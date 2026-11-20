// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Os ficheiros que ligam o site aos apps (docs/APPS.md):
//
//   node scripts/ligacoes-app.mjs <pasta do build>
//
// iPhone — <pasta>/.well-known/apple-app-site-association, com APPLE_TEAM_ID:
//  · applinks: as ligações do site (emails, WhatsApp, Mensagens) abrem no app, quando está
//    instalado, na página certa (app/web/src/components/NativeAppBridge.jsx);
//  · webcredentials: as palavras-passe guardadas no Safari para o site servem no app, e vice-versa.
//
// Android — <pasta>/.well-known/assetlinks.json, com ANDROID_CERT_SHA256 (as impressões SHA-256
// dos certificados que assinam o app, separadas por vírgulas: a da Play App Signing e a da chave de
// envio, na Play Console → Integridade da app):
//  · as mesmas ligações abrem no app (o AndroidManifest.xml pede a verificação: autoVerify);
//  · as palavras-passe guardadas no Chrome servem no app.
//
// As duas são variáveis do repositório no GitHub. Sem elas não se escreve o ficheiro e o deploy
// segue: o site funciona igual, só as ligações não abrem no app.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** O bundle ID do app iOS e o pacote do Android (app/mobile/capacitor.config.json). */
export const BUNDLE_ID = 'ao.livrariaadventista.app';

/** O Team ID da Apple: 10 letras maiúsculas e algarismos. */
export const teamIdValido = (teamId) => /^[A-Z0-9]{10}$/.test(String(teamId || '').trim());

/** O conteúdo do ficheiro, ou null com um Team ID inválido. */
export function associacaoApple(teamId) {
  const id = String(teamId || '').trim();
  if (!teamIdValido(id)) return null;
  const appId = `${id}.${BUNDLE_ID}`;
  return {
    applinks: {
      details: [
        {
          appIDs: [appId],
          // Todas as páginas, menos os ficheiros soltos do site (sitemap, manifesto, imagens):
          // esses abrem-se sempre no navegador.
          components: [
            { '/': '/*.xml', exclude: true },
            { '/': '/*.txt', exclude: true },
            { '/': '/*.webmanifest', exclude: true },
            { '/': '/icons/*', exclude: true },
            { '/': '/images/*', exclude: true },
            { '/': '/*' },
          ],
        },
      ],
    },
    webcredentials: { apps: [appId] },
  };
}

/** Uma impressão SHA-256 de certificado: 32 bytes em hexadecimal, separados por `:`. */
const IMPRESSAO = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

/** As impressões de ANDROID_CERT_SHA256, em maiúsculas; null se alguma estiver mal escrita. */
export function impressoesAndroid(texto) {
  const lista = String(texto || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (!lista.length || !lista.every((s) => IMPRESSAO.test(s))) return null;
  return [...new Set(lista)];
}

/** O assetlinks.json, ou null com as impressões inválidas. */
export function assetLinksAndroid(texto) {
  const sha256_cert_fingerprints = impressoesAndroid(texto);
  if (!sha256_cert_fingerprints) return null;
  return [{
    relation: ['delegate_permission/common.handle_all_urls', 'delegate_permission/common.get_login_creds'],
    target: { namespace: 'android_app', package_name: BUNDLE_ID, sha256_cert_fingerprints },
  }];
}

function escrever(pasta, nome, conteudo) {
  const destino = path.join(pasta, '.well-known');
  mkdirSync(destino, { recursive: true });
  writeFileSync(path.join(destino, nome), `${JSON.stringify(conteudo, null, 2)}\n`);
}

function main() {
  const [pasta] = process.argv.slice(2);
  if (!pasta) {
    console.error('uso: ligacoes-app.mjs <pasta do build>');
    process.exit(2);
  }
  let falhou = false;

  const teamId = process.env.APPLE_TEAM_ID || '';
  if (!teamId.trim()) {
    console.log('ligacoes-app: sem APPLE_TEAM_ID — as ligações do site não abrem no app iOS (docs/APPS.md).');
  } else {
    const apple = associacaoApple(teamId);
    if (!apple) {
      console.error(`ligacoes-app: APPLE_TEAM_ID inválido (${JSON.stringify(teamId)}); são 10 letras maiúsculas e algarismos.`);
      falhou = true;
    } else {
      escrever(pasta, 'apple-app-site-association', apple);
      console.log(`ligacoes-app: apple-app-site-association para ${teamId.trim()}.${BUNDLE_ID}`);
    }
  }

  const certificados = process.env.ANDROID_CERT_SHA256 || '';
  if (!certificados.trim()) {
    console.log('ligacoes-app: sem ANDROID_CERT_SHA256 — as ligações do site não abrem no app Android (docs/APPS.md).');
  } else {
    const android = assetLinksAndroid(certificados);
    if (!android) {
      console.error('ligacoes-app: ANDROID_CERT_SHA256 inválido; são impressões SHA-256 como AB:CD:…, separadas por vírgulas.');
      falhou = true;
    } else {
      escrever(pasta, 'assetlinks.json', android);
      console.log(`ligacoes-app: assetlinks.json com ${android[0].target.sha256_cert_fingerprints.length} certificado(s)`);
    }
  }

  if (falhou) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
