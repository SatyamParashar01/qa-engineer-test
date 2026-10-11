# Test Plan: Webhook Payment Flow

Comprehensive quality assurance strategy for EU Pay's asynchronous payment webhook processing architecture.

---

## 1. Test Scope

### In Scope
- Webhook endpoints: `POST /api/webhooks/payment-status` and `POST /api/webhooks/e-invoice`
- Cryptographic signature verification (HMAC-SHA256 with shared secret)
- Idempotency and duplicate event handling (`event_id` tracking)
- Payment state transitions (`pending` -> `completed` -> `refunded` -> `failed`)
- Error handling, status codes (200, 400, 401, 404, 500)
- Payload integrity and sanitization (SQLi, special characters, unicode)
- Concurrency & race conditions handling
- Real-time updates propagation (Socket.IO events)

### Out of Scope
- Frontend UI rendering (Flutter and Next.js applications)
- External third-party gateway downtime simulation (Powens, Bridge banking APIs)
- End-to-end multi-region latency benchmarks
- Load testing beyond single-node threshold (> 5,000 req/sec)

---

## 2. Test Environment
- **API Server:** Node.js Express API running on `http://localhost:3000`
- **Database:** In-memory test store initialized with seed payments and merchants
- **Test Runner:** Node.js Native Test Runner (`node:test`) + Supertest
- **Webhook Simulator:** Node.js crypto client script / curl / Postman collection
- **Secret Keys:** `WEBHOOK_SECRET = "test-webhook-secret-key"`

---

## 3. Test Scenarios (12+ Core Scenarios)

| ID | Scenario | Input / Conditions | Expected Result | Severity |
|---|---|---|---|---|
| **TC-01** | Valid webhook with correct signature | Valid `x-webhook-signature` using HMAC-SHA256 matching payload | HTTP `200 OK`, status updated to `completed` | Critical |
| **TC-02** | Webhook missing signature header | No `x-webhook-signature` header provided | HTTP `401 Unauthorized` with clear error message | Critical |
| **TC-03** | Webhook with forged/invalid signature | Invalid signature string `x-webhook-signature: evil_sig` | HTTP `401 Unauthorized` with `Invalid signature` | Critical |
| **TC-04** | Duplicate webhook (Idempotency) | Same `event_id` sent consecutively | 1st returns `200 OK`, 2nd returns `200 OK` with `Already processed` flag without mutating state again | High |
| **TC-05** | Webhook for non-existent payment | `payment_id: "99999999"` | HTTP `404 Not Found` with `Payment not found` | High |
| **TC-06** | Webhook with missing required fields | Missing `payment_id` or `status` | HTTP `400 Bad Request` | Medium |
| **TC-07** | Multiple webhooks for same payment (valid lifecycle) | Sequence: `pending` -> `completed` -> `refunded` with distinct `event_id`s | HTTP `200 OK` on each transition, state updated accurately | High |
| **TC-08** | Webhook before payment creation | Webhook arriving before local payment entity created in DB | HTTP `404 Not Found` (or queued in DLQ retry queue) | High |
| **TC-09** | Malformed JSON payload | Invalid JSON syntax in HTTP body | HTTP `400 Bad Request` / JSON parse error handler | Medium |
| **TC-10** | Concurrent webhooks (Race conditions) | 10 concurrent requests for the same payment with the same `event_id` | Exactly 1 request executes state change, 9 receive idempotent response | High |
| **TC-11** | SQL Injection payload in `payment_id` | `payment_id: "1; DROP TABLE payments;--"` | Treated safely as string literal, returns `404 Not Found` | High |
| **TC-12** | Timing attack resistance on signature | Comparing signatures with variable character matches | Constant-time comparison prevents side-channel timing attack | Critical |
| **TC-13** | Webhook replay attack (stale event) | Identical payload and signature replayed after TTL | Idempotency layer detects prior event and suppresses re-execution | High |

---

## 4. Security Tests

### 4.1 HMAC-SHA256 Signature Verification
- **Verification Rule:** Secret must never be leaked; payload must be signed using exact raw body string.
- **Test:** Mutate a single character in the body after signature computation (e.g. `amount` or `payment_id`). Endpoint must reject with `401 Unauthorized`.

### 4.2 Timing Attack Resistance
- Signatures should be compared with `crypto.timingSafeEqual` over fixed-length buffers to eliminate microsecond discrepancies revealing valid byte prefixes.

### 4.3 Replay Attack Prevention
- Webhooks must include either unique `event_id` or timestamp headers (e.g. `x-webhook-timestamp` within 5-minute tolerance window). Replayed events are discarded.

### 4.4 Injection and Sanitization
- `payment_id` and `status` values containing `<script>`, quotes, null bytes `\0`, or SQL keywords are strictly treated as data and sanitized.

---

## 5. Edge Cases
- **Extreme Identifiers:** Very large payment IDs (UUIDs, 64-bit BigInts, alphanumeric tokens).
- **Status casing & Unicode:** Unstandardized statuses (e.g. `COMPLETED`, `completed `, or Cyrillic characters) must be validated against an allowed enum: `['pending', 'completed', 'failed', 'refunded']`.
- **Empty or Whitespace Strings:** Payload with `{"payment_id": " ", "status": ""}` must return `400 Bad Request`.
- **Clock Drift:** Timestamps set far into the future or past.

---

## 6. Integration Tests

### 6.1 End-to-End Payment Flow
1. **Merchant creates payment:** `POST /api/payments` -> Returns status `pending`.
2. **Customer completes checkout at bank:** Bank triggers webhook to EU Pay.
3. **Webhook reception:** `POST /api/webhooks/payment-status` with HMAC signature.
4. **State persistence:** Verification that `GET /api/payments/:id` returns status `completed`.
5. **Real-time broadcast:** Socket.IO emits `payment_updated` event to merchant room `merchant_<id>`.

### 6.2 Failure & Retry Handling
- If webhook endpoint returns HTTP `5xx` due to transient database unavailability, payment gateway must receive standard retry headers (`Retry-After`).

---

## 7. Risk Assessment & Mitigation

| Production Risk | Impact | Detection Mechanism | Mitigation Strategy |
|---|---|---|---|
| **Signature Spoofing** | Attacker confirms unpaid orders | Automated alerting on spikes in `401 Unauthorized` webhook failures | Enforce strict HMAC-SHA256 with key rotation support |
| **Duplicate Webhook Delivery** | Double fulfillment / double refunds | Monitoring metric `webhook_duplicate_count > threshold` | Redis/database distributed lock + atomic event dedup cache |
| **Out-of-Order Webhooks** | `refunded` arrives before `completed` | Status transition state machine validator | Reject illegal backward transitions (e.g. cannot transition from `refunded` back to `pending`) |
| **Gateway Clock Skew** | Legitimate webhooks rejected as expired | Gateway time sync metric tracking | 300-second timestamp tolerance leeway on webhook replay validation |
