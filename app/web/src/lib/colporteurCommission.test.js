// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { CATEGORIES, SALE_MODES, STATUS_FLOW, commissionMatrix, inForce, resolvePct } from '@/lib/colporteurCommission';
import CASES from '@/lib/colporteurCommission.cases.json';

describe('resolvePct (os mesmos casos que private.colporteur_pct)', () => {
  for (const c of CASES.cases) {
    it(`${c.colporteur} · ${c.productType} · ${c.saleMode} · ${c.date} → ${c.pct}% (${c.why})`, () => {
      const r = resolvePct({
        category: CASES.colporteurs[c.colporteur], productType: c.productType, saleMode: c.saleMode, date: c.date,
        rules: CASES.rules.map((x) => ({ ...x })),
        overrides: CASES.overrides.filter((o) => o.colporteur === c.colporteur).map((x) => ({ ...x })),
        basePct: CASES.basePct,
      });
      expect(r.pct).toBe(c.pct);
      expect(r.source).toBe(c.source);
    });
  }
});

describe('auxiliares', () => {
  it('inForce respeita as duas pontas', () => {
    const row = { valid_from: '2026-01-01', valid_to: '2026-01-31' };
    expect(inForce(row, '2026-01-01')).toBe(true);
    expect(inForce(row, '2026-01-31')).toBe(true);
    expect(inForce(row, '2026-02-01')).toBe(false);
    expect(inForce({ valid_from: '2026-01-01', valid_to: null }, '2030-01-01')).toBe(true);
  });

  it('matriz cobre todas as categorias e modos', () => {
    const m = commissionMatrix({ rules: CASES.rules, basePct: 10, date: '2026-06-01' });
    expect(Object.keys(m)).toEqual(Object.keys(CATEGORIES));
    for (const cat of Object.keys(CATEGORIES)) expect(Object.keys(m[cat])).toEqual(Object.keys(SALE_MODES));
    expect(m.licenciado.site.pct).toBe(35);
    expect(m.estudante.compra.pct).toBe(20);
  });

  it('o fluxo de estados nunca leva de volta a "candidatura" a partir de activo', () => {
    expect(STATUS_FLOW.activo).not.toContain('candidatura');
    expect(STATUS_FLOW.candidatura).toContain('activo');
  });
});
