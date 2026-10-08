import { afterEach, describe, expect, it, vi } from 'vitest';

describe('install prompt', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('notifies a listener that re-subscribes (like the title screen redrawing) exactly once', async () => {
    const handlers: Record<string, (e: unknown) => void> = {};
    vi.stubGlobal('window', { addEventListener: (name: string, fn: (e: unknown) => void) => void (handlers[name] = fn) });
    const { canPromptInstall, initInstall, onInstallChange } = await import('../src/ui/install');
    initInstall();
    let calls = 0;
    let off = () => {};
    const redraw = () => {
      calls++;
      if (calls > 50) throw new Error('infinite redraw loop');
      off();
      off = onInstallChange(redraw);
    };
    off = onInstallChange(redraw);
    handlers.beforeinstallprompt!({ preventDefault: () => undefined, prompt: async () => undefined, userChoice: Promise.resolve({ outcome: 'dismissed' }) });
    expect(calls).toBe(1);
    expect(canPromptInstall()).toBe(true);
  });
});
