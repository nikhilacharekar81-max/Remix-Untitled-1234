import type pkg from 'pg';

export interface RepoContext {
  getPool(): pkg.Pool;
  withLock<T = void>(key: string, fn: () => Promise<T>): Promise<T>;
  executeInTransaction<T>(fn: (client: pkg.PoolClient) => Promise<T>): Promise<T>;
}
