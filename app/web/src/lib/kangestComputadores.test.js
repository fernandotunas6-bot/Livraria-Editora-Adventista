// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { problemasDoComputador, tamanho } from './kangestComputadores';

const AGORA = Date.parse('2026-11-26T12:00:00Z');
const GB = 1024 ** 3;
const bom = {
  estado: 'activo',
  estado_em: '2026-11-26T11:55:00Z',
  estado_computador: { espaco_livre: 50 * GB, base_bytes: 0.3 * GB, ultima_copia: '2026-11-26T08:00:00Z', fe_rejeitados: 0, por_enviar: 0, verificacao: 'ok' },
};

describe('problemasDoComputador', () => {
  it('um computador em dia não tem problemas', () => {
    expect(problemasDoComputador(bom, AGORA)).toEqual([]);
  });

  it('o disco, a AGT e a verificação são graves e vêm primeiro', () => {
    const p = { ...bom, estado_computador: { ...bom.estado_computador, espaco_livre: 0.4 * GB, fe_rejeitados: 2, verificacao: 'graves', copia_externa_erro: true } };
    const v = problemasDoComputador(p, AGORA);
    expect(v.filter((x) => x.grave).map((x) => x.texto)).toEqual([
      'Disco quase cheio (410 MB livres)',
      'A verificação da base encontrou problemas graves',
      '2 documento(s) rejeitado(s) pela AGT',
    ]);
    expect(v.at(-1)).toEqual({ grave: false, texto: 'A cópia externa (pen, OneDrive) falhou' });
  });

  it('sem contacto e sem cópias recentes', () => {
    const p = { ...bom, estado_em: '2026-11-24T10:00:00Z', estado_computador: { ...bom.estado_computador, ultima_copia: '2026-11-22T08:00:00Z' } };
    expect(problemasDoComputador(p, AGORA).map((x) => x.texto)).toEqual(['Sem contacto há 2 dia(s)', 'Última cópia há 4 dias']);
    expect(problemasDoComputador({ ...bom, estado_em: '2026-11-26T10:30:00Z' }, AGORA)[0]).toEqual({ grave: false, texto: 'Sem contacto há 2 h' });
  });

  it('um posto sem estado (versão antiga) ou revogado não acusa nada', () => {
    expect(problemasDoComputador({ estado: 'activo', estado_computador: {} }, AGORA)).toEqual([]);
    expect(problemasDoComputador({ ...bom, estado: 'revogado', estado_em: '2026-11-01T00:00:00Z' }, AGORA)).toEqual([]);
  });
});

describe('tamanho', () => {
  it('em MB ou GB, com vírgula', () => {
    expect(tamanho(850 * 1024 ** 2)).toBe('850 MB');
    expect(tamanho(12.4 * GB)).toBe('12,4 GB');
    expect(tamanho(null)).toBe('—');
  });
});
