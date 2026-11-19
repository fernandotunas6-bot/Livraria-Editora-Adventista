import { describe, expect, it } from 'vitest';
import {
  aspasShell, comandoSegredo, modoSugerido, montarLigacoes, normalizarUrl, projectoSupabase, sqlAgendador, tokenAleatorio,
} from './kangestConfig';

const CHAVE = `kg_${'A1'.repeat(24)}`;

describe('kangestConfig', () => {
  it('normaliza o endereço da API', () => {
    expect(normalizarUrl('api-huambo.livrariaadventista.ao')).toBe('https://api-huambo.livrariaadventista.ao/api/v1');
    expect(normalizarUrl('https://api-huambo.livrariaadventista.ao/api/')).toBe('https://api-huambo.livrariaadventista.ao/api/v1');
    expect(normalizarUrl('https://x.ao/api/v1/')).toBe('https://x.ao/api/v1');
    expect(normalizarUrl('')).toBe('');
  });

  it('monta o JSON que a Edge Function aceita, sem campos vazios', () => {
    const { json, erros } = montarLigacoes([
      { id: 'central', url: 'kangest.livraria.ao', chave: CHAVE, segredo: 'whsec_abcdefgh123', padrao: true,
        lojas: { 'loja-h': '1', 'loja-l': 2, 'loja-x': '' }, armazens_online: '1, 2', portes: ' PORTES ', generico: '' },
    ], { multicaixa_express: 'mb', transfer: 'TB', vazio: '' });
    expect(erros).toEqual([]);
    expect(JSON.parse(json)).toEqual([{
      id: 'central', url: 'https://kangest.livraria.ao/api/v1', chave: CHAVE, segredo: 'whsec_abcdefgh123', padrao: true,
      lojas: { 'loja-h': 1, 'loja-l': 2 }, armazens_online: [1, 2], portes: 'PORTES', pagamentos: { multicaixa_express: 'MB', transfer: 'TB' },
    }]);
  });

  it('aponta o que está errado antes de gravar', () => {
    const { erros } = montarLigacoes([
      { id: 'huambo', url: 'http://192.168.1.5:7800', chave: 'kg_curta', segredo: 'abc', padrao: true, lojas: { h: 'x' } },
      { id: 'huambo', url: 'https://b.ao', chave: CHAVE, padrao: true, lojas: { h: 1 } },
      { id: 'lubango', url: 'https://c.ao', chave: CHAVE, lojas: { h: 3 } },
    ]);
    const t = erros.join(' | ');
    expect(t).toMatch(/endereço tem de ser https/);
    expect(t).toMatch(/kg_ e tem 48/);
    expect(t).toMatch(/whsec_/);
    expect(t).toMatch(/armazém da loja tem de ser um número/);
    expect(t).toMatch(/mesmo identificador/);
    expect(t).toMatch(/A mesma loja está em «huambo» e em «lubango»/);
    expect(t).toMatch(/Só uma ligação pode ser a padrão/);
    expect(montarLigacoes([]).erros).toEqual(['Acrescente pelo menos uma ligação.']);
  });

  it('sugere o modo de pagamento', () => {
    expect(modoSugerido({ code: 'multicaixa_express' })).toBe('MB');
    expect(modoSugerido({ code: 'transfer', name: 'Transferência bancária' })).toBe('TB');
    expect(modoSugerido({ code: 'cod', name: 'Pagamento na entrega' })).toBe('NU');
    expect(modoSugerido({ code: 'x', name: 'Cartão Visa' })).toBe('CC');
  });

  it('comando e SQL com aspas seguras', () => {
    expect(aspasShell(`a'b`)).toBe(`'a'\\''b'`);
    expect(projectoSupabase('https://abcdefghijklmnop.supabase.co')).toBe('abcdefghijklmnop');
    expect(comandoSegredo('KANGEST_LIGACOES', '[{"id":"x"}]', 'abc')).toBe(`supabase secrets set --project-ref abc KANGEST_LIGACOES='[{"id":"x"}]'`);
    const tok = tokenAleatorio();
    expect(tok).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenAleatorio()).not.toBe(tok);
    const sql = sqlAgendador('https://p.supabase.co/functions/v1/app/', `t'k`);
    expect(sql).toContain(`'https://p.supabase.co/functions/v1/app/cron/kangest'`);
    expect(sql).toContain(`'t''k'`);
    expect(sql).toContain("vault.create_secret('t''k', 'kangest_cron_token')");
  });
});
