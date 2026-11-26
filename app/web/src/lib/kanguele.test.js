// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { KANGUELE_SITE, ligacaoKanguele } from './kanguele';

describe('o link do crédito «Desenvolvido pela Kanguele»', () => {
  it('usa o endereço das Configurações, quando é um https:// válido', () => {
    expect(ligacaoKanguele('https://kangest.livrariaadventista.ao/')).toBe('https://kangest.livrariaadventista.ao/');
    expect(ligacaoKanguele('  https://kanguele.ao  ')).toBe('https://kanguele.ao/');
  });

  it('sem endereço, ou com um inválido, fica o de omissão (o link nunca parte)', () => {
    for (const v of [undefined, null, '', '   ', 'kangest.ao', 'http://kangest.ao', 'javascript:alert(1)', 'https://localhost', 'https://a b.ao', 'https://u:p@kangest.ao']) {
      expect(ligacaoKanguele(v), String(v)).toBe(KANGUELE_SITE);
    }
  });
});
