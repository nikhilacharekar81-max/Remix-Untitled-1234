import { randomUUID } from 'node:crypto';
import { RepoContext } from '../types.js';
import { type AuditLog } from '../../store.js';

export class AdminRepo {
  constructor(private ctx: RepoContext) {}

  // --- AUDIT LOGS ---
  async addAuditLog(l: AuditLog, client?: any): Promise<void> {
    if (!l) return;
    const rawId = typeof l.id === 'string' && l.id.trim() ? l.id.trim() : `log_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const safeId = /^log_\d+$/.test(rawId) ? `${rawId}_${randomUUID().slice(0, 8)}` : rawId;
    l.id = safeId;
    const dbRunner = client || this.ctx.getPool();
    await dbRunner.query(
      `INSERT INTO audit_logs (id, actor, role, action, target, details, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [safeId, l.actor, l.role, l.action, l.target, l.details || null, l.timestamp]
    );
  }

  async saveAuditLogs(logs: AuditLog[]): Promise<void> {
    return this.ctx.withLock('audit_logs', async () => {
      if (!logs) return;
      const client = await this.ctx.getPool().connect();
      try {
        await client.query('BEGIN');
        for (const l of logs) {
          if (!l?.id) continue;
          await client.query(
            `INSERT INTO audit_logs (id, actor, role, action, target, details, timestamp)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (id) DO UPDATE SET
               actor = EXCLUDED.actor,
               role = EXCLUDED.role,
               action = EXCLUDED.action,
               target = EXCLUDED.target,
               details = EXCLUDED.details,
               timestamp = EXCLUDED.timestamp`,
            [l.id, l.actor, l.role, l.action, l.target, l.details || null, l.timestamp]
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

  async listAuditLogs(): Promise<AuditLog[]> {
    const res = await this.ctx.getPool().query('SELECT * FROM audit_logs ORDER BY timestamp DESC');
    return res.rows.map(r => ({
      id: r.id,
      actor: r.actor,
      role: r.role,
      action: r.action,
      target: r.target,
      details: r.details || '',
      timestamp: r.timestamp
    }));
  }

  // --- SITE SETTINGS ---
  async saveSiteSettings(settings: any): Promise<void> {
    return this.ctx.withLock('site_settings', async () => {
      await this.ctx.getPool().query(
        `INSERT INTO site_settings (key, value, updated_at)
         VALUES ('primary', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [JSON.stringify(settings)]
      );
    });
  }

  async loadSiteSettings(): Promise<any | null> {
    const res = await this.ctx.getPool().query("SELECT value FROM site_settings WHERE key = 'primary'");
    return res.rows.length > 0 ? res.rows[0].value : null;
  }

  // --- CATEGORIES ---
  async saveCategories(categories: any[]): Promise<void> {
    return this.ctx.withLock('categories', async () => {
      await this.ctx.getPool().query(
        `INSERT INTO site_settings (key, value, updated_at)
         VALUES ('categories', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [JSON.stringify(categories)]
      );
    });
  }

  async loadCategories(): Promise<any[] | null> {
    const res = await this.ctx.getPool().query("SELECT value FROM site_settings WHERE key = 'categories'");
    return res.rows.length > 0 ? res.rows[0].value : null;
  }
}
