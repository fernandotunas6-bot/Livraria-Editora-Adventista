import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rolar } from './odometro.js';

describe('rolar (o contador mecânico)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('uma fita por algarismo, o resto parado, e o texto inteiro para os leitores de ecrã', () => {
    const e = document.createElement('div');
    document.body.appendChild(e);
    rolar(e, '+1 952 693,00 Kz', { dur: 900 });
    const fitas = [...e.querySelectorAll('.odo-f')];
    expect(fitas).toHaveLength(9);
    expect(e.querySelector('.odo-sr').textContent).toBe('+1 952 693,00 Kz');
    expect(e.querySelector('.odo').getAttribute('aria-hidden')).toBe('true');
    expect([...e.querySelectorAll('.odo-c')].map((c) => c.textContent)).toEqual(['+', ' ', ' ', ',', ' ', 'K', 'z']);
    // Cada fita acaba no seu algarismo; o primeiro dá 1 volta, o último 3.
    const fim = (f) => f.textContent.split('\n').at(-1);
    expect(fitas.map(fim).join('')).toBe('195269300');
    expect(fitas[0].textContent.split('\n')).toHaveLength(12); // 1 volta + o 1
    expect(fitas.at(-1).textContent.split('\n')).toHaveLength(31); // 3 voltas + o 0
    // Os da direita demoram mais.
    const ms = (f) => Number(/transform (\d+)ms/.exec(f.style.transition)[1]);
    expect(ms(fitas[0])).toBeLessThan(ms(fitas.at(-1)));
    expect(ms(fitas.at(-1))).toBe(900);
    e.remove();
  });

  it('no fim fica só o texto', () => {
    const e = document.createElement('div');
    document.body.appendChild(e);
    rolar(e, '218 675,00 Kz', { dur: 500, atraso: 200 });
    expect(e.querySelector('.odo')).not.toBeNull();
    vi.advanceTimersByTime(800);
    expect(e.querySelector('.odo')).toBeNull();
    expect(e.textContent).toBe('218 675,00 Kz');
    e.remove();
  });

  it('com «reduzir movimento», ou sem algarismos, escreve logo', () => {
    const e = document.createElement('div');
    expect(rolar(e, '2 171 368,00 Kz', { reduce: true })).toBeNull();
    expect(e.textContent).toBe('2 171 368,00 Kz');
    rolar(e, '—');
    expect(e.textContent).toBe('—');
    expect(e.querySelector('.odo')).toBeNull();
  });
});
