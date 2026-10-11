import { test } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../../server.js';
import { db } from '../../db/database.js';

test('Auth API - Bug C: Email validation must reject invalid formats and emails without TLD', async () => {
  // Test invalid email missing domain and TLD
  const res1 = await request(app)
    .post('/api/auth/register')
    .send({
      email: 'user@domain',
      password: 'SecurePassword123!',
      business_name: 'Test Merchant'
    });
  assert.strictEqual(res1.status, 400);
  assert.strictEqual(res1.body.error, 'Invalid email format');

  // Test invalid email missing @
  const res2 = await request(app)
    .post('/api/auth/register')
    .send({
      email: 'userdomain.com',
      password: 'SecurePassword123!',
      business_name: 'Test Merchant'
    });
  assert.strictEqual(res2.status, 400);
  assert.strictEqual(res2.body.error, 'Invalid email format');
});

test('Auth API - Valid registration and login flow works properly', async () => {
  const uniqueEmail = `qa_${Date.now()}@testmerchant.com`;

  // Successful Registration
  const regRes = await request(app)
    .post('/api/auth/register')
    .send({
      email: uniqueEmail,
      password: 'StrongPassword123!',
      business_name: 'Super QA Store'
    });
  assert.strictEqual(regRes.status, 201);
  assert.ok(regRes.body.token);
  assert.strictEqual(regRes.body.user.email, uniqueEmail);

  // Duplicate Registration Prevention
  const dupRes = await request(app)
    .post('/api/auth/register')
    .send({
      email: uniqueEmail,
      password: 'StrongPassword123!',
      business_name: 'Super QA Store'
    });
  assert.strictEqual(dupRes.status, 409);

  // Successful Login
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({
      email: uniqueEmail,
      password: 'StrongPassword123!'
    });
  assert.strictEqual(loginRes.status, 200);
  assert.ok(loginRes.body.token);

  // Login with invalid password
  const badLogin = await request(app)
    .post('/api/auth/login')
    .send({
      email: uniqueEmail,
      password: 'WrongPassword!'
    });
  assert.strictEqual(badLogin.status, 401);
});
