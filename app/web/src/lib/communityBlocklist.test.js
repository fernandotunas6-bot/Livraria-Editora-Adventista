// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BLOCKED_ADULT, BLOCKED_MALICIOUS, BLOCKED_SHORTENERS } from './communityBlocklist';

const SQL = readFileSync(fileURLToPath(new URL('../../../../supabase/migrations/20261106220000_comunidade_links_seguros.sql', import.meta.url)), 'utf8');

/** Domínios que a migração põe na lista de origem, por categoria. */
function seeded(category) {
  const block = SQL.match(new RegExp(`select d, '${category}', 'lista'[\\s\\S]*?array\\[([\\s\\S]*?)\\]\\) d`))?.[1] || '';
  return [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe('lista de origem dos sites bloqueados', () => {
  it('é a mesma no site e na migração', () => {
    expect(seeded('adulto')).toEqual(BLOCKED_ADULT);
    expect(seeded('encurtador')).toEqual(BLOCKED_SHORTENERS);
    expect(seeded('malicioso')).toEqual(BLOCKED_MALICIOUS);
  });

  it('não bloqueia sites de uso comum', () => {
    const all = new Set([...BLOCKED_ADULT, ...BLOCKED_SHORTENERS, ...BLOCKED_MALICIOUS]);
    for (const ok of ['youtu.be', 'wa.me', 'youtube.com', 'facebook.com', 'instagram.com', 'adventistas.org', 'google.com']) {
      expect(all.has(ok)).toBe(false);
    }
  });
});
