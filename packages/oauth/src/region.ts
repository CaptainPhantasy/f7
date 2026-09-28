/**
 * Region profiles for the mainland-China and global deployment slots, plus
 * the resolver that decides which region a client belongs to.
 *
 * A region is a bundle of endpoints (OAuth host, managed API base URL, CDN,
 * site, telemetry). No deployment is baked in: every endpoint starts empty
 * and is filled in by the env overrides, so an unconfigured client never
 * reaches a host at all. The OAuth client_id is shared across regions and
 * stays in `./constants`.
 *
 * Resolution order (first match wins):
 *   1. env override (`FLOYD_CODE_OAUTH_HOST` / `FLOYD_OAUTH_HOST`)
 *   2. persisted login (the `oauthHost` stored in config.toml's oauth ref)
 *   3. persisted default-slot login (the oauth ref's key equals
 *      `FLOYD_CODE_OAUTH_KEY` — a mainland-China login persists no
 *      `oauthHost`, so the default slot's presence is an explicit-mainland-cn
 *      signal that outranks the marker)
 *   4. install-channel marker file (`<home>/region`, written by install
 *      scripts; consultable only before the first login)
 *   5. default 'mainland-cn'
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { z } from 'zod';

import { DEFAULT_FLOYD_CODE_OAUTH_HOST } from './constants';
import { DEFAULT_FLOYD_CODE_BASE_URL } from './managed-usage';
import { floydCodeEnvBaseUrl, floydCodeEnvOAuthHost, FLOYD_CODE_OAUTH_KEY } from './managed-floyd-code';

export type FloydRegion = 'mainland-cn' | 'global';

/** Zod schema for the wire/domain contract; parses to {@link FloydRegion}. */
export const floydRegionSchema = z.enum(['mainland-cn', 'global']);

export interface FloydRegionProfile {
  /** OAuth host the device flow talks to (authorize/token derive from it). */
  readonly oauthHost: string;
  /** Managed API base (`/coding/v1`): usages, userinfo, models, feedback... */
  readonly baseUrl: string;
  /** Update/install/plugin-marketplace root. */
  readonly cdnBase: string;
  /** Official site root (docs, console, signup, upgrade pages). */
  readonly siteBase: string;
  readonly telemetryEndpoint: string;
}

export const FLOYD_REGION_PROFILES: Record<FloydRegion, FloydRegionProfile> = {
  'mainland-cn': {
    oauthHost: DEFAULT_FLOYD_CODE_OAUTH_HOST,
    baseUrl: DEFAULT_FLOYD_CODE_BASE_URL,
    cdnBase: '',
    siteBase: '',
    telemetryEndpoint: '',
  },
  global: {
    oauthHost: '',
    baseUrl: '',
    cdnBase: '',
    siteBase: '',
    telemetryEndpoint: '',
  },
};

export function floydRegionProfile(region: FloydRegion): FloydRegionProfile {
  return FLOYD_REGION_PROFILES[region];
}

/**
 * Content-CDN URL builder (tips banner, WebBridge / Computer-Use binaries).
 * No content-CDN host ships with the client, so the result is a root-relative
 * path — funnel every content URL through here so pointing at a real CDN
 * later touches one function.
 */
export function floydCdnContentUrl(path: string): string {
  return `/${path.replace(/^\/+/, '')}`;
}

/**
 * Login hosts for an explicit region choice, or `undefined` when an env
 * override (`FLOYD_CODE_OAUTH_HOST` / `FLOYD_OAUTH_HOST` / `FLOYD_CODE_BASE_URL`)
 * is in play or the chosen profile has no endpoints configured — env keeps
 * full control of endpoints, so a region pick must not smuggle profile hosts
 * past it (requested hosts outrank env in `resolveFloydCodeLoginAuth`), and an
 * unconfigured region must not persist an empty host.
 *
 * When returned, both hosts are always set.
 */
export function floydRegionLoginHosts(
  region: FloydRegion,
  env: NodeJS.ProcessEnv = process.env,
): { readonly oauthHost: string; readonly baseUrl: string } | undefined {
  if (floydCodeEnvOAuthHost(env) !== undefined || floydCodeEnvBaseUrl(env) !== undefined) {
    return undefined;
  }
  const profile = floydRegionProfile(region);
  if (profile.oauthHost.length === 0 || profile.baseUrl.length === 0) return undefined;
  return { oauthHost: profile.oauthHost, baseUrl: profile.baseUrl };
}

/**
 * Marker file name under the Floyd home dir. Install scripts write a single
 * line (`mainland-cn` or `global`) here so a fresh client can default to the
 * region matching the channel it was installed from. It is only consulted
 * while the user has never logged in; a persisted login (config.toml) always
 * wins.
 */
export const FLOYD_REGION_MARKER_FILENAME = 'region';

export interface ResolveFloydRegionOptions {
  /** Defaults to `process.env`. */
  readonly env?: NodeJS.ProcessEnv;
  /** The `oauthHost` persisted in config.toml's oauth ref, if any. */
  readonly configuredOAuthHost?: string;
  /**
   * The credential key persisted in config.toml's oauth ref, if any. The
   * default slot ({@link FLOYD_CODE_OAUTH_KEY}) only ever holds a
   * mainland-China login — mainland-cn persists no `oauthHost` — so its
   * presence is an explicit-mainland-cn signal that outranks the
   * install-channel marker.
   */
  readonly configuredOAuthKey?: string;
  /** Floyd home dir; defaults to `FLOYD_CODE_HOME` or `~/.floyd-code`. */
  readonly homeDir?: string;
  /**
   * Set false to skip the install-channel marker (e.g. the desktop app's
   * embedded server, which is not installed through a channel script and
   * leaves the region choice entirely to the login UI).
   */
  readonly readMarker?: boolean;
}

function normalizeHost(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function regionForOAuthHost(oauthHost: string): FloydRegion | undefined {
  const normalized = normalizeHost(oauthHost);
  for (const region of Object.keys(FLOYD_REGION_PROFILES) as FloydRegion[]) {
    const profileHost = normalizeHost(FLOYD_REGION_PROFILES[region].oauthHost);
    if (profileHost.length > 0 && profileHost === normalized) return region;
  }
  return undefined;
}

function readRegionMarker(homeDir: string): FloydRegion | undefined {
  let raw: string;
  try {
    raw = readFileSync(join(homeDir, FLOYD_REGION_MARKER_FILENAME), 'utf-8');
  } catch {
    return undefined;
  }
  const value = raw.trim();
  return value === 'mainland-cn' || value === 'global' ? value : undefined;
}

// Mirrors `defaultFloydHome` in ./toolkit; keep the two in sync so the marker
// always lands next to the credentials dir it describes.
function defaultHomeDir(env: NodeJS.ProcessEnv): string {
  const override = env['FLOYD_CODE_HOME'];
  if (override !== undefined && override.length > 0) return override;
  return join(homedir(), '.floyd-code');
}

export function resolveFloydRegion(options: ResolveFloydRegionOptions = {}): FloydRegion {
  const env = options.env ?? process.env;
  // An env host that matches a profile pins the region. An unknown env host
  // means a custom/internal environment: the per-endpoint env overrides keep
  // doing their job regardless of region, so skip straight to the default
  // instead of letting a stale config/marker point CDN links somewhere odd.
  const envHost = env['FLOYD_CODE_OAUTH_HOST'] ?? env['FLOYD_OAUTH_HOST'];
  if (envHost !== undefined && envHost.length > 0) {
    return regionForOAuthHost(envHost) ?? 'mainland-cn';
  }
  const configured = options.configuredOAuthHost;
  if (configured !== undefined && configured.length > 0) {
    const configuredRegion = regionForOAuthHost(configured);
    if (configuredRegion !== undefined) return configuredRegion;
  }
  if (options.configuredOAuthKey === FLOYD_CODE_OAUTH_KEY) return 'mainland-cn';
  if (options.readMarker !== false) {
    const markerRegion = readRegionMarker(options.homeDir ?? defaultHomeDir(env));
    if (markerRegion !== undefined) return markerRegion;
  }
  return 'mainland-cn';
}
