import { RepoContext } from '../types.js';
import { type User, type UserEmail, mapUserRow } from '../../store.js';

export class IdentityRepo {
  constructor(private ctx: RepoContext) {}

  async saveUsers(users: User[]): Promise<void> {
    return this.ctx.withLock('users', async () => {
      if (!users) return;
      const client = await this.ctx.getPool().connect();
      try {
        await client.query('BEGIN');
        const seen = new Set<string>();
        for (const u of users) {
          if (!u?.id || seen.has(u.id)) continue;
          seen.add(u.id);
          if (u.email) {
            const conflictCheck = await client.query(
              'SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id <> $2 LIMIT 1',
              [u.email, u.id]
            );
            if (conflictCheck.rows.length > 0) {
              throw new Error('Email address is already registered to another user');
            }
          }
          await client.query(
            `INSERT INTO users (
              id, name, username, email, mobile, role, avatar, title, rating, reviews_count, 
              hourly_rate, earned, completed_jobs, bio, skills, status, verified, email_verified, 
              mobile_verified, wallet_balance, created_at, is_flagged, flag_reason, password, 
              session_version, known_devices, is_available_now, notification_preferences
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
            ON CONFLICT (id) DO UPDATE SET
              name = EXCLUDED.name,
              username = EXCLUDED.username,
              email = EXCLUDED.email,
              mobile = EXCLUDED.mobile,
              role = EXCLUDED.role,
              avatar = EXCLUDED.avatar,
              title = EXCLUDED.title,
              rating = EXCLUDED.rating,
              reviews_count = EXCLUDED.reviews_count,
              hourly_rate = EXCLUDED.hourly_rate,
              earned = EXCLUDED.earned,
              completed_jobs = EXCLUDED.completed_jobs,
              bio = EXCLUDED.bio,
              skills = EXCLUDED.skills,
              status = EXCLUDED.status,
              verified = EXCLUDED.verified,
              email_verified = EXCLUDED.email_verified,
              mobile_verified = EXCLUDED.mobile_verified,
              wallet_balance = EXCLUDED.wallet_balance,
              created_at = EXCLUDED.created_at,
              is_flagged = EXCLUDED.is_flagged,
              flag_reason = EXCLUDED.flag_reason,
              password = EXCLUDED.password,
              session_version = EXCLUDED.session_version,
              known_devices = EXCLUDED.known_devices,
              is_available_now = EXCLUDED.is_available_now,
              notification_preferences = EXCLUDED.notification_preferences`,
            [
              u.id, u.name, u.username || null, u.email, u.mobile || null, u.role, u.avatar || null,
              u.title || null, u.rating ?? 5.0, u.reviewsCount ?? 0, u.hourlyRate ?? 0, u.earned ?? 0,
              u.completedJobs ?? 0, u.bio || null, u.skills || [], u.status || 'active',
              !!u.verified, !!u.emailVerified, !!u.mobileVerified, u.walletBalance ?? 0,
              u.createdAt || new Date().toISOString(), !!u.isFlagged, u.flagReason || null,
              u.password || null, u.sessionVersion ?? 1, u.knownDevices || ['dev_default_session'],
              !!u.isAvailableNow, u.notificationPreferences ? JSON.stringify(u.notificationPreferences) : null
            ]
          );
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    });
  }

  async saveUser(user: User): Promise<void> {
    return this.saveUsers([user]);
  }

  async listUsers(): Promise<User[]> {
    const res = await this.ctx.getPool().query("SELECT * FROM users WHERE id != 'system'");
    return res.rows.map(mapUserRow);
  }

  async listPublicUsers(): Promise<User[]> {
    const res = await this.ctx.getPool().query(`
      SELECT * FROM users 
      WHERE status = 'active' 
      AND (is_flagged = FALSE OR is_flagged IS NULL)
      AND role NOT IN ('admin', 'super_admin', 'support', 'moderator', 'staff', 'internal')
    `);
    return res.rows.map(mapUserRow);
  }

  async getUser(id: string): Promise<User | null> {
    const res = await this.ctx.getPool().query('SELECT * FROM users WHERE id = $1', [id]);
    return res.rows.length > 0 ? mapUserRow(res.rows[0]) : null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const res = await this.ctx.getPool().query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    return res.rows.length > 0 ? mapUserRow(res.rows[0]) : null;
  }

  async getUserByUsername(username: string): Promise<User | null> {
    const res = await this.ctx.getPool().query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [username]);
    return res.rows.length > 0 ? mapUserRow(res.rows[0]) : null;
  }

  async getUserByMobile(mobile: string): Promise<User | null> {
    const res = await this.ctx.getPool().query('SELECT * FROM users WHERE mobile = $1', [mobile]);
    return res.rows.length > 0 ? mapUserRow(res.rows[0]) : null;
  }

  async getUserByEmailOrMobile(identifier: string): Promise<User | null> {
    const res = await this.ctx.getPool().query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1) OR mobile = $1',
      [identifier]
    );
    return res.rows.length > 0 ? mapUserRow(res.rows[0]) : null;
  }

  // --- USER EMAILS ---
  async addUserEmail(em: UserEmail): Promise<void> {
    if (!em?.id) return;
    await this.ctx.getPool().query(
      `INSERT INTO user_emails (id, user_id, user_email, subject, snippet, body, type, sent_at, date, read)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         user_email = EXCLUDED.user_email,
         subject = EXCLUDED.subject,
         snippet = EXCLUDED.snippet,
         body = EXCLUDED.body,
         type = EXCLUDED.type,
         sent_at = EXCLUDED.sent_at,
         date = EXCLUDED.date,
         read = EXCLUDED.read`,
      [
        em.id, em.userId, em.userEmail, em.subject, em.snippet || null, em.body,
        (em as any).type || null, (em as any).sentAt || null, em.date || null, !!em.read
      ]
    );
  }

  async saveUserEmails(emails: UserEmail[]): Promise<void> {
    return this.ctx.withLock('user_emails', async () => {
      if (!emails) return;
      const client = await this.ctx.getPool().connect();
      try {
        await client.query('BEGIN');
        for (const em of emails) {
          if (!em?.id) continue;
          await client.query(
            `INSERT INTO user_emails (id, user_id, user_email, subject, snippet, body, type, sent_at, date, read)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (id) DO UPDATE SET
               user_id = EXCLUDED.user_id,
               user_email = EXCLUDED.user_email,
               subject = EXCLUDED.subject,
               snippet = EXCLUDED.snippet,
               body = EXCLUDED.body,
               type = EXCLUDED.type,
               sent_at = EXCLUDED.sent_at,
               date = EXCLUDED.date,
               read = EXCLUDED.read`,
            [
              em.id, em.userId, em.userEmail, em.subject, em.snippet || null, em.body,
              (em as any).type || null, (em as any).sentAt || null, em.date || null, !!em.read
            ]
          );
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    });
  }

  async listUserEmails(): Promise<UserEmail[]> {
    const res = await this.ctx.getPool().query('SELECT * FROM user_emails');
    return res.rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      userEmail: r.user_email,
      subject: r.subject,
      snippet: r.snippet || '',
      body: r.body,
      date: r.date || '',
      read: r.read,
      type: r.type || 'GENERAL',
      ...(r.sent_at ? { sentAt: r.sent_at } : {})
    }));
  }

  async listUserEmailsForUser(userId: string): Promise<UserEmail[]> {
    const res = await this.ctx.getPool().query(
      'SELECT * FROM user_emails WHERE user_id = $1 ORDER BY date DESC',
      [userId]
    );
    return res.rows.map(e => ({
      id: e.id,
      userId: e.user_id,
      userEmail: e.user_email,
      subject: e.subject,
      snippet: e.snippet ? e.snippet.replace(/\b\d{6}\b/g, '******') : '',
      body: e.body ? e.body.replace(/\b\d{6}\b/g, '******') : '',
      date: e.date,
      read: Boolean(e.read),
      type: e.type || 'GENERAL'
    }));
  }

  async markUserEmailRead(id: string, userId?: string): Promise<void> {
    if (userId) {
      await this.ctx.getPool().query('UPDATE user_emails SET read = TRUE WHERE id = $1 AND user_id = $2', [id, userId]);
    } else {
      await this.ctx.getPool().query('UPDATE user_emails SET read = TRUE WHERE id = $1', [id]);
    }
  }
}
