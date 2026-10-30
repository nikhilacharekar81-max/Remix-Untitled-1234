import { Router, Request, Response } from 'express';
import { store } from '../store.js';
import { requireAuth, resolveAuthenticatedUserId } from '../middleware/auth.js';

const router = Router();

router.get('/notifications', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = resolveAuthenticatedUserId(req) || (req as any).user?.id;
    const userNotifs = await store.listNotificationsForUser(userId);
    res.json(userNotifs);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list notifications' });
  }
});

router.post('/notifications/:id/read', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = resolveAuthenticatedUserId(req) || (req as any).user?.id;
    const notifId = req.params.id;
    await store.markNotificationRead(notifId, userId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to mark notification read' });
  }
});

router.post('/notifications/read-all', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = resolveAuthenticatedUserId(req) || (req as any).user?.id;
    await store.markAllNotificationsRead(userId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to mark notifications read' });
  }
});

export default router;
