// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { ordersWithBookQuery } from './bookOrders';

const client = createClient('https://exemplo.supabase.co', 'sb_publishable_teste', { auth: { persistSession: false } });

describe('ordersWithBookQuery', () => {
  it('filtra o jsonb dos itens com JSON, não com um array do Postgres', () => {
    const query = ordersWithBookQuery(client, 'livro-1');
    expect(query.url.searchParams.get('items')).toBe('cs.[{"book_id":"livro-1"}]');
    expect(query.url.searchParams.get('items')).not.toContain('[object Object]');
  });

  it('só conta (HEAD com count exacto), sem descarregar encomendas', () => {
    const query = ordersWithBookQuery(client, 'livro-1');
    expect(query.method).toBe('HEAD');
    expect(query.url.pathname).toBe('/rest/v1/orders');
    expect(query.url.searchParams.get('select')).toBe('id');
  });

  it('um id com aspas não parte o JSON', () => {
    const query = ordersWithBookQuery(client, 'a"b');
    expect(JSON.parse(query.url.searchParams.get('items').slice(3))).toEqual([{ book_id: 'a"b' }]);
  });
});
