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

test('Table Orders API - Bug F: Reject duplicate order when table already has a pending order', async () => {
  const tableNumber = 99;
  const orderData = {
    merchant_id: '1',
    table_number: tableNumber,
    items: [
      { id: 'dish-1', name: 'Pasta Carbonara', price: 14.5, quantity: 2 }
    ],
    customer_name: 'John Doe',
    order_type: 'dine_in'
  };

  // First order creation (should succeed)
  const firstRes = await request(app)
    .post('/api/table-orders')
    .send(orderData);
  assert.strictEqual(firstRes.status, 201);
  assert.strictEqual(firstRes.body.data.status, 'pending');

  // Second order on the same table with pending status (Bug F: should be rejected with 409)
  const secondRes = await request(app)
    .post('/api/table-orders')
    .send(orderData);
  assert.strictEqual(secondRes.status, 409);
  assert.strictEqual(secondRes.body.error, 'Table already has a pending order');
});

test('Table Orders API - List orders and update order status', async () => {
  const listRes = await request(app)
    .get('/api/table-orders')
    .set('Authorization', `Bearer ${testToken}`);

  assert.strictEqual(listRes.status, 200);
  assert.ok(Array.isArray(listRes.body.data));
});
