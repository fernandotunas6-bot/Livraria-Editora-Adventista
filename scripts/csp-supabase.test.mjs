// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { supabaseOrigin, tightenSupabaseCsp } from './csp-supabase.mjs';

const headers = readFileSync(path.resolve(__dirname, '../app/web/public/_headers'), 'utf8');
const PROJECT = 'https://bggqkjjqbjhbjsckzopj.supabase.co';

describe('tightenSupabaseCsp', () => {
  it('troca os curingas pela origem do projecto, em connect-src e media-src', () => {
    const out = tightenSupabaseCsp(headers, `${PROJECT}/`);
    expect(out).not.toContain('*.supabase.co');
    expect(out).toContain(`connect-src 'self' ${PROJECT} wss://bggqkjjqbjhbjsckzopj.supabase.co`);
    expect(out).toContain(`media-src 'self' ${PROJECT}`);
  });

  it('não mexe em mais nada do ficheiro', () => {
    const out = tightenSupabaseCsp(headers, PROJECT);
    const strip = (t) => t.replaceAll(PROJECT, 'X').replaceAll('wss://bggqkjjqbjhbjsckzopj.supabase.co', 'W');
    expect(strip(out)).toBe(headers.replaceAll('https://*.supabase.co', 'X').replaceAll('wss://*.supabase.co', 'W'));
  });

  it('sem URL válido, deixa o ficheiro como está', () => {
    for (const bad of ['', undefined, 'http://inseguro.supabase.co', 'não é url', 'https://u:p@x.supabase.co']) {
      expect(tightenSupabaseCsp(headers, bad), String(bad)).toBe(headers);
    }
    expect(supabaseOrigin('https://x.supabase.co/rest/v1')).toBe('https://x.supabase.co');
  });

  it('o _headers publicado ainda tem os curingas que o build substitui', () => {
    expect(headers).toContain('https://*.supabase.co');
    expect(headers).toContain('wss://*.supabase.co');
  });
});
