// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADMIN_GROUPS } from '@/lib/adminSections';
import { DEFAULT_PERMISSIONS, MANAGER_PERMISSIONS, PERMISSIONS, getUserPermissions } from '@/lib/permissions';

// As chaves das permissões vivem em três sítios: aqui (o painel), na Edge Function
// (supabase/functions/app/permissions.ts) e na base de dados (private.permission_keys, a última
// migração que a define). Uma chave que falte num deles é apagada ao gravar um gestor por esse
// caminho — foi o que aconteceria a «Ver relatórios» sem este teste.
// A raiz do repositório: a primeira pasta acima de onde o vitest corre que tenha supabase/.
const findRoot = (dir) => (existsSync(join(dir, 'supabase', 'migrations')) || dirname(dir) === dir ? dir : findRoot(dirname(dir)));
const root = findRoot(resolve(process.cwd()));
const read = (path) => readFileSync(join(root, path), 'utf8');

const keys = Object.keys(PERMISSIONS).sort();

describe('as três listas de permissões batem certo', () => {
  it('a Edge Function conhece as mesmas chaves', () => {
    const src = read('supabase/functions/app/permissions.ts');
    const block = src.slice(src.indexOf('export const PERMISSION_KEYS'), src.indexOf('];', src.indexOf('export const PERMISSION_KEYS')));
    const edge = [...block.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]).sort();
    expect(edge).toEqual(keys);
  });

  it('a base de dados (a última private.permission_keys) conhece as mesmas chaves', () => {
    const dir = join(root, 'supabase', 'migrations');
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    const last = files.filter((f) => read(`supabase/migrations/${f}`).includes('function private.permission_keys()')).pop();
    expect(last, 'nenhuma migração define private.permission_keys').toBeTruthy();
    const sql = read(`supabase/migrations/${last}`);
    const body = sql.slice(sql.indexOf('function private.permission_keys()'));
    const arr = body.slice(body.indexOf('array['), body.indexOf(']', body.indexOf('array[')));
    const db = [...arr.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(db).toEqual(keys);
  });

  it('as listas de omissão têm todas as chaves', () => {
    expect(Object.keys(DEFAULT_PERMISSIONS).sort()).toEqual(keys);
    expect(Object.keys(MANAGER_PERMISSIONS).sort()).toEqual(keys);
  });

  it('cada permissão mora numa área do painel', () => {
    const areas = ADMIN_GROUPS.map((g) => g.id);
    for (const [key, p] of Object.entries(PERMISSIONS)) expect(areas, key).toContain(p.area);
  });
});

describe('getUserPermissions', () => {
  it('«Ver relatórios» é uma permissão do gestor como as outras', () => {
    expect(getUserPermissions({ role: 'manager', permissions: { view_reports: true } }).view_reports).toBe(true);
    expect(getUserPermissions({ role: 'manager', permissions: { manage_orders: true } }).view_reports).toBe(false);
    expect(getUserPermissions({ role: 'admin' }).view_reports).toBe(true);
  });

  it('produção, funcionários e finanças: só o administrador as tem sem as receber', () => {
    expect(getUserPermissions({ role: 'admin' })).toMatchObject({ manage_production: true, manage_staff: true, manage_finance: true });
    expect(getUserPermissions({ role: 'manager', permissions: { manage_production: true } }))
      .toMatchObject({ manage_production: true, manage_staff: false, manage_finance: false });
    expect(getUserPermissions({ role: 'member', permissions: { manage_finance: true } }).manage_finance).toBe(false);
  });
});
