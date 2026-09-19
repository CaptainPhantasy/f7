import type { OAuthFlowConfig } from './types';

export const DEFAULT_FLOYD_CODE_OAUTH_HOST = 'https://auth.floyd.com';

/** Node-side env override lookup, resolved through `globalThis` so the module
    stays loadable — and typecheckable — in browser bundles that have no
    `process` global (browser consumers of the ./device entry land on the
    default host). */
function envOverride(key: string): string | undefined {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.[key];
}

export const FLOYD_CODE_FLOW_CONFIG: OAuthFlowConfig = {
  name: 'floyd-code',
  oauthHost:
    envOverride('FLOYD_CODE_OAUTH_HOST') ??
    envOverride('FLOYD_OAUTH_HOST') ??
    DEFAULT_FLOYD_CODE_OAUTH_HOST,
  clientId: '17e5f671-d194-4dfb-9706-5516cb48c098',
};
