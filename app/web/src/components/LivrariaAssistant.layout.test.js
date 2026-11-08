import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabaseClient', () => ({ supabase: {}, APP_API_URL: '' }));
vi.mock('@/lib/dataClient', () => ({ default: { authStore: {} } }));
const { dayLabel, layoutMessages } = await import('./LivrariaAssistant');

const NOW = new Date('2026-11-07T15:00:00');
const at = (hhmm, day = '2026-11-07') => new Date(`${day}T${hhmm}:00`).toISOString();

describe('blocos de mensagens', () => {
  it('avatar no início de cada bloco do mesmo autor; hora só no fim do bloco', () => {
    const r = layoutMessages([
      { id: 1, role: 'user', created_at: at('10:00') },
      { id: 2, role: 'bot', created_at: at('10:00') },
      { id: 3, role: 'bot', created_at: at('10:01') },
      { id: 4, role: 'user', created_at: at('10:02') },
    ], NOW);
    expect(r.map((x) => x.showAvatar)).toEqual([true, true, false, true]);
    expect(r.map((x) => !!x.time)).toEqual([true, false, true, true]);
    expect(r[0].day).toBe('Hoje');
    expect(r.slice(1).every((x) => !x.day)).toBe(true);
  });

  it('uma pausa de mais de 5 minutos começa outro bloco; o dia muda com separador', () => {
    const r = layoutMessages([
      { id: 1, role: 'bot', created_at: at('09:00', '2026-11-06') },
      { id: 2, role: 'bot', created_at: at('10:00', '2026-11-07') },
      { id: 3, role: 'bot', created_at: at('10:10', '2026-11-07') },
    ], NOW);
    expect(r.map((x) => x.day)).toEqual(['Ontem', 'Hoje', '']);
    expect(r.map((x) => x.showAvatar)).toEqual([true, true, true]);
  });

  it('respostas de pessoas diferentes da equipa são blocos diferentes', () => {
    const r = layoutMessages([
      { id: 1, role: 'staff', author: 'Ana', created_at: at('10:00') },
      { id: 2, role: 'staff', author: 'Rui', created_at: at('10:01') },
    ], NOW);
    expect(r.map((x) => x.showAvatar)).toEqual([true, true]);
  });

  it('dias por extenso', () => {
    expect(dayLabel(new Date('2026-11-01T10:00:00'), NOW)).toBe('01/11/2026');
    expect(dayLabel(null, NOW)).toBe('');
  });
});
