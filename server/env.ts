import { IS_PRODUCTION, resolveIsProduction } from './initEnv.js';

export function isProduction(): boolean {
  return resolveIsProduction(import.meta.url);
}

export { IS_PRODUCTION };

