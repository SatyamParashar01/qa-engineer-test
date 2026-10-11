# Bug Reports - EU Pay QA Assessment

Comprehensive technical documentation of the 7 intentional bugs identified, reproduced, and analyzed in the EU Pay QA Test API.

---

## Bug A: Payment Amount Returned as String Instead of Number

**Location:** `src/routes/payment.routes.js` (Lines 16, 52)  
**Severity:** Medium  
**Component:** Payment API  

### How to Reproduce:
1. Start API server: `npm start`
2. Obtain authentication token via `POST /api/auth/login` with credentials:
   ```json
   {
     "email": "merchant@test.com",
     "password": "Test123!"
   }
   ```
3. Send request: `GET /api/payments` with header `Authorization: Bearer <TOKEN>`.
4. Inspect the `data[0].amount` property in the JSON response.

### Expected Behavior:
The `amount` field should be formatted as a numeric type (float or integer, e.g. `25.5` or `100.0`) representing currency amounts consistently across API endpoints and client calculations.

### Actual Behavior:
The `amount` field was explicitly converted into a string:
```json
{
  "id": "1",
  "amount": "25.5",
  "currency": "EUR",
  "status": "completed"
}
```

### Impact:
Downstream client applications (mobile Flutter app, web checkout UI, accounting services) performing financial calculations directly on `amount` can encounter `NaN`, string concatenation bugs (`"25.5" + 10 = "25.510"`), and data contract validation errors.

### Root Cause:
In `src/routes/payment.routes.js`, lines 16 and 52 both explicitly invoked `.toString()` on the numeric amount:
```javascript
amount: p.amount.toString(),
// and
amount: payment.amount.toString(),
```

### Suggested Fix:
Return the amount as a numeric type (`typeof p.amount === 'number' ? p.amount : parseFloat(p.amount)`).

---

## Bug B: Missing Maximum Transaction Amount Validation (€50,000 Threshold)

**Location:** `src/routes/payment.routes.js` (Line 75)  
**Severity:** High  
**Component:** Payment API  

### How to Reproduce:
1. Send authenticated request: `POST /api/payments` with body:
   ```json
   {
     "amount": 999999999,
     "currency": "EUR",
     "customer_email": "whale@test.com"
   }
   ```
2. Observe HTTP response status code and data.

### Expected Behavior:
The API should reject the request with HTTP `400 Bad Request` stating that the amount exceeds the allowable transaction threshold (e.g., maximum €50,000 per payment per compliance and anti-money-laundering/fraud limits).

### Actual Behavior:
The API returns HTTP `201 Created` and persists an unrealistic payment of €999,999,999.

### Impact:
Exposes payment gateway to catastrophic fraud, unbounded credit risk, AML (Anti-Money Laundering) compliance fines, and potential integer overflow issues downstream in core banking or clearing networks.

### Root Cause:
`POST /api/payments` verified `amount <= 0` but failed to implement an upper boundary check (`amount > 50000`).

### Suggested Fix:
Enforce transaction threshold limit:
```javascript
if (amount > 50000) {
  return res.status(400).json({ error: 'Payment amount exceeds maximum allowed limit of 50,000' });
}
```

---

## Bug C: Email Validation Regex Is Too Permissive (Missing TLD / Domain Validation)

**Location:** `src/routes/auth.routes.js` (Line 12)  
**Severity:** Medium  
**Component:** Auth API  

### How to Reproduce:
1. Send request: `POST /api/auth/register` with payload:
   ```json
   {
     "email": "user@domain",
     "password": "Password123!",
     "business_name": "Acme Corp"
   }
   ```
2. Check HTTP status code.

### Expected Behavior:
The API should reject email addresses lacking a Top-Level Domain (TLD) or valid domain formatting, returning HTTP `400 Bad Request` with `{"error": "Invalid email format"}`.

### Actual Behavior:
Registration succeeds with HTTP `201 Created` because the email matches the regex `/^[^\s@]+@[^\s@]+$/`.

### Impact:
Users can register with invalid or unrouteable email addresses (`admin@localhost`, `test@domain`), breaking transactional notifications, receipts, 2FA/MFA verification emails, and password reset flows.

### Root Cause:
The regular expression `/^[^\s@]+@[^\s@]+$/` only checks for the presence of `@` without verifying a period separator and valid top-level domain.

### Suggested Fix:
Update regex to enforce valid domain and TLD:
```javascript
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
```

---

## Bug D: Missing Webhook HMAC-SHA256 Signature Verification

**Location:** `src/routes/webhook.routes.js` (Line 21)  
**Severity:** Critical  
**Component:** Webhooks  

### How to Reproduce:
1. Send an unauthenticated request to: `POST /api/webhooks/payment-status`
   ```json
   {
     "payment_id": "1",
     "status": "refunded",
     "event_id": "fake_evt_001"
   }
   ```
   Do not include `x-webhook-signature` or supply a fake signature string `x-webhook-signature: fake-sig`.
2. Inspect payment status via `GET /api/payments/1`.

### Expected Behavior:
The webhook endpoint must verify the incoming `x-webhook-signature` using HMAC-SHA256 with the shared secret `WEBHOOK_SECRET`. Unsigned or mismatched signatures must return HTTP `401 Unauthorized`.

### Actual Behavior:
The endpoint completely bypassed signature verification (the verification logic was commented out), accepting any arbitrary status update from untrusted external parties.

### Impact:
**Critical security vulnerability.** Any attacker on the internet can spoof payment confirmations, mark unpaid orders as `completed`, or issue fraudulent refunds by injecting fake webhook requests without authorization.

### Root Cause:
HMAC verification logic was commented out in `src/routes/webhook.routes.js`.

### Suggested Fix:
Verify presence of signature and match against HMAC-SHA256 hash using `crypto.timingSafeEqual` or verified hash comparison:
```javascript
if (!signature) {
  return res.status(401).json({ error: 'Webhook signature header missing' });
}
const expectedSignature = crypto
  .createHmac('sha256', WEBHOOK_SECRET)
  .update(JSON.stringify(req.body))
  .digest('hex');

if (signature !== expectedSignature) {
  return res.status(401).json({ error: 'Invalid signature' });
}
```

---

## Bug E: Missing Webhook Idempotency Check (Duplicate Event Processing)

**Location:** `src/routes/webhook.routes.js` (Line 38)  
**Severity:** High  
**Component:** Webhooks  

### How to Reproduce:
1. Generate valid HMAC signature for webhook payload:
   ```json
   {
     "payment_id": "1",
     "status": "completed",
     "event_id": "evt_repeat_123"
   }
   ```
2. Send request: `POST /api/webhooks/payment-status` with the valid signature. (Receives 200 OK)
3. Send the exact same request a second time with the identical `event_id`.

### Expected Behavior:
The webhook handler must be idempotent. Upon receiving a duplicate `event_id`, it should identify that the event was already processed, avoid redundant mutations, and return an idempotent `200 OK` (`Already processed`).

### Actual Behavior:
Every identical webhook request re-executes payment status mutation, overwriting `webhook_received_at` timestamp and processing duplicate events without tracking `event_id`.

### Impact:
Network retries from payment service providers (e.g. Stripe, Powens) can trigger duplicate inventory adjustments, duplicate receipts, duplicate accounting ledger records, and race conditions.

### Root Cause:
`db.processed_webhooks` check and push logic were commented out.

### Suggested Fix:
Track and check processed event IDs:
```javascript
if (!db.processed_webhooks) db.processed_webhooks = [];
if (event_id && db.processed_webhooks.includes(event_id)) {
  return res.status(200).json({
    success: true,
    message: 'Already processed',
    payment_id,
    idempotent: true
  });
}
// After processing:
if (event_id) db.processed_webhooks.push(event_id);
```

---

## Bug F: Missing Duplicate Table Order Prevention

**Location:** `src/routes/table-order.routes.js` (Line 44)  
**Severity:** Medium  
**Component:** Table Orders  

### How to Reproduce:
1. Send request: `POST /api/table-orders` with:
   ```json
   {
     "merchant_id": "1",
     "table_number": 5,
     "items": [{"name": "Burger", "price": 10, "quantity": 1}],
     "customer_name": "Alice"
   }
   ```
2. Send the exact same request again immediately for Table 5 while the previous order is still in `pending` status.

### Expected Behavior:
The system should prevent concurrent active orders for the same table to avoid duplicate food preparation, returning HTTP `409 Conflict` (`Table already has a pending order`).

### Actual Behavior:
Both orders are accepted with HTTP `201 Created`, creating two separate active pending orders for Table 5.

### Impact:
Kitchen prints duplicate tickets, restaurant staff double-prepares dishes, and customer faces billing disputes.

### Root Cause:
The uniqueness check for existing pending orders on `(merchant_id, table_number)` was commented out.

### Suggested Fix:
Check if table already has an active pending order:
```javascript
const existingOrder = (db.table_orders || []).find(
  o => o.merchant_id === merchant_id && 
       o.table_number === table_number && 
       o.status === 'pending'
);
if (existingOrder) {
  return res.status(409).json({ error: 'Table already has a pending order' });
}
```

---

## Bug G: Missing Duplicate E-Invoice Submission Prevention

**Location:** `src/routes/einvoice.routes.js` (Line 50)  
**Severity:** Medium  
**Component:** E-Invoice  

### How to Reproduce:
1. Submit invoice to tax authority via authenticated `POST /api/einvoice/submit`:
   ```json
   {
     "invoice_id": "inv_999",
     "customer_siret": "12345678901234"
   }
   ```
2. Send identical submission request again for `invoice_id: "inv_999"`.

### Expected Behavior:
Invoices already in `submitted` or `accepted` state must not be re-submitted to tax authorities; return HTTP `409 Conflict` (`Invoice already submitted to tax authority`).

### Actual Behavior:
The API re-submits the invoice, generating a new `submission_id` and updating the submission timestamp repeatedly.

### Impact:
Duplicate tax filing in French/EU PDP systems (e.g. Seqino/Chorus Pro), resulting in rejection by tax authorities, double VAT accounting liability, and compliance penalties.

### Root Cause:
Status validation check on `invoice.einvoice_status` was commented out.

### Suggested Fix:
Add submission status check:
```javascript
if (invoice.einvoice_status === 'submitted' || invoice.einvoice_status === 'accepted') {
  return res.status(409).json({ 
    error: 'Invoice already submitted to tax authority' 
  });
}
```
