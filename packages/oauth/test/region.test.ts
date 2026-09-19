import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_FLOYD_CODE_OAUTH_HOST } from '#/constants';
import { FLOYD_CODE_OAUTH_KEY } from '#/managed-floyd-code';
import { DEFAULT_FLOYD_CODE_BASE_URL } from '#/managed-usage';
import {
  FLOYD_REGION_MARKER_FILENAME,
  FLOYD_REGION_PROFILES,
  floydRegionLoginHosts,
  floydRegionProfile,
  floydRegionSchema,
  resolveFloydRegion,
} from '#/region';

import { createTempWorkDir, type TempDirHandle } from './helpers';

describe('FLOYD_REGION_PROFILES', () => {
  it('keeps the mainland-cn profile aligned with the shared defaults', () => {
    expect(FLOYD_REGION_PROFILES['mainland-cn'].oauthHost).toBe(DEFAULT_FLOYD_CODE_OAUTH_HOST);
    expect(FLOYD_REGION_PROFILES['mainland-cn'].baseUrl).toBe(DEFAULT_FLOYD_CODE_BASE_URL);
  });

  it('floydRegionProfile returns the requested profile', () => {
    expect(floydRegionProfile('global').oauthHost).toBe('https://auth.floyd.ai');
    expect(floydRegionProfile('mainland-cn')).toBe(FLOYD_REGION_PROFILES['mainland-cn']);
  });
});

describe('resolveFloydRegion', () => {
  let workDir: TempDirHandle | undefined;

  afterEach(async () => {
    await workDir?.cleanup();
    workDir = undefined;
  });

  async function markerDir(contents?: string): Promise<string> {
    workDir = await createTempWorkDir();
    if (contents !== undefined) {
      await writeFile(join(workDir.path, FLOYD_REGION_MARKER_FILENAME), contents, 'utf-8');
    }
    return workDir.path;
  }

  it('defaults to mainland-cn when nothing points anywhere', async () => {
    expect(resolveFloydRegion({ env: {}, homeDir: await markerDir() })).toBe('mainland-cn');
  });

  it('resolves a known env oauth host, FLOYD_CODE_OAUTH_HOST first', () => {
    expect(resolveFloydRegion({ env: { FLOYD_CODE_OAUTH_HOST: 'https://auth.floyd.ai' } })).toBe(
      'global',
    );
    expect(resolveFloydRegion({ env: { FLOYD_OAUTH_HOST: 'https://auth.floyd.ai' } })).toBe(
      'global',
    );
    expect(
      resolveFloydRegion({
        env: {
          FLOYD_CODE_OAUTH_HOST: 'https://auth.floyd.com',
          FLOYD_OAUTH_HOST: 'https://auth.floyd.ai',
        },
      }),
    ).toBe('mainland-cn');
  });

  it('treats an unknown env host as a custom environment and falls back to cn', async () => {
    // ...even when the persisted login or marker says otherwise: the custom
    // env overrides every endpoint anyway.
    expect(
      resolveFloydRegion({
        env: { FLOYD_CODE_OAUTH_HOST: 'https://auth.internal.example.com' },
        configuredOAuthHost: 'https://auth.floyd.ai',
        homeDir: await markerDir('global\n'),
      }),
    ).toBe('mainland-cn');
  });

  it('resolves the persisted login host, tolerating trailing slashes', () => {
    expect(resolveFloydRegion({ env: {}, configuredOAuthHost: 'https://auth.floyd.ai/' })).toBe(
      'global',
    );
    expect(resolveFloydRegion({ env: {}, configuredOAuthHost: 'https://auth.floyd.com' })).toBe('mainland-cn');
  });

  it('ignores an unrecognized persisted host and continues down the chain', async () => {
    expect(
      resolveFloydRegion({
        env: {},
        configuredOAuthHost: 'https://auth.legacy.example.com',
        homeDir: await markerDir('global'),
      }),
    ).toBe('global');
  });

  it('reads the install-channel marker when nothing else decides', async () => {
    expect(resolveFloydRegion({ env: {}, homeDir: await markerDir('global\n') })).toBe('global');
    expect(resolveFloydRegion({ env: {}, homeDir: await markerDir('  mainland-cn  ') })).toBe('mainland-cn');
  });

  it('ignores a malformed or missing marker', async () => {
    expect(resolveFloydRegion({ env: {}, homeDir: await markerDir('apac') })).toBe('mainland-cn');
    expect(resolveFloydRegion({ env: {}, homeDir: await markerDir('') })).toBe('mainland-cn');
  });

  it('skips the marker entirely when readMarker is false', async () => {
    expect(
      resolveFloydRegion({ env: {}, homeDir: await markerDir('global'), readMarker: false }),
    ).toBe('mainland-cn');
  });

  it('honors FLOYD_CODE_HOME when homeDir is not passed explicitly', async () => {
    const dir = await markerDir('global');
    expect(resolveFloydRegion({ env: { FLOYD_CODE_HOME: dir } })).toBe('global');
  });

  it('env beats persisted login beats marker', async () => {
    const dir = await markerDir('global');
    expect(
      resolveFloydRegion({
        env: { FLOYD_CODE_OAUTH_HOST: 'https://auth.floyd.com' },
        configuredOAuthHost: 'https://auth.floyd.ai',
        homeDir: dir,
      }),
    ).toBe('mainland-cn');
    expect(
      resolveFloydRegion({
        env: {},
        configuredOAuthHost: 'https://auth.floyd.ai',
        homeDir: dir,
      }),
    ).toBe('global');
  });

  it('treats the persisted default-slot key as explicit mainland-cn, beating the marker', async () => {
    const dir = await markerDir('global');
    expect(
      resolveFloydRegion({ env: {}, configuredOAuthKey: FLOYD_CODE_OAUTH_KEY, homeDir: dir }),
    ).toBe('mainland-cn');
  });

  it('still follows the marker when no key or host is persisted', async () => {
    expect(resolveFloydRegion({ env: {}, homeDir: await markerDir('global') })).toBe('global');
  });

  it('lets an unknown scoped key fall through to the marker', async () => {
    const dir = await markerDir('global');
    expect(
      resolveFloydRegion({
        env: {},
        configuredOAuthKey: 'oauth/floyd-code-env-0123456789abcdef',
        homeDir: dir,
      }),
    ).toBe('global');
  });

  it('resolves a recognized persisted host before consulting the key', () => {
    expect(
      resolveFloydRegion({
        env: {},
        configuredOAuthHost: 'https://auth.floyd.ai',
        configuredOAuthKey: FLOYD_CODE_OAUTH_KEY,
      }),
    ).toBe('global');
  });
});

describe('floydRegionLoginHosts', () => {
  it('returns both profile hosts, mainland-cn included (explicit beats stale config)', () => {
    expect(floydRegionLoginHosts('mainland-cn', {})).toEqual({
      oauthHost: 'https://auth.floyd.com',
      baseUrl: 'https://api.floyd.com/coding/v1',
    });
    expect(floydRegionLoginHosts('global', {})).toEqual({
      oauthHost: 'https://auth.floyd.ai',
      baseUrl: 'https://api.floyd.ai/coding/v1',
    });
  });

  it('yields to env overrides', () => {
    expect(floydRegionLoginHosts('global', { FLOYD_CODE_OAUTH_HOST: 'https://auth.x.com' })).toBe(
      undefined,
    );
    expect(floydRegionLoginHosts('global', { FLOYD_OAUTH_HOST: 'https://auth.x.com' })).toBe(
      undefined,
    );
    expect(
      floydRegionLoginHosts('global', { FLOYD_CODE_BASE_URL: 'https://api.x.com/coding/v1' }),
    ).toBe(undefined);
  });
});

describe('floydRegionSchema', () => {
  it('parses valid regions and rejects others', () => {
    expect(floydRegionSchema.parse('mainland-cn')).toBe('mainland-cn');
    expect(floydRegionSchema.parse('global')).toBe('global');
    expect(floydRegionSchema.safeParse('apac').success).toBe(false);
  });
});
