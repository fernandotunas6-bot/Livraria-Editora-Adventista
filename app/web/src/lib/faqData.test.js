import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { FAQ_SECTIONS, buildFaq, filterFaq } from './faqData';

const values = { free_threshold: 'Kz 20.000,00', shipping_cost: 'Kz 1.500,00', express_cost: 'Kz 3.000,00' };
const appRoutes = fs.readFileSync(path.resolve(__dirname, '../App.jsx'), 'utf8');

describe('perguntas frequentes', () => {
  it('todos os marcadores são preenchidos com os valores do painel', () => {
    const text = JSON.stringify(buildFaq(values));
    expect(text).not.toMatch(/\{[a-z_]+\}/);
    expect(text).toContain('Kz 1.500,00');
  });

  it('um marcador sem valor fica à vista em vez de desaparecer', () => {
    expect(JSON.stringify(buildFaq({}))).toContain('{free_threshold}');
  });

  it('cada ligação leva a uma rota que existe', () => {
    for (const q of FAQ_SECTIONS.flatMap((s) => s.questions)) {
      if (!q.link) continue;
      const route = q.link.to.split(/[?#]/)[0];
      expect(appRoutes, `${q.question} → ${q.link.to}`).toContain(`path="${route}"`);
    }
  });

  it('as secções têm ids únicos, para as ligações de âncora', () => {
    const ids = FAQ_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('a pesquisa ignora acentos e maiúsculas, e exige todas as palavras', () => {
    const sections = buildFaq(values);
    const hits = filterFaq(sections, 'REEMBOLSO').flatMap((s) => s.questions);
    expect(hits.length).toBeGreaterThan(0);
    expect(filterFaq(sections, 'palavra passe').flatMap((s) => s.questions).length).toBeGreaterThan(0);
    expect(filterFaq(sections, 'pagamento xyzinexistente')).toEqual([]);
    expect(filterFaq(sections, '   ')).toBe(sections);
  });

  it('nenhuma resposta promete cartões ou cupões que a loja não tem', () => {
    const text = JSON.stringify(FAQ_SECTIONS).toLowerCase();
    expect(text).not.toMatch(/cup[ãa]o|cartão de crédito|\bvisa\b|mastercard/);
  });
});

describe('páginas legais', () => {
  it('estão registadas, com os endereços em inglês a redireccionar', () => {
    for (const p of ['/termos', '/privacidade', '/terms', '/privacy', '/cookies']) {
      expect(appRoutes).toContain(`path="${p}"`);
    }
  });
});
