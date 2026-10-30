import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import express from 'express';
import { authRouter } from '../server/routes/authRoutes.ts';
import { store } from '../server/store.ts';
import { postgresStore } from '../server/db/postgresStore.ts';

test('Strict Auth Verification: Signup, Login Gating, and Verification Flow', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const { hydrateStoreFromPostgres } = await import('../server/store.ts');
    await hydrateStoreFromPostgres();

    const uniqueId = Date.now() + '_' + Math.floor(Math.random() * 10000);
    const testEmail = `test_gate_${uniqueId}@example.com`;
    const testPassword = 'Password123!';
    const testMobile = '+1555' + Math.floor(1000000 + Math.random() * 9000000);

    // 1. Signup sends verification code and does NOT issue a session token
    const signupRes = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Audit Test User',
        email: testEmail,
        password: testPassword,
        confirmPassword: testPassword,
        mobile: testMobile
      })
    });

    const signupData = await signupRes.json();
    assert.strictEqual(signupRes.status, 201, `Signup should succeed with 201, got ${signupRes.status}: ${JSON.stringify(signupData)}`);
    assert.strictEqual(signupData.success, true, 'Signup response should indicate success');
    assert.strictEqual(signupData.requiresVerification, true, 'Signup response should require email verification');
    assert.strictEqual(signupData.token, undefined, 'Signup must NOT return a session token before verification');

    const createdUser = await store.getUserByEmail(testEmail);
    assert.ok(createdUser, 'User must exist in store');
    assert.strictEqual(createdUser.emailVerified, false, 'User emailVerified must be false immediately after signup');

    // 2. Unverified accounts must NOT be allowed to log in
    const unverifiedLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword
      })
    });

    const unverifiedLoginData = await unverifiedLoginRes.json();
    assert.strictEqual(unverifiedLoginRes.status, 403, 'Unverified account login must be blocked with 403');
    assert.strictEqual(unverifiedLoginData.requiresVerification, true, 'Unverified login response must indicate verification required');
    assert.strictEqual(unverifiedLoginData.token, undefined, 'No token may be issued for unverified account');

    // 3. User must enter correct code to verify; invalid code is rejected
    const invalidVerifyRes = await fetch(`${baseUrl}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        code: '000000'
      })
    });

    const invalidVerifyData = await invalidVerifyRes.json();
    assert.strictEqual(invalidVerifyRes.status, 400, 'Invalid verification code must be rejected with 400');
    assert.strictEqual(invalidVerifyData.token, undefined, 'Invalid code cannot return token');

    // Obtain the latest valid code (generated when unverified login dispatched fresh code)
    const validCode = unverifiedLoginData.mockEmailCode || signupData.mockEmailCode;
    assert.ok(validCode, 'Verification code must be available in test/dev environment');

    // 4. Entering correct verification code completes signup and verifies account
    const validVerifyRes = await fetch(`${baseUrl}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        code: validCode
      })
    });

    const validVerifyData = await validVerifyRes.json();
    assert.strictEqual(validVerifyRes.status, 200, `Valid verification code must succeed with 200, got ${validVerifyRes.status}: ${JSON.stringify(validVerifyData)}`);
    assert.strictEqual(validVerifyData.success, true);
    assert.ok(validVerifyData.token, 'Verification must return a valid session token');

    const verifiedUser = await store.getUserByEmail(testEmail);
    assert.ok(verifiedUser, 'User must exist in store');
    assert.strictEqual(verifiedUser.emailVerified, true, 'User emailVerified must now be true');

    // 5. After successful verification, user can log in normally
    const verifiedLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword
      })
    });

    const verifiedLoginData = await verifiedLoginRes.json();
    assert.strictEqual(verifiedLoginRes.status, 200, 'Verified user login must succeed with 200');
    assert.strictEqual(verifiedLoginData.success, true);
    assert.ok(verifiedLoginData.token, 'Verified login must return session token');
  } finally {
    try { (server as any).closeAllConnections?.(); } catch {}
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try {
      await postgresStore.getPool().end();
    } catch {}
  }
});
