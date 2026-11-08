import { describe, expect, it } from 'vitest';
import { hoursSummary, normalizeHours, teamAvailability } from './teamHours';

// Horário por omissão do servidor: segunda a sábado, 08h–18h (Luanda = UTC+1).
const DEFAULT = { open_hour: 8, close_hour: 18, open_days: [1, 2, 3, 4, 5, 6] };
const at = (iso) => new Date(iso).getTime();

describe('teamAvailability', () => {
  it('dentro do horário: disponível, até ao fecho', () => {
    // Sexta, 10h00 em Luanda.
    expect(teamAvailability(DEFAULT, at('2026-11-06T09:00:00Z'))).toEqual({
      open: true, label: 'A equipa está disponível', short: 'Disponível agora', detail: 'até às 18h',
    });
  });

  it('antes de abrir: volta hoje', () => {
    // Sexta, 07h30 em Luanda.
    expect(teamAvailability(DEFAULT, at('2026-11-06T06:30:00Z')).label).toBe('A equipa volta hoje às 08h');
  });

  it('à hora do fecho já está fechada: volta amanhã', () => {
    // Sexta, 18h00 em Luanda; sábado abre.
    const a = teamAvailability(DEFAULT, at('2026-11-06T17:00:00Z'));
    expect(a.open).toBe(false);
    expect(a.label).toBe('A equipa volta amanhã às 08h');
    expect(a.short).toBe('Volta amanhã às 08h');
    expect(a.detail).toBe('Segunda a sábado, das 08h às 18h');
  });

  it('sábado à noite salta o domingo fechado', () => {
    // Sábado, 18h30 em Luanda.
    expect(teamAvailability(DEFAULT, at('2026-11-07T17:30:00Z')).label).toBe('A equipa volta na segunda-feira às 08h');
  });

  it('conta o dia em Luanda, não em UTC', () => {
    // 23h30 UTC de sábado = 00h30 de domingo em Luanda: segunda é amanhã.
    expect(teamAvailability(DEFAULT, at('2026-11-07T23:30:00Z')).label).toBe('A equipa volta amanhã às 08h');
    // 07h30 UTC de sexta = 08h30 em Luanda: já abriu.
    expect(teamAvailability(DEFAULT, at('2026-11-06T07:30:00Z')).open).toBe(true);
  });

  it('sábado e domingo levam "no"', () => {
    const weekend = { open_hour: 9, close_hour: 13, open_days: [6] };
    // Segunda, 12h00 em Luanda.
    expect(teamAvailability(weekend, at('2026-11-09T11:00:00Z')).label).toBe('A equipa volta no sábado às 09h');
  });

  it('sem horário válido não diz nada', () => {
    expect(teamAvailability(null)).toBeNull();
    expect(teamAvailability({ open_hour: 18, close_hour: 8, open_days: [1] })).toBeNull();
    expect(teamAvailability({ open_hour: 8, close_hour: 18, open_days: [] })).toBeNull();
    expect(teamAvailability({ open_hour: 8, close_hour: 18, open_days: [0, 8, 'x'] })).toBeNull();
  });
});

describe('hoursSummary', () => {
  it('resume os dias seguidos e os soltos', () => {
    expect(hoursSummary(DEFAULT)).toBe('Segunda a sábado, das 08h às 18h');
    expect(hoursSummary({ open_hour: 0, close_hour: 24, open_days: [1, 2, 3, 4, 5, 6, 7] })).toBe('Todos os dias, das 00h às 24h');
    expect(hoursSummary({ open_hour: 8, close_hour: 17, open_days: [5, 1, 3, 3] })).toBe('Segunda, quarta e sexta, das 08h às 17h');
    expect(hoursSummary({ open_hour: 8, close_hour: 17, open_days: [1, 2] })).toBe('Segunda e terça, das 08h às 17h');
    expect(hoursSummary({ open_hour: 9, close_hour: 13, open_days: [6] })).toBe('Sábado, das 09h às 13h');
  });

  it('normaliza os dias', () => {
    expect(normalizeHours({ open_hour: '8', close_hour: '18', open_days: ['2', 1, 1] })).toEqual({ openHour: 8, closeHour: 18, openDays: [1, 2] });
  });
});
