import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Authoritative environment initialization
// Must execute before any configuration, authentication, cloud storage, or database module is imported.
dotenv.config();

export function resolveIsProduction(callerUrl?: string): boolean {
  const entryFile = process.argv[1] ? path.basename(process.argv[1]) : '';
  const callerFile = callerUrl ? path.basename(fileURLToPath(callerUrl)) : '';
  const isCompiledProductionBundle =
    entryFile.startsWith('server.js') || callerFile.startsWith('server.js');
  const isNpmStart = process.env.npm_lifecycle_event === 'start';
  const isExplicitProd = process.env.NODE_ENV === 'production';
  const isTestEnv = process.env.NODE_ENV === 'test';

  return (isExplicitProd || isNpmStart || isCompiledProductionBundle) && !isTestEnv;
}

export const IS_PRODUCTION = resolveIsProduction(import.meta.url);

if (IS_PRODUCTION) {
  (process.env as any).NODE_ENV = 'production';
}

