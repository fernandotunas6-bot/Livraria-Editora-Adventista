// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { timeLeft } from './ColporteurDeliveries';

describe('prazo da oferta de entrega', () => {
  const agora = Date.parse('2026-11-08T10:00:00Z');
  it('diz quanto falta', () => {
    expect(timeLeft('2026-11-08T10:45:00Z', agora)).toBe('faltam 45 min');
    expect(timeLeft('2026-11-08T11:30:00Z', agora)).toBe('faltam 1 h 30 min');
    expect(timeLeft('2026-11-08T09:59:00Z', agora)).toBe('prazo esgotado');
    expect(timeLeft('', agora)).toBe('');
  });
});
