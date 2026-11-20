-- Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
-- © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

-- Testes de segurança da lista de desejos (security_spec.md, secção 2, casos 01–12).
--
-- Corre no SQL Editor do Supabase. Faz as tentativas como o cliente A (o primeiro
-- utilizador), contra a lista do cliente B (o segundo), e depois como visitante anónimo.
-- NÃO GRAVA NADA: termina com `raise exception 'RESULTADO …'`, que anula a transacção
-- inteira. O resultado de cada caso aparece na mensagem do erro.
--
-- Esperado: 01 permitido; 02, 05, 06, 07 e 11 negados; 03, 04, 08, 09, 10 e 12 com 0 linhas.
do $teste$
declare
  a uuid; b uuid; livro text; r text := ''; n int;
begin
  select id into a from auth.users order by created_at limit 1;
  select id into b from auth.users where id <> a order by created_at limit 1;
  select id into livro from public.stock_books where active order by id limit 1;
  if a is null or b is null or livro is null then raise exception 'RESULTADO faltam dados de teste'; end if;

  -- Como o cliente A, com sessão.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  begin insert into public.wishlists (user_id, book_id) values (a, livro); r := r || '01 A guarda o seu: permitido | ';
  exception when others then r := r || '01 A guarda o seu: NEGADO ' || sqlstate || ' | '; end;

  begin insert into public.wishlists (user_id, book_id) values (b, livro); r := r || '02 A escreve na lista de B: PERMITIDO | ';
  exception when others then r := r || '02 A escreve na lista de B: negado ' || sqlstate || ' | '; end;

  select count(*) into n from public.wishlists where user_id = b; r := r || '03 A lê a lista de B: ' || n || ' linhas | ';
  select count(*) into n from public.wishlists where user_id <> a; r := r || '04 A lê tudo, linhas de outros: ' || n || ' | ';

  begin insert into public.wishlists (user_id, book_id) values (a, '../../etc/passwd'); r := r || '05 livro inexistente: PERMITIDO | ';
  exception when others then r := r || '05 livro inexistente: negado ' || sqlstate || ' | '; end;

  begin insert into public.wishlists (user_id, book_id) values (a, repeat('x', 1000000)); r := r || '06 id de 1 MB: PERMITIDO | ';
  exception when others then r := r || '06 id de 1 MB: negado ' || sqlstate || ' | '; end;

  begin insert into public.wishlists (user_id) values (a); r := r || '07 sem livro: PERMITIDO | ';
  exception when others then r := r || '07 sem livro: negado ' || sqlstate || ' | '; end;

  update public.wishlists set book_id = book_id where user_id = a; get diagnostics n = row_count;
  r := r || '08 A altera o seu: ' || n || ' linhas | ';

  update public.wishlists set user_id = a where user_id = b; get diagnostics n = row_count;
  r := r || '09 A apropria-se das linhas de B: ' || n || ' linhas | ';

  delete from public.wishlists where user_id = b; get diagnostics n = row_count;
  r := r || '10 A apaga a lista de B: ' || n || ' linhas | ';

  -- Como visitante anónimo.
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  begin insert into public.wishlists (user_id, book_id) values (a, livro); r := r || '11 anónimo escreve: PERMITIDO | ';
  exception when others then r := r || '11 anónimo escreve: negado ' || sqlstate || ' | '; end;
  select count(*) into n from public.wishlists; r := r || '12 anónimo lê: ' || n || ' linhas';

  raise exception 'RESULTADO %', r;
end
$teste$;
