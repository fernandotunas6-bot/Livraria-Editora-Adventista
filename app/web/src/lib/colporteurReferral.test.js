import { describe, expect, it } from 'vitest';
import { REFERRAL_KEY, captureReferral, getReferral, normalizeColporteurCode, referralLink } from '@/lib/colporteurReferral';

const memory = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
};

describe('normalizeColporteurCode', () => {
  it('aceita as formas habituais e recusa o resto', () => {
    expect(normalizeColporteurCode('cpt7')).toBe('CPT-0007');
    expect(normalizeColporteurCode(' CPT-0007 ')).toBe('CPT-0007');
    expect(normalizeColporteurCode('cpt 12345')).toBe('CPT-12345');
    expect(normalizeColporteurCode('CLI-000001')).toBe('');
    expect(normalizeColporteurCode('<script>')).toBe('');
    expect(normalizeColporteurCode('')).toBe('');
  });
});

describe('captureReferral / getReferral', () => {
  it('guarda o código do link e devolve-o nos 30 dias seguintes', () => {
    const store = memory();
    expect(captureReferral('?c=cpt7&utm=x', { store, now: 1000 })).toBe('CPT-0007');
    expect(getReferral({ store, now: 1000 + 29 * 86400000 })).toBe('CPT-0007');
    expect(getReferral({ store, now: 1000 + 31 * 86400000 })).toBe('');
  });
  it('?colportor= também serve; link sem código não apaga o guardado', () => {
    const store = memory();
    captureReferral('?colportor=CPT-0003', { store, now: 0 });
    expect(captureReferral('?q=biblia', { store, now: 10 })).toBe('');
    expect(getReferral({ store, now: 10 })).toBe('CPT-0003');
  });
  it('lixo guardado não rebenta', () => {
    const store = memory();
    store.setItem(REFERRAL_KEY, '{nada');
    expect(getReferral({ store })).toBe('');
    expect(getReferral({ store: { getItem: () => { throw new Error('bloqueado'); } } })).toBe('');
  });
  it('link de vendas', () => {
    expect(referralLink('CPT-0007', 'https://livrariaadventista.com')).toBe('https://livrariaadventista.com/?c=CPT-0007');
  });
});
