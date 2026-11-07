import { describe, expect, it } from 'vitest';
import { applyOptionalColumns, hasColumn } from './optionalColumns';

describe('applyOptionalColumns', () => {
  it('escreve os campos quando a coluna existe', () => {
    const data = { site_name: 'Livraria' };
    applyOptionalColumns(data, [[true, { youtube: 'https://x', about_team: [] }]]);
    expect(data).toEqual({ site_name: 'Livraria', youtube: 'https://x', about_team: [] });
  });

  it('apaga mesmo a chave quando a coluna não existe', () => {
    // É este o caso que o padrão antigo falhava: o `...form` já tinha posto a chave, e um
    // spread condicional nunca a tirava — o pedido seguia com uma coluna inexistente e o
    // PostgREST recusava-o inteiro.
    const data = { site_name: 'Livraria', youtube: '', about_team: [], unpaid_cancel_days: 0 };
    applyOptionalColumns(data, [
      [false, { youtube: 'https://x' }],
      [false, { about_team: [], unpaid_cancel_days: 7 }],
    ]);
    expect(data).toEqual({ site_name: 'Livraria' });
    expect('youtube' in data).toBe(false);
    expect('about_team' in data).toBe(false);
  });

  it('grupos independentes: uma coluna em falta não leva as outras', () => {
    const data = { a: 1, youtube: '', about_team: [] };
    applyOptionalColumns(data, [
      [true, { about_team: [{ name: 'Ana' }] }],
      [false, { youtube: 'https://x' }],
    ]);
    expect(data).toEqual({ a: 1, about_team: [{ name: 'Ana' }] });
  });

  it('valores falsos continuam a ser gravados', () => {
    // `0`, `''` e `false` são valores legítimos: não podem ser confundidos com "sem coluna".
    const data = {};
    applyOptionalColumns(data, [[true, { unpaid_cancel_days: 0, youtube: '', activo: false }]]);
    expect(data).toEqual({ unpaid_cancel_days: 0, youtube: '', activo: false });
  });

  it('aguenta listas e grupos vazios', () => {
    const data = { a: 1 };
    expect(applyOptionalColumns(data, [])).toEqual({ a: 1 });
    expect(applyOptionalColumns(data)).toEqual({ a: 1 });
    expect(applyOptionalColumns(data, [[true, null], [false, undefined]])).toEqual({ a: 1 });
  });
});

describe('hasColumn', () => {
  it('é a presença da chave, não o valor', () => {
    expect(hasColumn({ youtube: '' }, 'youtube')).toBe(true);
    expect(hasColumn({ youtube: null }, 'youtube')).toBe(true);
    expect(hasColumn({}, 'youtube')).toBe(false);
    expect(hasColumn(null, 'youtube')).toBe(false);
    expect(hasColumn(undefined, 'youtube')).toBe(false);
  });
});
