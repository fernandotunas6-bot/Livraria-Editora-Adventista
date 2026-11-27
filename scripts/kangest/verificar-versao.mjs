// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Confere uma versão publicada do KanGest: para cada instalador do manifesto do site, o tamanho, o SHA-256 (contra o
// manifesto e o SHA256SUMS.txt) e as duas assinaturas minisign (a do ficheiro e a global), com a chave pública guardada
// em ~/.kangest-livraria/actualizacoes.key.pub. Sem o minisign instalado: o Ed25519 e o BLAKE2b do próprio Node.
// Uso (Node 22), depois de o deploy do site que a publicação lança acabar:
//   node scripts/kangest/verificar-versao.mjs <versão esperada> [pasta onde guardar o .dmg de Intel]
// Usou-se na 1.4.9 e na 1.4.10 (docs/KANGEST-ONE.md).
import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const [, , esperada, guardar] = process.argv;
const BASE = 'https://livrariaadventista.ao/kangest/actualizacoes/';

// a chave pública: o ficheiro do minisign, em base64 numa só linha
const pubTexto = Buffer.from(readFileSync(join(homedir(), '.kangest-livraria/actualizacoes.key.pub'), 'utf8').trim(), 'base64').toString();
const pub = Buffer.from(pubTexto.trim().split('\n')[1], 'base64');
const idChave = Buffer.from(pub.subarray(2, 10)).reverse().toString('hex').toUpperCase();
const chave = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), pub.subarray(10, 42)]), format: 'der', type: 'spki' });

const m = await (await fetch(BASE + 'kangest-atualizacao.json', { cache: 'no-store' })).json();
const somas = await (await fetch(BASE + 'SHA256SUMS.txt', { cache: 'no-store' })).text();
console.log(`manifesto: versão ${m.versao} (${m.data}); esperada ${esperada}; chave ${idChave}`);
let tudo = m.versao === esperada;

for (const [plataforma, p] of Object.entries(m.pacotes || {})) {
  const r = await fetch(BASE + encodeURIComponent(p.ficheiro), { cache: 'no-store' });
  const b = Buffer.from(await r.arrayBuffer());
  const sha = createHash('sha256').update(b).digest('hex');
  const naLista = somas.split('\n').some((l) => l.trim() === `${sha}  ${p.ficheiro}`);
  const linhas = Buffer.from(p.assinatura, 'base64').toString().split('\n');
  const blob = Buffer.from(linhas[1], 'base64');
  const alg = blob.subarray(0, 2).toString();
  const idAssinatura = Buffer.from(blob.subarray(2, 10)).reverse().toString('hex').toUpperCase();
  const assinatura = blob.subarray(10, 74);
  const mensagem = alg === 'ED' ? createHash('blake2b512').update(b).digest() : b;
  const okFicheiro = verify(null, mensagem, chave, assinatura);
  const confianca = linhas[2].replace(/^trusted comment: /, '');
  const okGlobal = verify(null, Buffer.concat([assinatura, Buffer.from(confianca)]), chave, Buffer.from(linhas[3], 'base64'));
  const certo = r.ok && b.length === p.tamanho && sha === p.sha256 && naLista && okFicheiro && okGlobal && idAssinatura === idChave && p.ficheiro.includes(`_${esperada}_`);
  tudo &&= certo;
  console.log(
    `${certo ? 'certo ' : 'FALHOU'} ${plataforma} ${p.ficheiro} ${b.length} bytes · sha256 ${sha === p.sha256 ? 'igual' : 'DIFERENTE'} · lista ${naLista ? 'sim' : 'NÃO'} · ` +
      `assinatura ${okFicheiro ? 'válida' : 'INVÁLIDA'} (${alg}, chave ${idAssinatura}) · global ${okGlobal ? 'válida' : 'INVÁLIDA'} · ${confianca}`,
  );
  if (guardar && plataforma === 'macos-x86_64' && certo) {
    writeFileSync(join(guardar, p.ficheiro), b);
    console.log(`  guardado em ${join(guardar, p.ficheiro)}`);
  }
}
console.log(tudo ? 'TUDO CERTO' : 'HÁ FALHAS');
process.exit(tudo ? 0 : 1);
