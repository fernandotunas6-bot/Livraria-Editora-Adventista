// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { aoRolar } from '@/hooks/useRecolherAoDescer';

describe('aoRolar (o botão do chat ao descer a página)', () => {
  it('recolhe ao descer, longe do topo', () => {
    expect(aoRolar({ y: 300, ultimo: 0 })).toEqual({ ultimo: 300, recolhido: true });
  });

  it('volta logo ao subir', () => {
    expect(aoRolar({ y: 250, ultimo: 400 })).toEqual({ ultimo: 250, recolhido: false });
  });

  it('um toque pequeno não conta, para não piscar', () => {
    expect(aoRolar({ y: 254, ultimo: 250 })).toBeNull();
    expect(aoRolar({ y: 262, ultimo: 250, limiar: 16 })).toBeNull();
  });

  it('perto do topo não recolhe', () => {
    expect(aoRolar({ y: 60, ultimo: 0 })).toEqual({ ultimo: 60, recolhido: false });
  });
});
