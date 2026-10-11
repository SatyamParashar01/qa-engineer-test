import { test } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../../server.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'test-secret-key-do-not-use-in-production';
const testToken = jwt.sign(
  { id: '1', email: 'merchant@test.com', type: 'merchant' },
  JWT_SECRET,
  { expiresIn: '1h' }
);

test('E-Invoice API - Bug G: Prevent duplicate invoice submissions to tax authority', async () => {
  const invoiceId = `inv_test_${Date.now()}`;
  const validSiret = '12345678901234'; // 14 digits

  // First submission (should succeed)
  const firstRes = await request(app)
    .post('/api/einvoice/submit')
    .set('Authorization', `Bearer ${testToken}`)
    .send({
      invoice_id: invoiceId,
      customer_siret: validSiret
    });
  assert.strictEqual(firstRes.status, 200);
  assert.strictEqual(firstRes.body.data.status, 'submitted');

  // Second submission of same invoice (Bug G: should reject with 409 Conflict)
  const duplicateRes = await request(app)
    .post('/api/einvoice/submit')
    .set('Authorization', `Bearer ${testToken}`)
    .send({
      invoice_id: invoiceId,
      customer_siret: validSiret
    });
  assert.strictEqual(duplicateRes.status, 409);
  assert.strictEqual(duplicateRes.body.error, 'Invoice already submitted to tax authority');
});

test('E-Invoice API - Validate customer SIRET requirement (14 digits)', async () => {
  const invoiceId = `inv_siret_fail_${Date.now()}`;

  const invalidSiretRes = await request(app)
    .post('/api/einvoice/submit')
    .set('Authorization', `Bearer ${testToken}`)
    .send({
      invoice_id: invoiceId,
      customer_siret: '123' // Invalid length
    });

  assert.strictEqual(invalidSiretRes.status, 400);
  assert.ok(invalidSiretRes.body.error.includes('14 digits'));
});

test('E-Invoice API - Check e-invoice status', async () => {
  const invoiceId = `inv_status_chk_${Date.now()}`;
  const validSiret = '12345678901234';

  await request(app)
    .post('/api/einvoice/submit')
    .set('Authorization', `Bearer ${testToken}`)
    .send({
      invoice_id: invoiceId,
      customer_siret: validSiret
    });

  const statusRes = await request(app)
    .get(`/api/einvoice/status/${invoiceId}`)
    .set('Authorization', `Bearer ${testToken}`);

  assert.strictEqual(statusRes.status, 200);
  assert.strictEqual(statusRes.body.data.einvoice_status, 'submitted');
  assert.ok(statusRes.body.data.submission_id);
});
