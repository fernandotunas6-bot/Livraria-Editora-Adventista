// A versão do site em cada publicação.
//
// O site muda várias vezes por dia, mas quem tem a app aberta no telemóvel — ou a deixou em
// segundo plano, que no telemóvel é o normal — continua com a versão que carregou: o HTML só
// volta a ser pedido quando a app abre de novo. Para a app saber que já há uma versão nova e
// oferecer "Actualizar", cada build:
//
// - embute a sua versão no código (`__APP_VERSION__`), e
// - publica-a em `/version.json`, que a app aberta lê de tempos a tempos (lib/appVersion.js).
//
// A versão é a data do build (UTC) e o commit: `2026.11.08-ab12cd3`. Dois builds do mesmo
// commit dão a mesma versão (é o mesmo código); sem git, fica a hora do build no lugar do commit.
import { execSync } from 'node:child_process';

/** O commit do build: o do GitHub Actions ou do Cloudflare Pages, ou o do git local. */
export function resolveCommit(env = process.env, run = (cmd) => execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString()) {
  const fromEnv = env.GITHUB_SHA || env.CF_PAGES_COMMIT_SHA || '';
  if (/^[0-9a-f]{7,40}$/i.test(fromEnv)) return fromEnv.toLowerCase();
  try {
    const sha = run('git rev-parse HEAD').trim();
    return /^[0-9a-f]{7,40}$/i.test(sha) ? sha.toLowerCase() : '';
  } catch {
    return '';
  }
}

/** `2026.11.08-ab12cd3`, ou `2026.11.08-1432` (hora UTC) sem commit. */
export function buildVersion({ commit = '', date = new Date() } = {}) {
  const iso = date.toISOString();
  const day = iso.slice(0, 10).replace(/-/g, '.');
  const short = String(commit || '').slice(0, 7).toLowerCase();
  return /^[0-9a-f]{7}$/.test(short) ? `${day}-${short}` : `${day}-${iso.slice(11, 13)}${iso.slice(14, 16)}`;
}

/** Conteúdo do /version.json. */
export function versionFile(version, builtAt) {
  return `${JSON.stringify({ version, built_at: builtAt })}\n`;
}

/**
 * Plugin do Vite: define `__APP_VERSION__` e `__APP_BUILT_AT__` e escreve `version.json` na
 * raiz do build. Em desenvolvimento não há `version.json` e a app não procura versões novas.
 */
export function appVersionPlugin({ commit = resolveCommit(), date = new Date() } = {}) {
  const version = buildVersion({ commit, date });
  const builtAt = date.toISOString();
  return {
    name: 'livraria-app-version',
    config() {
      return {
        define: {
          __APP_VERSION__: JSON.stringify(version),
          __APP_BUILT_AT__: JSON.stringify(builtAt),
        },
      };
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: versionFile(version, builtAt) });
    },
  };
}
