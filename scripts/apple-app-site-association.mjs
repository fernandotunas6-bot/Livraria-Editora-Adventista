// O ficheiro que liga o site ao app iOS (docs/APP_IOS.md):
//
//   node scripts/apple-app-site-association.mjs <pasta do build>
//
// Escreve <pasta>/.well-known/apple-app-site-association com:
//  · applinks: as ligações do site (emails, WhatsApp, Mensagens) abrem no app, quando está
//    instalado, na página certa (app/web/src/components/NativeAppBridge.jsx);
//  · webcredentials: as palavras-passe guardadas no Safari para o site servem no app, e vice-versa.
//
// Precisa do Team ID da conta Apple Developer em APPLE_TEAM_ID (variável do repositório no
// GitHub). Sem ele não escreve nada e o deploy segue: o site funciona igual, só as ligações não
// abrem no app.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** O bundle ID do app (app/ios/capacitor.config.json e o projecto Xcode). */
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

function main() {
  const [pasta] = process.argv.slice(2);
  if (!pasta) {
    console.error('uso: apple-app-site-association.mjs <pasta do build>');
    process.exit(2);
  }
  const teamId = process.env.APPLE_TEAM_ID || '';
  if (!teamId.trim()) {
    console.log('apple-app-site-association: sem APPLE_TEAM_ID — as ligações do site não abrem no app (docs/APP_IOS.md).');
    return;
  }
  const conteudo = associacaoApple(teamId);
  if (!conteudo) {
    console.error(`apple-app-site-association: APPLE_TEAM_ID inválido (${JSON.stringify(teamId)}); são 10 letras maiúsculas e algarismos.`);
    process.exit(1);
  }
  const destino = path.join(pasta, '.well-known');
  mkdirSync(destino, { recursive: true });
  writeFileSync(path.join(destino, 'apple-app-site-association'), `${JSON.stringify(conteudo, null, 2)}\n`);
  console.log(`apple-app-site-association: escrito para ${teamId.trim()}.${BUNDLE_ID}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
