import { describe, expect, it, vi } from 'vitest';

import type { FloydRegionProfile } from '@legacy-ai/floyd-code-oauth';

import { handleDesktopCommand } from '#/tui/commands/desktop';
import type { SlashCommandHost } from '#/tui/commands/dispatch';

const mocks = vi.hoisted(() => ({
  openUrl: vi.fn(),
  currentFloydProfile: vi.fn(() => ({ siteBase: 'https://example.com' }) as unknown as FloydRegionProfile),
}));

vi.mock('#/utils/open-url', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/utils/open-url')>();
  return { ...actual, openUrl: mocks.openUrl };
});

vi.mock('#/utils/region', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/utils/region')>();
  return { ...actual, currentFloydProfile: mocks.currentFloydProfile };
});

describe('handleDesktopCommand', () => {
  it('shows the region-derived desktop app page URL and opens it in the browser', async () => {
    const host = { showStatus: vi.fn() } as unknown as SlashCommandHost;

    await handleDesktopCommand(host);

    expect(host.showStatus).toHaveBeenCalledWith(expect.stringContaining('https://example.com/code'));
    expect(mocks.openUrl).toHaveBeenCalledWith('https://example.com/code');
  });
});
