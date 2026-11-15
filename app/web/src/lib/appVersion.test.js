import { afterEach, describe, expect, it, vi } from 'vitest';

// A versão do build vem do Vite (`__APP_VERSION__`); nos testes define-se à mão antes de importar.
globalThis.__APP_VERSION__ = '2026.11.08-aaaaaaa';
const {
  CURRENT_VERSION, MIN_CHECK_GAP_MS, UPDATED_KEY, applyUpdate, fetchPublishedVersion, isNewerVersion, podeActualizarSozinha, shouldCheckNow, takeUpdatedFrom,
} = await import('@/lib/appVersion');

afterEach(() => sessionStorage.clear());

describe('isNewerVersion', () => {
  it('a versão do build é a do Vite', () => {
    expect(CURRENT_VERSION).toBe('2026.11.08-aaaaaaa');
  });

  it('há versão nova quando a publicada é outra (também depois de desfazer uma publicação)', () => {
    expect(isNewerVersion('2026.11.09-bbbbbbb')).toBe(true);
    expect(isNewerVersion('2026.11.07-ccccccc')).toBe(true);
    expect(isNewerVersion('2026.11.08-aaaaaaa')).toBe(false);
  });

  it('em desenvolvimento, ou com uma resposta estranha, nunca', () => {
    expect(isNewerVersion('2026.11.09-bbbbbbb', 'dev')).toBe(false);
    for (const v of [null, '', '<html>', 'latest', 42, '2026.11.09']) expect(isNewerVersion(v), String(v)).toBe(false);
  });
});

describe('fetchPublishedVersion', () => {
  it('lê o /version.json sem cache', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ version: '2026.11.09-bbbbbbb' }) }));
    expect(await fetchPublishedVersion(fetchImpl)).toBe('2026.11.09-bbbbbbb');
    expect(fetchImpl).toHaveBeenCalledWith('/version.json', expect.objectContaining({ cache: 'no-store' }));
  });

  it('sem rede, sem ficheiro ou com o HTML no lugar dele, não sabe', async () => {
    expect(await fetchPublishedVersion(async () => { throw new TypeError('Failed to fetch'); })).toBeNull();
    expect(await fetchPublishedVersion(async () => ({ ok: false }))).toBeNull();
    expect(await fetchPublishedVersion(async () => ({ ok: true, json: async () => { throw new SyntaxError('html'); } }))).toBeNull();
  });
});

describe('shouldCheckNow', () => {
  it('no máximo uma vez por minuto', () => {
    expect(shouldCheckNow(10_000, 0)).toBe(true);
    expect(shouldCheckNow(10_000 + MIN_CHECK_GAP_MS - 1, 10_000)).toBe(false);
    expect(shouldCheckNow(10_000 + MIN_CHECK_GAP_MS, 10_000)).toBe(true);
  });
});

describe('applyUpdate / takeUpdatedFrom', () => {
  it('pede ao service worker que veja se mudou, recarrega e lembra de onde vinha', async () => {
    const update = vi.fn(async () => {});
    const reload = vi.fn();
    const win = {
      sessionStorage,
      navigator: { serviceWorker: { getRegistration: async () => ({ update }) } },
      location: { reload },
    };
    await applyUpdate(win);
    expect(update).toHaveBeenCalled();
    expect(reload).toHaveBeenCalled();
    expect(sessionStorage.getItem(UPDATED_KEY)).toBe('2026.11.08-aaaaaaa');
  });

  it('sem service worker, recarrega na mesma', async () => {
    const reload = vi.fn();
    await applyUpdate({ sessionStorage, navigator: {}, location: { reload } });
    expect(reload).toHaveBeenCalled();
  });

  it('depois de recarregar: diz de que versão vinha, uma vez', () => {
    sessionStorage.setItem(UPDATED_KEY, '2026.11.07-ccccccc');
    expect(takeUpdatedFrom(window)).toBe('2026.11.07-ccccccc');
    expect(takeUpdatedFrom(window)).toBe('');
  });

  it('recarregou mas continua na mesma versão (a nova ainda não tinha chegado): não diz que actualizou', () => {
    sessionStorage.setItem(UPDATED_KEY, '2026.11.08-aaaaaaa');
    expect(takeUpdatedFrom(window)).toBe('');
  });
});

describe('podeActualizarSozinha', () => {
  const limpar = () => { document.body.innerHTML = ''; };
  afterEach(limpar);

  it('ao mudar de página, sem nada aberto: sim', () => {
    expect(podeActualizarSozinha({ momento: 'navegacao', pathname: '/shop' })).toBe(true);
    expect(podeActualizarSozinha({ momento: 'navegacao', pathname: '/admin' })).toBe(true);
  });

  it('com alterações por gravar, uma janela aberta ou uma caixa a ser escrita: não', () => {
    expect(podeActualizarSozinha({ pathname: '/shop', porGravar: true })).toBe(false);
    document.body.innerHTML = '<div role="dialog">Carrinho</div>';
    expect(podeActualizarSozinha({ pathname: '/shop' })).toBe(false);
    document.body.innerHTML = '<input id="q" type="text">';
    document.getElementById('q').focus();
    expect(podeActualizarSozinha({ pathname: '/shop' })).toBe(false);
    document.body.innerHTML = '<input id="c" type="checkbox">';
    document.getElementById('c').focus();
    expect(podeActualizarSozinha({ pathname: '/shop' })).toBe(true);
  });

  it('nunca nas páginas de um passo só (pagamento, entrada, links de email)', () => {
    for (const p of ['/success', '/login', '/reset-password', '/confirmar-encomenda']) {
      expect(podeActualizarSozinha({ momento: 'navegacao', pathname: p }), p).toBe(false);
    }
  });

  it('ao voltar à app, não nas páginas com formulários (o painel, o contacto…)', () => {
    expect(podeActualizarSozinha({ momento: 'regresso', pathname: '/shop' })).toBe(true);
    expect(podeActualizarSozinha({ momento: 'regresso', pathname: '/admin' })).toBe(false);
    expect(podeActualizarSozinha({ momento: 'regresso', pathname: '/contact' })).toBe(false);
  });
});
