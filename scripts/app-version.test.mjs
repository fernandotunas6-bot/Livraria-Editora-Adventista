// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { appVersionPlugin, buildVersion, resolveCommit, versionFile } from './app-version.mjs';

const DATE = new Date('2026-11-08T14:32:05Z');

describe('buildVersion', () => {
  it('data do build e commit curto', () => {
    expect(buildVersion({ commit: 'AB12CD34EF56', date: DATE })).toBe('2026.11.08-ab12cd3');
  });

  it('sem commit, a hora do build (UTC)', () => {
    expect(buildVersion({ commit: '', date: DATE })).toBe('2026.11.08-1432');
    expect(buildVersion({ commit: 'não-é-sha', date: DATE })).toBe('2026.11.08-1432');
  });
});

describe('resolveCommit', () => {
  it('prefere o commit do GitHub Actions ou do Cloudflare Pages', () => {
    const run = vi.fn(() => 'ffffffffffffffffffffffffffffffffffffffff\n');
    expect(resolveCommit({ GITHUB_SHA: 'ABCDEF1234567' }, run)).toBe('abcdef1234567');
    expect(resolveCommit({ CF_PAGES_COMMIT_SHA: '1234567abc' }, run)).toBe('1234567abc');
    expect(run).not.toHaveBeenCalled();
  });

  it('senão o do git; sem git, vazio', () => {
    expect(resolveCommit({}, () => 'abc1234def\n')).toBe('abc1234def');
    expect(resolveCommit({}, () => { throw new Error('sem git'); })).toBe('');
    expect(resolveCommit({ GITHUB_SHA: 'lixo' }, () => 'também lixo')).toBe('');
  });
});

describe('appVersionPlugin', () => {
  it('define a versão no código e escreve o version.json', () => {
    const plugin = appVersionPlugin({ commit: 'ab12cd3ef', date: DATE });
    expect(plugin.config().define).toEqual({
      __APP_VERSION__: '"2026.11.08-ab12cd3"',
      __APP_BUILT_AT__: '"2026-11-08T14:32:05.000Z"',
    });
    const emitFile = vi.fn();
    plugin.generateBundle.call({ emitFile });
    expect(emitFile).toHaveBeenCalledWith({ type: 'asset', fileName: 'version.json', source: versionFile('2026.11.08-ab12cd3', '2026-11-08T14:32:05.000Z') });
    expect(JSON.parse(emitFile.mock.calls[0][0].source)).toEqual({ version: '2026.11.08-ab12cd3', built_at: '2026-11-08T14:32:05.000Z' });
  });

  it('o version.json nunca fica em cache (nem no Cloudflare nem no service worker)', () => {
    const headers = readFileSync(path.resolve(__dirname, '../app/web/public/_headers'), 'utf8');
    expect(headers).toMatch(/\/version\.json\s*\n\s*Cache-Control: no-store/);
    const sw = readFileSync(path.resolve(__dirname, '../app/web/public/sw.js'), 'utf8');
    expect(sw).toContain("url.pathname === '/version.json'");
  });
});
