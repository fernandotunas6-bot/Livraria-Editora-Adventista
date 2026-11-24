#!/usr/bin/env node
// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.
//
// Confere a assinatura minisign de um instalador do KanGest Livraria (a de `tauri signer sign`) com a chave pública
// das actualizações, como o programa faz antes de instalar (atualizacao.rs, minisign_verify). O «publicar» do
// kangest-livraria.yml corre-o antes de pôr o instalador no site: uma assinatura que não confira com a chave
// embutida no programa deixava todas as lojas sem actualizações.
//
// Uso: node scripts/kangest/verificar-assinatura.mjs <chave.pub> <instalador.sig> <instalador>
import { readFileSync } from 'node:fs';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { pathToFileURL } from 'node:url';

/** O texto minisign: o do `tauri signer` vem todo em base64; aceita-se também o texto directo. */
export function textoMinisign(s) {
  const t = String(s || '').trim();
  return t.includes('untrusted comment') ? t : Buffer.from(t, 'base64').toString('utf8');
}

const linhas = (t) => t.split('\n').map((l) => l.trim()).filter(Boolean);
const PREFIXO_SPKI_ED25519 = Buffer.from('302a300506032b6570032100', 'hex');

/** `{ ok, motivo }`: o pacote e o comentário confiável conferem com a chave pública. */
export function verificarAssinatura(chavePublica, assinatura, dados) {
  let pk;
  let sig;
  let confiavel;
  let global;
  try {
    pk = Buffer.from(linhas(textoMinisign(chavePublica))[1] || '', 'base64');
    const s = linhas(textoMinisign(assinatura));
    sig = Buffer.from(s[1] || '', 'base64');
    confiavel = (s[2] || '').replace(/^trusted comment: /, '');
    global = Buffer.from(s[3] || '', 'base64');
  } catch {
    return { ok: false, motivo: 'a chave ou a assinatura não estão no formato minisign' };
  }
  if (pk.length !== 42 || pk.subarray(0, 2).toString() !== 'Ed') return { ok: false, motivo: 'a chave pública não é uma chave minisign' };
  if (sig.length !== 74 || global.length !== 64) return { ok: false, motivo: 'a assinatura não está no formato minisign' };
  if (!pk.subarray(2, 10).equals(sig.subarray(2, 10))) return { ok: false, motivo: 'a assinatura foi feita com outra chave' };
  const algoritmo = sig.subarray(0, 2).toString();
  if (algoritmo !== 'ED' && algoritmo !== 'Ed') return { ok: false, motivo: `algoritmo de assinatura desconhecido (${algoritmo})` };
  const chave = createPublicKey({ key: Buffer.concat([PREFIXO_SPKI_ED25519, pk.subarray(10)]), format: 'der', type: 'spki' });
  const mensagem = algoritmo === 'ED' ? createHash('blake2b512').update(dados).digest() : Buffer.from(dados);
  if (!verify(null, mensagem, chave, sig.subarray(10))) return { ok: false, motivo: 'o pacote não confere com a assinatura' };
  if (!verify(null, Buffer.concat([sig.subarray(10), Buffer.from(confiavel)]), chave, global)) {
    return { ok: false, motivo: 'o comentário confiável da assinatura foi alterado' };
  }
  return { ok: true, motivo: '' };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const [pub, sig, ficheiro] = process.argv.slice(2);
  if (!pub || !sig || !ficheiro) {
    console.error('Uso: node scripts/kangest/verificar-assinatura.mjs <chave.pub> <instalador.sig> <instalador>');
    process.exit(2);
  }
  const r = verificarAssinatura(readFileSync(pub, 'utf8'), readFileSync(sig, 'utf8'), readFileSync(ficheiro));
  console.log(r.ok ? `A assinatura de ${ficheiro} confere com a chave das actualizações.` : `Assinatura recusada: ${r.motivo}.`);
  process.exit(r.ok ? 0 : 1);
}
