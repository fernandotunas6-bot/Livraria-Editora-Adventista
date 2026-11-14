#!/usr/bin/env node
// Gera uma migração com as vendas de um PowerPoint «Painel de Vendas» da loja.
//
//   node scripts/relatorios/pptx-para-sql.mjs "Loja Huambo - Painel-Vendas 2026S.pptx" [--nome vendas_ate_novembro] [--escrever]
//
// Lê o ficheiro com o mesmo leitor do painel (app/web/src/painel-vendas/pptx.js), mostra os meses
// e os avisos (quadro geral × diapositivo do mês, TOTAL que não bate) e escreve o SQL no ecrã. Com
// --escrever grava-o em supabase/migrations/<agora>_<nome>.sql.
//
// A migração segue as regras da 20261114100000_vendas_das_lojas_ate_outubro:
//   - encontra a loja pelo nome ou pela província (sem acentos); não cria lojas;
//   - um mês em branco no PowerPoint não apaga o que está no painel;
//   - um valor que, arredondado ao kwanza, já é o do PowerPoint, fica (guarda os cêntimos);
//   - um ano que a loja ainda não tem é criado com os meses do PowerPoint.
// Correr duas vezes não muda nada.
//
// Para a equipa, o caminho normal é o painel: Relatórios › Todas as livrarias › Lançar vendas ›
// «A partir do PowerPoint da loja». Este script serve para quando os valores têm de ir numa migração.

import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lerPainelPptx } from '../../app/web/src/painel-vendas/pptx.js';

const aqui = dirname(fileURLToPath(import.meta.url));

const sem = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const sqlTexto = (s) => `'${String(s).replace(/'/g, "''")}'`;
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** O SQL da migração para o resultado de lerPainelPptx (puro, para os testes). */
export function migracaoSql(r, { ficheiro }) {
  if (!r.loja) throw new Error('O ficheiro não diz de que loja é; não sei onde pôr os valores.');
  const anos = Object.keys(r.anos).map(Number).sort((a, b) => a - b).filter((a) => r.anos[a].some((v) => v != null));
  if (!anos.length) throw new Error('O ficheiro não tem nenhum mês com valor.');
  const fonte = `Painel de Vendas da Loja ${/^d[eoa]s?\s/i.test(r.loja) ? '' : 'do '}${r.loja} (ficheiro da loja)`;
  const linhas = anos.map((a) => `      (${sqlTexto('%' + r.loja + '%')}, ${sqlTexto(sem(r.loja))}, ${a},\n       '${JSON.stringify(r.anos[a]).replace(/,/g, ', ')}'::jsonb,\n       ${sqlTexto(fonte)})`);
  const resumo = anos.map((a) => {
    const soma = r.anos[a].reduce((s, v) => s + Math.round((v || 0) * 100), 0) / 100;
    return `--   ${a}: ${r.ultimo[a] >= 0 ? 'até ' + MESES[r.ultimo[a]] : 'sem valores'}, ${soma.toLocaleString('pt-PT')} Kz`;
  });
  const avisos = r.avisos.length ? ['--', '-- Avisos do leitor (confirmar com a loja):', ...r.avisos.map((a) => `--   - ${a}`)] : [];
  return `-- Vendas da Loja ${/^d[eoa]s?\s/i.test(r.loja) ? '' : 'do '}${r.loja}, do ficheiro «${ficheiro}».
-- Gerada por scripts/relatorios/pptx-para-sql.mjs (o mesmo leitor do painel).
--
${resumo.join('\n')}
${avisos.join('\n')}${avisos.length ? '\n' : ''}--
-- Regras (as da 20261114100000_vendas_das_lojas_ate_outubro): a loja encontra-se pelo nome ou pela
-- província, e uma loja que não exista fica de fora; um mês em branco não apaga; um valor que,
-- arredondado ao kwanza, já é o do ficheiro, fica com os cêntimos; um ano novo é criado.
-- Correr duas vezes não muda nada. Reverter: o histórico (vendas_alteracoes) tem os valores de antes.

do $$
declare
  r record;
  v_loja text;
  v_meses jsonb;
  v_mudou boolean;
  i integer;
begin
  for r in
    select * from (values
${linhas.join(',\n')}
    ) as t (nome, provincia, ano, meses, fonte)
  loop
    select s.id into v_loja
    from public.physical_stores s
    where s.name ilike r.nome or private.plain_text(s.province) = r.provincia
    order by (s.name ilike r.nome) desc,
             exists (select 1 from public.vendas_anos v where v.loja_id = s.id) desc,
             s.active desc,
             s.created
    limit 1;
    continue when v_loja is null;

    select v.meses into v_meses
    from public.vendas_anos v
    where v.loja_id = v_loja and v.ano = r.ano
    for update;

    if not found then
      insert into public.vendas_anos (loja_id, ano, meses, fonte, actualizado_por)
      values (v_loja, r.ano, r.meses, r.fonte, null);
      continue;
    end if;

    v_mudou := false;
    for i in 0..11 loop
      if jsonb_typeof(r.meses -> i) = 'number'
         and (jsonb_typeof(v_meses -> i) is distinct from 'number'
              or round((v_meses ->> i)::numeric) <> (r.meses ->> i)::numeric) then
        v_meses := jsonb_set(v_meses, array[i::text], r.meses -> i);
        v_mudou := true;
      end if;
    end loop;

    if v_mudou then
      update public.vendas_anos
      set meses = v_meses, actualizado = now(), actualizado_por = null
      where loja_id = v_loja and ano = r.ano;
    end if;
  end loop;
end $$;
`;
}

const versao = (d = new Date()) => d.toISOString().replace(/\D/g, '').slice(0, 14);

async function main(argv) {
  const args = argv.slice(2);
  const ficheiro = args.find((a) => !a.startsWith('--'));
  if (!ficheiro) {
    console.error('Uso: node scripts/relatorios/pptx-para-sql.mjs <ficheiro.pptx> [--nome vendas_ate_novembro] [--escrever]');
    process.exit(2);
  }
  const iNome = args.indexOf('--nome');
  const nome = (iNome >= 0 && args[iNome + 1]) || 'vendas_da_loja';
  if (!/^[a-z0-9_]+$/.test(nome)) { console.error('O --nome só pode ter letras minúsculas, algarismos e _.'); process.exit(2); }
  const r = await lerPainelPptx(readFileSync(resolve(ficheiro)));
  for (const a of Object.keys(r.anos)) {
    console.error(`${r.loja || '?'} ${a}: ${r.anos[a].map((v, i) => `${MESES[i].slice(0, 3)} ${v ?? '—'}`).join(' · ')}`);
  }
  r.avisos.forEach((a) => console.error('AVISO: ' + a));
  const sql = migracaoSql(r, { ficheiro: basename(ficheiro) });
  if (args.includes('--escrever')) {
    const destino = join(aqui, '../../supabase/migrations', `${versao()}_${nome}.sql`);
    writeFileSync(destino, sql);
    console.error('Escrita: ' + destino);
  } else {
    process.stdout.write(sql);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv).catch((e) => { console.error(e.message || e); process.exit(1); });
}
