import { afterEach, describe, expect, it } from 'vitest';
import { detectQuery, pushRecentSection, readRecentSections } from '@/lib/adminSearch';

afterEach(() => localStorage.clear());

describe('detectQuery', () => {
  it('reconhece códigos de produto, escritos de qualquer forma', () => {
    expect(detectQuery('liv63')).toEqual({ kind: 'product', value: 'LIV-063' });
    expect(detectQuery(' LIV-063 ')).toEqual({ kind: 'product', value: 'LIV-063' });
  });

  it('reconhece números de encomenda', () => {
    expect(detectQuery('LA-T1003')).toEqual({ kind: 'order', value: 'LA-T1003' });
    expect(detectQuery('la1234')).toEqual({ kind: 'order', value: 'LA1234' });
    expect(detectQuery('#ab12cd34')).toEqual({ kind: 'order', value: 'AB12CD34' });
  });

  it('reconhece emails e telefones (com ou sem indicativo)', () => {
    expect(detectQuery('Ana@Exemplo.ao')).toEqual({ kind: 'email', value: 'ana@exemplo.ao' });
    expect(detectQuery('ana@')).toEqual({ kind: 'email', value: 'ana@' });
    expect(detectQuery('+244 923 456 789')).toEqual({ kind: 'phone', value: '923456789' });
    expect(detectQuery('923456789')).toEqual({ kind: 'phone', value: '923456789' });
  });

  it('o resto é texto; vazio é vazio', () => {
    expect(detectQuery('desejado')).toEqual({ kind: 'text', value: 'desejado' });
    expect(detectQuery('12')).toEqual({ kind: 'text', value: '12' });
    expect(detectQuery('   ')).toEqual({ kind: 'empty', value: '' });
  });
});

describe('secções recentes', () => {
  it('a mais recente primeiro, sem repetir, no máximo cinco, por pessoa', () => {
    for (const id of ['orders', 'books', 'orders', 'settings', 'users', 'notices', 'apps']) pushRecentSection('u1', id);
    expect(readRecentSections('u1')).toEqual(['apps', 'notices', 'users', 'settings', 'orders']);
    expect(readRecentSections('u2')).toEqual([]);
  });

  it('valores estragados não partem nada', () => {
    localStorage.setItem('livraria:painel:recentes:u1', '{x');
    expect(readRecentSections('u1')).toEqual([]);
    localStorage.setItem('livraria:painel:recentes:u1', JSON.stringify(['orders', 3, null]));
    expect(readRecentSections('u1')).toEqual(['orders']);
  });
});

describe('recentes com a vista onde se estava', () => {
  it('uma entrada por secção, com a última vista', async () => {
    const { parseRecent, pushRecentSection, readRecentSections } = await import('@/lib/adminSearch');
    localStorage.clear();
    pushRecentSection('u9', 'orders');
    pushRecentSection('u9', 'colportagem:contas');
    pushRecentSection('u9', 'colportagem:relatorios');
    expect(readRecentSections('u9')).toEqual(['colportagem:relatorios', 'orders']);
    expect(parseRecent('colportagem:relatorios')).toEqual({ section: 'colportagem', view: 'relatorios' });
    expect(parseRecent('orders')).toEqual({ section: 'orders', view: null });
    pushRecentSection('u9', 'orders');
    expect(readRecentSections('u9')).toEqual(['orders', 'colportagem:relatorios']);
  });
});
