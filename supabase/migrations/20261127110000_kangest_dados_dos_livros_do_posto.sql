-- Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
-- © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

-- Os dados das fichas do KanGest nos produtos do site que não os têm (KANGEST ONE, integração total;
-- docs/KANGEST-SINCRONIZACAO.md §19). O sentido contrário da 20261127100000: lá os dados dos livros do site vão para as
-- fichas dos artigos, aqui o autor, a editora, o idioma, o ano, as páginas e o ISBN das fichas completam os produtos.
--
-- A Edge Function chama-a depois de receber o lote, com o que o posto mandou no campo `livros` (já limpo em
-- kangestSinc.ts, `limparLivrosKanGest`). Só o posto que manda no catálogo; o produto encontra-se pela referência
-- (`kigest_ref`). Nunca se substitui o que lá está: só se preenche o que está vazio (o ano e as páginas a 0 contam como
-- vazios), e o ISBN só se nenhum outro produto o tiver. A resposta, por livro: feito, sem_produto ou recusado.

create or replace function public.kangest_dados_dos_livros(p_posto uuid, p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_posto record;
  i jsonb;
  v_ref text;
  v_id text;
  v_autor text;
  v_editora text;
  v_idioma text;
  v_ano integer;
  v_paginas integer;
  v_isbn text;
  v_out jsonb := '[]'::jsonb;
begin
  select id, estado, manda_catalogo into v_posto from public.kangest_postos where id = p_posto;
  if v_posto.id is null or v_posto.estado <> 'activo' then
    raise exception 'Posto desconhecido ou revogado.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_itens) is distinct from 'array' then
    raise exception 'Os livros têm de ser uma lista.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_itens) > 50 then
    raise exception 'No máximo 50 livros por volta.' using errcode = '22023';
  end if;

  for i in select value from jsonb_array_elements(p_itens) loop
    if not v_posto.manda_catalogo then
      v_out := v_out || jsonb_build_array(jsonb_build_object('artigo_id', i -> 'artigo_id', 'estado', 'recusado',
        'erro', 'Este KanGest não manda no catálogo do site (painel → Configurações → KanGest → Postos).'));
      continue;
    end if;
    v_ref := btrim(coalesce(i ->> 'referencia', ''));
    v_id := null;
    if v_ref <> '' then
      select b.id into v_id from public.stock_books b where b.kigest_ref = v_ref limit 1;
    end if;
    if v_id is null then
      v_out := v_out || jsonb_build_array(jsonb_build_object('artigo_id', i -> 'artigo_id', 'estado', 'sem_produto'));
      continue;
    end if;

    v_autor := left(btrim(regexp_replace(coalesce(i ->> 'autor', ''), '\s+', ' ', 'g')), 300);
    v_editora := left(btrim(regexp_replace(coalesce(i ->> 'editora', ''), '\s+', ' ', 'g')), 300);
    v_idioma := left(btrim(regexp_replace(coalesce(i ->> 'idioma', ''), '\s+', ' ', 'g')), 60);
    v_ano := case when coalesce(i ->> 'ano', '') ~ '^[0-9]{1,4}$' then (i ->> 'ano')::integer end;
    if v_ano is not null and (v_ano < 1 or v_ano > 3000) then
      v_ano := null;
    end if;
    v_paginas := case when coalesce(i ->> 'paginas', '') ~ '^[0-9]{1,6}$' then (i ->> 'paginas')::integer end;
    if v_paginas is not null and (v_paginas < 1 or v_paginas > 100000) then
      v_paginas := null;
    end if;
    -- o ISBN-13 (a Edge Function já conferiu o algarismo de controlo), e só se nenhum outro produto o tiver
    v_isbn := coalesce(i ->> 'isbn', '');
    if v_isbn !~ '^97[89][0-9]{10}$'
       or exists (select 1 from public.stock_books b
                   where b.id <> v_id and regexp_replace(coalesce(b.isbn, ''), '[^0-9Xx]', '', 'g') = v_isbn) then
      v_isbn := '';
    end if;

    update public.stock_books b set
      author = case when btrim(coalesce(b.author, '')) = '' and v_autor <> '' then v_autor else b.author end,
      publisher = case when btrim(coalesce(b.publisher, '')) = '' and v_editora <> '' then v_editora else b.publisher end,
      language = case when btrim(coalesce(b.language, '')) = '' and v_idioma <> '' then v_idioma else b.language end,
      year = case when coalesce(b.year, 0) <= 0 and v_ano is not null then v_ano else b.year end,
      pages = case when coalesce(b.pages, 0) <= 0 and v_paginas is not null then v_paginas else b.pages end,
      isbn = case when btrim(coalesce(b.isbn, '')) = '' and v_isbn <> '' then v_isbn else b.isbn end
     where b.id = v_id
       and ((btrim(coalesce(b.author, '')) = '' and v_autor <> '')
         or (btrim(coalesce(b.publisher, '')) = '' and v_editora <> '')
         or (btrim(coalesce(b.language, '')) = '' and v_idioma <> '')
         or (coalesce(b.year, 0) <= 0 and v_ano is not null)
         or (coalesce(b.pages, 0) <= 0 and v_paginas is not null)
         or (btrim(coalesce(b.isbn, '')) = '' and v_isbn <> ''));
    v_out := v_out || jsonb_build_array(jsonb_build_object('artigo_id', i -> 'artigo_id', 'estado', 'feito'));
  end loop;
  return v_out;
end;
$$;
revoke all on function public.kangest_dados_dos_livros(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.kangest_dados_dos_livros(uuid, jsonb) to service_role;
