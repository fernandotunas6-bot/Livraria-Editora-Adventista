// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { beforeEach, describe, expect, it, vi } from 'vitest';

// A gravação dos relatórios pelo adaptador: o que vai para public.vendas_anos_gravar (migração
// relatorios_gravacao_protegida), o recuo para o upsert quando a função ainda não existe, e os
// códigos de erro que os ecrãs sabem dizer (conflito, permissão, o resto).
const chamadas = [];
let respostaRpc = { data: [], error: null };
let respostaUpsert = { error: null };
const tabela = {
  upsert(rows, opts) { chamadas.push(['upsert', rows, opts]); return Promise.resolve(respostaUpsert); },
};
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    rpc: (nome, args) => { chamadas.push(['rpc', nome, args]); return Promise.resolve(respostaRpc); },
    from: (t) => { chamadas.push(['from', t]); return tabela; },
  },
  mediaUrl: () => '',
}));
const { createConsolidadoApi, createPainelApi } = await import('./adapter.js');

beforeEach(() => {
  chamadas.length = 0;
  respostaRpc = { data: [], error: null };
  respostaUpsert = { error: null };
});

describe('gravarMeses (todas as livrarias)', () => {
  it('manda cada loja com o actualizado que a grelha leu, numa chamada só', async () => {
    respostaRpc = { data: [{ loja_id: 'h', actualizado: '2026-11-14T12:00:00.1+00:00' }], error: null };
    const api = createConsolidadoApi({ canEdit: true });
    const feito = await api.gravarMeses(2026, [
      { lojaId: 'h', meses: [1.006, null, '3'], mes_em_curso: 3, origem: 'sistema', esperado: '2026-11-01T10:00:00.222222+00:00', nome: 'Huambo' },
      { lojaId: 'c', meses: [5], mes_em_curso: null, esperado: null },
    ]);
    expect(chamadas).toEqual([['rpc', 'vendas_anos_gravar', {
      p_ano: 2026,
      p_linhas: [
        { loja_id: 'h', esperado: '2026-11-01T10:00:00.222222+00:00', meses: [1.01, null, 3], mes_em_curso: 3, origem: 'sistema' },
        { loja_id: 'c', esperado: null, meses: [5], mes_em_curso: null, origem: 'manual' },
      ],
    }]]);
    expect(feito).toEqual({ h: '2026-11-14T12:00:00.1+00:00' });
  });

  it('sem a função (migração por aplicar), grava como antes', async () => {
    respostaRpc = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
    const api = createConsolidadoApi({ canEdit: true });
    await api.gravarMeses(2026, [{ lojaId: 'h', meses: [1], mes_em_curso: null, esperado: 'x' }]);
    expect(chamadas.map((c) => c[0])).toEqual(['rpc', 'from', 'upsert']);
  });

  it('um conflito, uma recusa de permissão e uma falha de rede têm códigos diferentes', async () => {
    const api = createConsolidadoApi({ canEdit: true });
    const tentar = async (error) => {
      respostaRpc = { data: null, error };
      try { await api.gravarMeses(2026, [{ lojaId: 'h', meses: [1] }]); return null; } catch (e) { return e.code; }
    };
    expect(await tentar({ code: '40001', message: 'Os números de Huambo de 2026 mudaram depois de os abrir.' })).toBe('conflict');
    expect(await tentar({ code: '42501', message: 'Sem permissão para gravar os relatórios de vendas.' })).toBe('invalid_argument');
    expect(await tentar({ code: '', message: 'TypeError: Failed to fetch' })).toBe('unavailable');
  });
});

describe('painel de uma loja', () => {
  it('grava o ano pela função quando o painel diz o que leu, e devolve o actualizado novo', async () => {
    respostaRpc = { data: [{ loja_id: 'h', actualizado: 'novo' }], error: null };
    const api = createPainelApi({ id: 'u', role: 'admin' }, { lojaId: 'h', store: { id: 'h', name: 'Huambo' }, canEdit: true });
    const r = await api.db.doc('anos/2026').set({ ano: 2026, meses: [1, null], observacoes: ['', ''], mes_em_curso: 2, meta_anual: null, criterio: 'media', fonte: 'PowerPoint', origem: 'manual' }, { esperado: 'lido' });
    expect(r).toEqual({ actualizado: 'novo' });
    expect(chamadas[0]).toEqual(['rpc', 'vendas_anos_gravar', { p_ano: 2026, p_linhas: [{
      loja_id: 'h', esperado: 'lido', meses: [1, null], observacoes: ['', ''], mes_em_curso: 2, meta_anual: null, criterio: 'media', fonte: 'PowerPoint', origem: 'manual',
    }] }]);
  });

  it('o histórico mostrado é o do servidor, para quem vê ou edita os relatórios', () => {
    expect(typeof createPainelApi({ role: 'admin' }, { lojaId: 'h', canEdit: true }).historico).toBe('function');
    expect(createPainelApi({ role: 'manager' }, { lojaId: 'h', canEdit: false, canReadSales: false }).historico).toBe(null);
  });
});
