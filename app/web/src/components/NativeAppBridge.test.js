import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({}) }));
vi.mock('@/hooks/useSiteSettings', () => ({ useSiteSettings: () => ({ settings: {} }) }));
vi.mock('@/hooks/useNotifications', () => ({ useNotifications: () => ({ unread: 0 }) }));
vi.mock('@/lib/pushNotifications', () => ({ sincronizarPushNativo: async () => false }));

const { aoPuxarParaActualizar, caminhoDaNotificacao, seguidorDeLigacoes } = await import('./NativeAppBridge.jsx');

describe('seguidorDeLigacoes', () => {
  it('a ligação que abriu o app chega duas vezes e segue-se uma', () => {
    const navegar = vi.fn();
    let t = 1000;
    const seguir = seguidorDeLigacoes(navegar, { agora: () => t });
    // appUrlOpen (guardado pelo plugin) e, logo a seguir, getLaunchUrl.
    expect(seguir('https://livrariaadventista.ao/track?code=AB12')).toBe(true);
    t += 40;
    expect(seguir('https://livrariaadventista.ao/track?code=AB12')).toBe(false);
    expect(navegar).toHaveBeenCalledTimes(1);
    expect(navegar).toHaveBeenCalledWith('/track?code=AB12');
  });

  it('outra ligação, ou a mesma mais tarde, segue-se', () => {
    const navegar = vi.fn();
    let t = 1000;
    const seguir = seguidorDeLigacoes(navegar, { agora: () => t });
    seguir('https://livrariaadventista.ao/track?code=AB12');
    t += 40;
    expect(seguir('https://livrariaadventista.ao/product/abc')).toBe(true);
    t += 60_000;
    expect(seguir('https://livrariaadventista.ao/product/abc')).toBe(true);
    expect(navegar).toHaveBeenCalledTimes(3);
  });

  it('o que não é do site não navega', () => {
    const navegar = vi.fn();
    const seguir = seguidorDeLigacoes(navegar);
    expect(seguir('ao.livrariaadventista.app://auth/callback?code=x')).toBe(false);
    expect(seguir('https://evil.example/track')).toBe(false);
    expect(navegar).not.toHaveBeenCalled();
  });
});

describe('caminhoDaNotificacao', () => {
  it('as páginas do site, pelo caminho ou pelo endereço inteiro', () => {
    expect(caminhoDaNotificacao('/profile?tab=orders')).toBe('/profile?tab=orders');
    expect(caminhoDaNotificacao('https://livrariaadventista.ao/novidades')).toBe('/novidades');
  });

  it('nada de fora do site', () => {
    expect(caminhoDaNotificacao('//exemplo.com/x')).toBeNull();
    expect(caminhoDaNotificacao('https://exemplo.com/x')).toBeNull();
    expect(caminhoDaNotificacao('')).toBeNull();
    expect(caminhoDaNotificacao(undefined)).toBeNull();
  });
});

describe('aoPuxarParaActualizar', () => {
  const docCom = (html) => {
    const d = document.implementation.createHTMLDocument('x');
    d.body.innerHTML = html;
    return d;
  };

  it('sem nada a perder, recarrega', () => {
    expect(aoPuxarParaActualizar({ porGravar: false, doc: docCom('<main></main>') })).toBe('recarregar');
    // Uma janela fechada (a fechar) não conta.
    expect(aoPuxarParaActualizar({ porGravar: false, doc: docCom('<div role="dialog" data-state="closed"></div>') })).toBe('recarregar');
  });

  it('alterações por gravar: avisa e não recarrega', () => {
    expect(aoPuxarParaActualizar({ porGravar: true, doc: docCom('') })).toBe('por-gravar');
  });

  it('com uma janela aberta (o carrinho, um formulário), não faz nada', () => {
    expect(aoPuxarParaActualizar({ porGravar: false, doc: docCom('<div role="dialog" data-state="open"></div>') })).toBe('janela');
    expect(aoPuxarParaActualizar({ porGravar: false, doc: docCom('<div role="alertdialog" data-state="open"></div>') })).toBe('janela');
  });
});
