import { RepoContext } from '../types.js';
import { type Notification } from '../../store.js';

export class NotificationsRepo {
  constructor(private ctx: RepoContext) {}

  async saveNotification(n: Notification, client?: any): Promise<{ inserted: boolean; duplicate?: boolean }> {
    const dbRunner = client || this.ctx.getPool();
    const useSavepoint = Boolean(client);
    const spName = `sp_notif_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    try {
      if (useSavepoint) {
        await dbRunner.query(`SAVEPOINT ${spName}`);
      }
      if (n.dedupKey) {
        const res = await dbRunner.query(
          `INSERT INTO notifications (id, user_id, type, title, message, link, read, created_at, dedup_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (dedup_key) DO NOTHING`,
          [n.id, n.userId, n.type, n.title, n.message, n.link || null, !!n.read, n.createdAt, n.dedupKey]
        );
        if (useSavepoint) {
          await dbRunner.query(`RELEASE SAVEPOINT ${spName}`);
        }
        if (res.rowCount === 0) {
          return { inserted: false, duplicate: true };
        }
        return { inserted: true };
      }
      await dbRunner.query(
        `INSERT INTO notifications (id, user_id, type, title, message, link, read, created_at, dedup_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           read = EXCLUDED.read`,
        [n.id, n.userId, n.type, n.title, n.message, n.link || null, !!n.read, n.createdAt, null]
      );
      if (useSavepoint) {
        await dbRunner.query(`RELEASE SAVEPOINT ${spName}`);
      }
      return { inserted: true };
    } catch (err: any) {
      if (useSavepoint) {
        try { await dbRunner.query(`ROLLBACK TO SAVEPOINT ${spName}`); } catch {}
      }
      const isDedupConflict =
        err?.code === '23505' &&
        (err?.constraint?.includes('dedup') ||
         err?.detail?.includes('dedup_key') ||
         err?.message?.includes('dedup_key') ||
         err?.constraint === 'notifications_dedup_key_key');

      if (isDedupConflict) {
        return { inserted: false, duplicate: true };
      }
      throw err;
    }
  }

  async saveNotifications(notifications: Notification[]): Promise<void> {
    for (const n of notifications) {
      await this.saveNotification(n);
    }
  }

  async listNotificationsForUser(userId: string): Promise<Notification[]> {
    const res = await this.ctx.getPool().query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return res.rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      type: r.type,
      title: r.title,
      message: r.message,
      link: r.link || undefined,
      read: Boolean(r.read),
      createdAt: r.created_at,
      dedupKey: r.dedup_key || undefined
    }));
  }

  async listAllNotifications(): Promise<Notification[]> {
    const res = await this.ctx.getPool().query('SELECT * FROM notifications ORDER BY created_at DESC');
    return res.rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      type: r.type,
      title: r.title,
      message: r.message,
      link: r.link || undefined,
      read: Boolean(r.read),
      createdAt: r.created_at,
      dedupKey: r.dedup_key || undefined
    }));
  }

  async markNotificationRead(id: string, userId: string): Promise<void> {
    await this.ctx.getPool().query('UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2', [id, userId]);
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await this.ctx.getPool().query('UPDATE notifications SET read = TRUE WHERE user_id = $1', [userId]);
  }
}
