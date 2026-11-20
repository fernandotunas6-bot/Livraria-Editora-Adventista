// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// CSP do site restrito ao projecto Supabase da loja.
//
// O `_headers` aceita ligações a `https://*.supabase.co`: qualquer projecto Supabase do mundo.
// Um script injectado podia mandar sessões ou dados para um projecto do atacante, e o CSP
// deixava. No build, os curingas passam a ser a origem de VITE_SUPABASE_URL (a única com que o
// site fala). Sem a variável, ou com um valor estranho, o ficheiro fica como está: um CSP
// errado parte o site em silêncio, e um curinga a mais não parte nada.
import fs from 'node:fs';
import path from 'node:path';

/** Origem https do projecto, ou null. */
export function supabaseOrigin(url) {
  try {
    const u = new URL(String(url || ''));
    if (u.protocol !== 'https:' || !u.hostname || u.username || u.password) return null;
    return u.origin;
  } catch {
    return null;
  }
}

export function tightenSupabaseCsp(headersText, url) {
  const origin = supabaseOrigin(url);
  if (!origin) return headersText;
  const host = new URL(origin).host;
  return String(headersText)
    .replaceAll('wss://*.supabase.co', `wss://${host}`)
    .replaceAll('https://*.supabase.co', origin);
}

/** Plugin do Vite: reescreve o `_headers` já copiado para a pasta do build. */
export function supabaseCspPlugin(url) {
  let outDir = '';
  return {
    name: 'csp-supabase',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const file = path.join(outDir, '_headers');
      if (!fs.existsSync(file)) return;
      const before = fs.readFileSync(file, 'utf8');
      const after = tightenSupabaseCsp(before, url);
      if (after !== before) {
        fs.writeFileSync(file, after);
        console.log(`CSP: ligações ao Supabase restritas a ${supabaseOrigin(url)}`);
      } else {
        console.log('CSP: sem VITE_SUPABASE_URL válido, o _headers fica com *.supabase.co');
      }
    },
  };
}
