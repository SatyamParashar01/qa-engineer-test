# Bug Fixes Documentation - EU Pay QA Assessment

This document details the production-ready code modifications implemented for all 7 intentional bugs in the EU Pay QA test repository.

---

## Fix 1: Payment Amount Data Type (Bug A)

**Bug:** Payment amount was returned as string (`p.amount.toString()`) instead of numeric format.  
**Files Changed:** `src/routes/payment.routes.js` (lines 14–20, 50–57)

### Code Changes:
```diff
--- a/src/routes/payment.routes.js
+++ b/src/routes/payment.routes.js
@@ -13,7 +13,7 @@
-    // BUG A: Amount is being converted to string instead of remaining as number
+    // Fix for Bug A: Amount should be returned as number, maintaining precision
     const formattedPayments = payments.map(p => ({
       id: p.id,
-      amount: p.amount.toString(), // ← BUG: Should be number, not string
+      amount: typeof p.amount === 'number' ? p.amount : parseFloat(p.amount),
       currency: p.currency,
       status: p.status,
       customer_email: p.customer_email,
@@ -51,7 +51,7 @@
         id: payment.id,
-        amount: payment.amount.toString(), // Same bug as above
+        amount: typeof payment.amount === 'number' ? payment.amount : parseFloat(payment.amount), // Fix for Bug A
         currency: payment.currency,
         status: payment.status,
         customer_email: payment.customer_email,
```

### Why This Fix:
Financial computation on clients (web / Flutter) requires strict numeric types. Strings cause concatenation issues (`"25.5" + 5 = "25.55"`), comparison failures, and `NaN` errors. Preserving numeric float ensures compatibility and accuracy.

### Verification:
```bash
node --test src/routes/__tests__/payment.routes.test.js
# Passes: GET /payments should return amounts as numbers, not strings
```

---

## Fix 2: Payment Maximum Limit Validation (Bug B)

**Bug:** `POST /api/payments` lacked validation for upper transaction boundary (€50,000).  
**Files Changed:** `src/routes/payment.routes.js` (lines 74–79)

### Code Changes:
```diff
--- a/src/routes/payment.routes.js
+++ b/src/routes/payment.routes.js
@@ -74,6 +74,9 @@
     if (!amount || isNaN(amount) || amount <= 0) {
       return res.status(400).json({ error: 'Valid amount is required' });
     }
+
+    // Fix for Bug B: Enforce maximum allowed payment limit (50,000 max)
+    if (amount > 50000) {
+      return res.status(400).json({ error: 'Payment amount exceeds maximum allowed limit of 50,000' });
+    }
```

### Why This Fix:
Payment processors require clear transaction limits to comply with EU anti-money laundering (AML), PSD2 risk assessment, and fraud protection guidelines.

### Verification:
```bash
node --test src/routes/__tests__/payment.routes.test.js
# Passes: POST /payments should reject payment amounts exceeding €50,000
```

---

## Fix 3: Strict Email Validation Regex (Bug C)

**Bug:** Email validation regex allowed addresses without a domain extension / TLD (e.g. `user@domain`).  
**Files Changed:** `src/routes/auth.routes.js` (lines 9–14)

### Code Changes:
```diff
--- a/src/routes/auth.routes.js
+++ b/src/routes/auth.routes.js
@@ -9,5 +9,5 @@
-// BUG C: Email validation is too permissive
+// Fix for Bug C: Proper email validation requiring username, domain, and TLD (at least 2 letters)
 function validateEmail(email) {
-  // BUG: This regex allows emails without TLD like "user@domain"
-  const emailRegex = /^[^\s@]+@[^\s@]+$/;
+  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
   return emailRegex.test(email);
 }
```

### Why This Fix:
Enforces that email addresses contain an `@` symbol, a valid domain host, and at least a 2-character Top-Level Domain (`.com`, `.eu`, `.de`, etc.), preventing invalid accounts and undeliverable transactional emails.

### Verification:
```bash
node --test src/routes/__tests__/auth.routes.test.js
# Passes: Email validation must reject invalid formats and emails without TLD
```

---

## Fix 4: Webhook Signature Verification (Bug D)

**Bug:** Webhooks accepted unauthenticated payloads without cryptographic signature verification.  
**Files Changed:** `src/routes/webhook.routes.js` (lines 18–35)

### Code Changes:
```diff
--- a/src/routes/webhook.routes.js
+++ b/src/routes/webhook.routes.js
@@ -18,6 +18,17 @@
+    // BUG D: Signature verification using HMAC-SHA256
+    if (!signature) {
+      return res.status(401).json({ error: 'Webhook signature header missing' });
+    }
+
+    const expectedSignature = crypto
+      .createHmac('sha256', WEBHOOK_SECRET)
+      .update(JSON.stringify(req.body))
+      .digest('hex');
+
+    if (signature !== expectedSignature) {
+      return res.status(401).json({ error: 'Invalid signature' });
+    }
```

### Why This Fix:
Ensures authentic webhook origin from payment providers (Powens/Stripe) by calculating HMAC-SHA256 of payload with secret key, preventing spoofing and unauthorized status modification.

### Verification:
```bash
node --test src/routes/__tests__/webhook.routes.test.js
# Passes: Should reject webhooks with missing signature header
# Passes: Should reject webhooks with forged or invalid signature
```

---

## Fix 5: Webhook Idempotency Check (Bug E)

**Bug:** Duplicate webhook events were repeatedly processed instead of being handled idempotently.  
**Files Changed:** `src/routes/webhook.routes.js` (lines 38–60)

### Code Changes:
```diff
--- a/src/routes/webhook.routes.js
+++ b/src/routes/webhook.routes.js
@@ -38,6 +38,18 @@
+    // Fix for Bug E: Webhook Idempotency check
+    if (!db.processed_webhooks) {
+      db.processed_webhooks = [];
+    }
+
+    if (event_id && db.processed_webhooks.includes(event_id)) {
+      return res.status(200).json({
+        success: true,
+        message: 'Already processed',
+        payment_id,
+        idempotent: true
+      });
+    }
@@ -53,4 +65,7 @@
     payment.status = status;
     payment.webhook_received_at = new Date();
+
+    // Mark webhook as processed
+    if (event_id) {
+      db.processed_webhooks.push(event_id);
+    }
```

### Why This Fix:
Webhook delivery guarantees "at-least-once" semantics in payment networks. Storing processed `event_id` ensures replay requests are acknowledged safely without repeated business logic or side effects.

### Verification:
```bash
node --test src/routes/__tests__/webhook.routes.test.js
# Passes: Idempotency prevents processing duplicate event_id twice
```

---

## Fix 6: Duplicate Table Order Prevention (Bug F)

**Bug:** Multiple pending table orders could be opened concurrently for the same table.  
**Files Changed:** `src/routes/table-order.routes.js` (lines 43–55)

### Code Changes:
```diff
--- a/src/routes/table-order.routes.js
+++ b/src/routes/table-order.routes.js
@@ -43,6 +43,14 @@
+    // Fix for Bug F: Duplicate order prevention - reject if table already has a pending order
+    const existingOrder = (db.table_orders || []).find(
+      o => o.merchant_id === merchant_id && 
+           o.table_number === table_number && 
+           o.status === 'pending'
+    );
+    if (existingOrder) {
+      return res.status(409).json({ error: 'Table already has a pending order' });
+    }
```

### Why This Fix:
Guarantees restaurant tables only possess one active pending order at a time, preventing duplicate kitchen preparation and customer double-billing.

### Verification:
```bash
node --test src/routes/__tests__/table-order.routes.test.js
# Passes: Reject duplicate order when table already has a pending order
```

---

## Fix 7: Duplicate E-Invoice Submission Prevention (Bug G)

**Bug:** E-invoices could be submitted to tax authorities multiple times.  
**Files Changed:** `src/routes/einvoice.routes.js` (lines 50–57)

### Code Changes:
```diff
--- a/src/routes/einvoice.routes.js
+++ b/src/routes/einvoice.routes.js
@@ -50,6 +50,11 @@
+    // Fix for Bug G: Prevent duplicate submissions to tax authority
+    if (invoice.einvoice_status === 'submitted' || invoice.einvoice_status === 'accepted') {
+      return res.status(409).json({ 
+        error: 'Invoice already submitted to tax authority' 
+      });
+    }
```

### Why This Fix:
Submitting an invoice twice to European tax platforms (like Seqino PDP / French tax authority) creates duplicate tax liabilities and invalid audit trails. Once in `submitted` or `accepted` state, subsequent attempts return `409 Conflict`.

### Verification:
```bash
node --test src/routes/__tests__/einvoice.routes.test.js
# Passes: Prevent duplicate invoice submissions to tax authority
```
