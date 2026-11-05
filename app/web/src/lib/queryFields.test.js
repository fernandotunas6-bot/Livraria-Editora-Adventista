// @vitest-environment node
/**
 * Cada `.from('tabela').select('campos')` com campos escritos à mão tem de pedir colunas que
 * as migrações criam. Um campo a mais faz o PostgREST responder 400 — foi assim que o
 * separador Atendimento da equipa ficou inteiro em erro (pedia `href` a staff_notifications,
 * que não tem essa coluna; auditoria, 9.7). O CI não tem base de dados, por isso as colunas
 * saem das próprias migrações.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const MIGRATIONS = path.join(ROOT, 'supabase/migrations');
const SOURCES = [path.join(ROOT, 'app/web/src'), path.join(ROOT, 'supabase/functions')];
const NOT_COLUMNS = new Set(['constraint', 'primary', 'unique', 'check', 'foreign', 'exclude', 'like']);

/** Colunas de cada tabela, pela ordem das migrações (create, add, rename, drop). */
export function columnsFromMigrations(files) {
  const cols = new Map();
  const set = (t) => { if (!cols.has(t)) cols.set(t, new Set()); return cols.get(t); };
  for (const sql of files) {
    for (const m of sql.matchAll(/create table (?:if not exists )?(?:public\.)?"?(\w+)"?\s*\(([\s\S]*?)\n\);/gi)) {
      const t = set(m[1]);
      for (const line of m[2].split('\n')) {
        const c = line.trim().match(/^"?([a-z_][a-z0-9_]*)"?\s+[a-z]/i);
        if (c && !NOT_COLUMNS.has(c[1].toLowerCase())) t.add(c[1]);
      }
    }
    for (const m of sql.matchAll(/alter table (?:if exists )?(?:only )?(?:public\.)?(\w+)\s+((?:add column[\s\S]*?)+);/gi)) {
      for (const c of m[2].matchAll(/add column (?:if not exists )?"?(\w+)"?/gi)) set(m[1]).add(c[1]);
    }
    for (const m of sql.matchAll(/alter table (?:if exists )?(?:public\.)?(\w+)\s+rename column (\w+) to (\w+)/gi)) {
      set(m[1]).delete(m[2]); set(m[1]).add(m[3]);
    }
    for (const m of sql.matchAll(/alter table (?:if exists )?(?:public\.)?(\w+)\s+drop column (?:if exists )?(\w+)/gi)) {
      set(m[1]).delete(m[2]);
    }
  }
  return cols;
}

/** Pares [tabela, campos] das consultas com campos explícitos num ficheiro. */
export function selectsIn(code) {
  const consts = Object.fromEntries([...code.matchAll(/const (\w+)\s*=\s*'([^']*)'/g)].map((m) => [m[1], m[2]]));
  const out = [];
  for (const m of code.matchAll(/\.from\(\s*'(\w+)'\s*\)\s*\.select\(\s*(?:'([^']*)'|`([^`$]*)`|([A-Z_]+))/g)) {
    const fields = m[2] ?? m[3] ?? consts[m[4]] ?? '';
    if (fields.trim() && fields.trim() !== '*') out.push([m[1], fields]);
  }
  return out;
}

/** Colunas pedidas, sem relações embutidas `x(...)`, aliases `a:b` nem conversões `::`. */
export function plainColumns(fields) {
  return fields
    .replace(/\w+(?::\w+)?(?:!\w+)?\s*\([^()]*\)/g, '')
    .split(',')
    .map((f) => f.trim().split(':').pop().split('->')[0].trim())
    .filter((f) => f && f !== '*');
}

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = path.join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

describe('consultas com campos explícitos', () => {
  const migrations = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
    .map((f) => readFileSync(path.join(MIGRATIONS, f), 'utf8'));
  const cols = columnsFromMigrations(migrations);
  const files = SOURCES.flatMap(walk).filter((f) => /\.(js|jsx|ts)$/.test(f) && !/\.test\./.test(f));
  const queries = files.flatMap((f) => selectsIn(readFileSync(f, 'utf8')).map(([t, fields]) => ({ f: path.relative(ROOT, f), t, fields })));

  it('encontra as consultas (o analisador não ficou cego)', () => {
    expect(queries.length).toBeGreaterThan(10);
    expect(queries.some((q) => q.t === 'staff_notifications')).toBe(true);
  });

  it('só pedem colunas que existem', () => {
    const missing = [];
    for (const { f, t, fields } of queries) {
      if (!cols.has(t)) { missing.push(`${t} (tabela desconhecida) em ${f}`); continue; }
      for (const c of plainColumns(fields)) if (!cols.get(t).has(c)) missing.push(`${t}.${c} em ${f}`);
    }
    expect(missing).toEqual([]);
  });

  it('apanharia o erro do href na staff_notifications', () => {
    expect(cols.get('staff_notifications').has('href')).toBe(false);
    expect(cols.get('customer_notifications').has('href')).toBe(true);
  });
});

describe('analisador', () => {
  it('lê create, add, rename e drop column', () => {
    const c = columnsFromMigrations([
      'create table public.t (\n  id bigint primary key,\n  a text,\n  constraint x check (true)\n);',
      'alter table public.t add column if not exists b int, add column c int;',
      'alter table public.t rename column a to a2;',
      'alter table public.t drop column if exists c;',
    ]).get('t');
    expect([...c].sort()).toEqual(['a2', 'b', 'id']);
  });

  it('ignora relações embutidas e aliases', () => {
    expect(plainColumns('id, nome:name, autor:profiles(name, email), total')).toEqual(['id', 'name', 'total']);
  });
});
