// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { aceitacao, relatorio } from './kangest-one.mjs';

const resposta = (status, corpo) => ({ status, json: async () => corpo });
const site = (comSessao) => async (url, opcoes) => {
  const autorizado = !!opcoes?.headers?.Authorization;
  const c = new URL(url).pathname.replace(/^\/functions\/v1\/app/, '');
  if (opcoes?.method === 'POST' && c === '/kangest/sinc') return resposta(401, { message: 'Pedido sem assinatura válida.', status: 401 });
  if (c === '/api/v1') return resposta(200, { data: { versao: '1', familias: ['auth', 'users', 'permissions', 'system', 'integrations', 'synchronization'] } });
  if (c === '/api/v1/system/info') return resposta(200, { data: { api: '1', kangest_min_version: null } });
  if (c === '/api/v1/products') return resposta(200, { data: [{ id: 'p1' }], next_cursor: null });
  if (!autorizado || !comSessao) {
    if (c === '/api/v1/auth/me') return resposta(401, { error: { status: 401, message: 'Sessão necessária.' }, ref: 'x' });
    if (c === '/api/v1/stock-movements') return resposta(403, { error: { status: 403, message: 'Sem permissão.' }, ref: 'x' });
    return resposta(404, { error: { status: 404, message: 'Rota não encontrada.' }, ref: 'x' });
  }
  if (c === '/api/v1/auth/me') return resposta(200, { data: { id: 'u1', equipa: true } });
  if (c === '/api/v1/system/health') return resposta(200, { data: { estado: 'ok', postos: [], ultima_migracao: '20261126220000' } });
  if (c === '/api/v1/stock-movements') return resposta(200, { data: [], next_cursor: null });
  return resposta(404, { error: { status: 404, message: 'Rota não encontrada.' }, ref: 'x' });
};
const BASE = 'https://exemplo.supabase.co/functions/v1/app';

describe('a aceitação do KANGEST ONE', () => {
  it('sem token: as verificações públicas e a recusa sem sessão', async () => {
    const r = await aceitacao({ base: BASE, fetchFn: site(false) });
    expect(r.ok).toBe(true);
    expect(r.passos.some((p) => p.detalhe === 'saltado')).toBe(true);
  });

  it('com token: quem sou, a saúde e o livro; o token não vai para o relatório', async () => {
    const r = await aceitacao({ base: BASE, token: 'token-secreto-123', fetchFn: site(true) });
    expect(r.ok).toBe(true);
    expect(r.passos.find((p) => p.nome.startsWith('A saúde')).detalhe).toContain('estado geral: ok');
    const md = relatorio(BASE, r, new Date('2026-11-26T12:00:00Z'));
    expect(md).toContain('tudo certo');
    expect(md).not.toContain('token-secreto-123');
  });

  it('uma falha diz-se (por exemplo, sem sessão a rota deixa passar)', async () => {
    const aberto = async (url, o) => (new URL(url).pathname.endsWith('/auth/me') ? resposta(200, { data: { id: 'x' } }) : site(false)(url, o));
    const r = await aceitacao({ base: BASE, fetchFn: aberto });
    expect(r.ok).toBe(false);
    expect(relatorio(BASE, r)).toContain('**falhou**');
  });

  it('a volta dos postos tem de recusar o pedido sem assinatura', async () => {
    const aberta = async (url, o) => (o?.method === 'POST' ? resposta(200, { resultado: null }) : site(false)(url, o));
    const r = await aceitacao({ base: BASE, fetchFn: aberta });
    expect(r.ok).toBe(false);
    expect(r.passos.find((p) => p.id === '13')?.ok).toBe(false);
  });

  it('sem endereço não corre', async () => {
    expect((await aceitacao({ base: '' })).ok).toBe(false);
  });
});
