#!/usr/bin/env node
// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.
//
// Os testes de aceitação do KANGEST ONE contra um ambiente (o staging; docs/AMBIENTES.md). Só leituras: não cria, não
// altera e não apaga nada, por isso também se pode correr contra a produção.
//
// Uso (Node 22):
//   node scripts/aceitacao/kangest-one.mjs https://<projecto>.supabase.co/functions/v1/app [relatorio.md]
//   KANGEST_ONE_TOKEN=<token da sessão de uma conta da equipa com «Gerir configurações»> node scripts/aceitacao/…
// Sem o token, correm só as verificações públicas e a recusa sem sessão. O token nunca aparece no relatório.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Corre as verificações; devolve `{ ok, passos: [{ id, nome, ok, detalhe }] }`. `fetchFn` para os testes. */
export async function aceitacao({ base, token = '', fetchFn = fetch }) {
  const url = String(base || '').trim().replace(/\/+$/, '');
  const passos = [];
  const passo = (id, nome, ok, detalhe = '') => passos.push({ id, nome, ok: !!ok, detalhe: String(detalhe).slice(0, 300) });
  const pedir = async (caminho, comToken = false) => {
    try {
      const r = await fetchFn(`${url}${caminho}`, { headers: comToken && token ? { Authorization: `Bearer ${token}` } : {} });
      const corpo = await r.json().catch(() => null);
      return { status: r.status, corpo };
    } catch (e) {
      return { status: 0, corpo: null, erro: e?.message || String(e) };
    }
  };
  if (!/^https?:\/\//.test(url)) {
    passo('0', 'O endereço da Edge Function', false, url || 'em falta');
    return { ok: false, passos };
  }

  const indice = await pedir('/api/v1');
  passo('C', 'O índice da API v1 responde em { data } com as famílias', indice.status === 200 && Array.isArray(indice.corpo?.data?.familias) && indice.corpo.data.familias.length >= 6,
    `estado ${indice.status}${indice.erro ? ` · ${indice.erro}` : ''}`);
  const info = await pedir('/api/v1/system/info');
  passo('E', 'A versão da API e a versão mínima do KanGest', info.status === 200 && info.corpo?.data?.api === '1', `kangest_min_version: ${info.corpo?.data?.kangest_min_version ?? 'nenhuma'}`);
  const semSessao = await pedir('/api/v1/auth/me');
  passo('10', 'Sem sessão não acede (401, no formato único de erro, com ref)', semSessao.status === 401 && semSessao.corpo?.error?.status === 401 && !!semSessao.corpo?.ref,
    `estado ${semSessao.status}`);
  const naoExiste = await pedir('/api/v1/nao-existe');
  passo('C', 'Uma rota inexistente dá 404 no mesmo formato', naoExiste.status === 404 && naoExiste.corpo?.error?.status === 404, `estado ${naoExiste.status}`);
  const produtos = await pedir('/api/v1/products?limit=5');
  passo('4', 'Os produtos à vista, pelo RLS público, com cursor', produtos.status === 200 && Array.isArray(produtos.corpo?.data) && 'next_cursor' in (produtos.corpo || {}),
    `${produtos.corpo?.data?.length ?? 0} produto(s)`);
  const livroSemSessao = await pedir('/api/v1/stock-movements');
  passo('10', 'O livro de stock sem sessão é recusado', [401, 403].includes(livroSemSessao.status), `estado ${livroSemSessao.status}`);

  if (token) {
    const eu = await pedir('/api/v1/auth/me', true);
    passo('1', 'Com a sessão da conta do site, quem sou e as permissões', eu.status === 200 && !!eu.corpo?.data?.id, `equipa: ${eu.corpo?.data?.equipa ?? '—'}`);
    const saude = await pedir('/api/v1/system/health', true);
    const estado = saude.corpo?.data?.estado;
    passo('E', 'A saúde do ecossistema (base, Auth, Storage, emails, postos)', saude.status === 200 && ['ok', 'aviso', 'grave'].includes(estado),
      `estado geral: ${estado ?? saude.status}; postos: ${saude.corpo?.data?.postos?.length ?? 0}; migração: ${saude.corpo?.data?.ultima_migracao ?? '—'}`);
    const livro = await pedir('/api/v1/stock-movements?limit=5', true);
    passo('7', 'O livro único de stock lê-se com a permissão', livro.status === 200 && Array.isArray(livro.corpo?.data), `estado ${livro.status}`);
  } else {
    passo('1', 'Com a sessão da conta do site (KANGEST_ONE_TOKEN em falta: por correr)', true, 'saltado');
  }
  return { ok: passos.every((p) => p.ok), passos };
}

/** O relatório em Markdown (sem o token). */
export function relatorio(base, r, hora = new Date()) {
  const linhas = [
    `# Aceitação do KANGEST ONE`,
    ``,
    `- Ambiente: ${base}`,
    `- Hora: ${hora.toISOString()}`,
    `- Resultado: **${r.ok ? 'tudo certo' : 'há falhas'}** (${r.passos.filter((p) => p.ok).length} de ${r.passos.length})`,
    ``,
    `| Teste | Verificação | Resultado | Detalhe |`,
    `|---|---|---|---|`,
    ...r.passos.map((p) => `| ${p.id} | ${p.nome} | ${p.ok ? 'certo' : '**falhou**'} | ${p.detalhe.replace(/\|/g, '/')} |`),
    ``,
    `Os testes 2, 3, 5, 6, 8, 9 e 11 a 14 correm no CI (Rust, PGlite e vitest); ver docs/KANGEST-SINCRONIZACAO.md.`,
  ];
  return linhas.join('\n') + '\n';
}

async function main() {
  const [base, ficheiro] = process.argv.slice(2);
  const r = await aceitacao({ base, token: process.env.KANGEST_ONE_TOKEN || '' });
  const md = relatorio(base, r);
  if (ficheiro) writeFileSync(ficheiro, md);
  console.log(md);
  process.exit(r.ok ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();
