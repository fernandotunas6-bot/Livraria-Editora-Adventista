// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { addBusinessDays, deliveryWindow, formatWindow } from '@/lib/deliveryEstimate';

// 2026-11-07 é um sábado; 2026-11-09 uma segunda.
const sabado = new Date(2026, 10, 7, 15, 30);
const segunda = new Date(2026, 10, 9, 9, 0);

describe('addBusinessDays', () => {
  it('salta os fins de semana', () => {
    expect(addBusinessDays(segunda, 1)).toEqual(new Date(2026, 10, 10));
    expect(addBusinessDays(segunda, 5)).toEqual(new Date(2026, 10, 16));
    // ao sábado, o primeiro dia útil é segunda
    expect(addBusinessDays(sabado, 1)).toEqual(new Date(2026, 10, 9));
  });

  it('zero dias é o próprio dia, sem horas', () => {
    expect(addBusinessDays(segunda, 0)).toEqual(new Date(2026, 10, 9));
  });
});

describe('deliveryWindow / formatWindow', () => {
  it('Luanda: 5 a 7 dias úteis', () => {
    const w = deliveryWindow('luanda', segunda);
    expect(w.from).toEqual(new Date(2026, 10, 16));
    expect(w.to).toEqual(new Date(2026, 10, 18));
    expect(formatWindow(w)).toBe('16–18 nov.');
  });

  it('províncias: 7 a 14 dias úteis, a passar de mês', () => {
    expect(formatWindow(deliveryWindow('provincias', new Date(2026, 10, 20)))).toBe('1–10 dez.');
    expect(formatWindow(deliveryWindow('provincias', new Date(2026, 10, 16)))).toBe('25 nov. – 4 dez.');
  });

  it('tipo desconhecido usa o de Luanda; um só dia diz-se uma vez', () => {
    expect(deliveryWindow('marte', segunda)).toEqual(deliveryWindow('luanda', segunda));
    expect(formatWindow({ from: new Date(2026, 0, 5), to: new Date(2026, 0, 5) })).toBe('5 jan.');
  });
});
