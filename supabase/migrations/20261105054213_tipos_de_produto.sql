-- O catálogo deixa de ser só de livros: cada produto tem um tipo, e o código (book_code) passa
-- a ter o prefixo do tipo, com a sua própria contagem: LIV-101, BIB-001, UNI-004…
-- O nome da tabela (stock_books) e da coluna (book_code) ficam, para não partir o resto.

alter table public.stock_books
  add column if not exists product_type text not null default 'livro';

alter table public.stock_books
  drop constraint if exists stock_books_product_type_check;
alter table public.stock_books
  add constraint stock_books_product_type_check check (product_type in (
    'livro', 'biblia', 'revista', 'papelaria', 'musica', 'vestuario', 'uniforme', 'didatico', 'desbravadores'
  ));

create index if not exists stock_books_product_type_idx on public.stock_books (product_type) where active;

-- Prefixo de cada tipo. Os livros continuam com o prefixo configurável em site_settings.book_code_prefix.
create or replace function public.product_code_prefix(p_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'biblia' then 'BIB-'
    when 'revista' then 'REV-'
    when 'papelaria' then 'MAT-'
    when 'musica' then 'MUS-'
    when 'vestuario' then 'VES-'
    when 'uniforme' then 'UNI-'
    when 'didatico' then 'DID-'
    when 'desbravadores' then 'DBV-'
    else 'LIV-'
  end;
$$;

-- Último número usado por prefixo. Começa no maior código que já existe.
create table if not exists private.product_code_counters (
  prefix text primary key,
  last_value integer not null default 0
);
alter table private.product_code_counters enable row level security;

insert into private.product_code_counters (prefix, last_value)
select p.prefix, coalesce(max(nullif(regexp_replace(substr(b.book_code, length(p.prefix) + 1), '\D', '', 'g'), '')::integer), 0)
from (values ('LIV-'), ('BIB-'), ('REV-'), ('MAT-'), ('MUS-'), ('VES-'), ('UNI-'), ('DID-'), ('DBV-'), ('COL-')) as p(prefix)
left join public.stock_books b on b.book_code like p.prefix || '%'
group by p.prefix
on conflict (prefix) do update set last_value = greatest(private.product_code_counters.last_value, excluded.last_value);

-- O prefixo configurado para livros também tem contador, se for outro.
insert into private.product_code_counters (prefix, last_value)
select s.book_code_prefix, greatest(
  (select last_value from private.product_code_counters where prefix = 'LIV-'),
  coalesce((select max(nullif(regexp_replace(substr(b.book_code, length(s.book_code_prefix) + 1), '\D', '', 'g'), '')::integer)
            from public.stock_books b where b.book_code like s.book_code_prefix || '%'), 0))
from public.site_settings s
where coalesce(s.book_code_prefix, '') not in ('', 'LIV-')
on conflict (prefix) do nothing;

create or replace function public.stock_books_before_save()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_prefix text;
  v_threshold int;
  v_code text;
  v_next int;
begin
  select nullif(s.book_code_prefix, ''), s.low_stock_threshold
    into v_prefix, v_threshold
  from public.site_settings s
  order by s.created asc, s.id desc
  limit 1;
  new.product_type := coalesce(nullif(btrim(new.product_type), ''), 'livro');
  v_prefix := case when new.product_type = 'livro' then coalesce(v_prefix, 'LIV-') else public.product_code_prefix(new.product_type) end;
  v_threshold := coalesce(v_threshold, 5);

  new.book_code := upper(btrim(coalesce(new.book_code, '')));
  if new.book_code = '' then
    loop
      insert into private.product_code_counters as c (prefix, last_value) values (v_prefix, 1)
      on conflict (prefix) do update set last_value = c.last_value + 1
      returning c.last_value into v_next;
      v_code := v_prefix || lpad(v_next::text, 3, '0');
      exit when not exists (select 1 from public.stock_books b where b.book_code = v_code);
    end loop;
    new.book_code := v_code;
  end if;
  if coalesce(new.sku, '') = '' then new.sku := new.book_code; end if;
  if coalesce(new.publisher, '') = '' then new.publisher := 'Livraria Adventista'; end if;
  if coalesce(new.language, '') = '' and new.product_type in ('livro', 'biblia', 'revista') then new.language := 'Português'; end if;
  if coalesce(new.price, 0) < 0 then new.price := 0; end if;
  if coalesce(new.stock, 0) < 0 then new.stock := 0; end if;
  new.cover := public.normalize_drive_url(new.cover);
  new.author_photo := public.normalize_drive_url(new.author_photo);
  if coalesce(new.stock, 0) <= 0 then
    new.stock_alert := true; new.stock_low := false;
  elsif new.stock <= v_threshold then
    new.stock_low := true; new.stock_alert := false;
  else
    new.stock_low := false; new.stock_alert := false;
  end if;
  return new;
end;
$function$;

-- Pesquisa por código sem distinguir maiúsculas: "liv-63", "LIV-063" e "liv063" encontram o mesmo.
create or replace function public.normalize_product_code(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p ~* '^\s*([a-z]{3})[-\s]?0*([0-9]+)\s*$'
      then upper(regexp_replace(p, '^\s*([a-zA-Z]{3})[-\s]?0*([0-9]+)\s*$', '\1')) || '-' ||
           lpad(regexp_replace(p, '^\s*([a-zA-Z]{3})[-\s]?0*([0-9]+)\s*$', '\2'), 3, '0')
    else upper(btrim(coalesce(p, '')))
  end;
$$;

comment on column public.stock_books.product_type is
  'Tipo de produto: livro, biblia, revista, papelaria, musica, vestuario, uniforme, didatico, desbravadores. Define o prefixo do código.';
