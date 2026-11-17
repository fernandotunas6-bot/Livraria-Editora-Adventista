import { afterEach, describe, expect, it } from 'vitest';

// Com o Capacitor verdadeiro (sem simulações): os plugins carregados pelo site têm de chegar a
// quem os pede. O Proxy dos plugins responde a `then`, e devolvido por uma função `async` o
// `await` ficava pendurado para sempre — no app, todas as funções nativas paravam (lib/nativeApp.js:
// semThen). Aqui a ponte nativa é fingida e não responde: só interessa que o plugin chegue.

const { pluginAparelho, pluginApp, pluginHaptics, pluginPush, pluginStatusBar, pluginWebAuth, semThen } = await import('./nativeApp');

const aTempo = (p, ms = 1000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('pendurado')), ms))]);

afterEach(() => {
  delete window.Capacitor;
  delete window.webkit;
});

describe('plugins do Capacitor no app', () => {
  it('chegam a quem os pede (o await não fica pendurado)', async () => {
    window.webkit = { messageHandlers: { bridge: { postMessage() {} } } };
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' };
    for (const carregar of [pluginApp, pluginHaptics, pluginPush, pluginStatusBar, pluginAparelho, pluginWebAuth]) {
      const p = await aTempo(carregar());
      expect(p).toBeTruthy();
      expect(p.then).toBeUndefined();
      expect(typeof p.addListener).toBe('function');
    }
  });

  it('semThen deixa passar o resto', () => {
    const alvo = { abrir: () => 'ok', then: () => 'nunca' };
    const p = semThen(alvo);
    expect(p.abrir()).toBe('ok');
    expect(p.then).toBeUndefined();
    expect(semThen(null)).toBeNull();
  });
});
