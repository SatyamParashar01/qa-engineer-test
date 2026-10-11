# Test Plan: Webhook Payment Flow

This test plan covers testing for EU Pay's payment webhook endpoints. It focuses on making sure payment updates are secure, duplicate events are handled properly, and edge cases don't break the system.

---

## 1. Scope

### In Scope
- Webhook routes: `POST/api/webhooks/payment-status` and `POST/api/webhooks/e-invoice`
- Signature check using HMAC-SHA256
- Duplicate webhook handling using event_id (idempotency)
- Payment status transitions (pending, completed, refunded, failed)
- Invalid payloads and error handling (400, 401, 404)
- Real-time order updates via Socket.IO

### Out of Scope
- Frontend UI testing
- Third-party bank downtime simulation (Powens API)
- Load and stress testing

---

## 2. Test Environment
- Local server: http://localhost:3000
- Test framework: Node.js built-in test runner (node:test) + Supertest
- Manual testing tool: Postman collection & curl
- Database: In-memory test DB with seed merchants and payments

---

## 3. Test Scenarios

| Test ID | Scenario | Input / Steps | Expected Result |
|---|---|---|---|
| TC-01 | Valid webhook | Send webhook with correct signature | Status 200 OK, payment status updated |
| TC-02 | Missing signature header | Send request without x-webhook-signature | Status 401 Unauthorized |
| TC-03 | Wrong signature | Send request with fake signature | Status 401 Unauthorized |
| TC-04 | Duplicate webhook | Send same payload and event_id twice | First returns 200 OK; second returns 200 OK ("Already processed") without updating again |
| TC-05 | Payment not found | Send webhook with random payment_id | Status 404 Payment not found |
| TC-06 | Missing required fields | Send payload without payment_id or status | Status 400 Bad request |
| TC-07 | Status lifecycle update | Update payment from pending -> completed -> refunded | Status updates correctly each time |
| TC-08 | Payment does not exist yet | Webhook arrives before payment is created | Status 404 |
| TC-09 | Malformed JSON | Send broken JSON in request body | Status 400 Bad request |
| TC-10 | Concurrent duplicate webhooks | Send duplicate webhooks at the same time | Only one updates status, other handles as duplicate |
| TC-11 | SQL injection in payment_id | Send payment_id with SQL characters | Handled safely, returns 404 |
| TC-12 | Replay attack | Resend an old webhook event | Recognized by event ID and ignored |

---

## 4. Security & Edge Cases
- Signature verification: The server must hash the body with HMAC-SHA256 and compare it with the header before touching the database.
- Idempotency: Using event_id array ensures network retries from payment providers do not trigger double actions.
- Input checking: Making sure status strings match allowed values (pending, completed, etc.) and large numbers or strings don't crash the server.

---

## 5. What Could Go Wrong in Production?

- Problem: A bad actor tries to fake a payment success webhook.
  - Detection: Look for spikes in 401 Unauthorized errors on webhook logs.
  - Fix: Keep webhook secrets secure and reject any request with an invalid signature.

- Problem: The payment provider retries the same webhook because of network lag.
  - Detection: Check if multiple webhook events have the same event_id.
  - Fix: Save processed event_ids in the database/cache and return 200 without processing again.

- Problem: Out-of-order webhooks (e.g. refunded arrives before completed).
  - Detection: Track unexpected status changes in application logs.
  - Fix: Add state transition checks so orders cannot move backward from finished states.
