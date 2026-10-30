import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'crypto';
import { store, type User } from '../store.js';
import { postgresStore, isPostgresEnabled } from '../db/postgresStore.js';
import {
  rateLimit,
  requireAuth,
  requireActiveStatus,
  resolveAuthenticatedUserId,
  safeUser,
  signToken,
  registerNewUserSession,
  registerNewUserSessionAtomic,
  MAX_ACTIVE_SESSIONS,
  IS_PRODUCTION,
  apiError
} from '../middleware/auth.js';
import { disconnectUserSockets } from '../websocket.js';
import {
  deliverSecurityCode,
  deliverAdminCode,
  recordUserEmail,
  EMAIL_DELIVERY_ENABLED
} from '../services/notificationService.js';
import {
  emailVerificationCodes,
  smsVerificationCodes,
  forgotPasswordCodes,
  withdrawalVerificationCodes,
  generate6DigitCode,
  isValidEmail,
  isValidMobile,
  checkRecoveryCode,
  handleLogin
} from '../services/authService.js';
import { handlePayoutRequest } from '../services/payoutService.js';
import { ensureWallet } from '../services/orderService.js';

export const authRouter = Router();

const isTestEnv = process.env.NODE_ENV === 'test';

// 1. Signup Endpoint
authRouter.post('/signup', rateLimit(20, 3_600_000), async (req: Request, res: Response) => {
  try {
    const { email, password, confirmPassword, mobile, name } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      return apiError(res, 'Email and password are required.');
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const trimmedMobile = typeof mobile === 'string' ? mobile.trim() : '';
    if (trimmedMobile && !isValidMobile(trimmedMobile)) {
      return res.status(400).json({ error: 'Please enter a valid mobile number.' });
    }

    const emailCheck = await store.getUserByEmail(normalizedEmail);
    if (emailCheck) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    if (trimmedMobile) {
      const mobileCheck = await store.getUserByMobile(trimmedMobile);
      if (mobileCheck) {
        return res.status(409).json({ error: 'An account with this mobile number already exists.' });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUserId = 'user_' + Date.now() + '_' + randomBytes(3).toString('hex');
    const newUser: User = {
      id: newUserId,
      name: (typeof name === 'string' && name.trim() ? name.trim().slice(0, 80) : normalizedEmail.split('@')[0]),
      email: normalizedEmail,
      mobile: trimmedMobile || undefined,
      role: 'user',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=400&h=400&fit=crop',
      title: 'Freelancer / Member',
      rating: 0,
      reviewsCount: 0,
      hourlyRate: 50,
      earned: 0,
      completedJobs: 0,
      bio: 'New member on WorkPerHour.',
      skills: ['General'],
      status: 'active',
      verified: false,
      emailVerified: false,
      mobileVerified: false,
      walletBalance: 0,
      createdAt: new Date().toISOString().substring(0, 10),
      password: hashedPassword,
      sessionVersion: 1,
      activeSessionVersions: [1],
      knownDevices: req.body?.deviceId ? [String(req.body.deviceId).trim()] : ['dev_default_session']
    };

    await store.saveUser(newUser);
    await ensureWallet(newUserId);

    const emailCode = generate6DigitCode();
    const now = Date.now();
    const expiresAtMs = now + 30 * 60 * 1000;
    if (isPostgresEnabled()) {
      try {
        await postgresStore.getPool().query(
          `INSERT INTO auth_verification_codes (email, code, type, attempts, last_resend_at, expires_at, created_at)
           VALUES ($1, $2, 'verify', 0, $3, $4, NOW())
           ON CONFLICT (email, type) DO UPDATE SET code = $2, attempts = 0, last_resend_at = $3, expires_at = $4, created_at = NOW()`,
          [normalizedEmail, emailCode, now, new Date(expiresAtMs)]
        );
      } catch (e) {
        console.error('[Auth] Failed to persist verification code to DB:', e);
        return res.status(500).json({ error: 'Failed to generate verification code.' });
      }
    } else {
      emailVerificationCodes.set(normalizedEmail, {
        code: emailCode,
        expiresAt: expiresAtMs,
        lastResendAt: now,
        attempts: 0
      });
    }

    deliverSecurityCode(normalizedEmail, 'SIGNUP_EMAIL', emailCode);

    if (trimmedMobile) {
      const smsCode = generate6DigitCode();
      const smsExpiresAtMs = Date.now() + 30 * 60 * 1000;
      if (isPostgresEnabled()) {
        try {
          await postgresStore.getPool().query(
            `INSERT INTO auth_verification_codes (email, code, type, attempts, last_resend_at, expires_at, created_at)
             VALUES ($1, $2, 'sms', 0, $3, $4, NOW())
             ON CONFLICT (email, type) DO UPDATE SET code = $2, attempts = 0, last_resend_at = $3, expires_at = $4, created_at = NOW()`,
            [trimmedMobile, smsCode, Date.now(), new Date(smsExpiresAtMs)]
          );
        } catch (e) {
          console.warn('[Auth] Failed to persist SMS verification code to DB:', e);
        }
      }
      smsVerificationCodes.set(trimmedMobile, {
        code: smsCode,
        expiresAt: smsExpiresAtMs,
        lastResendAt: Date.now(),
        attempts: 0
      });
      deliverSecurityCode(trimmedMobile, 'SIGNUP_SMS', smsCode);
    }

    recordUserEmail({
      id: 'email_' + Date.now() + '_' + randomUUID().slice(0, 8),
      userId: newUserId,
      userEmail: normalizedEmail,
      subject: 'Verify Your WorkPerHour Account',
      snippet: 'Welcome to WorkPerHour! Verification code dispatched.',
      body: 'Welcome to WorkPerHour! Please enter the verification code sent to your registered contact channel to verify your account.',
      date: new Date().toLocaleDateString(),
      read: false,
      type: 'GENERAL'
    });

    res.status(201).json({
      success: true,
      requiresVerification: true,
      message: 'Account created! Please enter the 6-digit verification code sent to your email to complete registration.',
      email: normalizedEmail,
      mockEmailCode: !IS_PRODUCTION ? emailCode : undefined,
      user: safeUser(newUser)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Signup failed' });
  }
});

// 2. Email Verification & Resend
authRouter.post('/verify-email', rateLimit(30, 3_600_000), async (req: Request, res: Response) => {
  const { email, code: rawCode } = req.body || {};
  if (typeof email !== 'string' || !email.trim() || rawCode === undefined || rawCode === null || String(rawCode).trim() === '') {
    return res.status(400).json({ error: 'Email and code are required.' });
  }
  const code = String(rawCode).trim();
  const normalizedEmail = email.trim().toLowerCase();

  let valid = false;
  if (isPostgresEnabled()) {
    try {
      const result = await postgresStore.executeInTransaction(async (client) => {
        const codeRes = await client.query(
          `SELECT * FROM auth_verification_codes WHERE email = $1 AND type = 'verify' FOR UPDATE`,
          [normalizedEmail]
        );
        if (codeRes.rows.length === 0) {
          return { status: 400, error: 'Invalid verification code.' };
        }
        const row = codeRes.rows[0];
        if (new Date() > new Date(row.expires_at)) {
          await client.query(`DELETE FROM auth_verification_codes WHERE email = $1 AND type = 'verify'`, [normalizedEmail]);
          return { status: 400, error: 'Verification code has expired. Please request a new one.' };
        }
        if (Number(row.attempts || 0) >= 5) {
          await client.query(`DELETE FROM auth_verification_codes WHERE email = $1 AND type = 'verify'`, [normalizedEmail]);
          return { status: 429, error: 'Too many failed attempts. Code invalidated.' };
        }
        if (row.code === code) {
          await client.query(`DELETE FROM auth_verification_codes WHERE email = $1 AND type = 'verify'`, [normalizedEmail]);
          return { ok: true };
        } else {
          const upd = await client.query(
            `UPDATE auth_verification_codes SET attempts = attempts + 1 WHERE email = $1 AND type = 'verify' RETURNING attempts`,
            [normalizedEmail]
          );
          if (Number(upd.rows[0]?.attempts || 0) >= 5) {
            await client.query(`DELETE FROM auth_verification_codes WHERE email = $1 AND type = 'verify'`, [normalizedEmail]);
            return { status: 429, error: 'Too many failed attempts. Code invalidated.' };
          }
          return { status: 400, error: 'Invalid verification code.' };
        }
      });

      if (result.error) {
        return res.status(result.status).json({ error: result.error });
      }
      valid = true;
    } catch (e) {
      console.error('[Auth] Error querying auth_verification_codes:', e);
      return res.status(500).json({ error: 'Failed to verify code.' });
    }
  } else {
    if (IS_PRODUCTION) {
      return res.status(500).json({ error: 'Security verification requires database connection in production.' });
    }
    const record = emailVerificationCodes.get(normalizedEmail);
    if (record) {
      if (Date.now() > record.expiresAt) {
        emailVerificationCodes.delete(normalizedEmail);
        return res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
      }
      if (record.attempts >= 5) {
        emailVerificationCodes.delete(normalizedEmail);
        return res.status(429).json({ error: 'Too many failed attempts. Code invalidated.' });
      }
      if (record.code === code) {
        valid = true;
        emailVerificationCodes.delete(normalizedEmail);
      } else {
        record.attempts++;
      }
    }
  }

  if (!valid) {
    return res.status(400).json({ error: 'Invalid verification code.' });
  }

  const user = await store.getUserByEmail(normalizedEmail);
  if (!user) {
    return res.status(404).json({ error: 'User account not found.' });
  }

  user.emailVerified = true;
  user.verified = true;
  const sessionVersion = await registerNewUserSessionAtomic(user);

  const token = signToken({
    id: user.id,
    role: user.role,
    email: user.email,
    sessionVersion
  });

  res.json({
    success: true,
    message: 'Email verified successfully!',
    token,
    user: safeUser(user)
  });
});

authRouter.post('/resend-email-code', rateLimit(10, 3_600_000), async (req: Request, res: Response) => {
  const { email } = req.body || {};
  if (typeof email !== 'string' || !email.trim()) return res.status(400).json({ error: 'Email is required.' });
  const normalizedEmail = email.trim().toLowerCase();
  const generic = { success: true, message: 'If this email needs verification, a new code has been sent.' };
  const user = await store.getUserByEmail(normalizedEmail);
  if (!user || user.emailVerified) return res.json(generic);

  const now = Date.now();
  const newCode = generate6DigitCode();
  const expiresAtMs = now + 30 * 60 * 1000;

  if (isPostgresEnabled()) {
    const pool = postgresStore.getPool();
    try {
      const existingRes = await pool.query(
        `SELECT last_resend_at FROM auth_verification_codes WHERE email = $1 AND type = 'verify'`,
        [normalizedEmail]
      );
      if (existingRes.rows.length > 0 && now - Number(existingRes.rows[0].last_resend_at || 0) < 30_000) {
        return res.status(429).json({ error: 'Please wait 30 seconds before requesting a new resend.' });
      }
      await pool.query(
        `INSERT INTO auth_verification_codes (email, code, type, attempts, last_resend_at, expires_at, created_at)
         VALUES ($1, $2, 'verify', 0, $3, $4, NOW())
         ON CONFLICT (email, type) DO UPDATE SET code = $2, attempts = 0, last_resend_at = $3, expires_at = $4, created_at = NOW()`,
        [normalizedEmail, newCode, now, new Date(expiresAtMs)]
      );
    } catch (e) {
      console.error('[Auth] Failed to persist resend verification code to DB:', e);
      return res.status(500).json({ error: 'Failed to generate verification code.' });
    }
  } else {
    if (IS_PRODUCTION) {
      return res.status(500).json({ error: 'Security verification requires database connection in production.' });
    }
    const existing = emailVerificationCodes.get(normalizedEmail);
    if (existing && now - existing.lastResendAt < 30_000) {
      return res.status(429).json({ error: 'Please wait 30 seconds before requesting a new resend.' });
    }
    emailVerificationCodes.set(normalizedEmail, {
      code: newCode,
      expiresAt: expiresAtMs,
      lastResendAt: now,
      attempts: 0
    });
  }

  deliverSecurityCode(normalizedEmail, 'EMAIL_VERIFICATION', newCode);

  recordUserEmail({
    id: 'email_' + Date.now() + '_' + randomUUID().slice(0, 8),
    userId: user.id,
    userEmail: normalizedEmail,
    subject: 'Your New WorkPerHour Verification Code',
    snippet: 'A new verification code was dispatched.',
    body: 'A new verification code was requested for your account. Please enter the code sent to your registered contact channel.',
    date: new Date().toLocaleDateString(),
    read: false,
    type: 'GENERAL'
  });

  res.json({
    ...generic,
    mockCode: !IS_PRODUCTION ? newCode : undefined
  });
});

// 3. Mobile / SMS Verification & Resend
authRouter.post('/verify-sms', rateLimit(30, 3_600_000), async (req: Request, res: Response) => {
  const { mobile, code: rawCode } = req.body || {};
  if (typeof mobile !== 'string' || !mobile.trim() || rawCode === undefined || rawCode === null || String(rawCode).trim() === '') {
    return res.status(400).json({ error: 'Mobile number and code are required.' });
  }
  const code = String(rawCode).trim();
  const cleanMobile = mobile.trim();

  if (isPostgresEnabled()) {
    try {
      const result = await postgresStore.executeInTransaction(async (client) => {
        const codeRes = await client.query(
          `SELECT * FROM auth_verification_codes WHERE email = $1 AND type = 'sms' FOR UPDATE`,
          [cleanMobile]
        );
        if (codeRes.rows.length === 0) {
          return { status: 400, error: 'No SMS verification code found or expired.' };
        }
        const row = codeRes.rows[0];
        if (new Date() > new Date(row.expires_at)) {
          await client.query(`DELETE FROM auth_verification_codes WHERE email = $1 AND type = 'sms'`, [cleanMobile]);
          return { status: 400, error: 'SMS verification code has expired.' };
        }
        if (Number(row.attempts || 0) >= 5) {
          await client.query(`DELETE FROM auth_verification_codes WHERE email = $1 AND type = 'sms'`, [cleanMobile]);
          return { status: 429, error: 'Too many failed attempts.' };
        }
        if (row.code === code) {
          await client.query(`DELETE FROM auth_verification_codes WHERE email = $1 AND type = 'sms'`, [cleanMobile]);
          return { ok: true };
        }
        const upd = await client.query(
          `UPDATE auth_verification_codes SET attempts = attempts + 1 WHERE email = $1 AND type = 'sms' RETURNING attempts`,
          [cleanMobile]
        );
        if (Number(upd.rows[0]?.attempts || 0) >= 5) {
          await client.query(`DELETE FROM auth_verification_codes WHERE email = $1 AND type = 'sms'`, [cleanMobile]);
          return { status: 429, error: 'Too many failed attempts.' };
        }
        return { status: 400, error: 'Invalid SMS verification code.' };
      });
      if (result.error) {
        return res.status(result.status).json({ error: result.error });
      }
      smsVerificationCodes.delete(cleanMobile);
    } catch (e) {
      console.error('[Auth] Error verifying SMS code in DB:', e);
      return res.status(500).json({ error: 'Failed to verify SMS code.' });
    }
  } else {
    const record = smsVerificationCodes.get(cleanMobile);
    if (!record) return res.status(400).json({ error: 'No SMS verification code found or expired.' });
    if (Date.now() > record.expiresAt) {
      smsVerificationCodes.delete(cleanMobile);
      return res.status(400).json({ error: 'SMS verification code has expired.' });
    }
    if (record.attempts >= 5) {
      smsVerificationCodes.delete(cleanMobile);
      return res.status(429).json({ error: 'Too many failed attempts.' });
    }
    if (record.code !== code) {
      record.attempts++;
      return res.status(400).json({ error: 'Invalid SMS verification code.' });
    }
    smsVerificationCodes.delete(cleanMobile);
  }

  const user = await store.getUserByMobile(cleanMobile);
  if (user) {
    user.mobileVerified = true;
    user.verified = true;
    await store.saveUser(user);
  }
  res.json({ success: true, message: 'Mobile verified successfully via SMS! Account is now active and usable.' });
});

authRouter.post('/resend-sms-code', rateLimit(10, 3_600_000), async (req: Request, res: Response) => {
  const { mobile } = req.body || {};
  if (typeof mobile !== 'string' || !mobile.trim()) return res.status(400).json({ error: 'Mobile number is required.' });
  const cleanMobile = mobile.trim();
  const now = Date.now();
  const newCode = generate6DigitCode();
  const expiresAtMs = now + 30 * 60 * 1000;

  if (isPostgresEnabled()) {
    const pool = postgresStore.getPool();
    try {
      const existingRes = await pool.query(
        `SELECT last_resend_at FROM auth_verification_codes WHERE email = $1 AND type = 'sms'`,
        [cleanMobile]
      );
      if (existingRes.rows.length > 0 && now - Number(existingRes.rows[0].last_resend_at || 0) < 30_000) {
        return res.status(429).json({ error: 'Please wait 30 seconds before resending SMS.' });
      }
      await pool.query(
        `INSERT INTO auth_verification_codes (email, code, type, attempts, last_resend_at, expires_at, created_at)
         VALUES ($1, $2, 'sms', 0, $3, $4, NOW())
         ON CONFLICT (email, type) DO UPDATE SET code = $2, attempts = 0, last_resend_at = $3, expires_at = $4, created_at = NOW()`,
        [cleanMobile, newCode, now, new Date(expiresAtMs)]
      );
    } catch (e) {
      console.error('[Auth] Failed to persist resend SMS code to DB:', e);
      return res.status(500).json({ error: 'Failed to generate SMS verification code.' });
    }
  } else {
    const existing = smsVerificationCodes.get(cleanMobile);
    if (existing && now - existing.lastResendAt < 30_000) {
      return res.status(429).json({ error: 'Please wait 30 seconds before resending SMS.' });
    }
  }

  smsVerificationCodes.set(cleanMobile, {
    code: newCode,
    expiresAt: expiresAtMs,
    lastResendAt: now,
    attempts: 0
  });

  deliverSecurityCode(cleanMobile, 'SMS_OTP', newCode);
  res.json({ success: true, message: 'New SMS OTP dispatched.' });
});

// 4. Login Endpoints
authRouter.post('/login', handleLogin);
authRouter.post('/login/verify', handleLogin);

// 5. Current Session (Me)
authRouter.get('/me', async (req: Request, res: Response) => {
  const authUserId = resolveAuthenticatedUserId(req);
  if (!authUserId) {
    return res.status(401).json({ error: 'Unauthenticated session token.' });
  }
  const u = await store.getUser(authUserId);
  if (!u) {
    return res.status(401).json({ error: 'User account not found.' });
  }
  return res.json({ success: true, user: safeUser(u) });
});

// 6. Demo Session (dev/test only)
authRouter.post('/demo-session', async (req: Request, res: Response) => {
  if (IS_PRODUCTION && !isTestEnv) return res.status(404).json({ error: 'Not found.' });
  const { userId } = req.body || {};
  const user = await store.getUser(userId);
  if (!user) return res.status(404).json({ error: 'Demo user not found.' });
  if (['admin', 'super_admin', 'support'].includes(user.role)) {
    return res.status(403).json({ error: 'Demo login is not available for privileged accounts.' });
  }
  let sessionVersion: number;
  try {
    sessionVersion = await registerNewUserSessionAtomic(user);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to persist demo session.' });
  }
  const token = signToken({ id: user.id, role: user.role, email: user.email, sessionVersion });
  return res.json({ success: true, token, user: safeUser(user) });
});

// 7. Forgot Password Flow
authRouter.post('/forgot-password/request', rateLimit(10, 3_600_000), async (req: Request, res: Response) => {
  const { emailOrMobile, query: reqQuery } = req.body || {};
  const rawInput = emailOrMobile || reqQuery;
  if (typeof rawInput !== 'string' || !rawInput.trim()) return res.status(400).json({ error: 'Email or mobile is required.' });
  const query = rawInput.trim().toLowerCase();
  const genericResponse = { success: true, message: 'If an account exists, a recovery code has been sent.' };

  const user = await store.getUserByEmailOrMobile(query);
  if (!user) {
    return res.json(genericResponse);
  }

  const now = Date.now();
  const code = generate6DigitCode();
  const expiresAtMs = now + 30 * 60 * 1000;
  const emailKey = (user.email || query).toLowerCase();

  if (isPostgresEnabled()) {
    const pool = postgresStore.getPool();
    try {
      const existingRes = await pool.query(
        `SELECT last_resend_at FROM auth_verification_codes WHERE email = $1 AND type = 'reset'`,
        [emailKey]
      );
      if (existingRes.rows.length > 0 && now - Number(existingRes.rows[0].last_resend_at || 0) < 30_000) {
        return res.json(genericResponse);
      }
      await pool.query(
        `INSERT INTO auth_verification_codes (email, code, type, attempts, last_resend_at, expires_at, created_at)
         VALUES ($1, $2, 'reset', 0, $3, $4, NOW())
         ON CONFLICT (email, type) DO UPDATE SET code = $2, attempts = 0, last_resend_at = $3, expires_at = $4, created_at = NOW()`,
        [emailKey, code, now, new Date(expiresAtMs)]
      );
    } catch (e) {
      console.error('[Auth] Failed to persist reset code to DB:', e);
      return res.status(500).json({ error: 'Failed to generate recovery code.' });
    }
  } else {
    if (IS_PRODUCTION) {
      return res.status(500).json({ error: 'Security verification requires database connection in production.' });
    }
    const existing = forgotPasswordCodes.get(query);
    if (existing && now - existing.lastResendAt < 30_000) {
      return res.json(genericResponse);
    }
    forgotPasswordCodes.set(query, {
      code,
      expiresAt: expiresAtMs,
      lastResendAt: now,
      attempts: 0
    });
  }

  if (user.role === 'admin' || user.role === 'super_admin') {
    deliverAdminCode(user.email, code);
  } else if (user.email) {
    deliverSecurityCode(user.email, 'PASSWORD_RESET', code);
  } else if (user.mobile) {
    deliverSecurityCode(user.mobile, 'PASSWORD_RESET', code);
  }

  res.json({ ...genericResponse, mockCode: process.env.NODE_ENV !== 'production' ? code : undefined });
});

authRouter.post('/forgot-password/verify', async (req: Request, res: Response) => {
  const { emailOrMobile, query: reqQuery, code } = req.body || {};
  const rawInput = emailOrMobile || reqQuery;
  if (typeof rawInput !== 'string' || !rawInput.trim() || !code) return res.status(400).json({ error: 'Identifier and code are required.' });
  const query = rawInput.trim().toLowerCase();
  const trimmedCode = String(code).trim();

  if (isPostgresEnabled()) {
    try {
      const errRes = await postgresStore.executeInTransaction(async (client) => {
        const codeRes = await client.query(
          `SELECT * FROM auth_verification_codes WHERE (email = $1 OR email = (SELECT LOWER(email) FROM users WHERE mobile = $1 LIMIT 1)) AND type = 'reset' FOR UPDATE`,
          [query]
        );
        if (codeRes.rows.length === 0) {
          return { status: 400, error: 'Invalid or expired recovery code.' };
        }
        const row = codeRes.rows[0];
        if (new Date() > new Date(row.expires_at)) {
          await client.query(`DELETE FROM auth_verification_codes WHERE email = $1 AND type = 'reset'`, [row.email]);
          return { status: 400, error: 'Invalid or expired recovery code.' };
        }
        if (Number(row.attempts || 0) >= 5) {
          await client.query(`DELETE FROM auth_verification_codes WHERE email = $1 AND type = 'reset'`, [row.email]);
          return { status: 429, error: 'Too many failed attempts. Please request a new recovery code.' };
        }
        if (row.code !== trimmedCode) {
          const upd = await client.query(
            `UPDATE auth_verification_codes SET attempts = attempts + 1 WHERE email = $1 AND type = 'reset' RETURNING attempts`,
            [row.email]
          );
          if (Number(upd.rows[0]?.attempts || 0) >= 5) {
            await client.query(`DELETE FROM auth_verification_codes WHERE email = $1 AND type = 'reset'`, [row.email]);
            return { status: 429, error: 'Too many failed attempts. Please request a new recovery code.' };
          }
          return { status: 400, error: 'Invalid or expired recovery code.' };
        }
        return null;
      });

      if (errRes) {
        return res.status(errRes.status).json({ error: errRes.error });
      }
      return res.json({ success: true, message: 'Code verified successfully.' });
    } catch (e) {
      console.error('[Auth] Error verifying reset code from DB:', e);
      return res.status(500).json({ error: 'Failed to verify recovery code.' });
    }
  }

  if (IS_PRODUCTION) {
    return res.status(500).json({ error: 'Security verification requires database connection in production.' });
  }

  const check = checkRecoveryCode(query, trimmedCode, true);
  if (check === 'locked') return res.status(429).json({ error: 'Too many failed attempts. Please request a new recovery code.' });
  if (check !== 'ok') {
    return res.status(400).json({ error: 'Invalid or expired recovery code.' });
  }

  res.json({ success: true, message: 'Code verified successfully.' });
});

authRouter.post('/forgot-password/reset', async (req: Request, res: Response) => {
  const { emailOrMobile, query: reqQuery, code, newPassword, confirmPassword, confirmNewPassword } = req.body || {};
  const rawInput = emailOrMobile || reqQuery;
  if (typeof rawInput !== 'string' || !rawInput.trim() || !code || typeof newPassword !== 'string' || !newPassword) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  const confirmToUse = confirmPassword || confirmNewPassword;
  if (confirmToUse && newPassword !== confirmToUse) {
    return res.status(400).json({ error: 'Passwords do not match.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
  }
  const query = rawInput.trim().toLowerCase();
  const trimmedCode = String(code).trim();

  if (isPostgresEnabled()) {
    try {
      const errRes = await postgresStore.executeInTransaction(async (client) => {
        const codeRes = await client.query(
          `SELECT * FROM auth_verification_codes WHERE (email = $1 OR email = (SELECT LOWER(email) FROM users WHERE mobile = $1 LIMIT 1)) AND type = 'reset' FOR UPDATE`,
          [query]
        );
        if (codeRes.rows.length === 0) {
          return { status: 400, error: 'Invalid or expired recovery code. Please request a new one.' };
        }
        const row = codeRes.rows[0];
        if (new Date() > new Date(row.expires_at)) {
          await client.query(`DELETE FROM auth_verification_codes WHERE email = $1 AND type = 'reset'`, [row.email]);
          return { status: 400, error: 'Invalid or expired recovery code. Please request a new one.' };
        }
        if (Number(row.attempts || 0) >= 5) {
          await client.query(`DELETE FROM auth_verification_codes WHERE email = $1 AND type = 'reset'`, [row.email]);
          return { status: 429, error: 'Too many failed attempts. Please request a new recovery code.' };
        }
        if (row.code !== trimmedCode) {
          const upd = await client.query(
            `UPDATE auth_verification_codes SET attempts = attempts + 1 WHERE email = $1 AND type = 'reset' RETURNING attempts`,
            [row.email]
          );
          if (Number(upd.rows[0]?.attempts || 0) >= 5) {
            await client.query(`DELETE FROM auth_verification_codes WHERE email = $1 AND type = 'reset'`, [row.email]);
            return { status: 429, error: 'Too many failed attempts. Please request a new recovery code.' };
          }
          return { status: 400, error: 'Invalid or expired recovery code. Please request a new one.' };
        }
        await client.query(`DELETE FROM auth_verification_codes WHERE email = $1 AND type = 'reset'`, [row.email]);
        return null;
      });

      if (errRes) {
        return res.status(errRes.status).json({ error: errRes.error });
      }
    } catch (e) {
      console.error('[Auth] Error querying reset code during reset:', e);
      return res.status(500).json({ error: 'Failed to reset password.' });
    }
  } else {
    if (IS_PRODUCTION) {
      return res.status(500).json({ error: 'Security verification requires database connection in production.' });
    }
    const record = forgotPasswordCodes.get(query);
    if (!record || record.code !== trimmedCode || Date.now() > record.expiresAt) {
      return res.status(400).json({ error: 'Invalid or expired recovery code. Please request a new one.' });
    }
    forgotPasswordCodes.delete(query);
  }

  const user = await store.getUserByEmailOrMobile(query);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  user.password = await bcrypt.hash(newPassword, 10);
  user.sessionVersion = (user.sessionVersion || 1) + MAX_ACTIVE_SESSIONS;
  (user as any).activeSessionVersions = [];
  await store.saveUser(user);
  disconnectUserSockets(user.id, 'Password reset');

  res.json({ success: true, message: 'Password reset successfully. Please log in with your new password.' });
});

// 8. Withdrawal Code Request & Execute
authRouter.post('/withdrawal/request-code', requireAuth, async (req: Request, res: Response) => {
  const authUserId = resolveAuthenticatedUserId(req);
  const caller = authUserId ? await store.getUser(authUserId) : null;
  if (!caller || !caller.email) return res.status(400).json({ error: 'User email not found.' });

  const code = generate6DigitCode();
  const now = Date.now();
  const expiresAtMs = now + 30 * 60 * 1000;

  if (isPostgresEnabled()) {
    try {
      await postgresStore.getPool().query(
        `INSERT INTO auth_verification_codes (email, code, type, attempts, last_resend_at, expires_at, created_at)
         VALUES ($1, $2, 'withdrawal', 0, $3, $4, NOW())
         ON CONFLICT (email, type) DO UPDATE SET code = $2, attempts = 0, last_resend_at = $3, expires_at = $4, created_at = NOW()`,
        [caller.id, code, now, new Date(expiresAtMs)]
      );
    } catch (e) {
      console.error('[Auth] Failed to persist withdrawal verification code to DB:', e);
      return res.status(500).json({ error: 'Failed to generate withdrawal verification code.' });
    }
  } else {
    if (IS_PRODUCTION) {
      return res.status(500).json({ error: 'Security verification requires database connection in production.' });
    }
    withdrawalVerificationCodes.set(caller.id, {
      code,
      expiresAt: expiresAtMs,
      lastResendAt: now,
      attempts: 0
    });
  }

  deliverSecurityCode(caller.email, 'WITHDRAWAL', code);

  recordUserEmail({
    id: 'email_' + Date.now() + '_' + randomUUID().slice(0, 8),
    userId: caller.id,
    userEmail: caller.email,
    subject: 'Withdrawal Email Verification Requested',
    snippet: 'Withdrawal verification code dispatched.',
    body: 'You requested a withdrawal from your WorkPerHour wallet. Please use the verification code sent to your registered contact channel to complete the transaction.',
    date: new Date().toLocaleDateString(),
    read: false,
    type: 'GENERAL'
  });

  res.json({
    success: true,
    message: 'Withdrawal verification code sent to your registered email.',
    codeRequired: EMAIL_DELIVERY_ENABLED || !IS_PRODUCTION
  });
});

authRouter.post('/withdrawal/verify-and-execute', requireAuth, requireActiveStatus, rateLimit(10, 60_000), (req: Request, res: Response) => {
  const caller = (req as any).authenticatedUser;
  req.body.userId = caller.id;
  return handlePayoutRequest(req, res);
});
