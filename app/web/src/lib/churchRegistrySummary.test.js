import { describe, expect, it } from 'vitest';
import { indexRegistry, matchesQuery, registryError } from '@/lib/churchRegistryApi';
import { registrySummary } from '@/lib/churchRegistrySummary';

const reg = {
  provinces: [{ id: 'hua', name: 'Huambo', sort_order: 1 }, { id: 'bie', name: 'Bié', sort_order: 2 }],
  municipalities: [{ id: 'm-hua', name: 'Huambo', province: 'hua' }, { id: 'm-cui', name: 'Cuito', province: 'bie' }],
  fields: [{ id: 'f1', name: 'Missão Centro' }],
  districts: [
    { id: 'd1', name: 'Distrito Centro', field_id: 'f1', province_id: 'hua', active: true },
    { id: 'd2', name: 'Distrito Centro', field_id: 'f1', province_id: 'bie', active: true },
    { id: 'd3', name: 'Antigo', field_id: 'f1', province_id: 'hua', active: false },
  ],
  churches: [
    { id: 'c1', name: 'Central Huambo', district_id: 'd1', province_id: 'hua', municipality_id: 'm-hua', active: true },
    { id: 'c2', name: 'Central Cuito', district_id: 'd2', province_id: 'bie', municipality_id: 'm-cui', active: true },
    { id: 'c3', name: 'Sem distrito', district_id: null, province_id: 'hua', municipality_id: null, active: true },
  ],
  pastors: [
    { id: 'p1', title: 'Pr.', name: 'Gomes João', role: 'pastor_distrital', province_id: 'hua', phone: '900000001', status: 'activo' },
    { id: 'p2', title: 'Pr.', name: 'Sem Distrito', role: 'pastor_distrital', province_id: 'bie', phone: '', status: 'activo' },
    { id: 'p3', title: 'Pr.', name: 'Associado', role: 'pastor_licenciado', province_id: 'hua', phone: '900000003', status: 'activo' },
  ],
  assignments: [
    { id: 'a0', pastor_id: 'p2', district_id: 'd1', kind: 'titular', start_date: '2024-01-01', end_date: '2025-12-31' },
    { id: 'a1', pastor_id: 'p1', district_id: 'd1', kind: 'titular', start_date: '2026-01-01', end_date: null },
    { id: 'a2', pastor_id: 'p3', district_id: 'd1', kind: 'associado', start_date: '2026-01-01', end_date: null },
  ],
};

describe('indexRegistry', () => {
  const idx = indexRegistry(reg);
  it('titular e associados só das atribuições em curso', () => {
    expect(idx.titularOf.get('d1').pastor_id).toBe('p1');
    expect(idx.associatesOf.get('d1').map((a) => a.pastor_id)).toEqual(['p3']);
    expect(idx.districtsOfPastor.has('p2')).toBe(false);
    expect(idx.historyOf('p2').map((a) => a.id)).toEqual(['a0']);
  });
  it('nomes e contagens', () => {
    expect(idx.pastorLabel('p1')).toBe('Pr. Gomes João');
    expect(idx.churchesOf.get('d1')).toBe(1);
    expect(idx.municipalityName('m-cui')).toBe('Cuito');
  });
});

describe('registrySummary', () => {
  const s = registrySummary(reg, indexRegistry(reg));
  it('conta só o que está activo, por província', () => {
    expect(s.totals).toEqual({ districts: 2, churches: 3, pastors: 3 });
    expect(s.byProvince.map((r) => [r.name, r.districts, r.churches, r.pastors])).toEqual([['Huambo', 1, 2, 2], ['Bié', 1, 1, 1]]);
    expect(s.byProvince[0].municipalities).toEqual(['Huambo']);
  });
  it('lista o que falta completar', () => {
    const issues = Object.fromEntries(s.issues.map((i) => [i.key, i.count]));
    expect(issues).toEqual({ 'sem-titular': 1, 'igreja-sem-distrito': 1, 'igreja-sem-municipio': 1, 'distrital-sem-distrito': 1, 'sem-telefone': 1 });
  });
});

describe('utilitários', () => {
  it('pesquisa sem acentos e por várias palavras', () => {
    expect(matchesQuery('Pr. João Sangundu Bongo', 'joao bongo')).toBe(true);
    expect(matchesQuery('Pr. João Sangundu Bongo', 'joao huambo')).toBe(false);
  });
  it('traduz os erros da base de dados', () => {
    expect(registryError({ code: '23505', message: 'duplicate key value violates unique constraint "church_districts_key"' })).toMatch(/Já existe um distrito/);
    expect(registryError({ code: '23503', message: 'foreign key' })).toMatch(/Desactive/);
    expect(registryError({ code: 'PGRST205', message: 'Could not find the table' })).toMatch(/migração/);
    expect(registryError({ code: '42501', message: 'new row violates row-level security policy' })).toMatch(/Sem permissão/);
  });
});
