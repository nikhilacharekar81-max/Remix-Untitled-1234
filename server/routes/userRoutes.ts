import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { store } from '../store.js';
import { postgresStore, isPostgresEnabled } from '../db/postgresStore.js';
import { isUserPublic, sanitizePublicUser } from '../publicData.js';
import {
  requireAuth,
  requireAdmin,
  adminActor,
  safeUser,
  isStaffUser,
  escapeHtml,
  signToken,
  resolveAuthenticatedUserId
} from '../middleware/auth.js';
import { siteSettings } from '../../src/server/siteSettings.js';
import { registerAuditLog } from '../services/orderService.js';
import { disconnectUserSockets } from '../websocket.js';
import { deliverSecurityCode } from '../services/notificationService.js';
import { generate6DigitCode, emailVerificationCodes } from '../services/authService.js';
import { financialRepository } from '../domains/finance/financial.service.js';

export const userRouter = Router();

// Public users list (returns full safeUser list for staff/admin callers)
userRouter.get('/users', async (req: Request, res: Response) => {
  try {
    const callerId = (req as any).authenticatedUserId;
    const caller = (req as any).authenticatedUser || (callerId ? await store.getUser(callerId) : null);
    if (isStaffUser(caller)) {
      const allUsers = await store.listUsers();
      return res.json(allUsers.map(safeUser));
    }
    const publicUsers = await store.listPublicUsers();
    res.json(publicUsers.map(sanitizePublicUser));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list users' });
  }
});

// Update authenticated user profile
userRouter.patch('/users/profile', requireAuth, async (req: Request, res: Response) => {
  try {
    const authUserId = (req as any).authenticatedUserId;
    const user = await store.getUser(authUserId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const {
      name,
      title,
      bio,
      hourlyRate,
      skills,
      avatar,
      isAvailableNow,
      username
    } = req.body || {};

    if (typeof name === 'string' && name.trim()) {
      user.name = escapeHtml(name.trim().slice(0, 80));
    }
    if (typeof title === 'string') {
      user.title = escapeHtml(title.trim().slice(0, 120));
    }
    if (typeof bio === 'string') {
      user.bio = escapeHtml(bio.trim());
    }
    if (typeof hourlyRate === 'number' && Number.isFinite(hourlyRate) && hourlyRate >= 0) {
      user.hourlyRate = hourlyRate;
    }
    if (Array.isArray(skills)) {
      user.skills = skills.map((s: any) => String(s).trim()).filter(Boolean);
    } else if (typeof skills === 'string') {
      user.skills = skills.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (typeof avatar === 'string' && avatar.trim()) {
      user.avatar = avatar.trim();
    }
    if (typeof isAvailableNow === 'boolean') {
      user.isAvailableNow = isAvailableNow;
    }
    if (typeof username === 'string' && username.trim() && username.trim().toLowerCase() !== user.username?.toLowerCase()) {
      const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '');
      if (cleanUsername) {
        const existing = await store.getUserByUsername(cleanUsername);
        if (existing && existing.id !== user.id) {
          return res.status(409).json({ error: 'Username is already taken.' });
        }
        user.username = cleanUsername;
      }
    }

    await store.saveUser(user);

    if (user.role === 'freelancer') {
      await postgresStore.getPool().query(
        `UPDATE gigs SET 
          freelancer_name = $1, 
          freelancer_username = $2, 
          freelancer_avatar = $3 
         WHERE freelancer_id = $4`,
        [user.name, user.username || null, user.avatar || null, user.id]
      );
    }

    res.json({ success: true, user: safeUser(user) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update profile' });
  }
});

// Update user email address
userRouter.patch('/users/email', requireAuth, async (req: Request, res: Response) => {
  try {
    const authUserId = (req as any).authenticatedUserId;
    const user = await store.getUser(authUserId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { email, currentPassword } = req.body || {};
    if (typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ error: 'Email is required.' });
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail === user.email.toLowerCase()) {
      return res.json({ success: true, user: safeUser(user) });
    }

    if (user.password) {
      if (!currentPassword || typeof currentPassword !== 'string') {
        return res.status(401).json({ error: 'Current password is required to change email.' });
      }
      const match = await bcrypt.compare(String(currentPassword), user.password);
      if (!match) {
        return res.status(401).json({ error: 'Current password does not match.' });
      }
    }

    const existing = await store.getUserByEmail(normalizedEmail);
    if (existing && existing.id !== user.id) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    user.email = normalizedEmail;
    user.emailVerified = false;
    user.sessionVersion = (user.sessionVersion || 1) + 1;
    user.activeSessionVersions = [user.sessionVersion];
    await store.saveUser(user);

    disconnectUserSockets(user.id);

    const verificationCode = generate6DigitCode();
    const expiresAtMs = Date.now() + 30 * 60 * 1000;
    if (isPostgresEnabled()) {
      await postgresStore.getPool().query(
        `INSERT INTO auth_verification_codes (email, code, type, attempts, last_resend_at, expires_at, created_at)
         VALUES ($1, $2, 'verify', 0, $3, $4, NOW())
         ON CONFLICT (email, type) DO UPDATE SET code = $2, attempts = 0, last_resend_at = $3, expires_at = $4, created_at = NOW()`,
        [normalizedEmail, verificationCode, Date.now(), new Date(expiresAtMs)]
      );
    } else {
      emailVerificationCodes.set(normalizedEmail, {
        code: verificationCode,
        expiresAt: expiresAtMs,
        lastResendAt: Date.now(),
        attempts: 0
      });
    }

    deliverSecurityCode(normalizedEmail, 'EMAIL_VERIFICATION', verificationCode);

    res.json({ success: true, user: safeUser(user) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update email' });
  }
});

userRouter.get('/users/notification-preferences', requireAuth, async (req: Request, res: Response) => {
  const authUserId = (req as any).authenticatedUserId;
  const user = await store.getUser(authUserId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const prefs = user.notificationPreferences || {};
  res.json({
    emailNotifications: prefs.emailNotifications || 'Instant alerts for all messages',
    smsNotifications: prefs.smsNotifications || (user.mobile ? `Enabled (${user.mobile})` : 'Disabled'),
    marketingNotifs: prefs.marketingNotifs || 'Subscribed',
    mobile: user.mobile || null
  });
});

userRouter.patch('/users/notification-preferences', requireAuth, async (req: Request, res: Response) => {
  const authUserId = (req as any).authenticatedUserId;
  const user = await store.getUser(authUserId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { emailNotifications, smsNotifications, marketingNotifs } = req.body || {};

  if (!user.notificationPreferences) {
    user.notificationPreferences = {};
  }

  if (typeof emailNotifications === 'string') {
    user.notificationPreferences.emailNotifications = emailNotifications;
  }
  if (typeof smsNotifications === 'string') {
    user.notificationPreferences.smsNotifications = smsNotifications;
  }
  if (typeof marketingNotifs === 'string') {
    user.notificationPreferences.marketingNotifs = marketingNotifs;
  }

  await store.saveUser(user);
  res.json({
    success: true,
    notificationPreferences: user.notificationPreferences
  });
});

userRouter.patch('/users/availability', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).authenticatedUserId;
  const { isAvailableNow } = req.body;
  const user = await store.getUser(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.isAvailableNow = !!isAvailableNow;
  await store.saveUser(user);
  res.json({ success: true, user: safeUser(user) });
});

// Get user profile by ID
userRouter.get('/users/:id', async (req: Request, res: Response) => {
  try {
    const user = await store.getUser(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const callerId = resolveAuthenticatedUserId(req) || (req as any).authenticatedUserId;
    const caller = (req as any).authenticatedUser || (callerId ? await store.getUser(callerId) : null);
    const isStaff = isStaffUser(caller);
    if (callerId === user.id || isStaff) {
      return res.json(safeUser(user));
    }
    return res.json(sanitizePublicUser(user));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch user' });
  }
});

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Update User (including password update with currentPassword check)
const handleUserUpdate = async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const targetUser = await store.getUser(userId);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    const authUserId = resolveAuthenticatedUserId(req) || (req as any).authenticatedUserId;
    const caller = (req as any).authenticatedUser || (authUserId ? await store.getUser(authUserId) : null);
    if (!caller) return res.status(401).json({ error: 'Authentication required' });

    const isSuperAdminUser = caller.role === 'super_admin';
    const isFullAdmin = caller.role === 'admin' || isSuperAdminUser;

    if (caller.id !== targetUser.id && !isFullAdmin) {
      return res.status(403).json({ error: 'Forbidden: You can only edit your own account.' });
    }

    if (req.body.role !== undefined && targetUser.role !== req.body.role) {
      if (!isFullAdmin) {
        return res.status(403).json({ error: 'Forbidden: Only administrators can modify roles.' });
      }
      const allowedRoles = [
        'Format', 'Freelancer', 'Employer', 'Both',
        'admin', 'super_admin', 'support', 'moderator', 'finance_manager',
        'buyer', 'freelancer'
      ];
      if (!allowedRoles.includes(req.body.role)) {
        return res.status(400).json({ error: `Invalid role "${req.body.role}". Allowed roles: ${allowedRoles.join(', ')}` });
      }
      if ((targetUser.role === 'super_admin' || req.body.role === 'super_admin') && !isSuperAdminUser) {
        return res.status(403).json({ error: 'Forbidden: Only super_admin can grant or revoke super_admin role.' });
      }
      targetUser.role = req.body.role;
    }

    let newToken: string | undefined;

    if (req.body.password) {
      if (caller.id !== targetUser.id) {
        if (!isFullAdmin) {
          return res.status(403).json({ error: 'Forbidden: You cannot modify another user password.' });
        }
        if (targetUser.role === 'super_admin' && !isSuperAdminUser) {
          return res.status(403).json({ error: 'Forbidden: Only super_admin can reset password of a super_admin.' });
        }
      } else {
        const currentPassword = req.body.currentPassword;
        if (!currentPassword) {
          return res.status(400).json({ error: 'Current password is required to change password' });
        }
        const pool = postgresStore.getPool();
        const userRowRes = await pool.query("SELECT password, password_hash FROM users WHERE id = $1", [targetUser.id]);
        const currentHash = userRowRes.rows[0]?.password_hash || userRowRes.rows[0]?.password || (targetUser as any).password;
        const matches = currentHash && (await verifyPassword(currentPassword, currentHash));
        if (!matches) {
          return res.status(400).json({ error: 'Current password does not match' });
        }
      }

      const newPassword = String(req.body.password);
      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
      }
      const hashed = await bcrypt.hash(newPassword, 10);
      targetUser.password = hashed;
      const pool = postgresStore.getPool();

      // Session invalidation & WebSocket disconnect
      const newVersion = (Number(targetUser.sessionVersion) || 1) + 1;
      targetUser.sessionVersion = newVersion;
      if (caller.id === targetUser.id) {
        targetUser.activeSessionVersions = [newVersion];
        newToken = signToken({
          id: targetUser.id,
          role: targetUser.role,
          email: targetUser.email,
          sessionVersion: newVersion
        });
      } else {
        targetUser.activeSessionVersions = [];
      }

      await pool.query(
        "UPDATE users SET password = $1, password_hash = $1, session_version = $2 WHERE id = $3",
        [hashed, newVersion, targetUser.id]
      );

      disconnectUserSockets(targetUser.id);
    }

    if (req.body.name) targetUser.name = escapeHtml(String(req.body.name).trim().slice(0, 80));
    if (req.body.title) targetUser.title = escapeHtml(String(req.body.title).trim().slice(0, 120));
    if (req.body.bio) targetUser.bio = escapeHtml(String(req.body.bio).trim());
    if (req.body.avatar) targetUser.avatar = String(req.body.avatar).trim();

    await store.saveUser(targetUser);
    const safeResult: any = safeUser(targetUser);
    if (newToken) {
      safeResult.token = newToken;
      res.setHeader('x-auth-token', newToken);
    }
    res.json(safeResult);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update user' });
  }
};

userRouter.put('/users/:id', requireAuth, handleUserUpdate);
userRouter.patch('/users/:id', requireAuth, handleUserUpdate);

userRouter.delete('/users/:id', requireAdmin, async (req: Request, res: Response) => {
  const { handleDeleteUserAccount } = await import('./adminRoutes.js');
  return handleDeleteUserAccount(req, res);
});

userRouter.post('/users/:id/flag', requireAdmin, async (req: Request, res: Response) => {
  const user = await store.getUser(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.isFlagged = !user.isFlagged;
  user.flagReason = user.isFlagged ? (req.body.reason || 'Flagged for TOS investigation.') : undefined;
  await store.saveUser(user);

  await registerAuditLog({
    id: 'log_' + Date.now() + '_' + randomUUID().slice(0, 8),
    actor: adminActor(req),
    role: 'admin',
    action: user.isFlagged ? 'USER_FLAGGED_TOS' : 'USER_UNFLAGGED_TOS',
    target: `User #${user.id} (${user.name})`,
    details: user.flagReason || 'Flag removed',
    timestamp: new Date().toLocaleString()
  });

  res.json({ success: true, isFlagged: user.isFlagged, flagReason: user.flagReason });
});

userRouter.get('/user/quota-status', requireAuth, async (req: Request, res: Response) => {
  try {
    const authUserId = (req as any).authenticatedUserId;
    const user = await store.getUser(authUserId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const activeSettings = siteSettings.getSettings();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const [bidsRes, jobPostsRes] = await Promise.all([
      postgresStore.getPool().query(
        'SELECT count(*) FROM proposals WHERE freelancer_id = $1 AND created_at >= $2',
        [user.id, thirtyDaysAgo]
      ),
      postgresStore.getPool().query(
        'SELECT count(*) FROM projects WHERE buyer_id = $1 AND created_at >= $2',
        [user.id, thirtyDaysAgo]
      )
    ]);

    const bidsUsed = parseInt(bidsRes.rows[0]?.count || '0', 10);
    const jobPostsUsed = parseInt(jobPostsRes.rows[0]?.count || '0', 10);

    const freelancerPlanId = (user as any).membershipTier || 'plan_free';
    const freelancerPlan = activeSettings.memberships.freelancerPlans.find(p => p.id === freelancerPlanId) || activeSettings.memberships.freelancerPlans[0];

    const buyerPlanId = (user as any).buyerMembershipTier || 'buyer_free';
    const buyerPlan = activeSettings.memberships.buyerPlans.find(p => p.id === buyerPlanId) || activeSettings.memberships.buyerPlans[0];

    const rawBidsLimit = freelancerPlan?.bidsPerMonth ?? 0;
    const bidsLimit = rawBidsLimit > 0 ? rawBidsLimit : null;
    const bidsRemaining = bidsLimit !== null ? Math.max(0, bidsLimit - bidsUsed) : null;

    const rawJobPostsLimit = buyerPlan?.jobPostsPerMonth ?? 0;
    const jobPostsLimit = rawJobPostsLimit > 0 ? rawJobPostsLimit : null;
    const jobPostsRemaining = jobPostsLimit !== null ? Math.max(0, jobPostsLimit - jobPostsUsed) : null;

    res.json({
      success: true,
      membershipsEnabled: activeSettings.memberships.membershipsEnabled,
      freelancer: {
        planId: freelancerPlanId,
        planName: freelancerPlan?.name || 'Standard Freelancer',
        bidsUsed,
        bidsLimit,
        bidsRemaining,
        unlimited: bidsLimit === null
      },
      buyer: {
        planId: buyerPlanId,
        planName: buyerPlan?.name || 'Standard Client',
        jobPostsUsed,
        jobPostsLimit,
        jobPostsRemaining,
        unlimited: jobPostsLimit === null
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

userRouter.post('/user/membership', requireAuth, async (req: Request, res: Response) => {
  try {
    const authUserId = (req as any).authenticatedUserId;
    const user = await store.getUser(authUserId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const activeSettings = siteSettings.getSettings();
    const { freelancerPlanId, buyerPlanId } = req.body || {};
    if (freelancerPlanId) {
      const plan = activeSettings.memberships.freelancerPlans.find(p => p.id === freelancerPlanId);
      if (!plan || !plan.enabled) {
        return res.status(400).json({ error: 'Invalid or disabled membership plan.' });
      }
      if (plan.priceMonthly > 0) {
        return res.status(402).json({ error: 'Paid plans require checkout' });
      }
      (user as any).membershipTier = freelancerPlanId;
    }
    if (buyerPlanId) {
      const plan = activeSettings.memberships.buyerPlans.find(p => p.id === buyerPlanId);
      if (!plan || !plan.enabled) {
        return res.status(400).json({ error: 'Invalid or disabled buyer plan.' });
      }
      if (plan.priceMonthly > 0) {
        return res.status(402).json({ error: 'Paid plans require checkout' });
      }
      (user as any).buyerMembershipTier = buyerPlanId;
    }
    await store.saveUser(user);
    res.json({ success: true, user: safeUser(user) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

userRouter.get('/user-emails/:userId', requireAuth, async (req: Request, res: Response) => {
  try {
    const caller = (req as any).authenticatedUser;
    const targetUser = await store.getUser(req.params.userId);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    const isSelf = caller.id === req.params.userId;
    const isSuperAdmin = caller.role === 'super_admin';
    const isAdmin = caller.role === 'admin';
    const isSupport = caller.role === 'support';
    const isTargetAdmin = targetUser.role === 'admin' || targetUser.role === 'super_admin';

    if (!isSelf) {
      if (isSupport && isTargetAdmin) {
        return res.status(403).json({ error: 'Forbidden: Support staff cannot inspect administrator emails.' });
      }
      if (isAdmin && targetUser.role === 'super_admin') {
        return res.status(403).json({ error: 'Forbidden: Only super_admin can inspect super_admin emails.' });
      }
      if (!isAdmin && !isSuperAdmin && !isSupport) {
        return res.status(403).json({ error: 'Forbidden: Insufficient privileges.' });
      }
    }

    const userList = await store.listUserEmailsForUser(req.params.userId);
    res.json(userList);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list user emails' });
  }
});

userRouter.patch('/user-emails/:id/read', requireAuth, async (req: Request, res: Response) => {
  try {
    const callerId = (req as any).authenticatedUserId;
    const isStaff = isStaffUser((req as any).authenticatedUser);

    await store.markUserEmailRead(req.params.id, isStaff ? undefined : callerId);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to mark email read' });
  }
});
