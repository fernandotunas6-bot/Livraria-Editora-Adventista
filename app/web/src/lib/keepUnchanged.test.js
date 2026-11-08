import { describe, expect, it } from 'vitest';
import { keepUnchanged } from './keepUnchanged';

describe('keepUnchanged', () => {
  it('as partes iguais ficam com o objecto antigo (um formulário que depende delas não se apaga)', () => {
    const prev = { settings: { base_pct: 30 }, staff: [{ id: 1 }] };
    const next = { settings: { base_pct: 30 }, staff: [{ id: 1 }, { id: 2 }] };
    const out = keepUnchanged(prev, next);
    expect(out.settings).toBe(prev.settings);
    expect(out.staff).toBe(next.staff);
  });

  it('nada mudou: devolve o próprio objecto antigo (o React não volta a pintar)', () => {
    const prev = { a: [1], b: { c: 2 } };
    expect(keepUnchanged(prev, { a: [1], b: { c: 2 } })).toBe(prev);
  });

  it('mudou mesmo: fica o novo; chaves que saíram não ficam', () => {
    const prev = { settings: { base_pct: 30 }, extra: 1 };
    expect(keepUnchanged(prev, { settings: { base_pct: 35 } })).toEqual({ settings: { base_pct: 35 } });
    expect(keepUnchanged(null, { a: 1 })).toEqual({ a: 1 });
    expect(keepUnchanged({ a: 1 }, [1, 2])).toEqual([1, 2]);
  });
});
