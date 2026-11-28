// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { desistenciaParaOKanGest, destinoPermitido, lerAbertura, pedidoDoKanGest, retornoParaOKanGest } from './kangestEntrada';

describe('a entrada nos dois sentidos com o KanGest', () => {
  it('só abre páginas do próprio site; o resto vai para o painel', () => {
    expect(destinoPermitido('/admin?tab=orders&encomenda=LA-1')).toBe('/admin?tab=orders&encomenda=LA-1');
    expect(destinoPermitido('/product/abc')).toBe('/product/abc');
    for (const mau of ['https://mau.example', '//mau.example', '/\\mau', 'javascript:alert(1)', '/admin#x', '/qualquer', '', null]) {
      expect(destinoPermitido(mau), String(mau)).toBe('/admin');
    }
  });

  it('lê o resumo e o destino do fragmento', () => {
    expect(lerAbertura('#t=pkce_abc123XYZ&d=%2Fadmin%3Ftab%3Dbooks')).toEqual({ tokenHash: 'pkce_abc123XYZ', destino: '/admin?tab=books' });
    expect(lerAbertura('#t=<script>&d=//mau').tokenHash).toBe('');
    expect(lerAbertura('').destino).toBe('/admin');
  });

  it('o pedido do KanGest tem de ter a forma do que o KanGest gera', () => {
    const d = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    expect(pedidoDoKanGest(`?e=aBcDeFgHiJkLmNoPqRsTuVwX&d=${d}`)).toEqual({ estado: 'aBcDeFgHiJkLmNoPqRsTuVwX', desafio: d });
    expect(pedidoDoKanGest(`?e=curto&d=${d}`)).toBeNull();
    expect(pedidoDoKanGest('?e=aBcDeFgHiJkLmNoPqRsTuVwX&d=curto')).toBeNull();
    expect(pedidoDoKanGest('')).toBeNull();
  });

  it('devolve o código ao KanGest pela mesma ligação do Google', () => {
    expect(retornoParaOKanGest('aBcDeFgHiJkLmNoPqRsTuVwX', 'abc-_123')).toBe('kangest://auth?e=aBcDeFgHiJkLmNoPqRsTuVwX&code=abc-_123');
    expect(desistenciaParaOKanGest('aBcDeFgHiJkLmNoPqRsTuVwX')).toMatch(/^kangest:\/\/auth\?e=aBcDeFgHiJkLmNoPqRsTuVwX&erro=/);
  });
});
