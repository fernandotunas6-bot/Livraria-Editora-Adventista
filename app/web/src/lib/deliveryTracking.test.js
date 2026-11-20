// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabaseClient', () => ({ supabase: {}, APP_API_URL: 'http://api.invalid' }));
const {
  accuracyLabel, ageLabel, betterFix, etaLabel, liveSummary, navigationLinks, shouldSendPosition,
} = await import('./deliveryTracking');

describe('trajeto: contas e frases', () => {
  const NOW = 1_000_000;
  it('shouldSendPosition: a primeira vai; depois de 10 s se andou 25 m, ou de 30 s parado', () => {
    const p = { lat: -8.9, lng: 13.37 };
    expect(shouldSendPosition(null, p, NOW)).toBe(true);
    const last = { ...p, at: NOW - 5000 };
    expect(shouldSendPosition(last, { lat: -8.91, lng: 13.37 }, NOW)).toBe(false);
    expect(shouldSendPosition({ ...p, at: NOW - 11_000 }, { lat: -8.9003, lng: 13.37 }, NOW)).toBe(true);
    expect(shouldSendPosition({ ...p, at: NOW - 11_000 }, { lat: -8.90001, lng: 13.37 }, NOW)).toBe(false);
    expect(shouldSendPosition({ ...p, at: NOW - 31_000 }, { lat: -8.90001, lng: 13.37 }, NOW)).toBe(true);
    expect(shouldSendPosition(null, { lat: NaN, lng: 1 }, NOW)).toBe(false);
  });

  it('betterFix fica com a leitura mais precisa', () => {
    expect(betterFix(null, { accuracy: 50 })).toEqual({ accuracy: 50 });
    expect(betterFix({ accuracy: 50 }, { accuracy: 12 })).toEqual({ accuracy: 12 });
    expect(betterFix({ accuracy: 12 }, { accuracy: 80 })).toEqual({ accuracy: 12 });
  });

  it('as frases', () => {
    expect(accuracyLabel(8.4)).toBe('±8 m');
    expect(accuracyLabel(1500)).toBe('±1,5 km');
    expect(accuracyLabel(null)).toBe('');
    expect(etaLabel(7)).toBe('cerca de 7 min');
    expect(etaLabel(70)).toBe('cerca de 1 h 10 min');
    expect(etaLabel(0)).toBe('');
    expect(ageLabel(5)).toBe('agora mesmo');
    expect(ageLabel(40)).toBe('há 40 s');
    expect(ageLabel(400)).toBe('há 7 min');
  });

  it('navegar: Google Maps e Waze até ao ponto', () => {
    const l = navigationLinks({ lat: -8.9, lng: 13.37 });
    expect(l.google).toBe('https://www.google.com/maps/dir/?api=1&destination=-8.9,13.37&travelmode=driving');
    expect(l.waze).toBe('https://waze.com/ul?ll=-8.9,13.37&navigate=yes');
    expect(navigationLinks(null)).toBeNull();
  });

  it('liveSummary diz o que se passa a quem recebe', () => {
    expect(liveSummary({ on_the_way: false })).toContain('Ainda não saiu');
    expect(liveSummary({ on_the_way: true, courier: null })).toContain('aparece no mapa quando partilhar');
    expect(liveSummary({ on_the_way: true, courier: { name: 'Ana', kind: 'colportor', stale: false }, distance_km: 1.67, eta_min: 7 }))
      .toBe('Ana vai a caminho · a 1,7 km · cerca de 7 min');
    expect(liveSummary({ on_the_way: true, courier: { name: 'Rui', kind: 'equipa', stale: true, age_s: 420 } }))
      .toBe('Última posição de Rui há 7 min — pode estar sem rede.');
  });
});
