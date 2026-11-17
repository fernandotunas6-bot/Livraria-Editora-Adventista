import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({}) }));
vi.mock('@/hooks/useSiteSettings', () => ({ useSiteSettings: () => ({ settings: {} }) }));
vi.mock('@/hooks/useNotifications', () => ({ useNotifications: () => ({ unread: 0 }) }));
vi.mock('@/lib/pushNotifications', () => ({ sincronizarPushNativo: async () => false }));

const { aoPuxarParaActualizar, caminhoDaNotificacao, podePuxarAqui, seguidorDeLigacoes } = await import('./NativeAppBridge.jsx');

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
    // Deslizar dentro de uma janela não é pedir para actualizar: nem o aviso das alterações.
    expect(aoPuxarParaActualizar({ porGravar: true, doc: docCom('<div role="dialog" data-state="open"></div>') })).toBe('janela');
  });

  it('as janelas feitas à mão também contam (o carrinho, os filtros, o assistente), sem data-state', () => {
    // O carrinho e os filtros no telemóvel: modais, só no ecrã enquanto abertos.
    expect(aoPuxarParaActualizar({ porGravar: false, doc: docCom('<div role="dialog" aria-modal="true" aria-labelledby="titulo-carrinho"></div>') })).toBe('janela');
    // O assistente: ecrã inteiro no telemóvel, sem aria-modal.
    expect(aoPuxarParaActualizar({ porGravar: false, doc: docCom('<div role="dialog" aria-label="Assistente"></div>') })).toBe('janela');
    // Uma do Radix a fechar já não conta.
    expect(aoPuxarParaActualizar({ porGravar: false, doc: docCom('<div role="dialog" aria-modal="true" data-state="closed"></div>') })).toBe('recarregar');
  });

  it('dentro de uma lista que já desceu, puxar é subir a lista: não recarrega', () => {
    const doc = docCom('<div id="lista" style="overflow-y:auto;height:100px"><p id="item">x</p></div>');
    const lista = doc.getElementById('lista');
    const item = doc.getElementById('item');
    const win = { getComputedStyle: (el) => ({ overflowY: el.style.overflowY || 'visible' }) };
    Object.defineProperty(lista, 'scrollTop', { value: 240, configurable: true });
    expect(aoPuxarParaActualizar({ porGravar: false, doc, win, alvo: item })).toBe('janela');
    // A lista no topo: puxar já é actualizar.
    Object.defineProperty(lista, 'scrollTop', { value: 0, configurable: true });
    expect(aoPuxarParaActualizar({ porGravar: false, doc, win, alvo: item })).toBe('recarregar');
  });
});

describe('podePuxarAqui', () => {
  const docCom = (html) => {
    const d = document.implementation.createHTMLDocument('x');
    d.body.innerHTML = html;
    return d;
  };
  const win = { getComputedStyle: (el) => ({ overflowY: el.style.overflowY || 'visible' }) };

  it('sem toque nem janela, pode', () => {
    expect(podePuxarAqui(null, { doc: docCom('<main></main>'), win })).toBe(true);
  });

  it('uma janela aberta não deixa, onde quer que se toque', () => {
    expect(podePuxarAqui(null, { doc: docCom('<div role="dialog" data-state="open"></div>'), win })).toBe(false);
  });

  it('só conta o que tem scroll vertical próprio (um carrossel na horizontal não)', () => {
    const doc = docCom('<div id="carrossel" style="overflow-y:hidden"><img id="capa"></div>');
    const carrossel = doc.getElementById('carrossel');
    Object.defineProperty(carrossel, 'scrollTop', { value: 30, configurable: true });
    expect(podePuxarAqui(doc.getElementById('capa'), { doc, win })).toBe(true);
    carrossel.style.overflowY = 'scroll';
    expect(podePuxarAqui(doc.getElementById('capa'), { doc, win })).toBe(false);
  });
});
