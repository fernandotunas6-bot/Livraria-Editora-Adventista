// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { canPublish, engagePath, isMember, levelInfo, luandaDay, nextTier } from '@/lib/readerLevels';

const status = (extra = {}) => ({
  level: 'novo', books: 0, tiers: { assiduo: 5, honra: 15 },
  engage: { enabled: true, min_days: 30, active_days: 5, account_days: 0, days_active: 0 }, ...extra,
});

describe('níveis dos leitores', () => {
  it('nomes e quem é membro da Comunidade de Leitores', () => {
    expect(levelInfo('novo').label).toBe('Conta nova');
    expect(levelInfo('honra').label).toBe('Leitor de honra');
    expect(levelInfo('inventado').label).toBe('Conta nova');
    expect(isMember('novo')).toBe(false);
    expect(isMember('leitor')).toBe(true);
  });

  it('criar publicações: os Leitores e a equipa', () => {
    expect(canPublish({ level: 'novo' })).toBe(false);
    expect(canPublish({ level: 'novo', staff: true })).toBe(true);
    expect(canPublish({ level: 'assiduo' })).toBe(true);
  });

  it('o que falta para o nível seguinte', () => {
    expect(nextTier(status()).text).toMatch(/primeiro livro/);
    const leitor = nextTier(status({ level: 'leitor', books: 2 }));
    expect(leitor).toMatchObject({ next: 'assiduo', missing: 3 });
    expect(leitor.text).toBe('Faltam 3 livros para Leitor assíduo.');
    expect(nextTier(status({ level: 'leitor', books: 4 })).text).toBe('Falta 1 livro para Leitor assíduo.');
    expect(nextTier(status({ level: 'assiduo', books: 7 }))).toMatchObject({ next: 'honra', missing: 8 });
    expect(nextTier(status({ level: 'honra', books: 20 }))).toBeNull();
    // Leitor pela participação, sem livros: o assíduo pede 5.
    expect(nextTier(status({ level: 'leitor', books: 0 }))).toMatchObject({ next: 'assiduo', missing: 5, ratio: 0 });
  });

  it('o caminho sem compra: dias activos e dias de conta', () => {
    const e = engagePath(status({ engage: { enabled: true, min_days: 30, active_days: 5, account_days: 12, days_active: 2 } }));
    expect(e).toMatchObject({ enabled: true, daysActive: 2, daysNeeded: 5, accountDays: 12, minDays: 30 });
    expect(e.text).toBe('Ou entre sem comprar: participe em mais 3 dias e espere que a conta faça 30 dias (faltam 18).');
    expect(engagePath(status({ engage: { enabled: true, min_days: 30, active_days: 5, account_days: 40, days_active: 4 } })).text)
      .toBe('Ou entre sem comprar: participe em mais 1 dia.');
    expect(engagePath(status({ engage: { enabled: true, min_days: 30, active_days: 5, account_days: 29, days_active: 6 } })).text)
      .toBe('Ou entre sem comprar: a conta faz 30 dias daqui a 1 dia.');
    const pronto = engagePath(status({ engage: { enabled: true, min_days: 30, active_days: 5, account_days: 40, days_active: 9 } }));
    expect(pronto.text).toMatch(/próxima visita/);
    expect(pronto.ratio).toBe(1);
    expect(engagePath(status({ engage: { enabled: false } })).enabled).toBe(false);
    expect(engagePath(status({ level: 'leitor' }))).toBeNull();
  });

  it('o dia conta em Luanda (UTC+1)', () => {
    expect(luandaDay(new Date('2026-11-08T23:30:00Z'))).toBe('2026-11-09');
    expect(luandaDay(new Date('2026-11-08T22:59:00Z'))).toBe('2026-11-08');
  });
});
