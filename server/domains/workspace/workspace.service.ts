import { randomUUID } from 'node:crypto';
import { Workspace, Order } from '../../../src/types.js';
import { postgresStore } from '../../db/postgresStore.js';

class WorkspaceService {
  private workspaces: Map<string, Workspace> = new Map();

  public loadFromList(list: any[]) {
    if (Array.isArray(list)) {
      this.workspaces.clear();
      for (const w of list) {
        if (w?.workspaceId) this.workspaces.set(w.workspaceId, w);
      }
    }
  }

  public async hydrateFromPostgres(): Promise<void> {
    try {
      const list = await postgresStore.listWorkspaces();
      this.loadFromList(list);
    } catch (err) {
      console.error('[WorkspaceService] Failed to hydrate workspaces from PostgreSQL:', err);
    }
  }

  public listAll(): Workspace[] {
    return Array.from(this.workspaces.values());
  }

  public async listAllAsync(): Promise<Workspace[]> {
    const dbList = await postgresStore.listWorkspaces();
    this.loadFromList(dbList);
    return Array.from(this.workspaces.values());
  }

  public async persistWorkspace(workspace: Workspace, client?: any): Promise<void> {
    try {
      await postgresStore.saveWorkspace(workspace, client);
    } catch (err) {
      console.error(`[WorkspaceService] Failed to persist workspace ${workspace.workspaceId} to PostgreSQL:`, err);
      throw err;
    }
  }

  public async saveToDisk(): Promise<void> {
    const list = Array.from(this.workspaces.values());
    await postgresStore.saveWorkspaces(list);
  }

  private syncWorkspaceToMemory(workspace: Workspace & { updatedAt?: string }, client?: any): void {
    const isTx = Boolean(client) || postgresStore.isActiveTransaction();
    if (isTx) {
      postgresStore.onCommit(() => {
        const current = this.workspaces.get(workspace.workspaceId) as (Workspace & { updatedAt?: string }) | undefined;
        if (!current || !current.updatedAt || !workspace.updatedAt || new Date(workspace.updatedAt).getTime() >= new Date(current.updatedAt).getTime()) {
          this.workspaces.set(workspace.workspaceId, workspace);
        }
      });
    } else {
      const current = this.workspaces.get(workspace.workspaceId) as (Workspace & { updatedAt?: string }) | undefined;
      if (!current || !current.updatedAt || !workspace.updatedAt || new Date(workspace.updatedAt).getTime() >= new Date(current.updatedAt).getTime()) {
        this.workspaces.set(workspace.workspaceId, workspace);
      }
    }
  }

  public async createWorkspaceAsync(params: {
    buyerId: string;
    sellerId: string;
    originType: 'gig' | 'project' | 'profile';
    originId: string;
    activeOrderId?: string;
    title?: string;
  }, client?: any): Promise<Workspace> {
    const workspaceId = 'ws_' + randomUUID().slice(0, 12);
    const createdAt = new Date().toISOString().split('T')[0];
    const workspace: Workspace & { orderIds?: string[]; title?: string; updatedAt?: string } = {
      workspaceId,
      buyerId: params.buyerId,
      sellerId: params.sellerId,
      originType: params.originType,
      originId: params.originId,
      createdAt,
      updatedAt: new Date().toISOString(),
      status: 'active',
      activeOrderId: params.activeOrderId,
      orderIds: params.activeOrderId ? [params.activeOrderId] : [],
      title: params.title || params.originId
    };
    await this.persistWorkspace(workspace, client);
    this.syncWorkspaceToMemory(workspace, client);
    return workspace;
  }

  public createWorkspace(params: {
    buyerId: string;
    sellerId: string;
    originType: 'gig' | 'project' | 'profile';
    originId: string;
    activeOrderId?: string;
    title?: string;
  }): Workspace {
    const workspaceId = 'ws_' + randomUUID().slice(0, 12);
    const createdAt = new Date().toISOString().split('T')[0];
    const workspace: Workspace & { orderIds?: string[]; title?: string; updatedAt?: string } = {
      workspaceId,
      buyerId: params.buyerId,
      sellerId: params.sellerId,
      originType: params.originType,
      originId: params.originId,
      createdAt,
      updatedAt: new Date().toISOString(),
      status: 'active',
      activeOrderId: params.activeOrderId,
      orderIds: params.activeOrderId ? [params.activeOrderId] : [],
      title: params.title || params.originId
    };
    this.syncWorkspaceToMemory(workspace);
    this.persistWorkspace(workspace).catch(err => {
      console.error(`[WorkspaceService] Workspace creation persist error for ${workspace.workspaceId}:`, err);
    });
    return workspace;
  }

  public getWorkspace(workspaceId: string): Workspace | undefined {
    return this.workspaces.get(workspaceId);
  }

  public async getWorkspaceAsync(workspaceId: string, client?: any): Promise<Workspace | undefined> {
    const ws = await postgresStore.getWorkspace(workspaceId, client);
    if (ws) {
      this.syncWorkspaceToMemory(ws as any, client);
      return ws;
    }
    const isTx = Boolean(client) || postgresStore.isActiveTransaction();
    if (!isTx) {
      this.workspaces.delete(workspaceId);
    }
    return undefined;
  }

  public getWorkspacesForUser(userId: string): Workspace[] {
    return Array.from(this.workspaces.values()).filter(w => w.buyerId === userId || w.sellerId === userId);
  }

  public async getWorkspacesForUserAsync(userId: string): Promise<Workspace[]> {
    await this.hydrateFromPostgres();
    return this.getWorkspacesForUser(userId);
  }

  public findWorkspaceByOrder(orderId: string, orders: Order[]): Workspace | undefined {
    const order = orders.find(o => o.id === orderId);
    if (!order) return undefined;
    if (order.workspaceId) {
      return this.workspaces.get(order.workspaceId);
    }
    for (const w of this.workspaces.values()) {
      if (w.activeOrderId === orderId) return w;
      if (Array.isArray((w as any).orderIds) && (w as any).orderIds.includes(orderId)) return w;
    }
    return undefined;
  }

  public async ensureWorkspaceForOrderAsync(order: Order, client?: any): Promise<Workspace> {
    let ws: (Workspace & { orderIds?: string[]; updatedAt?: string }) | undefined;

    if (order.workspaceId) {
      const dbWs = await postgresStore.getWorkspace(order.workspaceId, client);
      if (dbWs && dbWs.buyerId === order.buyerId && dbWs.sellerId === order.sellerId) {
        ws = dbWs as Workspace & { orderIds?: string[]; updatedAt?: string };
      } else if (!dbWs && this.workspaces.has(order.workspaceId)) {
        const memWs = this.workspaces.get(order.workspaceId)! as Workspace & { orderIds?: string[]; updatedAt?: string };
        if (memWs.buyerId === order.buyerId && memWs.sellerId === order.sellerId) {
          ws = memWs;
        }
      }
    }

    if (ws) {
      const existingOrderIds = Array.isArray(ws.orderIds) ? [...ws.orderIds] : [];
      const isNewOrderInWorkspace = !existingOrderIds.includes(order.id);
      const updatedOrderIds = isNewOrderInWorkspace ? [...existingOrderIds, order.id] : existingOrderIds;
      const nextActiveOrderId =
        isNewOrderInWorkspace || !ws.activeOrderId || !updatedOrderIds.includes(ws.activeOrderId)
          ? order.id
          : ws.activeOrderId;
      const updatedWs: Workspace & { orderIds?: string[]; updatedAt?: string } = {
        ...ws,
        activeOrderId: nextActiveOrderId,
        orderIds: updatedOrderIds,
        updatedAt: new Date().toISOString()
      };
      await this.persistWorkspace(updatedWs, client);
      this.syncWorkspaceToMemory(updatedWs, client);
      order.workspaceId = updatedWs.workspaceId;
      return updatedWs;
    }

    const originType = order.projectId ? 'project' : (order.gigId ? 'gig' : 'profile');
    const originId = order.projectId || order.gigId || order.sellerId || order.id;

    ws = await this.createWorkspaceAsync({
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      originType,
      originId,
      activeOrderId: order.id,
      title: order.title || originId
    }, client);

    order.workspaceId = ws.workspaceId;
    return ws;
  }

  public async recordOrder(order: Order, client?: any): Promise<Workspace> {
    if (!order.workspaceId) {
      return this.ensureWorkspaceForOrderAsync(order, client);
    }
    const dbWs = await postgresStore.getWorkspace(order.workspaceId, client);
    const baseWs = (dbWs && dbWs.buyerId === order.buyerId && dbWs.sellerId === order.sellerId)
      ? dbWs
      : (this.workspaces.has(order.workspaceId) &&
         this.workspaces.get(order.workspaceId)!.buyerId === order.buyerId &&
         this.workspaces.get(order.workspaceId)!.sellerId === order.sellerId
          ? this.workspaces.get(order.workspaceId)!
          : undefined);
    if (!baseWs) {
      return this.ensureWorkspaceForOrderAsync(order, client);
    }
    const updatedOrderIds = Array.isArray(baseWs.orderIds) ? [...baseWs.orderIds] : [];
    if (!updatedOrderIds.includes(order.id)) updatedOrderIds.push(order.id);
    const updatedWs: Workspace & { orderIds?: string[]; updatedAt?: string; title?: string } = {
      ...baseWs,
      activeOrderId: order.id,
      orderIds: updatedOrderIds,
      title: order.title || (baseWs as any).title || baseWs.originId,
      updatedAt: new Date().toISOString()
    };
    await this.persistWorkspace(updatedWs, client);
    this.syncWorkspaceToMemory(updatedWs, client);
    return updatedWs;
  }

  public ensureWorkspaceForOrder(order: Order): Workspace {
    let ws: (Workspace & { orderIds?: string[]; updatedAt?: string }) | undefined;

    if (order.workspaceId && this.workspaces.has(order.workspaceId)) {
      const candidate = this.workspaces.get(order.workspaceId)! as Workspace & { orderIds?: string[]; updatedAt?: string };
      if (candidate.buyerId === order.buyerId && candidate.sellerId === order.sellerId) {
        ws = candidate;
      }
    }

    if (ws) {
      const targetWs = ws;
      if (!Array.isArray(targetWs.orderIds)) targetWs.orderIds = [];
      const isNewOrderInWorkspace = !targetWs.orderIds.includes(order.id);
      if (isNewOrderInWorkspace) {
        targetWs.orderIds.push(order.id);
        targetWs.activeOrderId = order.id;
      } else if (!targetWs.activeOrderId || !targetWs.orderIds.includes(targetWs.activeOrderId)) {
        targetWs.activeOrderId = order.id;
      }
      targetWs.updatedAt = new Date().toISOString();
      this.persistWorkspace(targetWs).catch(err => {
        console.error(`[WorkspaceService] Workspace update persist error for ${targetWs.workspaceId}:`, err);
      });
      order.workspaceId = targetWs.workspaceId;
      return targetWs;
    }

    const originType = order.projectId ? 'project' : 'gig';
    const originId = order.projectId || order.gigId || order.id;

    ws = this.createWorkspace({
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      originType,
      originId,
      activeOrderId: order.id,
      title: order.title || originId
    });

    order.workspaceId = ws.workspaceId;
    return ws;
  }

  public migrateLegacyOrders(orders: Order[], dryRun: boolean = false): { migratedCount: number; dryRun: boolean; details: string[] } {
    let migratedCount = 0;
    const details: string[] = [];
    for (const o of orders) {
      if (!o.workspaceId || !this.workspaces.has(o.workspaceId)) {
        migratedCount++;
        if (!dryRun) {
          const ws = this.ensureWorkspaceForOrder(o);
          details.push(`Migrated order ${o.id} to dedicated workspace ${ws.workspaceId}`);
        } else {
          details.push(`[DryRun] Would migrate order ${o.id} to dedicated workspace`);
        }
      }
    }
    return { migratedCount, dryRun, details };
  }

  public async deleteWorkspace(workspaceId: string): Promise<boolean> {
    try {
      await postgresStore.deleteWorkspace(workspaceId);
      this.workspaces.delete(workspaceId);
      return true;
    } catch (err) {
      console.error(`[WorkspaceService] Failed to delete workspace ${workspaceId} from PostgreSQL:`, err);
      return false;
    }
  }
}

export const workspaceService = new WorkspaceService();

