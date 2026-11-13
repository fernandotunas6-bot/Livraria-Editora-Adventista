import { describe, expect, it } from 'vitest';
import { errorWhere, formatMetric, pageName, rating, vitalsTable } from './siteHealth';

describe('rating', () => {
  it('usa os limiares da Google para o p75', () => {
    expect(rating('LCP', 2500)).toBe('good');
    expect(rating('LCP', 2501)).toBe('needs');
    expect(rating('LCP', 4001)).toBe('poor');
    expect(rating('INP', 180)).toBe('good');
    expect(rating('CLS', 0.3)).toBe('poor');
    expect(rating('XYZ', 1)).toBe('');
    expect(rating('LCP', Number.NaN)).toBe('');
  });
});

describe('formatMetric', () => {
  it('segundos, milissegundos e o CLS sem unidade, à portuguesa', () => {
    expect(formatMetric('LCP', 4212)).toBe('4,2 s');
    expect(formatMetric('INP', 180.4)).toBe('180 ms');
    expect(formatMetric('CLS', 0.05)).toBe('0,05');
    expect(formatMetric('LCP', Number.NaN)).toBe('—');
  });
});

describe('vitalsTable', () => {
  const rows = [
    { page: '/shop', device: 'mobile', name: 'LCP', p75: 3000, median: 2500, samples: 4 },
    { page: '*', device: 'mobile', name: 'LCP', p75: 3500, median: 2800, samples: 10 },
    { page: '/', device: 'mobile', name: 'LCP', p75: 4100, median: 3000, samples: 6 },
    { page: '/', device: 'mobile', name: 'CLS', p75: 0.02, median: 0, samples: 6 },
    { page: '/', device: 'desktop', name: 'LCP', p75: 900, median: 800, samples: 3 },
  ];

  it('uma linha por página do aparelho, com todas as páginas primeiro e as outras pelas visitas', () => {
    const t = vitalsTable(rows, 'mobile');
    expect(t.map((r) => r.page)).toEqual(['*', '/', '/shop']);
    expect(t[1].metrics.LCP.p75).toBe(4100);
    expect(t[1].metrics.CLS.p75).toBe(0.02);
    expect(t[1].visits).toBe(6);
  });

  it('o computador fica à parte', () => {
    expect(vitalsTable(rows, 'desktop').map((r) => r.page)).toEqual(['/']);
    expect(vitalsTable([], 'mobile')).toEqual([]);
  });
});

it('pageName e errorWhere', () => {
  expect(pageName('/product/:id')).toBe('Ficha de produto');
  expect(pageName('/outra')).toBe('/outra');
  expect(errorWhere({ source: 'https://livrariaadventista.ao/assets/index-abc.js', line: 1, col: 2048 })).toBe('/assets/index-abc.js:1:2048');
  expect(errorWhere({})).toBe('');
});
