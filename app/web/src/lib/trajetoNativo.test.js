import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// O trajeto nos apps: o que se passa ao telemóvel (lib/trajetoNativo.js → TrajetoPlugin.swift no
// iPhone, TrajetoPlugin.java e TrajetoService.java no Android).

let aoMudarSessao = null;
const largarSessao = vi.fn();
vi.mock('@/lib/supabaseClient', () => ({
  SUPABASE_URL: 'https://projecto.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'sessao-1' } } }),
      onAuthStateChange: (fn) => { aoMudarSessao = fn; return { data: { subscription: { unsubscribe: largarSessao } } }; },
    },
  },
}));

const ouvintes = {};
const trajeto = {
  iniciar: vi.fn(async () => {}),
  actualizarSessao: vi.fn(async () => {}),
  parar: vi.fn(async () => {}),
  estado: vi.fn(async () => ({ activa: true, encomenda: 'o1' })),
  addListener: vi.fn(async (evento, fn) => { ouvintes[evento] = fn; return { remove: () => { delete ouvintes[evento]; } }; }),
};
vi.mock('@capacitor/core', () => ({ registerPlugin: () => trajeto }));

const { estadoDoTrajetoNativo, iniciarTrajetoNativo, pararTrajetoNativo, trajetoNativoDisponivel } = await import('./trajetoNativo');

beforeEach(() => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' }; });
afterEach(() => { delete window.Capacitor; vi.clearAllMocks(); });

describe('trajeto no app iOS', () => {
  it('fora do app não há', async () => {
    delete window.Capacitor;
    expect(await trajetoNativoDisponivel()).toBe(false);
    expect(await estadoDoTrajetoNativo()).toEqual({ activa: false });
  });

  it('o iPhone recebe a encomenda, o Supabase e a sessão; as sessões novas seguem', async () => {
    const leitura = vi.fn();
    const largar = await iniciarTrajetoNativo('o1', { leitura });
    expect(trajeto.iniciar).toHaveBeenCalledWith({
      encomenda: 'o1', supabaseUrl: 'https://projecto.supabase.co', chave: 'sb_publishable_x', sessao: 'sessao-1',
    });

    ouvintes.leitura({ lat: 1, lng: 2, accuracy: 5 });
    expect(leitura).toHaveBeenCalledWith({ lat: 1, lng: 2, accuracy: 5 });

    aoMudarSessao('TOKEN_REFRESHED', { access_token: 'sessao-2' });
    expect(trajeto.actualizarSessao).toHaveBeenCalledWith({ sessao: 'sessao-2' });
    aoMudarSessao('SIGNED_OUT', null);
    expect(trajeto.actualizarSessao).toHaveBeenCalledTimes(1);

    largar();
    expect(ouvintes.leitura).toBeUndefined();
  });

  it('parar pára o iPhone e deixa de seguir a sessão', async () => {
    await iniciarTrajetoNativo('o1');
    await pararTrajetoNativo();
    expect(trajeto.parar).toHaveBeenCalled();
    expect(largarSessao).toHaveBeenCalled();
  });

  it('o estado da partilha em curso', async () => {
    expect(await estadoDoTrajetoNativo()).toEqual({ activa: true, encomenda: 'o1' });
  });

  it('uma versão do app sem o plugin não conta: quem entrega fica com a partilha do site', async () => {
    trajeto.estado.mockRejectedValueOnce(Object.assign(new Error('"Trajeto" plugin is not implemented on ios'), { code: 'UNIMPLEMENTED' }));
    expect(await trajetoNativoDisponivel()).toBe(false);
    expect(await trajetoNativoDisponivel()).toBe(true);
  });
});

describe('trajeto no app Android', () => {
  beforeEach(() => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' }; });

  it('o Android também partilha com o ecrã apagado, com as mesmas mensagens', async () => {
    expect(await trajetoNativoDisponivel()).toBe(true);
    const enviado = vi.fn();
    await iniciarTrajetoNativo('o2', { enviado });
    expect(trajeto.iniciar).toHaveBeenCalledWith({
      encomenda: 'o2', supabaseUrl: 'https://projecto.supabase.co', chave: 'sb_publishable_x', sessao: 'sessao-1',
    });
    ouvintes.enviado({ quando: 123 });
    expect(enviado).toHaveBeenCalledWith({ quando: 123 });
    await pararTrajetoNativo();
    expect(trajeto.parar).toHaveBeenCalled();
  });
});
