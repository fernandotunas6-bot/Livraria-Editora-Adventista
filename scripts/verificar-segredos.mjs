#!/usr/bin/env node
// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.
// Procura credenciais nos ficheiros versionados antes de um PR ou de um deploy.
//
// Só padrões com prefixo próprio, que quase nunca aparecem por acaso: um verificador que
// grita com falsos positivos acaba desligado. Ficam de fora de propósito:
// - chaves `AIza…` da Google: a da Firebase Web está no código e é pública por desenho
//   (restringe-se por domínio na Google Cloud, não se esconde);
// - a chave publishable do Supabase (`sb_publishable_…`) e o JWT `anon`: vão no bundle.
// Um JWT só é segredo se o papel for `service_role`, por isso esse é descodificado e lido.
//
// Uso: node scripts/verificar-segredos.mjs        (sai com 1 se encontrar algo)
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const RULES = [
  { name: 'Chave secreta do Supabase', re: /\bsb_secret_[A-Za-z0-9_-]{20,}/g },
  { name: 'Chave privada', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g },
  { name: 'Token do GitHub', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})/g },
  { name: 'Chave da AWS', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'Chave secreta Stripe', re: /\b[sr]k_live_[0-9A-Za-z]{20,}/g },
  { name: 'Chave SendGrid', re: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g },
  { name: 'Segredo OAuth da Google', re: /\bGOCSPX-[A-Za-z0-9_-]{20,}/g },
  { name: 'Token do Slack', re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/g },
  { name: 'Chave de API (sk-)', re: /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{32,}/g },
];

const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g;

function jwtRole(payload) {
  try {
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(json)?.role || '';
  } catch {
    return '';
  }
}

/** Devolve os achados num texto: { rule, line, preview } — o valor nunca sai inteiro. */
export function findSecrets(text) {
  const found = [];
  const lineOf = (index) => text.slice(0, index).split('\n').length;
  const mask = (value) => `${value.slice(0, 6)}…(${value.length} caracteres)`;
  for (const { name, re } of RULES) {
    for (const m of text.matchAll(re)) found.push({ rule: name, line: lineOf(m.index), preview: mask(m[0]) });
  }
  for (const m of text.matchAll(JWT)) {
    if (jwtRole(m[1]) === 'service_role') {
      found.push({ rule: 'JWT service_role do Supabase', line: lineOf(m.index), preview: mask(m[0]) });
    }
  }
  return found;
}

const BINARY = /\.(png|jpe?g|gif|webp|ico|svg|pdf|zip|woff2?|ttf|otf|mp4|webm|mp3)$/i;
const MAX_BYTES = 2_000_000;

function main() {
  const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  const problems = [];
  for (const file of files) {
    if (BINARY.test(file) || file.endsWith('package-lock.json')) continue;
    let size = 0;
    try { size = statSync(file).size; } catch { continue; }
    if (size > MAX_BYTES) continue;
    for (const hit of findSecrets(readFileSync(file, 'utf8'))) problems.push({ file, ...hit });
  }
  if (!problems.length) {
    console.log(`Segredos: nada encontrado em ${files.length} ficheiros versionados.`);
    return;
  }
  console.error('Possíveis credenciais em ficheiros versionados:');
  for (const p of problems) console.error(`  ${p.file}:${p.line}  ${p.rule}  ${p.preview}`);
  console.error('\nRetire-as do código e revogue-as no fornecedor: o que entrou no git fica no histórico.');
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();
