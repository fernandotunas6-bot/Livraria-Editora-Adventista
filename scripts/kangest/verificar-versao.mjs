// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.
//
// Confere uma versão do KanGest já publicada no site, de ponta a ponta: o manifesto anuncia a versão esperada e, para
// cada instalador dele, o tamanho, o SHA-256 (contra o manifesto e o SHA256SUMS.txt) e a assinatura minisign com a
// chave pública das actualizações (a mesma verificação do verificar-assinatura.mjs, que o «publicar» corre antes).
//
// Uso (Node 22), depois de acabar o deploy do site que a publicação lança (deploy-cloudflare.yml):
//   node scripts/kangest/verificar-versao.mjs <versão esperada> [pasta onde guardar o .dmg de Intel]
// A chave pública vem de ~/.kangest-livraria/actualizacoes.key.pub (ou de KANGEST_CHAVE_PUB). Usou-se na 1.4.9 e na
// 1.4.10 (docs/KANGEST-ONE.md).
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { verificarAssinatura } from './verificar-assinatura.mjs';

const [, , esperada, guardar] = process.argv;
if (!esperada) {
  console.error('Uso: node scripts/kangest/verificar-versao.mjs <versão esperada> [pasta onde guardar o .dmg de Intel]');
  process.exit(2);
}
const BASE = 'https://livrariaadventista.ao/kangest/actualizacoes/';
const chavePublica = readFileSync(process.env.KANGEST_CHAVE_PUB || join(homedir(), '.kangest-livraria/actualizacoes.key.pub'), 'utf8');

const m = await (await fetch(BASE + 'kangest-atualizacao.json', { cache: 'no-store' })).json();
const somas = await (await fetch(BASE + 'SHA256SUMS.txt', { cache: 'no-store' })).text();
console.log(`manifesto: versão ${m.versao} (${m.data}); esperada ${esperada}`);
let tudo = m.versao === esperada;

for (const [plataforma, p] of Object.entries(m.pacotes || {})) {
  const r = await fetch(BASE + encodeURIComponent(p.ficheiro), { cache: 'no-store' });
  const b = Buffer.from(await r.arrayBuffer());
  const sha = createHash('sha256').update(b).digest('hex');
  const naLista = somas.split('\n').some((l) => l.trim() === `${sha}  ${p.ficheiro}`);
  const a = verificarAssinatura(chavePublica, p.assinatura, b);
  const certo = r.ok && b.length === p.tamanho && sha === p.sha256 && naLista && a.ok && p.ficheiro.includes(`_${esperada}_`);
  tudo &&= certo;
  console.log(
    `${certo ? 'certo ' : 'FALHOU'} ${plataforma} ${p.ficheiro} ${b.length} bytes · sha256 ${sha === p.sha256 ? 'igual' : 'DIFERENTE'} · ` +
      `lista ${naLista ? 'sim' : 'NÃO'} · assinatura ${a.ok ? 'válida' : `RECUSADA (${a.motivo})`}`,
  );
  if (guardar && plataforma === 'macos-x86_64' && certo) {
    writeFileSync(join(guardar, p.ficheiro), b);
    console.log(`  guardado em ${join(guardar, p.ficheiro)}`);
  }
}
console.log(tudo ? 'TUDO CERTO' : 'HÁ FALHAS');
process.exit(tudo ? 0 : 1);
