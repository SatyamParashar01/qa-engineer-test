import { test } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import crypto from 'crypto';
import app from '../../server.js';
import { db } from '../../db/database.js';

const WEBHOOK_SECRET = 'test-webhook-secret-key';

function generateSignature(payload) {
  return crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex');
}

test('Webhook API - Bug D: Should reject webhooks with missing signature header', async () => {
  const payload = {
    payment_id: '1',
    status: 'completed',
    event_id: 'evt_sig_missing_1'
  };

  const response = await request(app)
    .post('/api/webhooks/payment-status')
    .send(payload);

  assert.strictEqual(response.status, 401);
  assert.ok(response.body.error.toLowerCase().includes('signature'));
});

test('Webhook API - Bug D: Should reject webhooks with forged or invalid signature', async () => {
  const payload = {
    payment_id: '1',
    status: 'completed',
    event_id: 'evt_sig_invalid_1'
  };

  const response = await request(app)
    .post('/api/webhooks/payment-status')
    .set('x-webhook-signature', 'invalid-fake-signature-12345')
    .send(payload);

  assert.strictEqual(response.status, 401);
  assert.strictEqual(response.body.error, 'Invalid signature');
});

test('Webhook API - Valid signature updates payment status', async () => {
  const payload = {
    payment_id: '2',
    status: 'completed',
    event_id: 'evt_valid_sig_1'
  };
  const signature = generateSignature(payload);

  const response = await request(app)
    .post('/api/webhooks/payment-status')
    .set('x-webhook-signature', signature)
    .send(payload);

  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.body.success, true);
  assert.strictEqual(response.body.new_status, 'completed');
});

test('Webhook API - Bug E: Idempotency prevents processing duplicate event_id twice', async () => {
  const payload = {
    payment_id: '1',
    status: 'refunded',
    event_id: 'evt_duplicate_check_1'
  };
  const signature = generateSignature(payload);

  // First request
  const firstRes = await request(app)
    .post('/api/webhooks/payment-status')
    .set('x-webhook-signature', signature)
    .send(payload);
  assert.strictEqual(firstRes.status, 200);

  // Duplicate second request with same event_id
  const duplicateRes = await request(app)
    .post('/api/webhooks/payment-status')
    .set('x-webhook-signature', signature)
    .send(payload);

  assert.strictEqual(duplicateRes.status, 200);
  assert.strictEqual(duplicateRes.body.message, 'Already processed');
  assert.strictEqual(duplicateRes.body.idempotent, true);
});
