-- Sinais em tempo real afinados (2026-11-08).
--
-- O sinal «catalogo» (migração sinais_em_tempo_real) saía em cada actualização de
-- public.stock_books, também na de increment_book_views, que conta as visitas: cada visita a um
-- livro fazia todos os painéis abertos voltar a pedir o catálogo. Com muitas visitas, o painel
-- passava o tempo a recarregar. Agora uma actualização só dá sinal quando muda alguma coisa além
-- das visitas (views_count) e da data de alteração (updated). Criar e apagar produtos dão sinal
-- como antes, um por instrução.
--
-- Reverter: drop do gatilho stock_books_update_realtime_signal e da função
-- private.catalog_update_realtime_signal; repor o gatilho stock_books_realtime_signal da migração
-- sinais_em_tempo_real (after insert or update or delete).

drop trigger if exists stock_books_realtime_signal on public.stock_books;
create trigger stock_books_realtime_signal
  after insert or delete on public.stock_books
  for each statement execute function private.catalog_realtime_signal();

-- As linhas antes e depois da instrução (tabelas de transição): há sinal se alguma linha nova não
-- for igual a uma velha, tirando as visitas e a data de alteração.
create or replace function private.catalog_update_realtime_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select to_jsonb(n) - 'views_count' - 'updated' from novos n
    except
    select to_jsonb(v) - 'views_count' - 'updated' from velhos v
  ) then
    perform private.realtime_signal('painel', 'catalogo');
  end if;
  return null;
end;
$$;
revoke all on function private.catalog_update_realtime_signal() from public, anon, authenticated;

drop trigger if exists stock_books_update_realtime_signal on public.stock_books;
create trigger stock_books_update_realtime_signal
  after update on public.stock_books
  referencing old table as velhos new table as novos
  for each statement execute function private.catalog_update_realtime_signal();
