#!/usr/bin/env node
// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.
//
// Gera as chaves da sincronização do KanGest Livraria com a base central (docs/KANGEST-SINCRONIZACAO.md).
//
//   node scripts/kangest/chaves-sinc.mjs
//       primeira configuração: uma chave X25519 do centro e a chave dos dados pessoais
//   node scripts/kangest/chaves-sinc.mjs --rodar '<KANGEST_SINC_CHAVES actual>'
//       uma chave X25519 nova à frente; as duas anteriores continuam a aceitar-se enquanto os postos não
//       emparelharem outra vez (no painel, «Rodar a chave» em cada posto)
//
// O resultado vai para os segredos da Edge Function, nunca para o repositório. A KANGEST_DADOS_CHAVE gera-se uma
// vez e NUNCA se troca: sem ela, os NIF e os nomes dos clientes que já chegaram não se voltam a ler.
import { webcrypto } from 'node:crypto';

const { subtle } = webcrypto;
const b64 = (b) => Buffer.from(b).toString('base64');

async function parX25519(kid) {
  const par = await subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
  // o PKCS#8 de uma X25519 termina nos 32 bytes da chave (RFC 8410)
  const pkcs8 = new Uint8Array(await subtle.exportKey('pkcs8', par.privateKey));
  const publica = new Uint8Array(await subtle.exportKey('raw', par.publicKey));
  return { kid, privada: b64(pkcs8.slice(-32)), publica: b64(publica) };
}

const i = process.argv.indexOf('--rodar');
if (i >= 0) {
  let actuais;
  try {
    actuais = JSON.parse(process.argv[i + 1] || '');
  } catch {
    console.error('Passe o valor actual de KANGEST_SINC_CHAVES (o JSON) a seguir a --rodar.');
    process.exit(1);
  }
  const lista = Array.isArray(actuais) ? actuais : [actuais];
  const kid = String(Math.max(0, ...lista.map((c) => Number(c?.kid) || 0)) + 1);
  const chaves = [await parX25519(kid), ...lista].slice(0, 3);
  console.log('Chave do centro nova (kid %s). As anteriores continuam a aceitar-se:\n', kid);
  console.log(`npx supabase secrets set --project-ref <projecto> KANGEST_SINC_CHAVES='${JSON.stringify(chaves)}'\n`);
  console.log('Depois, no painel (Sistema → Ligação ao KanGest → Postos), «Rodar a chave» em cada posto.');
  console.log('A KANGEST_DADOS_CHAVE fica como está.');
} else {
  const chaves = [await parX25519('1')];
  const dados = b64(webcrypto.getRandomValues(new Uint8Array(32)));
  console.log('Chaves novas da sincronização do KanGest Livraria. Guarde a KANGEST_DADOS_CHAVE também num cofre de senhas:');
  console.log('sem ela, os NIF e os nomes dos clientes guardados não se voltam a ler.\n');
  console.log(`npx supabase secrets set --project-ref <projecto> KANGEST_SINC_CHAVES='${JSON.stringify(chaves)}' KANGEST_DADOS_CHAVE='${dados}'`);
  console.log('\nPara as pessoas entrarem no KanGest com a conta do site (Loja online), a chave pública do site, a mesma do');
  console.log('navegador (não é segredo). Sem ela, usa-se a chave anon do projecto:\n');
  console.log('npx supabase secrets set --project-ref <projecto> KANGEST_CHAVE_PUBLICA_SITE="$(gh variable get VITE_SUPABASE_PUBLISHABLE_KEY)"');
}
