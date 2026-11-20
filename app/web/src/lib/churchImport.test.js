// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import {
  buildImportPlan, districtKey, matchProvince, normalizeName, parseRegistryFile, roleFromCargo,
  sequentialPhones, similarity, splitTitle,
} from '@/lib/churchImport';

// Amostra com a forma e os casos difíceis dos ficheiros reais (churches.json e pastores.json).
// Os telefones são fictícios: os reais não entram no repositório.
const PROVINCES = [
  { id: 'hua', name: 'Huambo' }, { id: 'bie', name: 'Bié' }, { id: 'cub', name: 'Cubango' },
  { id: 'cua', name: 'Cuando' }, { id: 'bgl', name: 'Benguela' }, { id: 'hui', name: 'Huíla' },
];
const MUNICIPALITIES = [
  { id: 'm-hua', name: 'Huambo', province: 'hua' }, { id: 'm-caa', name: 'Caála', province: 'hua' },
  { id: 'm-cui', name: 'Cuito', province: 'bie' }, { id: 'm-and', name: 'Andulo', province: 'bie' },
  { id: 'm-ccv', name: 'Cuito Cuanavale', province: 'cua' },
];
const CHURCHES = [
  { cn: '001', nome: 'Central Huambo', distrito: 'Distrito Centro', municipio: 'Huambo', provincia: 'Huambo', delegado: 'Tyindongo Ndjimbo', data_congresso: '11-13-SET' },
  { cn: '005', nome: 'Alfa', distrito: 'Benfica Norte', municipio: 'Huambo', provincia: 'Huambo', delegado: 'Pr. Lauriano Salote', data_congresso: '11-13-SET' },
  { cn: '081', nome: 'Central Caála', distrito: 'Centro da Caála', municipio: 'Caála', provincia: 'Huambo', delegado: 'Pr. Antunes Bastos', data_congresso: '4-6-SET' },
  { cn: '250', nome: 'Central Cuito', distrito: 'Distrito Centro', municipio: 'Cuito', provincia: 'Bié', delegado: 'Pr. Enoque Paulino', data_congresso: '10-12-JUL' },
  { cn: '281', nome: 'Central Andulo', distrito: 'Distrito do Andulo', municipio: 'Andulo', provincia: 'Bié', delegado: 'Pr. Miguel Evaldine Praia', data_congresso: '24-27-SET' },
  { cn: '326', nome: 'Cuito Cuanavale Sede', distrito: 'Distrito Cuito Cuanavale', municipio: 'Cuito Cuanavale', provincia: 'Quando', delegado: 'Pr. Florindo Chiconjo', data_congresso: '3-5-JUL' },
];
const PASTORS = [
  { id: 1, nome: 'Pr. Enoque Paulino', distrito: 'Presidente - Missão', provincia: 'Huambo', cargo: 'Presidente', contacto: '900000001', media_geral: 4.88, classificacao: 'Excelente (E)' },
  { id: 3, nome: 'Anc Simão Avelino', distrito: 'Tesoureiro', provincia: 'Huambo', cargo: 'Tesoureiro', contacto: '900000003' },
  { id: 4, nome: 'Pr. Lauriano Salote', distrito: 'Andulo', provincia: 'Bié', cargo: 'Pastor Distrital', contacto: '900000004' },
  { id: 12, nome: 'Pr. Teles Justino', distrito: 'Calenga', provincia: 'Huambo', cargo: 'Pastor Distrital', contacto: '900000012' },
  { id: 13, nome: 'Pr. Alfredo Casselo', distrito: 'Calenga e Lepi', provincia: 'Huambo', cargo: 'Pastor Distrital', contacto: '900000013' },
  { id: 26, nome: 'Pr. Azevedo Manuel', distrito: 'Chinguar', provincia: 'Bié', cargo: 'Pastor Distrital', contacto: '938000087' },
  { id: 27, nome: 'Pr. Frederico Valente', distrito: 'Chinjenje', provincia: 'Huambo', cargo: 'Pastor Distrital', contacto: '938000087' },
  { id: 33, nome: 'Pr. Martinho Sapato', distrito: 'Huambo', provincia: 'Huambo', cargo: 'Pastor Distrital', contacto: '910000033' },
  { id: 37, nome: 'Pr. Roberto Cambinda', distrito: 'Cuito Cuanavale', provincia: 'Quando', cargo: 'Pastor Distrital', contacto: '910000037' },
  { id: 40, nome: 'Pr. Domingos Suquina', distrito: 'ISPAB – Bongo', provincia: 'Huambo', cargo: 'Professor / Pastor', contacto: '910000040' },
  { id: 44, nome: 'Pr. Colino Celino', distrito: 'Jubilado', provincia: 'Huambo', cargo: 'Pastor Jubilado', contacto: '910000044' },
  { id: 62, nome: 'Pr. Orlando Canema', distrito: 'Livraria', provincia: 'Huambo', cargo: 'Diretor de Livraria', contacto: '910000062' },
  { id: 68, nome: 'Pr. Adelino Celino', distrito: 'Missão Centro', provincia: 'Huambo', cargo: 'Pastor Departamental', contacto: '910000068' },
  { id: 73, nome: 'Pr. Samuel Mahamba', distrito: 'Missão da Chicuma', provincia: 'Bié', cargo: 'Pastor Distrital', contacto: '910000073' },
  { id: 77, nome: 'Pr. Amílcar Gonçalves', distrito: 'Missão Sul', provincia: 'Huíla', cargo: 'Pastor Departamental', contacto: '910000077' },
  { id: 85, nome: 'Pr. Necas dos Santos', distrito: 'União Sudoeste', provincia: 'Huambo', cargo: 'Pastor Departamental', contacto: '910000085' },
  { id: 96, nome: 'Pr. Diamantino Sawambo', distrito: 'Huambo', provincia: 'Huambo', cargo: 'Pastor Licenciado', contacto: '924700003' },
  { id: 97, nome: 'Pr. Tchindongo Djimbo', distrito: 'Huambo', provincia: 'Huambo', cargo: 'Pastor Licenciado', contacto: '924700004' },
  { id: 98, nome: 'Pr. Isaias Sabonete', distrito: 'Huambo', provincia: 'Huambo', cargo: 'Pastor Licenciado', contacto: '924700005' },
];

const build = () => buildImportPlan({
  churches: CHURCHES, pastors: PASTORS, provinces: PROVINCES, municipalities: MUNICIPALITIES,
  defaultField: { name: 'Missão Centro', short_name: 'MC' },
});

describe('normalização', () => {
  it('ignora acentos, maiúsculas e pontuação', () => {
    expect(normalizeName('  Caála–Centro ')).toBe('caala centro');
    expect(districtKey('Distrito do Andulo')).toBe('andulo');
    expect(districtKey('Distrito Centro')).toBe('centro');
  });
  it('separa o título do nome', () => {
    expect(splitTitle('Pr. Enoque Paulino')).toEqual({ title: 'Pr.', name: 'Enoque Paulino' });
    expect(splitTitle('Anc Simão Avelino')).toEqual({ title: 'Anc.', name: 'Simão Avelino' });
    expect(splitTitle('Ancião Sabino Leo Sankulo')).toEqual({ title: 'Anc.', name: 'Sabino Leo Sankulo' });
    expect(splitTitle('Caquinda Restino')).toEqual({ title: '', name: 'Caquinda Restino' });
  });
  it('traduz os cargos do ficheiro', () => {
    expect(roleFromCargo('Pastor Distrital')).toBe('pastor_distrital');
    expect(roleFromCargo('Secretário Executivo')).toBe('secretario_executivo');
    expect(roleFromCargo('Diretor de Livraria')).toBe('director_livraria');
    expect(roleFromCargo('Professor / Pastor')).toBe('professor');
    expect(roleFromCargo('Líder / Pastor')).toBe('lider');
    expect(roleFromCargo('???')).toBe('outro');
  });
  it('"Quando" é a província do Cuando', () => {
    expect(matchProvince('Quando', PROVINCES)?.id).toBe('cua');
    expect(matchProvince('bie', PROVINCES)?.id).toBe('bie');
    expect(matchProvince('Atlântida', PROVINCES)).toBeNull();
  });
  it('semelhança e telefones em sequência', () => {
    expect(similarity('Adriano Delfin Feka', 'Adriano Delfim Feca')).toBeGreaterThan(0.85);
    expect(similarity('Alfa', 'Ómega')).toBeLessThan(0.5);
    expect([...sequentialPhones(['924700003', '924700004', '924700005', '900000001'])].sort())
      .toEqual(['924700003', '924700004', '924700005']);
    expect(sequentialPhones(['900000001', '900000003']).size).toBe(0);
    expect(sequentialPhones([]).size).toBe(0);
  });
});

describe('buildImportPlan', () => {
  const { plan, preview, warnings } = build();
  const district = (name, province) => plan.districts.find((d) => d.name === name && d.province_id === province);
  const pastor = (name) => plan.pastors.find((p) => p.name === name);

  it('mantém separados os dois "Distrito Centro"', () => {
    expect(district('Distrito Centro', 'hua')).toBeTruthy();
    expect(district('Distrito Centro', 'bie')).toBeTruthy();
    expect(district('Distrito Centro', 'hua').key).not.toBe(district('Distrito Centro', 'bie').key);
  });

  it('junta "Distrito do Andulo" (igrejas) e "Andulo" (pastores) no mesmo distrito', () => {
    const andulo = plan.districts.filter((d) => districtKey(d.name) === 'andulo');
    expect(andulo).toHaveLength(1);
    const a = plan.assignments.find((x) => x.pastor_key === pastor('Lauriano Salote').key);
    expect(a).toEqual({ pastor_key: pastor('Lauriano Salote').key, district_key: andulo[0].key, kind: 'titular' });
    expect(andulo[0].municipality_id).toBe('m-and');
  });

  it('põe a igreja do Cuito Cuanavale na província do Cuando', () => {
    const c = plan.churches.find((x) => x.cn === '326');
    expect(c.province_id).toBe('cua');
    expect(c.municipality_id).toBe('m-ccv');
    expect(c.district_key).toBe(district('Distrito Cuito Cuanavale', 'cua').key);
  });

  it('cargos, instituições e campos não viram distritos', () => {
    const names = plan.districts.map((d) => normalizeName(d.name));
    for (const n of ['presidente missao', 'tesoureiro', 'jubilado', 'livraria', 'ispab bongo', 'missao centro', 'missao sul', 'uniao sudoeste', 'huambo']) {
      expect(names).not.toContain(n);
    }
    expect(pastor('Domingos Suquina').posting).toBe('ISPAB – Bongo');
    expect(pastor('Enoque Paulino').role).toBe('presidente');
  });

  it('"Missão da Chicuma" com pastor distrital é um distrito', () => {
    expect(district('Missão da Chicuma', 'bie')).toBeTruthy();
  });

  it('cria os campos que aparecem no ficheiro e liga cada pastor ao seu', () => {
    const fieldName = (key) => plan.fields.find((f) => f.key === key)?.name;
    expect(plan.fields.map((f) => f.name).sort()).toEqual(['Missão Centro', 'Missão Sul', 'União Sudoeste']);
    expect(plan.fields.find((f) => f.name === 'União Sudoeste').kind).toBe('uniao');
    expect(fieldName(pastor('Amílcar Gonçalves').field_key)).toBe('Missão Sul');
    expect(fieldName(pastor('Adelino Celino').field_key)).toBe('Missão Centro');
    expect(fieldName(pastor('Lauriano Salote').field_key)).toBe('Missão Centro');
  });

  it('deixa as avaliações de fora', () => {
    const keys = new Set(plan.pastors.flatMap((p) => Object.keys(p)));
    for (const k of ['media_geral', 'classificacao', 'assistencia', 'sermoes', 'total_pontos']) expect(keys.has(k)).toBe(false);
    expect(JSON.stringify(plan)).not.toContain('Excelente');
  });

  it('liga delegados com o mesmo nome e só sugere os parecidos', () => {
    const alfa = plan.churches.find((c) => c.cn === '005');
    expect(alfa.delegate_pastor_key).toBe(pastor('Lauriano Salote').key);
    const huambo = plan.churches.find((c) => c.cn === '001');
    expect(huambo.delegate_pastor_key).toBe('');
    expect(preview.suggestions.some((s) => s.kind === 'delegado' && s.a === 'Tyindongo Ndjimbo')).toBe(true);
  });

  it('sugere fundir distritos parecidos sem os fundir', () => {
    expect(preview.suggestions.some((s) => s.kind === 'distrito' && [s.a, s.b].sort().join('|') === 'Calenga|Calenga e Lepi')).toBe(true);
    expect(district('Calenga', 'hua')).toBeTruthy();
    expect(district('Calenga e Lepi', 'hua')).toBeTruthy();
  });

  it('avisa do distrito que é só a província, do telefone repetido e dos números em sequência', () => {
    const msgs = warnings.map((w) => w.message).join('\n');
    expect(msgs).toMatch(/só como "Huambo"/);
    expect(msgs).toMatch(/938000087 aparece em Azevedo Manuel e Frederico Valente/);
    expect(msgs).toMatch(/3 telefones em sequência/);
    expect(preview.counts.errors).toBe(0);
  });

  it('dá a mesma forma que a função church_registry_import espera', () => {
    for (const d of plan.districts) expect(Object.keys(d).sort()).toEqual(['field_key', 'key', 'municipality_id', 'name', 'province_id']);
    for (const c of plan.churches) expect(Object.keys(c).sort()).toEqual(['cn', 'congress_label', 'delegate_name', 'delegate_pastor_key', 'district_key', 'key', 'municipality_id', 'name', 'province_id']);
    for (const p of plan.pastors) expect(Object.keys(p).sort()).toEqual(['field_key', 'key', 'name', 'notes', 'phone', 'posting', 'province_id', 'role', 'title']);
    const keys = new Set([...plan.districts, ...plan.pastors].map((x) => x.key));
    for (const a of plan.assignments) {
      expect(keys.has(a.pastor_key) && keys.has(a.district_key)).toBe(true);
    }
  });

  it('um segundo titular no mesmo distrito entra como associado', () => {
    const extra = [...PASTORS, { id: 200, nome: 'Pr. Outro Titular', distrito: 'Andulo', provincia: 'Bié', cargo: 'Pastor Distrital', contacto: '' }];
    const r = buildImportPlan({ churches: CHURCHES, pastors: extra, provinces: PROVINCES, municipalities: MUNICIPALITIES, defaultField: { name: 'Missão Centro' } });
    const outro = r.plan.pastors.find((p) => p.name === 'Outro Titular');
    expect(r.plan.assignments.find((a) => a.pastor_key === outro.key).kind).toBe('associado');
  });

  it('igreja com número repetido entra uma vez e dá erro', () => {
    const r = buildImportPlan({ churches: [...CHURCHES, { ...CHURCHES[0], nome: 'Cópia' }], pastors: [], provinces: PROVINCES, municipalities: MUNICIPALITIES, defaultField: { name: 'Missão Centro' } });
    expect(r.plan.churches.filter((c) => c.cn === '001')).toHaveLength(1);
    expect(r.preview.counts.errors).toBe(1);
  });
});

describe('parseRegistryFile', () => {
  it('reconhece cada ficheiro', () => {
    expect(parseRegistryFile(JSON.stringify(CHURCHES)).kind).toBe('churches');
    expect(parseRegistryFile(JSON.stringify(PASTORS)).kind).toBe('pastors');
  });
  it('recusa o que não é', () => {
    expect(() => parseRegistryFile('{')).toThrow(/JSON válido/);
    expect(() => parseRegistryFile('{"a":1}')).toThrow(/lista/);
    expect(() => parseRegistryFile('[{"x":1}]')).toThrow(/Não reconheço/);
  });
});
