import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import {
  store,
  type Project,
  type ProjectClarification
} from '../store.js';
import { postgresStore } from '../db/postgresStore.js';
import { isProjectPublic, sanitizePublicProject } from '../publicData.js';
import {
  requireAuth,
  requireActiveStatus,
  requireAdmin,
  adminActor,
  resolveAuthenticatedUserId,
  isStaffUser,
  rateLimit,
  escapeHtml
} from '../middleware/auth.js';
import { siteSettings } from '../../src/server/siteSettings.js';
import { createNotification } from '../services/notificationService.js';
import { registerAuditLog } from '../services/orderService.js';
import { diagnosticService } from '../services/diagnosticService.js';
import { processProposalAccept } from './proposalRoutes.js';

export const projectRouter = Router();

export async function getBuyerStats(buyerId: string) {
  try {
    const [ordersRes, projectsRes, proposalsRes] = await Promise.all([
      postgresStore.getPool().query('SELECT amount, status FROM orders WHERE buyer_id = $1', [buyerId]),
      postgresStore.getPool().query('SELECT id, status, proposals_count FROM projects WHERE buyer_id = $1', [buyerId]),
      postgresStore.getPool().query(
        'SELECT project_id, status FROM proposals WHERE project_id IN (SELECT id FROM projects WHERE buyer_id = $1)',
        [buyerId]
      )
    ]);

    const buyerOrders = ordersRes.rows;
    const buyerProjects = projectsRes.rows;
    const proposalsList = proposalsRes.rows;

    let hiredCount = 0;
    let decidedCount = 0;

    for (const proj of buyerProjects) {
      const hasAcceptedProposal = proposalsList.some(p => p.project_id === proj.id && p.status === 'accepted');
      const isHired = hasAcceptedProposal || proj.status === 'in_progress' || proj.status === 'in-progress';
      const isDecided = isHired || (proj.status === 'completed' && Number(proj.proposals_count || 0) > 0);

      if (isHired) hiredCount++;
      if (isDecided) decidedCount++;
    }

    const hireRate = decidedCount >= 3 ? hiredCount / decidedCount : null;
    const totalSpent = buyerOrders.filter(o => o.status === 'completed').reduce((sum, o) => sum + Number(o.amount || 0), 0);
    const completedCount = buyerOrders.filter(o => o.status === 'completed').length;

    return {
      buyerSpent: totalSpent,
      buyerCompletedProjects: completedCount,
      hireRate,
      buyerProjectsPosted: buyerProjects.length
    };
  } catch {
    return {
      buyerSpent: 0,
      buyerCompletedProjects: 0,
      hireRate: null,
      buyerProjectsPosted: 0
    };
  }
}

// Public projects list
projectRouter.get('/projects', async (req: Request, res: Response) => {
  try {
    const projects = await store.listProjects();
    const publicProjects = await Promise.all(
      projects
        .filter(p => isProjectPublic(p) && (p.status === 'open' || p.status === 'published'))
        .map(async p => {
          const stats = await getBuyerStats(p.buyerId);
          return sanitizePublicProject({ ...p, ...stats });
        })
    );
    res.json(publicProjects);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list projects' });
  }
});

// Single Project Detail
projectRouter.get('/projects/:id', async (req: Request, res: Response) => {
  try {
    const project = await store.getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const authUserId = resolveAuthenticatedUserId(req);
    const callerUser = authUserId ? await store.getUser(authUserId) : null;
    const isStaff = callerUser ? isStaffUser(callerUser) : false;
    const isOwner = Boolean(authUserId && project.buyerId === authUserId);

    let hasProposalOrOrder = false;
    if (authUserId) {
      const pool = postgresStore.getPool();
      const [propRes, ordRes] = await Promise.all([
        pool.query('SELECT 1 FROM proposals WHERE project_id = $1 AND freelancer_id = $2 LIMIT 1', [project.id, authUserId]),
        pool.query('SELECT 1 FROM orders WHERE project_id = $1 AND (seller_id = $2 OR buyer_id = $2) LIMIT 1', [project.id, authUserId])
      ]);
      hasProposalOrOrder = propRes.rows.length > 0 || ordRes.rows.length > 0;
    }

    const stats = await getBuyerStats(project.buyerId);
    const isPublic = isProjectPublic(project) && (project as any).isPublished !== false && project.status !== 'suspended' && project.status !== 'unpublished';

    if (isPublic) {
      if (isStaff || isOwner || hasProposalOrOrder) {
        return res.json({ ...project, ...stats });
      }
      return res.json(sanitizePublicProject({ ...project, ...stats }));
    }

    if (isStaff || isOwner || hasProposalOrOrder) {
      return res.json({ ...project, ...stats });
    }
    return res.status(404).json({ error: 'Project not found or unavailable' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to get project' });
  }
});

// Authenticated Owner Listings
projectRouter.get('/my/projects', requireAuth, async (req: Request, res: Response) => {
  try {
    const authUserId = (req as any).authenticatedUserId;
    const myProjects = await store.listProjectsForBuyer(authUserId);
    res.json(myProjects);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list my projects' });
  }
});

// Project Clarifications
projectRouter.get('/projects/:id/clarifications', async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;
    const project = await store.getProject(projectId);
    if (!project) return res.json([]);

    const callerId = (req as any).authenticatedUserId;
    const callerUser = (req as any).authenticatedUser;
    const isBuyer = callerId && project.buyerId === callerId;
    const isStaff = callerUser && isStaffUser(callerUser);

    const propCheck = callerId ? await postgresStore.getPool().query(
      'SELECT id FROM proposals WHERE project_id = $1 AND freelancer_id = $2',
      [projectId, callerId]
    ) : { rows: [] };
    const hasProposal = propCheck.rows.length > 0;

    if (project.status === 'open' || project.status === 'published' || isBuyer || isStaff || hasProposal) {
      const clarRes = await postgresStore.getPool().query(
        'SELECT * FROM project_clarifications WHERE project_id = $1 ORDER BY timestamp ASC',
        [projectId]
      );
      const projectClarificationsList = clarRes.rows.map(c => ({
        id: c.id,
        projectId: c.project_id,
        userId: c.user_id,
        userName: c.user_name,
        userAvatar: c.user_avatar || '',
        text: c.text,
        timestamp: c.timestamp,
        replies: c.replies || []
      }));
      return res.json(projectClarificationsList);
    }
    return res.json([]);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list clarifications' });
  }
});

projectRouter.post('/projects/:id/clarifications', requireAuth, requireActiveStatus, rateLimit(20, 60_000), async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;
    const project = await store.getProject(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const userId = (req as any).authenticatedUserId;
    const user = (req as any).authenticatedUser;
    const { text, replyToId } = req.body;

    if (!text || !text.trim()) return res.status(400).json({ error: 'Text is required.' });

    if (replyToId) {
      const clarRes = await postgresStore.getPool().query(
        'SELECT * FROM project_clarifications WHERE id = $1 AND project_id = $2',
        [replyToId, projectId]
      );
      if (clarRes.rows.length === 0) return res.status(404).json({ error: 'Parent question not found.' });
      const parent = clarRes.rows[0];

      const isOwner = project.buyerId === userId;
      const isStaff = isStaffUser(user);
      if (!isOwner && !isStaff) return res.status(403).json({ error: 'Only the project owner can respond to clarifications.' });

      const replies = parent.replies || [];
      replies.push({
        id: 'rep_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        userId,
        userName: user.name,
        userAvatar: user.avatar,
        text: text.trim().slice(0, 2000),
        timestamp: new Date().toISOString()
      });

      await postgresStore.getPool().query(
        'UPDATE project_clarifications SET replies = $1 WHERE id = $2',
        [JSON.stringify(replies), replyToId]
      );
    } else {
      const newClarId = 'clar_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      const timestamp = new Date().toISOString();
      await postgresStore.getPool().query(
        `INSERT INTO project_clarifications (id, project_id, user_id, user_name, user_avatar, text, timestamp, replies)
         VALUES ($1, $2, $3, $4, $5, $6, $7, '[]'::jsonb)`,
        [newClarId, projectId, userId, user.name, user.avatar || null, text.trim().slice(0, 2000), timestamp]
      );

      createNotification({
        userId: project.buyerId,
        type: 'project',
        title: 'New Clarification Question',
        message: `${user.name} asked a question about "${project.title}".`,
        link: `/projects/${project.slug || project.id}`
      });
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to post clarification' });
  }
});

// Create Project
projectRouter.post('/projects', requireAuth, requireActiveStatus, async (req: Request, res: Response) => {
  try {
    const caller = (req as any).authenticatedUser;
    if (caller.status === 'restricted') return res.status(403).json({ error: 'Restricted: You cannot post new projects while your account is restricted.' });

    const budgetMin = Number(req.body.budgetMin !== undefined ? req.body.budgetMin : req.body.minBudget);
    const budgetMax = Number(req.body.budgetMax !== undefined ? req.body.budgetMax : (req.body.maxBudget !== undefined ? req.body.maxBudget : budgetMin));
    if (!Number.isFinite(budgetMin) || budgetMin < 1) {
      return res.status(400).json({ error: 'Minimum project budget must be at least $1.00.' });
    }
    if (!Number.isFinite(budgetMax) || budgetMax < budgetMin) {
      return res.status(400).json({ error: 'Maximum budget must be greater than or equal to minimum budget.' });
    }

    const activeSettings = siteSettings.getSettings();
    const platformMinBudget = activeSettings.marketplace.minimumProjectBudget ?? 1;
    if (platformMinBudget > 0 && budgetMin < platformMinBudget) {
      return res.status(400).json({
        error: `Project budget ($${budgetMin}) is below the platform minimum requirement of $${platformMinBudget}.`
      });
    }

    const newProjId = 'proj_' + Date.now() + '_' + randomUUID().slice(0, 8);
    const title = escapeHtml(req.body.title || 'Untitled Project');
    const category = req.body.category || 'Development & IT';
    const subcategory = req.body.subcategory || 'General';
    const description = escapeHtml(req.body.description || '');
    const deadlineDays = 14;
    const createdAt = new Date().toISOString().split('T')[0];

    const maxHires = Math.max(1, Math.min(50, Number(req.body.maxHires ?? req.body.freelancersNeeded ?? 1) || 1));
    const newProj: Project = {
      id: newProjId,
      buyerId: caller.id,
      buyerName: caller.name,
      buyerAvatar: caller.avatar,
      title,
      category,
      subcategory,
      description,
      budgetMin,
      budgetMax,
      deadlineDays,
      proposalsCount: 0,
      createdAt,
      status: 'open',
      featured: false,
      maxHires,
      ...( { freelancersNeeded: maxHires } as any )
    };

    await store.saveProject(newProj);
    res.json(newProj);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create project' });
  }
});

// Update Project (PUT)
projectRouter.put('/projects/:id', requireAuth, requireActiveStatus, async (req: Request, res: Response) => {
  try {
    const caller = (req as any).authenticatedUser;
    const project = await store.getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.buyerId !== caller.id && !isStaffUser(caller)) {
      return res.status(403).json({ error: 'Forbidden: You can only edit your own projects.' });
    }

    const budgetMin = Number(req.body.budgetMin !== undefined ? req.body.budgetMin : (req.body.minBudget !== undefined ? req.body.minBudget : project.budgetMin));
    const budgetMax = Number(req.body.budgetMax !== undefined ? req.body.budgetMax : (req.body.maxBudget !== undefined ? req.body.maxBudget : project.budgetMax));
    if (!Number.isFinite(budgetMin) || budgetMin < 1) {
      return res.status(400).json({ error: 'Minimum project budget must be at least $1.00.' });
    }
    if (!Number.isFinite(budgetMax) || budgetMax < budgetMin) {
      return res.status(400).json({ error: 'Maximum budget must be greater than or equal to minimum budget.' });
    }

    if (req.body.title !== undefined) project.title = escapeHtml(String(req.body.title));
    if (req.body.category !== undefined && typeof req.body.category === 'string') project.category = req.body.category.trim().slice(0, 100);
    if (req.body.subcategory !== undefined && typeof req.body.subcategory === 'string') project.subcategory = req.body.subcategory.trim().slice(0, 100);
    if (req.body.description !== undefined) project.description = escapeHtml(String(req.body.description));
    project.budgetMin = budgetMin;
    project.budgetMax = budgetMax;
    if (req.body.deadlineDays !== undefined) project.deadlineDays = Math.max(1, Math.min(365, Number(req.body.deadlineDays) || 14));
    if (req.body.status !== undefined) {
      const normalizedStatus = req.body.status === 'in-progress' ? 'in_progress' : req.body.status;
      const allowedStatuses = ['open', 'in_progress', 'completed', 'cancelled', 'closed'];
      if (!allowedStatuses.includes(normalizedStatus)) {
        return res.status(400).json({ error: 'Invalid project status.' });
      }
      project.status = normalizedStatus;
    }

    await store.saveProject(project);
    res.json(project);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update project' });
  }
});

// Update Project Status
projectRouter.patch('/projects/:id/status', requireAuth, requireActiveStatus, async (req: Request, res: Response) => {
  try {
    const authUserId = (req as any).authenticatedUserId;
    const caller = (req as any).authenticatedUser;
    if (!caller || (caller.status !== 'active' && caller.status !== 'restricted')) return res.status(403).json({ error: 'Account is not active' });

    const p = await store.getProject(req.params.id);
    if (!p) return res.status(404).json({ error: 'Project not found' });

    if (p.buyerId !== caller.id && !isStaffUser(caller)) {
      return res.status(403).json({ error: 'Forbidden: Only the project owner can update this project status.' });
    }

    const rawStatus = typeof req.body?.status === 'string' ? req.body.status.trim().toLowerCase() : 'completed';
    const requestedStatus = rawStatus === 'in-progress' ? 'in_progress' : rawStatus;
    const allowedStatuses = ['open', 'in_progress', 'completed', 'cancelled', 'closed'];
    if (!allowedStatuses.includes(requestedStatus)) {
      return res.status(400).json({ error: 'Invalid project status.' });
    }

    const oldStatus = p.status;
    p.status = requestedStatus as any;
    await store.saveProject(p);

    await registerAuditLog({
      id: 'log_' + Date.now() + '_' + randomUUID().slice(0, 8),
      actor: caller.name,
      role: caller.role || 'user',
      action: `PROJECT_STATUS_${requestedStatus.toUpperCase()}`,
      target: `Project "${p.title}"`,
      details: `Buyer changed project status from "${oldStatus}" to "${requestedStatus}"`,
      timestamp: new Date().toLocaleString()
    });

    res.json({ ...p, status: requestedStatus });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update project status' });
  }
});

// Multi-hire Project Handler
projectRouter.post('/projects/:id/hire', requireAuth, requireActiveStatus, async (req: Request, res: Response) => {
  try {
    const caller = (req as any).authenticatedUser;
    const project = await store.getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.buyerId !== caller.id && !isStaffUser(caller)) {
      return res.status(403).json({ error: 'Forbidden: Only the project owner can hire.' });
    }
    const proposalId = req.body?.proposalId;
    if (proposalId) {
      req.params.id = proposalId;
      return await processProposalAccept(req, res);
    }
    const maxHires = Math.max(1, Number(project.maxHires || (project as any).freelancersNeeded || 1));
    const acceptedRes = await postgresStore.getPool().query(
      "SELECT COUNT(*) FROM proposals WHERE project_id = $1 AND status = 'accepted'",
      [project.id]
    );
    const hiresCount = parseInt(acceptedRes.rows[0]?.count || '0', 10);
    if (hiresCount >= maxHires) {
      project.status = 'in_progress' as any;
      await store.saveProject(project);
      await postgresStore.getPool().query("UPDATE proposals SET status = 'declined' WHERE project_id = $1 AND status = 'pending'", [project.id]);
    } else {
      project.status = 'open';
      await store.saveProject(project);
    }
    res.json({ success: true, project, hiresCount, maxHires });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to process hire' });
  }
});

// Admin: List all projects with admin moderation metadata
projectRouter.get('/admin/projects', requireAdmin, async (req: Request, res: Response) => {
  try {
    const projects = await store.listProjects();
    res.json(projects);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list admin projects' });
  }
});

// Admin: Update project details, status, and moderation
projectRouter.patch('/admin/projects/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const project = await store.getProject(req.params.id);
    if (!project) {
      diagnosticService.log('warning', 'projectService', 'adminUpdateProject', 'server/routes/projectRoutes.ts', 'admin_update_project', 'FAILED', { projectId: req.params.id }, 'Project not found');
      return res.status(404).json({ error: 'Project not found' });
    }

    if (req.body.title !== undefined) project.title = escapeHtml(String(req.body.title));
    if (req.body.category !== undefined && typeof req.body.category === 'string') project.category = req.body.category.trim().slice(0, 100);
    if (req.body.subcategory !== undefined && typeof req.body.subcategory === 'string') project.subcategory = req.body.subcategory.trim().slice(0, 100);
    if (req.body.description !== undefined) project.description = escapeHtml(String(req.body.description));
    if (req.body.budgetMin !== undefined || req.body.budgetMax !== undefined) {
      const bMin = req.body.budgetMin !== undefined ? Number(req.body.budgetMin) : project.budgetMin;
      const bMax = req.body.budgetMax !== undefined ? Number(req.body.budgetMax) : project.budgetMax;
      if (bMin < 1 || bMax < bMin) {
        return res.status(400).json({ error: 'Invalid budget: minBudget must be >= 1 and maxBudget >= minBudget' });
      }
      project.budgetMin = bMin;
      project.budgetMax = bMax;
    }
    if (req.body.deadlineDays !== undefined) project.deadlineDays = Math.max(1, Math.min(365, Number(req.body.deadlineDays) || 14));
    const ALLOWED_PROJECT_STATUSES = ['open', 'in_progress', 'completed', 'cancelled', 'closed'];
    if (req.body.status !== undefined) {
      const normalizedStatus = req.body.status === 'in-progress' ? 'in_progress' : req.body.status;
      if (!ALLOWED_PROJECT_STATUSES.includes(normalizedStatus)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${ALLOWED_PROJECT_STATUSES.join(', ')}` });
      }
      project.status = normalizedStatus;
    }
    if (req.body.moderationStatus !== undefined) project.moderationStatus = req.body.moderationStatus;
    if (req.body.moderationNotes !== undefined) project.moderationNotes = req.body.moderationNotes;
    if (req.body.featured !== undefined) project.featured = Boolean(req.body.featured);

    await store.saveProject(project);
    res.json(project);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update project' });
  }
});

// Admin: Update project status
projectRouter.patch('/admin/projects/:id/status', requireAdmin, async (req: Request, res: Response) => {
  try {
    const p = await store.getProject(req.params.id);
    if (!p) return res.status(404).json({ error: 'Project not found' });

    const ALLOWED_PROJECT_STATUSES = ['open', 'in_progress', 'completed', 'cancelled', 'closed'];
    const rawStatus = req.body.status;
    const newStatus = rawStatus === 'in-progress' ? 'in_progress' : rawStatus;
    if (!ALLOWED_PROJECT_STATUSES.includes(newStatus)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${ALLOWED_PROJECT_STATUSES.join(', ')}` });
    }

    const oldStatus = p.status;
    p.status = newStatus;
    await store.saveProject(p);

    await registerAuditLog({
      id: 'log_' + Date.now() + '_' + randomUUID().slice(0, 8),
      actor: adminActor(req),
      role: 'super_admin',
      action: `PROJECT_STATUS_${String(newStatus).toUpperCase()}`,
      target: `Project "${p.title}"`,
      details: `Admin changed status from "${oldStatus}" to "${newStatus}"`,
      timestamp: new Date().toLocaleString()
    });

    res.json(p);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update status' });
  }
});

// Admin: Toggle project featured
projectRouter.patch('/admin/projects/:id/feature', requireAdmin, async (req: Request, res: Response) => {
  try {
    const p = await store.getProject(req.params.id);
    if (!p) return res.status(404).json({ error: 'Project not found' });
    p.featured = !p.featured;
    await store.saveProject(p);

    await registerAuditLog({
      id: 'log_' + Date.now() + '_' + randomUUID().slice(0, 8),
      actor: adminActor(req),
      role: 'super_admin',
      action: p.featured ? 'ADMIN_PROJECT_FEATURED' : 'ADMIN_PROJECT_UNFEATURED',
      target: `Project "${p.title}"`,
      details: `Admin toggled featured status to ${p.featured}`,
      timestamp: new Date().toLocaleString()
    });

    res.json(p);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to toggle featured' });
  }
});

// Admin: Delete project
projectRouter.delete('/admin/projects/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const deleted = await store.getProject(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Project not found' });

    await store.deleteProject(req.params.id);

    await registerAuditLog({
      id: 'log_' + Date.now() + '_' + randomUUID().slice(0, 8),
      actor: adminActor(req),
      role: 'super_admin',
      action: 'ADMIN_PROJECT_DELETED',
      target: `Project "${deleted.title}"`,
      details: `Admin permanently removed project #${deleted.id}`,
      timestamp: new Date().toLocaleString()
    });

    res.json({ success: true, id: deleted.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete project' });
  }
});
