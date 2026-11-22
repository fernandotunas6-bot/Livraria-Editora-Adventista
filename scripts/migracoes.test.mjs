// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Há PRs em paralelo com migrações do mesmo dia. Duas com a mesma versão não dão conflito no git
// (os nomes são diferentes), e o PR aparece verde, mas o `supabase db push` falha a meio da
// publicação. Aconteceu com a 20261108210000 (#51 e #52).
// No vitest, `import.meta.url` não é `file:`: sobe-se a partir da pasta onde corre (app/web).
const pasta = resolve(process.cwd(), '../../supabase/migrations');
const ficheiros = readdirSync(pasta).filter((f) => f.endsWith('.sql'));

describe('migrações', () => {
  it('a pasta tem migrações', () => {
    expect(readdirSync(join(pasta))).not.toHaveLength(0);
    expect(ficheiros.length).toBeGreaterThan(100);
  });

  it('o nome é a versão de 14 dígitos e uma descrição', () => {
    expect(ficheiros.filter((f) => !/^\d{14}_[a-z0-9_]+\.sql$/.test(f))).toEqual([]);
  });

  it('nenhuma versão se repete', () => {
    const versoes = ficheiros.map((f) => f.slice(0, 14));
    expect(versoes.filter((v, i) => versoes.indexOf(v) !== i)).toEqual([]);
  });

  // `set search_path = 'net, extensions'` (com aspas à volta da lista) é *um* schema chamado
  // «net, extensions», que não existe: o `http_post` deixa de se encontrar e o agendador falha de
  // 5 em 5 minutos sem nada no site. Aconteceu na fila de emails (20261102140000, corrigida na
  // 20261102170000) e no KanGest (20261119120000, corrigida na 20261122100000). Essas duas já estão
  // aplicadas e não se editam. A lista vai sem aspas: `set search_path = net, extensions`.
  it('nenhum search_path é uma lista entre aspas', () => {
    const ja_corrigidas = ['20261102140000_agendador_fila_emails.sql', '20261119120000_kangest.sql'];
    const com_aspas = ficheiros
      .filter((f) => !ja_corrigidas.includes(f))
      .filter((f) => {
        const sql = readFileSync(join(pasta, f), 'utf8').replace(/--[^\n]*/g, '');
        return /search_path\s*(=|to)\s*'[^']*,[^']*'/i.test(sql);
      });
    expect(com_aspas).toEqual([]);
  });
});
