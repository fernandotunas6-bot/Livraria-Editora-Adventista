import { describe, expect, it } from 'vitest';
import { indexRegistry } from '@/lib/churchRegistryApi';
import {
  MESSAGE_LIMIT, districtPastor, formatPhone, groupByDistrict, interestLine, interestRows, pastorMessage, pastorWhatsApp, telHref,
} from '@/lib/colporteurInterests';
import { interestsHtml } from '@/lib/colporteurPrint';
import { weekLabel } from '@/lib/colporteurReports';

// Um campo com dois distritos: o Centro (titular com telefone) e o Sul (só um associado, sem
// telefone), e um terceiro sem pastor.
const reg = {
  fields: [{ id: 'f1', name: 'Missão Centro de Angola' }],
  provinces: [{ id: 'huambo', name: 'Huambo' }, { id: 'bie', name: 'Bié' }],
  municipalities: [],
  districts: [
    { id: 'd1', name: 'Distrito Centro', province_id: 'huambo', field_id: 'f1' },
    { id: 'd2', name: 'Distrito Sul', province_id: 'huambo', field_id: 'f1' },
    { id: 'd3', name: 'Distrito Cuito', province_id: 'bie', field_id: 'f1' },
  ],
  churches: [
    { id: 'c1', name: 'Igreja Central', district_id: 'd1' },
    { id: 'c2', name: 'Igreja da Calenga', district_id: 'd2' },
    { id: 'c3', name: 'Igreja do Cuito', district_id: 'd3' },
  ],
  pastors: [
    { id: 'p1', name: 'João Kalandula', title: 'Pr.', phone: '923456789' },
    { id: 'p2', name: 'Pedro Sapalo', title: 'Pr.', phone: '' },
    { id: 'p3', name: 'Ex-titular', title: 'Pr.', phone: '911111111' },
  ],
  assignments: [
    { pastor_id: 'p3', district_id: 'd1', kind: 'titular', start_date: '2020-01-01', end_date: '2025-12-31' },
    { pastor_id: 'p1', district_id: 'd1', kind: 'titular', start_date: '2026-01-01', end_date: null },
    { pastor_id: 'p2', district_id: 'd2', kind: 'associado', start_date: '2026-01-01', end_date: null },
  ],
};
const idx = indexRegistry(reg);
const colporteurs = [
  { id: 'a', code: 'CPT-0001', full_name: 'Ana Chilombo', church_id: 'c1' },
  { id: 'b', code: 'CPT-0002', full_name: 'Bento Kalunga', church_id: 'c2' },
  { id: 'x', code: 'CPT-0003', full_name: 'Xavier', church_id: null, church_other: 'Igreja do Bairro' },
];
const reports = [
  { id: 'r1', colporteur_id: 'a', week_start: '2026-11-02', status: 'validado', interest_contacts: [
    { name: 'Maria João', phone: '923000111', place: 'Bairro Académico', request: 'Estudos bíblicos' },
    { name: '  ', phone: '923000999' }, // sem nome: não conta
  ] },
  { id: 'r2', colporteur_id: 'a', week_start: '2026-11-09', status: 'enviado', interest_contacts: [
    { name: 'Maria J.', phone: '923 000 111', place: 'Académico', request: 'Visita' }, // a mesma pessoa, mais recente
    { name: 'Zeca Tito', phone: '', place: 'São João' },
  ] },
  { id: 'r3', colporteur_id: 'b', week_start: '2026-11-09', status: 'validado', interest_contacts: [{ name: 'Rosa', phone: '924000222', place: 'Calenga' }] },
  { id: 'r4', colporteur_id: 'x', week_start: '2026-11-16', status: 'validado', interest_contacts: [{ name: 'Tomás', phone: '925000333' }] },
  { id: 'r5', colporteur_id: 'b', week_start: '2026-11-16', status: 'rascunho', interest_contacts: [{ name: 'Rascunho', phone: '926' }] },
  { id: 'r6', colporteur_id: 'b', week_start: '2026-11-16', status: 'devolvido', interest_contacts: [{ name: 'Devolvido', phone: '927' }] },
  { id: 'r7', colporteur_id: 'a', week_start: '2026-09-07', status: 'validado', interest_contacts: [{ name: 'Antigo', phone: '928000444' }] },
];

describe('telefones', () => {
  it('formata o telemóvel de Angola e faz o link para ligar', () => {
    expect(formatPhone('923456789')).toBe('923 456 789');
    expect(formatPhone('244923456789')).toBe('244923456789');
    expect(formatPhone('')).toBe('');
    expect(telHref('923 456 789')).toBe('tel:+244923456789');
    expect(telHref('244923456789')).toBe('tel:+244923456789');
    expect(telHref('')).toBe('');
  });
});

describe('districtPastor', () => {
  it('o titular em funções; sem titular, um associado; sem nenhum, null', () => {
    expect(districtPastor(idx, 'd1')).toEqual({ id: 'p1', label: 'Pr. João Kalandula', phone: '923456789', titular: true });
    expect(districtPastor(idx, 'd2')).toMatchObject({ id: 'p2', titular: false, phone: '' });
    expect(districtPastor(idx, 'd3')).toBeNull();
    expect(districtPastor(idx, '')).toBeNull();
  });
});

describe('interestRows', () => {
  const rows = interestRows({ reports, colporteurs, idx, from: '2026-11-02', to: '2026-11-23' });
  it('só relatórios enviados e validados do período, e só quem tem nome', () => {
    expect(rows.map((r) => r.name).sort()).toEqual(['Maria J.', 'Rosa', 'Tomás', 'Zeca Tito']);
  });
  it('a mesma pessoa (o mesmo telefone) conta uma vez, com o relatório mais recente', () => {
    const maria = rows.find((r) => r.phone === '923000111');
    expect(maria).toMatchObject({ name: 'Maria J.', weekStart: '2026-11-09', status: 'enviado', times: 2, request: 'Visita', districtId: 'd1', churchLabel: 'Igreja Central' });
    expect(maria.colporteur).toEqual({ id: 'a', code: 'CPT-0001', name: 'Ana Chilombo' });
  });
  it('sem igreja no registo fica sem distrito, com a igreja escrita', () => {
    expect(rows.find((r) => r.name === 'Tomás')).toMatchObject({ districtId: '', churchLabel: 'Igreja do Bairro (fora do registo)' });
  });
  it('sem período, todas as semanas', () => {
    expect(interestRows({ reports, colporteurs, idx }).map((r) => r.name)).toContain('Antigo');
  });
});

describe('groupByDistrict e mensagem', () => {
  const groups = groupByDistrict(interestRows({ reports, colporteurs, idx, from: '2026-11-02', to: '2026-11-23' }), idx);
  it('por distrito, com a província e o pastor; os sem distrito no fim', () => {
    expect(groups.map((g) => [g.label, g.pastor?.label || null, g.rows.length])).toEqual([
      ['Distrito Centro · Huambo', 'Pr. João Kalandula', 2],
      ['Distrito Sul · Huambo', 'Pr. Pedro Sapalo', 1],
      ['Sem distrito', null, 1],
    ]);
    expect(groups[0].rows.map((r) => r.name)).toEqual(['Maria J.', 'Zeca Tito']);
  });
  it('a mensagem ao pastor lista as pessoas, com o telefone, o pedido e quem as encontrou', () => {
    const txt = pastorMessage(groups[0], 'Novembro de 2026');
    expect(txt).toMatch(/^Olá, Pr\. João Kalandula\./);
    expect(txt).toContain('estas 2 pessoas interessadas no distrito Distrito Centro · Huambo (Novembro de 2026)');
    expect(txt).toContain('1. Maria J. — 923 000 111 — Académico — Visita (CPT-0001 Ana Chilombo, Igreja Central; semana de 09/11 a 15/11)');
    expect(txt).toContain('2. Zeca Tito — São João');
    expect(interestLine(groups[2].rows[0])).toBe('Tomás — 925 000 333 (CPT-0003 Xavier, Igreja do Bairro (fora do registo); semana de 16/11 a 22/11)');
  });
  it('o WhatsApp vai para o telefone do pastor; sem telefone, não há link', () => {
    const wa = pastorWhatsApp(groups[0], 'Novembro de 2026');
    expect(wa.startsWith('https://wa.me/244923456789?text=')).toBe(true);
    expect(decodeURIComponent(wa.split('?text=')[1])).toContain('Maria J.');
    expect(pastorWhatsApp(groups[1], 'Novembro de 2026')).toBe('');
    expect(pastorWhatsApp(groups[2], 'Novembro de 2026')).toBe('');
  });
  it('uma lista grande vai cortada na mensagem, com quantos ficam de fora', () => {
    const many = { ...groups[0], rows: Array.from({ length: MESSAGE_LIMIT + 3 }, (_, i) => ({ ...groups[0].rows[0], name: `Pessoa ${i}` })) };
    const txt = pastorMessage(many, 'x');
    expect(txt).toContain(`${MESSAGE_LIMIT}. Pessoa ${MESSAGE_LIMIT - 1}`);
    expect(txt).not.toContain(`Pessoa ${MESSAGE_LIMIT}`);
    expect(txt).toContain('E mais 3');
  });
  it('a impressão: uma página por distrito, com o pastor e os textos escapados', () => {
    const g = [{ ...groups[0], rows: [{ ...groups[0].rows[0], name: '<b>Maria</b>' }] }, groups[1]];
    const html = interestsHtml({ groups: g, period: 'Novembro de 2026', formatPhone, weekLabel });
    expect(html).toContain('Interessados · Distrito Centro · Huambo');
    expect(html).toContain('Pr. João Kalandula · 923 456 789');
    expect(html).toContain('Pr. Pedro Sapalo (associado)');
    expect(html).toContain('&lt;b&gt;Maria&lt;/b&gt;');
    expect(html).not.toContain('<b>Maria</b>');
    expect(html.match(/break-before:page/g)).toHaveLength(1);
    expect(interestsHtml({ groups: [], period: 'P', formatPhone, weekLabel })).toContain('Não há interessados neste período.');
  });
});
