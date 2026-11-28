// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { destinoDaEncomenda, destinoDaLoja, enderecoManualValido, ligacaoDoPrograma, ligacaoPeloServidor, postoParaAbrir } from './kangestServidor';

describe('abrir o KanGest pelo servidor da loja', () => {
  it('só as rotas permitidas, com a marca de que vêm do site', () => {
    expect(destinoDaEncomenda('LA-0042')).toBe('/loja-online?encomenda=LA-0042');
    expect(destinoDaEncomenda('../admin')).toBe('/loja-online');
    expect(destinoDaLoja('por_confirmar')).toBe('/loja-online?filtro=por_confirmar');
    expect(destinoDaLoja('apagar')).toBe('/loja-online');
    expect(ligacaoPeloServidor('http://192.168.1.10:7799/', '/loja-online?encomenda=LA-1')).toBe('http://192.168.1.10:7799/#/loja-online?encomenda=LA-1&origem=site');
    expect(ligacaoPeloServidor('http://192.168.1.10:7799', '/loja-online')).toBe('http://192.168.1.10:7799/#/loja-online?origem=site');
    expect(ligacaoPeloServidor('javascript:alert(1)', '/loja-online')).toBe('');
  });

  it('sem servidor, a ligação do programa deste computador', () => {
    expect(ligacaoDoPrograma('/loja-online?encomenda=LA-1')).toBe('kangest://loja-online/encomenda/LA-1');
    expect(ligacaoDoPrograma('/loja-online?filtro=em_curso')).toBe('kangest://loja-online?filtro=em_curso');
    expect(ligacaoDoPrograma('/loja-online')).toBe('kangest://loja-online');
  });

  it('o posto: o que emite as encomendas da loja, depois um que emita, depois o da loja', () => {
    const postos = [
      { posto_id: 'a', store_id: 'lubango', emitir_encomendas: false, endereco: 'http://10.0.0.2:7799' },
      { posto_id: 'b', store_id: 'huambo', emitir_encomendas: true, endereco: 'http://192.168.1.10:7799' },
      { posto_id: 'c', store_id: 'lubango', emitir_encomendas: true, endereco: 'http://10.0.0.3:7799' },
    ];
    expect(postoParaAbrir(postos, 'huambo').posto_id).toBe('b');
    expect(postoParaAbrir(postos, 'lubango').posto_id).toBe('c');
    expect(postoParaAbrir(postos, null).posto_id).toBe('b');
    // pelo nome da loja de levantamento, como as encomendas a guardam
    expect(postoParaAbrir([{ ...postos[1], emitir_encomendas: false }, { ...postos[0], loja: 'Livraria do Lubango' }], 'livraria do lubango').posto_id).toBe('a');
    expect(postoParaAbrir([{ posto_id: 'x', endereco: '' }], 'huambo')).toBeNull();
  });

  it('o endereço escrito à mão', () => {
    for (const bom of ['http://192.168.1.10:7799', 'http://kangest-loja:7799/', 'https://servidor.loja.lan:8443']) expect(enderecoManualValido(bom), bom).toBe(true);
    for (const mau of ['192.168.1.10:7799', 'ftp://x:1', 'http://a b:1', 'http://x:7799/caminho', '']) expect(enderecoManualValido(mau), mau).toBe(false);
  });
});
