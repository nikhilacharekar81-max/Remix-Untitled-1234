import { RepoContext } from '../types.js';
import {
  type Gig,
  type Project,
  type Proposal,
  type ProjectClarification,
  mapGigRow,
  mapProjectRow,
  mapProposalRow
} from '../../store.js';

export class MarketplaceRepo {
  constructor(private ctx: RepoContext) {}

  // --- GIGS ---
  async saveGigs(gigs: Gig[]): Promise<void> {
    return this.ctx.withLock('gigs', async () => {
      if (!gigs) return;
      const client = await this.ctx.getPool().connect();
      try {
        await client.query('BEGIN');
        const seen = new Set<string>();
        for (const g of gigs) {
          if (!g?.id || seen.has(g.id)) continue;
          seen.add(g.id);
          let slug = g.slug || g.title?.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '') || 'gig-' + g.id;
          if (slug.length < 2) slug = 'gig-' + g.id;
          try {
            const collisionRes = await client.query(
              'SELECT id FROM gigs WHERE slug = $1 AND id != $2 LIMIT 1',
              [slug, g.id]
            );
            if (collisionRes.rows.length > 0) {
              slug = `${slug}-${g.id}`;
            }
          } catch {}

          const executeRowInsert = async (targetSlug: string) => {
            await client.query(
              `INSERT INTO gigs (
                id, freelancer_id, freelancer_name, freelancer_username, freelancer_avatar, 
                freelancer_level, title, slug, category, subcategory, description, price, 
                delivery_days, rating, reviews_count, image, cover_image, gallery, tags, 
                status, featured, is_featured, featured_until, extras, moderation_status, moderation_notes
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
              ON CONFLICT (id) DO UPDATE SET
                freelancer_id = EXCLUDED.freelancer_id,
                freelancer_name = EXCLUDED.freelancer_name,
                freelancer_username = EXCLUDED.freelancer_username,
                freelancer_avatar = EXCLUDED.freelancer_avatar,
                freelancer_level = EXCLUDED.freelancer_level,
                title = EXCLUDED.title,
                slug = EXCLUDED.slug,
                category = EXCLUDED.category,
                subcategory = EXCLUDED.subcategory,
                description = EXCLUDED.description,
                price = EXCLUDED.price,
                delivery_days = EXCLUDED.delivery_days,
                rating = COALESCE(gigs.rating, EXCLUDED.rating),
                reviews_count = COALESCE(gigs.reviews_count, EXCLUDED.reviews_count),
                image = EXCLUDED.image,
                cover_image = EXCLUDED.cover_image,
                gallery = EXCLUDED.gallery,
                tags = EXCLUDED.tags,
                status = CASE 
                  WHEN gigs.status = 'deleted' THEN 'deleted' 
                  WHEN gigs.moderation_status IN ('rejected', 'flagged') AND EXCLUDED.status = 'active' THEN gigs.status 
                  ELSE EXCLUDED.status 
                END,
                featured = (
                  CASE 
                    WHEN (EXCLUDED.featured_until IS NOT NULL AND EXCLUDED.featured_until::timestamptz > NOW()) THEN TRUE
                    WHEN (gigs.featured_until IS NOT NULL AND gigs.featured_until::timestamptz > NOW()) THEN TRUE
                    ELSE FALSE
                  END
                ),
                is_featured = (
                  CASE 
                    WHEN (EXCLUDED.featured_until IS NOT NULL AND EXCLUDED.featured_until::timestamptz > NOW()) THEN TRUE
                    WHEN (gigs.featured_until IS NOT NULL AND gigs.featured_until::timestamptz > NOW()) THEN TRUE
                    ELSE FALSE
                  END
                ),
                featured_until = (
                  CASE
                    WHEN EXCLUDED.featured_until IS NOT NULL AND gigs.featured_until IS NOT NULL THEN
                      CASE WHEN EXCLUDED.featured_until::timestamptz > gigs.featured_until::timestamptz THEN EXCLUDED.featured_until ELSE gigs.featured_until END
                    WHEN EXCLUDED.featured_until IS NOT NULL THEN EXCLUDED.featured_until
                    ELSE gigs.featured_until
                  END
                ),
                extras = EXCLUDED.extras,
                moderation_status = CASE 
                  WHEN gigs.moderation_status IN ('rejected', 'flagged') AND EXCLUDED.moderation_status NOT IN ('rejected', 'flagged') THEN gigs.moderation_status 
                  ELSE EXCLUDED.moderation_status 
                END,
                moderation_notes = COALESCE(EXCLUDED.moderation_notes, gigs.moderation_notes)`,
              [
                g.id, g.freelancerId, g.freelancerName, g.freelancerUsername || null, g.freelancerAvatar || null,
                g.freelancerLevel || null, g.title, targetSlug, g.category, g.subcategory || null,
                g.description || null, g.price, g.deliveryDays, g.rating ?? 5.0, g.reviewsCount ?? 0,
                g.image || null, g.coverImage || null, g.gallery || [], g.tags || [],
                g.status || 'active', !!g.featured, !!g.featured || !!(g as any).isFeatured, (g as any).featuredUntil || null,
                JSON.stringify(g.extras || []),
                g.moderationStatus || 'approved', g.moderationNotes || null
              ]
            );
          };

          let savepointSeq = 0;
          const attemptInsertWithSavepoint = async (targetSlug: string): Promise<void> => {
            const spName = `sp_gig_${savepointSeq++}`;
            await client.query(`SAVEPOINT ${spName}`);
            try {
              await executeRowInsert(targetSlug);
              await client.query(`RELEASE SAVEPOINT ${spName}`);
            } catch (err) {
              try {
                await client.query(`ROLLBACK TO SAVEPOINT ${spName}`);
                await client.query(`RELEASE SAVEPOINT ${spName}`);
              } catch (cleanupErr) {
                console.error(`[MarketplaceRepo.saveGigs] Failed to clean up savepoint ${spName}:`, cleanupErr);
                throw cleanupErr;
              }
              throw err;
            }
          };

          const isSlugConflict = (err: any) =>
            err?.code === '23505' &&
            (err?.constraint === 'idx_gigs_unique_slug' || String(err?.message || '').includes('idx_gigs_unique_slug'));

          try {
            await attemptInsertWithSavepoint(slug);
          } catch (insertErr: any) {
            if (isSlugConflict(insertErr)) {
              const fallbackSlug = `${slug}-${g.id}`;
              try {
                await attemptInsertWithSavepoint(fallbackSlug);
              } catch (retryErr: any) {
                if (isSlugConflict(retryErr)) {
                  await attemptInsertWithSavepoint(`${fallbackSlug}-${Date.now().toString(36)}`);
                } else {
                  throw retryErr;
                }
              }
            } else {
              throw insertErr;
            }
          }
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

  async updateGig(id: string, updates: Record<string, any>, expectedFreelancerId?: string): Promise<Gig | null> {
    return this.ctx.withLock('gigs', async () => {
      const fieldMap: Record<string, string> = {
        title: 'title',
        slug: 'slug',
        category: 'category',
        subcategory: 'subcategory',
        description: 'description',
        price: 'price',
        deliveryDays: 'delivery_days',
        image: 'image',
        coverImage: 'cover_image',
        gallery: 'gallery',
        tags: 'tags',
        extras: 'extras',
        status: 'status',
        moderationStatus: 'moderation_status',
        moderationNotes: 'moderation_notes',
        freelancerName: 'freelancer_name',
        freelancerUsername: 'freelancer_username',
        freelancerAvatar: 'freelancer_avatar',
        freelancerLevel: 'freelancer_level'
      };

      const setClauses: string[] = [];
      const values: any[] = [];
      let idx = 1;

      for (const [key, col] of Object.entries(fieldMap)) {
        if (updates[key] !== undefined) {
          let val = updates[key];
          if (key === 'extras') {
            val = JSON.stringify(val || []);
          }
          setClauses.push(`${col} = $${idx}`);
          values.push(val);
          idx++;
        }
      }

      if (setClauses.length === 0) {
        const existing = await this.getGig(id);
        return existing || null;
      }

      setClauses.push('updated_at = NOW()');

      let whereClause = `WHERE id = $${idx} AND status != 'deleted'`;
      values.push(id);
      idx++;

      if (expectedFreelancerId) {
        whereClause += ` AND freelancer_id = $${idx}`;
        values.push(expectedFreelancerId);
        idx++;
      }

      const runUpdate = async (overrideSlug?: string) => {
        const localClauses = [...setClauses];
        const localValues = [...values];
        if (overrideSlug !== undefined) {
          const slugIdx = localClauses.findIndex(c => c.startsWith('slug = '));
          if (slugIdx >= 0) {
            const match = localClauses[slugIdx].match(/\$(\d+)/);
            if (match) {
              const paramNum = parseInt(match[1], 10);
              localValues[paramNum - 1] = overrideSlug;
            }
          }
        }
        const query = `
          UPDATE gigs
          SET ${localClauses.join(', ')}
          ${whereClause}
          RETURNING *
        `;
        return await this.ctx.getPool().query(query, localValues);
      };

      try {
        const res = await runUpdate();
        if (res.rows.length === 0) return null;
        return mapGigRow(res.rows[0]);
      } catch (err: any) {
        if (err?.code === '23505' && (err?.constraint === 'idx_gigs_unique_slug' || String(err?.message || '').includes('idx_gigs_unique_slug')) && updates.slug) {
          const fallbackSlug = `${updates.slug}-${id}`;
          try {
            const res = await runUpdate(fallbackSlug);
            if (res.rows.length === 0) return null;
            return mapGigRow(res.rows[0]);
          } catch (retryErr: any) {
            if (retryErr?.code === '23505' && (retryErr?.constraint === 'idx_gigs_unique_slug' || String(retryErr?.message || '').includes('idx_gigs_unique_slug'))) {
              const res = await runUpdate(`${fallbackSlug}-${Date.now().toString(36)}`);
              if (res.rows.length === 0) return null;
              return mapGigRow(res.rows[0]);
            }
            throw retryErr;
          }
        }
        throw err;
      }
    });
  }

  async saveGig(gig: Gig): Promise<void> {
    return this.saveGigs([gig]);
  }

  async listGigs(): Promise<Gig[]> {
    let res = await this.ctx.getPool().query('SELECT * FROM gigs');
    if (res.rows.length === 0) {
      await seedDefaultGigsIfNeeded(this.ctx.getPool());
      res = await this.ctx.getPool().query('SELECT * FROM gigs');
    }
    return res.rows.map(mapGigRow);
  }

  async getGig(idOrSlug: string): Promise<Gig | null> {
    let res = await this.ctx.getPool().query('SELECT * FROM gigs WHERE id = $1 OR slug = $1 ORDER BY (CASE WHEN id = $1 THEN 0 ELSE 1 END) ASC LIMIT 1', [idOrSlug]);
    if (res.rows.length === 0) {
      await seedDefaultGigsIfNeeded(this.ctx.getPool());
      res = await this.ctx.getPool().query('SELECT * FROM gigs WHERE id = $1 OR slug = $1 ORDER BY (CASE WHEN id = $1 THEN 0 ELSE 1 END) ASC LIMIT 1', [idOrSlug]);
    }
    return res.rows.length > 0 ? mapGigRow(res.rows[0]) : null;
  }

  async deleteGig(id: string): Promise<void> {
    return this.ctx.withLock('gigs', async () => {
      await this.ctx.getPool().query("UPDATE gigs SET status = 'deleted' WHERE id = $1", [id]);
    });
  }

  // --- PROJECTS ---
  async saveProjects(projects: Project[]): Promise<void> {
    return this.ctx.withLock('projects', async () => {
      if (!projects) return;
      const client = await this.ctx.getPool().connect();
      try {
        await client.query('BEGIN');
        const seen = new Set<string>();
        for (const p of projects) {
          if (!p?.id || seen.has(p.id)) continue;
          seen.add(p.id);
          await client.query(
            `INSERT INTO projects (
              id, buyer_id, buyer_name, buyer_avatar, title, slug, category, subcategory, 
              description, budget_min, budget_max, budget, budget_type, duration, deadline_days, proposals_count, 
              created_at, status, featured, moderation_status, moderation_notes, skills,
              max_hires, freelancers_needed
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
            ON CONFLICT (id) DO UPDATE SET
              buyer_id = EXCLUDED.buyer_id,
              buyer_name = EXCLUDED.buyer_name,
              buyer_avatar = EXCLUDED.buyer_avatar,
              title = EXCLUDED.title,
              slug = EXCLUDED.slug,
              category = EXCLUDED.category,
              subcategory = EXCLUDED.subcategory,
              description = EXCLUDED.description,
              budget_min = EXCLUDED.budget_min,
              budget_max = EXCLUDED.budget_max,
              budget = EXCLUDED.budget,
              budget_type = EXCLUDED.budget_type,
              duration = EXCLUDED.duration,
              deadline_days = EXCLUDED.deadline_days,
              proposals_count = EXCLUDED.proposals_count,
              created_at = EXCLUDED.created_at,
              status = EXCLUDED.status,
              featured = EXCLUDED.featured,
              moderation_status = EXCLUDED.moderation_status,
              moderation_notes = EXCLUDED.moderation_notes,
              skills = EXCLUDED.skills,
              max_hires = EXCLUDED.max_hires,
              freelancers_needed = EXCLUDED.freelancers_needed`,
            [
              p.id, p.buyerId, p.buyerName, p.buyerAvatar || null, p.title, p.slug || null,
              p.category, p.subcategory || null, p.description || null, p.budgetMin,
              p.budgetMax, p.budget || null, p.budgetType || null, p.duration || null,
              p.deadlineDays, p.proposalsCount ?? 0, p.createdAt,
              p.status || 'open', !!p.featured, p.moderationStatus || 'approved', p.moderationNotes || null,
              p.skills || [],
              Math.max(1, Number(p.maxHires || (p as any).freelancersNeeded || 1)),
              Math.max(1, Number((p as any).freelancersNeeded || p.maxHires || 1))
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

  async saveProject(project: Project): Promise<void> {
    return this.saveProjects([project]);
  }

  async listProjects(): Promise<Project[]> {
    const res = await this.ctx.getPool().query('SELECT * FROM projects');
    return res.rows.map(mapProjectRow);
  }

  async getProject(idOrSlug: string): Promise<Project | null> {
    const res = await this.ctx.getPool().query('SELECT * FROM projects WHERE id = $1 OR slug = $1', [idOrSlug]);
    return res.rows.length > 0 ? mapProjectRow(res.rows[0]) : null;
  }

  // --- PROPOSALS ---
  async saveProposals(proposals: Proposal[]): Promise<void> {
    return this.ctx.withLock('proposals', async () => {
      if (!proposals) return;
      const client = await this.ctx.getPool().connect();
      try {
        await client.query('BEGIN');
        const seen = new Set<string>();
        for (const pr of proposals) {
          if (!pr?.id || seen.has(pr.id)) continue;
          seen.add(pr.id);
          await client.query(
            `INSERT INTO proposals (
              id, project_id, freelancer_id, freelancer_name, freelancer_avatar, 
              freelancer_title, cover_letter, bid_amount, delivery_days, created_at, status,
              workstream_order_id, offer_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT (id) DO UPDATE SET
              project_id = EXCLUDED.project_id,
              freelancer_id = EXCLUDED.freelancer_id,
              freelancer_name = EXCLUDED.freelancer_name,
              freelancer_avatar = EXCLUDED.freelancer_avatar,
              freelancer_title = EXCLUDED.freelancer_title,
              cover_letter = EXCLUDED.cover_letter,
              bid_amount = EXCLUDED.bid_amount,
              delivery_days = EXCLUDED.delivery_days,
              created_at = EXCLUDED.created_at,
              status = EXCLUDED.status,
              workstream_order_id = EXCLUDED.workstream_order_id,
              offer_id = EXCLUDED.offer_id`,
            [
              pr.id, pr.projectId, pr.freelancerId, pr.freelancerName, pr.freelancerAvatar || null,
              pr.freelancerTitle || null, pr.coverLetter || null, pr.bidAmount,
              pr.deliveryDays, pr.createdAt, pr.status || 'pending',
              pr.workstreamOrderId || null, pr.offerId || null
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

  async saveProposal(proposal: Proposal): Promise<void> {
    return this.saveProposals([proposal]);
  }

  async listProposals(): Promise<Proposal[]> {
    const res = await this.ctx.getPool().query('SELECT * FROM proposals');
    return res.rows.map(mapProposalRow);
  }

  async getProposal(id: string): Promise<Proposal | null> {
    const res = await this.ctx.getPool().query('SELECT * FROM proposals WHERE id = $1', [id]);
    return res.rows.length > 0 ? mapProposalRow(res.rows[0]) : null;
  }

  async listProposalsByProject(projectId: string): Promise<Proposal[]> {
    const res = await this.ctx.getPool().query('SELECT * FROM proposals WHERE project_id = $1 ORDER BY created_at DESC', [projectId]);
    return res.rows.map(mapProposalRow);
  }

  async listProposalsByFreelancer(freelancerId: string): Promise<Proposal[]> {
    const res = await this.ctx.getPool().query('SELECT * FROM proposals WHERE freelancer_id = $1 ORDER BY created_at DESC', [freelancerId]);
    return res.rows.map(mapProposalRow);
  }

  // --- PROJECT CLARIFICATIONS ---
  async saveProjectClarifications(clarifications: ProjectClarification[]): Promise<void> {
    return this.ctx.withLock('project_clarifications', async () => {
      if (!clarifications) return;
      const client = await this.ctx.getPool().connect();
      try {
        await client.query('BEGIN');
        const seen = new Set<string>();
        for (const c of clarifications) {
          if (!c?.id || seen.has(c.id)) continue;
          seen.add(c.id);
          await client.query(
            `INSERT INTO project_clarifications (id, project_id, user_id, user_name, user_avatar, text, timestamp, replies)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (id) DO UPDATE SET
               project_id = EXCLUDED.project_id,
               user_id = EXCLUDED.user_id,
               user_name = EXCLUDED.user_name,
               user_avatar = EXCLUDED.user_avatar,
               text = EXCLUDED.text,
               timestamp = EXCLUDED.timestamp,
               replies = EXCLUDED.replies`,
            [c.id, c.projectId, c.userId, c.userName, c.userAvatar || null, c.text, c.timestamp, JSON.stringify(c.replies || [])]
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

  async saveProjectClarification(c: ProjectClarification): Promise<void> {
    return this.saveProjectClarifications([c]);
  }

  async listProjectClarifications(): Promise<ProjectClarification[]> {
    const res = await this.ctx.getPool().query('SELECT * FROM project_clarifications ORDER BY timestamp ASC');
    return res.rows.map(r => ({
      id: r.id,
      projectId: r.project_id,
      userId: r.user_id,
      userName: r.user_name,
      userAvatar: r.user_avatar || undefined,
      text: r.text,
      timestamp: r.timestamp,
      replies: r.replies || []
    }));
  }

  async listProjectClarificationsForProject(projectId: string): Promise<ProjectClarification[]> {
    const res = await this.ctx.getPool().query(
      'SELECT * FROM project_clarifications WHERE project_id = $1 ORDER BY timestamp ASC',
      [projectId]
    );
    return res.rows.map(r => ({
      id: r.id,
      projectId: r.project_id,
      userId: r.user_id,
      userName: r.user_name,
      userAvatar: r.user_avatar || undefined,
      text: r.text,
      timestamp: r.timestamp,
      replies: r.replies || []
    }));
  }
}

async function seedDefaultGigsIfNeeded(pool: any) {
  const nowIso = new Date().toISOString();
  const seedGigs = [
    {
      id: 'g1',
      freelancerId: 'u1',
      freelancerName: 'Sarah Jenkins',
      freelancerUsername: 'sarah_j',
      freelancerAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
      freelancerLevel: 'Top Rated ★★★',
      title: 'I will architect and build a production full-stack React, Node.js and PostgreSQL web application',
      slug: 'architect-build-production-full-stack-react-nodejs-postgresql-web-app',
      category: 'Technology & Programming',
      subcategory: 'Web Development',
      description: 'Complete end-to-end full-stack engineering with TypeScript, React, Express, and transactional PostgreSQL persistence.',
      price: 450,
      deliveryDays: 7,
      rating: 4.9,
      reviewsCount: 124,
      tags: ['React', 'PostgreSQL', 'Node.js', 'TypeScript'],
      image: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800&auto=format&fit=crop&q=80',
      coverImage: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800&auto=format&fit=crop&q=80',
      status: 'active',
      createdAt: nowIso
    },
    {
      id: 'g2',
      freelancerId: 'u3',
      freelancerName: 'Elena Rostova',
      freelancerUsername: 'elena_r',
      freelancerAvatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
      freelancerLevel: 'Top Rated ★★★',
      title: 'I will build custom AI agents, RAG pipelines, and enterprise LLM integrations',
      slug: 'build-custom-ai-agents-rag-pipelines-enterprise-llm-integrations',
      category: 'AI Services',
      subcategory: 'AI Agents',
      description: 'Production-grade AI workflows, vector search, function calling, and automated reasoning pipelines.',
      price: 650,
      deliveryDays: 5,
      rating: 5.0,
      reviewsCount: 89,
      tags: ['AI Agents', 'LLM', 'TypeScript', 'Python'],
      image: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&auto=format&fit=crop&q=80',
      coverImage: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&auto=format&fit=crop&q=80',
      status: 'active',
      createdAt: nowIso
    }
  ];

  for (const g of seedGigs) {
    try {
      await pool.query(
        `INSERT INTO gigs (
          id, freelancer_id, freelancer_name, freelancer_username, freelancer_avatar, freelancer_level,
          title, slug, category, subcategory, description, price, delivery_days, rating, reviews_count,
          tags, image, cover_image, gallery, status, created_at, extras
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
        ON CONFLICT (id) DO NOTHING`,
        [
          g.id, g.freelancerId, g.freelancerName, g.freelancerUsername, g.freelancerAvatar, g.freelancerLevel,
          g.title, g.slug, g.category, g.subcategory, g.description, g.price, g.deliveryDays, g.rating, g.reviewsCount,
          g.tags, g.image, g.coverImage, [], g.status, g.createdAt, JSON.stringify([])
        ]
      );
    } catch {}
  }
}
