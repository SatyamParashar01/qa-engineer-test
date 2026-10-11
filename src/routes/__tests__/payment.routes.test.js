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

test('Payment API - Bug A: GET /payments should return amounts as numbers, not strings', async () => {
  const response = await request(app)
    .get('/api/payments')
    .set('Authorization', `Bearer ${testToken}`);

  assert.strictEqual(response.status, 200);
  assert.ok(response.body.data.length > 0);
  for (const payment of response.body.data) {
    assert.strictEqual(typeof payment.amount, 'number', 'Payment amount must be a number type');
  }
});

test('Payment API - Bug A: GET /payments/:id should return amount as number', async () => {
  const response = await request(app)
    .get('/api/payments/1')
    .set('Authorization', `Bearer ${testToken}`);

  assert.strictEqual(response.status, 200);
  assert.strictEqual(typeof response.body.data.amount, 'number');
  assert.strictEqual(response.body.data.amount, 25.5);
});

test('Payment API - Bug B: POST /payments should reject payment amounts exceeding €50,000', async () => {
  const response = await request(app)
    .post('/api/payments')
    .set('Authorization', `Bearer ${testToken}`)
    .send({
      amount: 999999999,
      currency: 'EUR',
      customer_email: 'customer@test.com'
    });

  assert.strictEqual(response.status, 400);
  assert.ok(response.body.error.toLowerCase().includes('maximum') || response.body.error.includes('50,000'));
});

test('Payment API - Validation for negative or zero amounts', async () => {
  const zeroRes = await request(app)
    .post('/api/payments')
    .set('Authorization', `Bearer ${testToken}`)
    .send({
      amount: 0,
      currency: 'EUR',
      customer_email: 'customer@test.com'
    });
  assert.strictEqual(zeroRes.status, 400);

  const negRes = await request(app)
    .post('/api/payments')
    .set('Authorization', `Bearer ${testToken}`)
    .send({
      amount: -10,
      currency: 'EUR',
      customer_email: 'customer@test.com'
    });
  assert.strictEqual(negRes.status, 400);
});

test('Payment API - Valid payment creation persists numeric amount', async () => {
  const response = await request(app)
    .post('/api/payments')
    .set('Authorization', `Bearer ${testToken}`)
    .send({
      amount: 150.75,
      currency: 'EUR',
      customer_email: 'buyer@test.com'
    });

  assert.strictEqual(response.status, 201);
  assert.strictEqual(typeof response.body.data.amount, 'number');
  assert.strictEqual(response.body.data.amount, 150.75);
});
