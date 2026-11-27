-- Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
-- © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

-- O género do site a partir da família do artigo do KanGest (KANGEST ONE, integração total; docs/KANGEST-SINCRONIZACAO.md
-- §19). A mesma função da 20261127110000, com mais um campo nos livros que o posto manda: `genero`, o género do site
-- ligado à família do artigo (sinc/fichas.rs, `generos`).
--
-- Só muda um produto em «Catálogo Geral» (o género por omissão) ou sem género, e só para um género que o site já tenha:
-- o KanGest não cria categorias públicas novas. Tudo o resto fica como na 20261127110000.

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
  v_genero text;
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

    -- o género da família do artigo, só se o site já o tiver (o KanGest não cria categorias públicas novas)
    v_genero := left(btrim(regexp_replace(coalesce(i ->> 'genero', ''), '\s+', ' ', 'g')), 80);
    if v_genero <> '' and not exists (select 1 from public.stock_books g where g.genre = v_genero) then
      v_genero := '';
    end if;

    update public.stock_books b set
      author = case when btrim(coalesce(b.author, '')) = '' and v_autor <> '' then v_autor else b.author end,
      publisher = case when btrim(coalesce(b.publisher, '')) = '' and v_editora <> '' then v_editora else b.publisher end,
      language = case when btrim(coalesce(b.language, '')) = '' and v_idioma <> '' then v_idioma else b.language end,
      year = case when coalesce(b.year, 0) <= 0 and v_ano is not null then v_ano else b.year end,
      pages = case when coalesce(b.pages, 0) <= 0 and v_paginas is not null then v_paginas else b.pages end,
      isbn = case when btrim(coalesce(b.isbn, '')) = '' and v_isbn <> '' then v_isbn else b.isbn end,
      genre = case when (btrim(coalesce(b.genre, '')) = '' or b.genre = 'Catálogo Geral') and v_genero <> '' then v_genero else b.genre end
     where b.id = v_id
       and ((btrim(coalesce(b.author, '')) = '' and v_autor <> '')
         or (btrim(coalesce(b.publisher, '')) = '' and v_editora <> '')
         or (btrim(coalesce(b.language, '')) = '' and v_idioma <> '')
         or (coalesce(b.year, 0) <= 0 and v_ano is not null)
         or (coalesce(b.pages, 0) <= 0 and v_paginas is not null)
         or (btrim(coalesce(b.isbn, '')) = '' and v_isbn <> '')
         or ((btrim(coalesce(b.genre, '')) = '' or b.genre = 'Catálogo Geral') and v_genero <> '' and v_genero <> coalesce(b.genre, '')));
    v_out := v_out || jsonb_build_array(jsonb_build_object('artigo_id', i -> 'artigo_id', 'estado', 'feito'));
  end loop;
  return v_out;
end;
$$;
revoke all on function public.kangest_dados_dos_livros(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.kangest_dados_dos_livros(uuid, jsonb) to service_role;
