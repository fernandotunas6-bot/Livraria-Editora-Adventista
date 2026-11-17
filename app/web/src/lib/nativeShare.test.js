import { afterEach, describe, expect, it, vi } from 'vitest';

const pluginShare = vi.fn(async () => ({}));
vi.mock('@capacitor/share', () => ({ Share: { share: pluginShare } }));

const { canNativeShare, copyText, nativeShare } = await import('@/lib/nativeShare');

const original = { share: navigator.share, clipboard: navigator.clipboard };
afterEach(() => {
  delete window.Capacitor;
  pluginShare.mockClear();
  Object.defineProperty(navigator, 'share', { value: original.share, configurable: true });
  Object.defineProperty(navigator, 'clipboard', { value: original.clipboard, configurable: true });
});

describe('nativeShare', () => {
  it('sem folha de partilha, diz que não há', async () => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    expect(canNativeShare()).toBe(false);
    expect(await nativeShare({ title: 't', url: 'https://x' })).toBe('unsupported');
  });

  it('partilhado, cancelado pela pessoa, ou recusado pelo navegador', async () => {
    const share = vi.fn(async () => {});
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    expect(await nativeShare({ title: 'Livro', text: 'Leia', url: 'https://x/p/1' })).toBe('shared');
    expect(share).toHaveBeenCalledWith({ title: 'Livro', text: 'Leia', url: 'https://x/p/1' });

    share.mockRejectedValueOnce(Object.assign(new Error('fechou'), { name: 'AbortError' }));
    expect(await nativeShare({ url: 'https://x' })).toBe('cancelled');

    share.mockRejectedValueOnce(Object.assign(new Error('não'), { name: 'NotAllowedError' }));
    expect(await nativeShare({ url: 'https://x' })).toBe('unsupported');
  });
});

describe('nativeShare no app iOS', () => {
  it('usa a folha nativa do plugin, mesmo sem a do WKWebView', async () => {
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' };
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    expect(canNativeShare()).toBe(true);
    expect(await nativeShare({ title: 'Livro', text: 'Leia', url: 'https://x/p/1' })).toBe('shared');
    expect(pluginShare).toHaveBeenCalledWith({ title: 'Livro', text: 'Leia', url: 'https://x/p/1', dialogTitle: 'Livro' });

    pluginShare.mockRejectedValueOnce(new Error('Share canceled'));
    expect(await nativeShare({ url: 'https://x' })).toBe('cancelled');
  });
});

describe('copyText', () => {
  it('copia, ou diz que não conseguiu', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    expect(await copyText('https://x')).toBe(true);
    writeText.mockRejectedValueOnce(new Error('bloqueado'));
    expect(await copyText('https://x')).toBe(false);
  });
});
