# QA Engineer Assessment - Submission Summary

**Candidate:** Satyam Parashar  
**Role:** QA Engineer  
**Date:** 11 October 2026  

---

## Summary of Work Done

Here is my submission for the EU Pay QA Engineer technical test. I went through the API, identified all 7 bugs, fixed them with clean code, and wrote automated integration tests to make sure they don't break again.

### What is covered:
1. **Found & Fixed All 7 Bugs:**
   - **Bug A (Payment):** Fixed amount data type to stay as a number instead of string.
   - **Bug B (Payment):** Added validation to block payment amounts above €50,000.
   - **Bug C (Auth):** Fixed email regex to require a proper domain and TLD (e.g., .com).
   - **Bug D (Webhook):** Added HMAC-SHA256 signature verification to stop fake webhooks.
   - **Bug E (Webhook):** Added idempotency check using `event_id` to prevent processing the same webhook twice.
   - **Bug F (Table Orders):** Blocked creating a new order if the table already has a pending order.
   - **Bug G (E-Invoice):** Blocked duplicate invoice submissions to the tax authority.

2. **Automated Tests:**
   - Added 16 tests using Node.js native test runner and Supertest covering all 7 bugs, error cases, and security scenarios.
   - All tests pass when running `npm test`.

3. **Documentation:**
   - `bug-reports.md`: Details and steps to reproduce each bug.
   - `fixes.md`: Explanation and code changes for each fix.
   - `test-plan.md`: Testing approach for webhooks including edge cases and security.
   - `src/routes/`: Fixed production code for Payments, Auth, Webhooks, Table Orders, and E-Invoice.
   - `src/routes/__tests__/`: 16 automated tests across 5 test suites.
---

## How to Verify Locally

1. Install dependencies:
   ```bash
   npm install
- Start server: `npm start`
- Run test suite: `npm test`
