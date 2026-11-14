// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lerPainelPptx } from '../../app/web/src/painel-vendas/pptx.js';
import { migracaoSql } from './pptx-para-sql.mjs';

// No vitest corre a partir de app/web.
const FICHEIRO = resolve(process.cwd(), '../../Loja Huambo - Painel-Vendas 2026S (1).pptx');

describe('pptx-para-sql', () => {
  it('gera a migração com os mesmos meses da de Outubro', async () => {
    const r = await lerPainelPptx(readFileSync(FICHEIRO));
    const sql = migracaoSql(r, { ficheiro: 'Painel.pptx' });
    expect(sql).toContain("('%Huambo%', 'huambo', 2026,\n       '[2171368, 1976988, 4956455, 3624705, 2917373, 2472331, 4779202, 3232271, 6639756, 4908704, null, null]'::jsonb");
    expect(sql).toContain("('%Huambo%', 'huambo', 2025,");
    expect(sql).toContain('--   2026: até Outubro, 37');
    expect(sql).toMatch(/Julho de 2025: o quadro geral diz 211/);
    // Um bloco só, que não cria lojas.
    expect(sql.match(/do \$\$/g)).toHaveLength(1);
    expect(sql).not.toMatch(/insert into public\.physical_stores/);
  });

  it('escapa as plicas e recusa um PowerPoint sem loja', () => {
    const anos = { 2026: [1, ...Array(11).fill(null)] };
    expect(migracaoSql({ loja: "D'Ombe", anos, ultimo: { 2026: 0 }, avisos: [] }, { ficheiro: 'x.pptx' })).toContain("'%D''Ombe%'");
    expect(() => migracaoSql({ loja: null, anos, ultimo: {}, avisos: [] }, { ficheiro: 'x.pptx' })).toThrow(/loja/);
  });
});
