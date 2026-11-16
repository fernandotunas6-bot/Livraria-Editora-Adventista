import { afterEach, describe, expect, it, vi } from 'vitest';

// As notificações dentro do app iOS: o APNs pelo plugin PushNotifications (lib/pushNotifications.js).

const send = vi.fn(async () => ({}));
vi.mock('@/lib/dataClient', () => ({ default: { send, authStore: { model: null } } }));

const listeners = {};
const push = {
  checkPermissions: vi.fn(async () => ({ receive: 'prompt' })),
  requestPermissions: vi.fn(async () => ({ receive: 'granted' })),
  addListener: vi.fn(async (evento, fn) => { listeners[evento] = fn; return { remove: () => { delete listeners[evento]; } }; }),
  register: vi.fn(async () => { setTimeout(() => listeners.registration?.({ value: 'ab'.repeat(32) }), 0); }),
  unregister: vi.fn(async () => {}),
};
vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: push }));
push.createChannel = vi.fn(async () => {});

// O plugin «Aparelho» do app Android diz se o build levou o Firebase (google-services.json).
let firebase = true;
vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({ pushConfigurado: async () => ({ configurado: firebase }) }) }));

const {
  desligarPushNativo, isPushSupported, permissaoDoPushNativo, pushDisponivel, pushNativoLigado, pushNativoNoServidor,
  requestPushPermission, sincronizarPushNativo, subscribeToPush,
} = await import('./pushNotifications');

const noApp = () => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' }; };

afterEach(() => {
  firebase = true;
  delete window.Capacitor;
  localStorage.clear();
  vi.clearAllMocks();
  push.checkPermissions.mockImplementation(async () => ({ receive: 'prompt' }));
});

describe('pushDisponivel', () => {
  it('no site precisa da chave VAPID; no app só do interruptor da loja', () => {
    expect(pushDisponivel({ push_enabled: true, vapid_public_key: 'k' })).toBe(true);
    expect(pushDisponivel({ push_enabled: true, vapid_public_key: '' })).toBe(false);
    expect(pushDisponivel({ push_enabled: false, vapid_public_key: 'k' })).toBe(false);
    noApp();
    expect(pushDisponivel({ push_enabled: true, vapid_public_key: '' })).toBe(true);
    expect(pushDisponivel({ push_enabled: false })).toBe(false);
  });
});

describe('no app iOS', () => {
  it('há push, mesmo sem service worker', () => {
    noApp();
    expect(isPushSupported()).toBe(true);
  });

  it('pede a permissão ao iPhone, regista no APNs e entrega o token ao servidor', async () => {
    noApp();
    expect(await requestPushPermission()).toBe('granted');
    const r = await subscribeToPush('chave-vapid-que-nao-conta', { appUpdates: false });
    expect(r).toEqual({ token: 'ab'.repeat(32) });
    expect(send).toHaveBeenCalledWith('/push/native/subscribe', {
      method: 'POST',
      body: expect.objectContaining({ token: 'ab'.repeat(32), platform: 'ios', app_updates: false }),
    });
    // Os ouvintes do registo saem no fim.
    expect(listeners.registration).toBeUndefined();
  });

  it('sem permissão não regista', async () => {
    noApp();
    push.checkPermissions.mockImplementation(async () => ({ receive: 'denied' }));
    expect(await subscribeToPush('k')).toBeNull();
    expect(push.register).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('ao entrar ou sair da conta só volta a registar se a permissão já foi dada', async () => {
    noApp();
    expect(await sincronizarPushNativo()).toBe(false);
    expect(push.requestPermissions).not.toHaveBeenCalled();
    push.checkPermissions.mockImplementation(async () => ({ receive: 'granted' }));
    expect(await permissaoDoPushNativo()).toBe('granted');
    expect(await sincronizarPushNativo()).toBe(true);
    expect(send).toHaveBeenCalledWith('/push/native/subscribe', expect.anything());
  });

  it('desligar: o servidor esquece o aparelho', async () => {
    noApp();
    push.checkPermissions.mockImplementation(async () => ({ receive: 'granted' }));
    await subscribeToPush('k');
    send.mockClear();
    await desligarPushNativo();
    expect(send).toHaveBeenCalledWith('/push/native/unsubscribe', { method: 'POST', body: { token: 'ab'.repeat(32), platform: 'ios' } });
    expect(push.unregister).toHaveBeenCalled();
  });

  it('quem desligou no perfil continua desligado no arranque seguinte, até voltar a ligar', async () => {
    noApp();
    push.checkPermissions.mockImplementation(async () => ({ receive: 'granted' }));
    await subscribeToPush('k', { pedida: true });
    expect(await pushNativoLigado()).toBe(true);
    await desligarPushNativo();
    send.mockClear();
    push.register.mockClear();
    // A permissão do iPhone continua dada, mas o app não volta a registar o aparelho sozinho…
    expect(await pushNativoLigado()).toBe(false);
    expect(await sincronizarPushNativo()).toBe(false);
    // …nem a oferta de depois da compra (SuccessPage), que não é a pessoa a ligar.
    expect(await subscribeToPush('k')).toBeNull();
    expect(push.register).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    // Ligar outra vez no perfil desfaz.
    expect(await subscribeToPush('k', { pedida: true })).toEqual({ token: 'ab'.repeat(32) });
    expect(await pushNativoLigado()).toBe(true);
    expect(await sincronizarPushNativo()).toBe(true);
  });

  it('o servidor diz se envia para este telemóvel; sem resposta, conta como sim', async () => {
    noApp();
    send.mockResolvedValueOnce({ enabled: true, ios: false, android: true });
    expect(await pushNativoNoServidor()).toBe(false);
    expect(send).toHaveBeenCalledWith('/push/config', { method: 'GET' });
    send.mockResolvedValueOnce({ enabled: true, ios: true, android: false });
    expect(await pushNativoNoServidor()).toBe(true);
    // Um servidor que ainda não diz (sem `ios`) ou que não responde não trava o interruptor.
    send.mockResolvedValueOnce({ enabled: true, publicKey: 'k' });
    expect(await pushNativoNoServidor()).toBe(true);
    send.mockRejectedValueOnce(new Error('sem rede'));
    expect(await pushNativoNoServidor()).toBe(true);
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
    send.mockResolvedValueOnce({ enabled: true, ios: true, android: false });
    expect(await pushNativoNoServidor()).toBe(false);
  });
});

describe('no app Android', () => {
  const noAndroid = () => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' }; };

  it('sem o Firebase no build, nem pergunta nem regista (registar derrubava o app)', async () => {
    noAndroid();
    firebase = false;
    expect(await requestPushPermission()).toBe('unsupported');
    expect(await subscribeToPush('k')).toBeNull();
    expect(await sincronizarPushNativo()).toBe(false);
    expect(push.register).not.toHaveBeenCalled();
    expect(push.checkPermissions).not.toHaveBeenCalled();
  });

  it('com o Firebase: regista, cria o canal dos avisos e diz que é Android', async () => {
    noAndroid();
    expect(await subscribeToPush('k', { appUpdates: true })).toEqual({ token: 'ab'.repeat(32) });
    expect(push.createChannel).toHaveBeenCalledWith(expect.objectContaining({ id: 'livraria' }));
    expect(send).toHaveBeenCalledWith('/push/native/subscribe', {
      method: 'POST',
      body: expect.objectContaining({ platform: 'android', app_updates: true }),
    });
  });
});

describe('fora do app', () => {
  it('nada do APNs', async () => {
    expect(await permissaoDoPushNativo()).toBeNull();
    expect(await sincronizarPushNativo()).toBe(false);
    expect(push.checkPermissions).not.toHaveBeenCalled();
  });
});
