// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// A verificação das assinaturas minisign do instalador, com chaves e assinaturas feitas aqui no formato do
// `tauri signer` (o texto minisign todo em base64).
import { describe, expect, it } from 'vitest';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { textoMinisign, verificarAssinatura } from './verificar-assinatura.mjs';

function parDeChaves() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pk = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  const numero = randomBytes(8);
  const texto = `untrusted comment: minisign public key: ${numero.toString('hex').toUpperCase()}\n${Buffer.concat([Buffer.from('Ed'), numero, pk]).toString('base64')}\n`;
  return { privada: privateKey, numero, publica: Buffer.from(texto).toString('base64') };
}

function assinar({ privada, numero }, dados, { comentario = 'timestamp:1764000000\tfile:pacote.exe', prehash = true } = {}) {
  const mensagem = prehash ? createHash('blake2b512').update(dados).digest() : dados;
  const s = sign(null, mensagem, privada);
  const global = sign(null, Buffer.concat([s, Buffer.from(comentario)]), privada);
  const texto = [
    'untrusted comment: signature from tauri secret key',
    Buffer.concat([Buffer.from(prehash ? 'ED' : 'Ed'), numero, s]).toString('base64'),
    `trusted comment: ${comentario}`,
    global.toString('base64'),
  ].join('\n');
  return Buffer.from(`${texto}\n`).toString('base64');
}

describe('assinatura do instalador (minisign)', () => {
  const chaves = parDeChaves();
  const dados = randomBytes(4096);

  it('confere com a chave certa, no formato do tauri signer e no texto directo', () => {
    const sig = assinar(chaves, dados);
    expect(verificarAssinatura(chaves.publica, sig, dados)).toEqual({ ok: true, motivo: '' });
    expect(verificarAssinatura(textoMinisign(chaves.publica), textoMinisign(sig), dados).ok).toBe(true);
    expect(verificarAssinatura(chaves.publica, assinar(chaves, dados, { prehash: false }), dados).ok).toBe(true);
  });

  it('recusa um pacote alterado', () => {
    const alterado = Buffer.from(dados);
    alterado[100] ^= 1;
    expect(verificarAssinatura(chaves.publica, assinar(chaves, dados), alterado)).toEqual({ ok: false, motivo: 'o pacote não confere com a assinatura' });
  });

  it('recusa a assinatura de outra chave', () => {
    const outra = parDeChaves();
    expect(verificarAssinatura(chaves.publica, assinar(outra, dados), dados).motivo).toBe('a assinatura foi feita com outra chave');
    // o mesmo número de chave, mas outra chave privada
    expect(verificarAssinatura(chaves.publica, assinar({ ...outra, numero: chaves.numero }, dados), dados).motivo).toBe('o pacote não confere com a assinatura');
  });

  it('recusa um comentário confiável alterado', () => {
    const t = textoMinisign(assinar(chaves, dados)).replace('file:pacote.exe', 'file:outro.exe');
    expect(verificarAssinatura(chaves.publica, t, dados).motivo).toBe('o comentário confiável da assinatura foi alterado');
  });

  it('recusa o que não é minisign', () => {
    expect(verificarAssinatura('', assinar(chaves, dados), dados).ok).toBe(false);
    expect(verificarAssinatura(chaves.publica, 'lixo', dados).ok).toBe(false);
  });
});
