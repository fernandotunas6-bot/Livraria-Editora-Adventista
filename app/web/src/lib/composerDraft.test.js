import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearDraft, counterState, draftStorageKey, isEmptyDraft, readDraft, saveDraft,
} from '@/lib/composerDraft';

const DIA = 24 * 60 * 60 * 1000;

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('draftStorageKey', () => {
  it('separa por conta e por sítio onde se escreve', () => {
    expect(draftStorageKey('ana', 'feed')).toBe('livraria:rascunho:ana:feed');
    expect(draftStorageKey('ana', 'livro:42')).toBe('livraria:rascunho:ana:livro:42');
    expect(draftStorageKey('ana', '')).toBe('livraria:rascunho:ana:feed');
  });

  it('sem conta não há chave (não se guarda o rascunho de ninguém)', () => {
    expect(draftStorageKey('', 'feed')).toBe('');
    expect(draftStorageKey(null)).toBe('');
  });
});

describe('isEmptyDraft', () => {
  it('só espaços, citação vazia e sem ligações conta como vazio', () => {
    expect(isEmptyDraft(null)).toBe(true);
    expect(isEmptyDraft({ body: '   ', quote: '\n', links: [] })).toBe(true);
    expect(isEmptyDraft({ body: 'Olá' })).toBe(false);
    expect(isEmptyDraft({ quote: 'Uma passagem' })).toBe(false);
    expect(isEmptyDraft({ links: [{ url: 'https://exemplo.ao' }] })).toBe(false);
  });
});

describe('readDraft / saveDraft', () => {
  const key = draftStorageKey('ana', 'feed');

  it('guarda e devolve o rascunho com a hora em que foi guardado', () => {
    saveDraft(key, { body: 'Meio texto', topic: 'oracao' }, 1_000);
    expect(readDraft(key, 2_000)).toEqual({ body: 'Meio texto', topic: 'oracao', at: 1_000 });
  });

  it('um rascunho vazio apaga o que estava guardado', () => {
    saveDraft(key, { body: 'Meio texto' }, 1_000);
    saveDraft(key, { body: '  ' }, 2_000);
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('ao fim de uma semana o rascunho sai', () => {
    saveDraft(key, { body: 'Antigo' }, 0);
    expect(readDraft(key, 6 * DIA)).not.toBeNull();
    expect(readDraft(key, 8 * DIA)).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('ignora o que estiver estragado e não lança', () => {
    localStorage.setItem(key, '{nada disto é json');
    expect(readDraft(key)).toBeNull();
    localStorage.setItem(key, '"texto"');
    expect(readDraft(key)).toBeNull();
  });

  it('com o armazenamento cheio ou bloqueado perde-se só a conveniência', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    expect(() => saveDraft(key, { body: 'Texto' })).not.toThrow();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    expect(readDraft(key)).toBeNull();
  });

  it('sem chave não lê nem escreve', () => {
    saveDraft('', { body: 'Texto' });
    expect(localStorage.length).toBe(0);
    expect(readDraft('')).toBeNull();
  });

  it('clearDraft apaga o rascunho', () => {
    saveDraft(key, { body: 'Texto' });
    clearDraft(key);
    expect(readDraft(key)).toBeNull();
  });
});

describe('counterState', () => {
  it('só aparece perto do limite e passa a aviso nos últimos 5 %', () => {
    expect(counterState(0, 1000)).toBe('hidden');
    expect(counterState(799, 1000)).toBe('hidden');
    expect(counterState(800, 1000)).toBe('show');
    expect(counterState(949, 1000)).toBe('show');
    expect(counterState(950, 1000)).toBe('warn');
    expect(counterState(1000, 1000)).toBe('warn');
  });

  it('sem limite não há contador', () => {
    expect(counterState(5000, 0)).toBe('hidden');
    expect(counterState(5000, undefined)).toBe('hidden');
  });
});
