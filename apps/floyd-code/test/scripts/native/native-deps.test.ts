import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { collectNativeAssets } from '../../../scripts/native/assets.mjs';

import {
  nativeDeps,
  resolveTargetDeps,
  isSupportedTarget,
  SUPPORTED_TARGETS,
} from '../../../scripts/native/native-deps.mjs';

describe('SUPPORTED_TARGETS', () => {
  it('contains the six published targets', () => {
    expect([...SUPPORTED_TARGETS].toSorted()).toEqual(
      [
        'darwin-arm64',
        'darwin-x64',
        'linux-arm64',
        'linux-x64',
        'win32-arm64',
        'win32-x64',
      ].toSorted(),
    );
  });
});

describe('isSupportedTarget', () => {
  it('accepts every supported target', () => {
    for (const t of SUPPORTED_TARGETS) {
      expect(isSupportedTarget(t)).toBe(true);
    }
  });

  it('rejects unknown targets', () => {
    expect(isSupportedTarget('linux-x64-musl')).toBe(false);
    expect(isSupportedTarget('darwin-arm')).toBe(false);
  });
});

describe('resolveTargetDeps', () => {
  it('returns one descriptor per package for darwin-arm64', () => {
    const deps = resolveTargetDeps('darwin-arm64');
    const names = deps.map((d) => d.resolvedName);
    expect(names).toContain('@mariozechner/clipboard');
    expect(names).toContain('@mariozechner/clipboard-darwin-arm64');
    expect(names).toContain('@legacy-ai/pi-tui');
  });

  it('picks the right clipboard subpackage per target', () => {
    expect(
      resolveTargetDeps('linux-x64').map((d) => d.resolvedName),
    ).toContain('@mariozechner/clipboard-linux-x64-gnu');
    expect(
      resolveTargetDeps('win32-x64').map((d) => d.resolvedName),
    ).toContain('@mariozechner/clipboard-win32-x64-msvc');
    expect(
      resolveTargetDeps('win32-arm64').map((d) => d.resolvedName),
    ).toContain('@mariozechner/clipboard-win32-arm64-msvc');
  });

  it('encodes pi-tui native file path per target', () => {
    const linuxPiTui = resolveTargetDeps('linux-arm64').find(
      (d) => d.resolvedName === '@legacy-ai/pi-tui',
    );
    expect(linuxPiTui?.nativeFileRelatives).toEqual([
      'native/linux/prebuilds/linux-arm64/linux-platform-x11.node',
    ]);
    const macPiTui = resolveTargetDeps('darwin-x64').find(
      (d) => d.resolvedName === '@legacy-ai/pi-tui',
    );
    expect(macPiTui?.nativeFileRelatives).toEqual([
      'native/darwin/prebuilds/darwin-x64/darwin-platform.node',
    ]);
    const winArmPiTui = resolveTargetDeps('win32-arm64').find(
      (d) => d.resolvedName === '@legacy-ai/pi-tui',
    );
    expect(winArmPiTui?.nativeFileRelatives).toEqual([
      'native/win32/prebuilds/win32-arm64/win32-platform.node',
    ]);
  });

  it('throws on unsupported target', () => {
    expect(() => resolveTargetDeps('linux-x64-musl')).toThrow(/unsupported/i);
  });
});

describe('nativeDeps registry shape', () => {
  it.skipIf(process.platform === 'win32')('packages the command-window helper with permission to execute it', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'floyd-terminal-assets-'));
    try {
      writeFileSync(join(folder, 'package.json'), '{}');
      symlinkSync(resolve(import.meta.dirname, '../../../node_modules'), join(folder, 'node_modules'), 'dir');
      const workers = join(folder, 'dist-native/intermediates');
      mkdirSync(workers, { recursive: true });
      writeFileSync(join(workers, 'text-build-worker.mjs'), 'export {};');
      writeFileSync(join(workers, 'search-worker.mjs'), 'export {};');
      const { manifest } = await collectNativeAssets({ appRoot: folder, target: `${process.platform}-${process.arch}` });
      const terminal = manifest.packages.find((pkg) => pkg.name === 'node-pty');
      expect(terminal).toBeDefined();
      expect(terminal?.files.some((file) => file.relativePath.endsWith('/pty.node'))).toBe(true);
      if (process.platform === 'darwin') {
        expect(terminal?.files.find((file) => file.relativePath.endsWith('/spawn-helper'))?.mode).toBe(0o755);
      } else {
        expect(terminal?.files.some((file) => file.relativePath.endsWith('/spawn-helper'))).toBe(false);
      }
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it('has clipboard host (collect=js-only)', () => {
    const host = nativeDeps.find((d) => d.id === 'clipboard-host');
    expect(host?.collect).toBe('js-only');
  });

  it('has clipboard-target (collect=native-files, parent=clipboard-host)', () => {
    const target = nativeDeps.find((d) => d.id === 'clipboard-target');
    expect(target?.collect).toBe('native-files');
    expect(target?.parent).toBe('clipboard-host');
  });

  it('has pi-tui (collect=native-file-only, no parent)', () => {
    const piTui = nativeDeps.find((d) => d.id === 'pi-tui');
    expect(piTui?.collect).toBe('native-file-only');
    expect(piTui?.parent).toBe(null);
  });
});
