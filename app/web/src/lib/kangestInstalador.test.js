// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it, vi } from 'vitest';
import {
  instaladorDoManifesto, instaladoresDoManifesto, lerInstalador, lerInstaladores, MANIFESTO_INSTALADOR, sistemaDoAparelho, tamanhoLegivel,
} from './kangestInstalador';

const SHA = 'a'.repeat(64);
// o que o «publicar» do kangest-livraria.yml escreve (manifesto-atualizacao.py + certificado_agt e tamanho)
const manifesto = (extra = {}, pacote = {}) => ({
  versao: '1.4.4',
  data: '2026-11-24',
  notas: '',
  pacotes: { 'windows-x86_64': { ficheiro: 'KanGest-Livraria_1.4.4_x64-setup.exe', sha256: SHA, assinatura: 'dW50cnVzdGVk', tamanho: 7864320, ...pacote } },
  certificado_agt: true,
  ...extra,
});

describe('instalador do KanGest Livraria', () => {
  it('lê o manifesto publicado', () => {
    expect(instaladorDoManifesto(manifesto())).toEqual({
      sistema: 'windows-x86_64',
      rotulo: 'Windows',
      detalhe: 'Windows 10 ou 11, 64 bits',
      versao: '1.4.4',
      data: '2026-11-24',
      notas: '',
      ficheiro: 'KanGest-Livraria_1.4.4_x64-setup.exe',
      endereco: '/kangest/actualizacoes/KanGest-Livraria_1.4.4_x64-setup.exe',
      sha256: SHA,
      tamanho: 7864320,
      assinado: true,
      certificado: true,
    });
  });

  it('a AGT só conta com um «true» explícito, e a assinatura só se a houver', () => {
    expect(instaladorDoManifesto(manifesto({ certificado_agt: false })).certificado).toBe(false);
    const { certificado_agt, ...semCampo } = manifesto();
    expect(certificado_agt).toBe(true);
    expect(instaladorDoManifesto(semCampo).certificado).toBe(false);
    expect(instaladorDoManifesto(manifesto({}, { assinatura: undefined })).assinado).toBe(false);
    expect(instaladorDoManifesto(manifesto({}, { assinatura: '  ' })).assinado).toBe(false);
  });

  it('recusa o que não é o instalador do Windows ou tem um nome que não vai num endereço', () => {
    expect(instaladorDoManifesto(null)).toBeNull();
    expect(instaladorDoManifesto({ versao: '1.4.4', pacotes: {} })).toBeNull();
    expect(instaladorDoManifesto(manifesto({ versao: '' }))).toBeNull();
    expect(instaladorDoManifesto(manifesto({}, { sha256: 'xyz' }))).toBeNull();
    expect(instaladorDoManifesto(manifesto({}, { ficheiro: 'KanGest Livraria_1.4.4_x64-setup.exe' }))).toBeNull();
    expect(instaladorDoManifesto(manifesto({}, { ficheiro: '../../index.exe' }))).toBeNull();
    expect(instaladorDoManifesto(manifesto({}, { ficheiro: 'KanGest-Livraria_1.4.4_aarch64.dmg' }))).toBeNull();
  });

  it('os instaladores do Mac, para Apple Silicon e para Intel, ao lado do do Windows', () => {
    const m = manifesto({}, {});
    m.pacotes['macos-aarch64'] = { ficheiro: 'KanGest-Livraria_1.4.6_aarch64.dmg', sha256: SHA, assinatura: 'x', tamanho: 9000000 };
    m.pacotes['macos-x86_64'] = { ficheiro: 'KanGest-Livraria_1.4.6_x64.dmg', sha256: SHA, tamanho: 9500000 };
    const lista = instaladoresDoManifesto(m);
    expect(lista.map((i) => i.sistema)).toEqual(['windows-x86_64', 'macos-aarch64', 'macos-x86_64']);
    expect(lista[1]).toMatchObject({ rotulo: 'Mac com Apple Silicon', endereco: '/kangest/actualizacoes/KanGest-Livraria_1.4.6_aarch64.dmg', assinado: true });
    expect(lista[2].assinado).toBe(false);
    // um .exe no lugar do Mac, ou um .dmg no do Windows, não serve
    m.pacotes['macos-x86_64'].ficheiro = 'KanGest-Livraria_1.4.6_x64-setup.exe';
    expect(instaladorDoManifesto(m, 'macos-x86_64')).toBeNull();
    expect(instaladorDoManifesto(m, 'outro')).toBeNull();
    // um manifesto só com o Windows (as versões de antes) dá só o Windows
    expect(instaladoresDoManifesto(manifesto()).map((i) => i.sistema)).toEqual(['windows-x86_64']);
    expect(instaladoresDoManifesto(null)).toEqual([]);
  });

  it('o sistema do aparelho, para destacar o instalador certo', () => {
    expect(sistemaDoAparelho('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows');
    expect(sistemaDoAparelho('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('mac');
    expect(sistemaDoAparelho('Mozilla/5.0 (Linux; Android 14)')).toBe('');
  });

  it('o tamanho em KB ou MB, e nada se não o houver', () => {
    expect(tamanhoLegivel(7864320)).toBe('7,5 MB');
    expect(tamanhoLegivel(300 * 1024)).toBe('300 KB');
    expect(tamanhoLegivel(undefined)).toBe('');
    expect(instaladorDoManifesto(manifesto({}, { tamanho: 'grande' })).tamanho).toBeNull();
  });

  it('sem instalador publicado o site devolve a página dele, e isso não é um manifesto', async () => {
    const resposta = (corpo, tipo, ok = true) => ({ ok, headers: new Headers({ 'content-type': tipo }), json: async () => corpo });
    const fetchFn = vi.fn(async () => resposta(manifesto(), 'application/json; charset=utf-8'));
    expect((await lerInstalador(fetchFn)).versao).toBe('1.4.4');
    expect(fetchFn).toHaveBeenCalledWith(MANIFESTO_INSTALADOR, { cache: 'no-store' });
    expect(await lerInstalador(async () => resposta(null, 'text/html; charset=utf-8'))).toBeNull();
    expect(await lerInstalador(async () => resposta(manifesto(), 'application/json', false))).toBeNull();
    expect(await lerInstalador(async () => ({ ok: true, headers: new Headers({ 'content-type': 'application/json' }), json: async () => { throw new Error('x'); } }))).toBeNull();
  });

  it('lê todos os instaladores; sem manifesto, ou sem nenhum, dá null', async () => {
    const resposta = (corpo, tipo, ok = true) => ({ ok, headers: new Headers({ 'content-type': tipo }), json: async () => corpo });
    expect((await lerInstaladores(async () => resposta(manifesto(), 'application/json'))).length).toBe(1);
    expect(await lerInstaladores(async () => resposta(null, 'text/html'))).toBeNull();
    expect(await lerInstaladores(async () => resposta({ versao: '1.4.6', pacotes: {} }, 'application/json'))).toBeNull();
  });
});
