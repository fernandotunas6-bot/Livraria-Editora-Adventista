-- Códigos de Cliente (CLI-000000) e de Funcionário (FUN-000).
-- · Cada conta de cliente recebe CLI- ao ser criada; cada cliente que comprou sem conta recebe CLI-
--   a partir do email. Quando essa pessoa cria conta, fica com o mesmo código.
-- · Cada administrador ou gestor recebe FUN-.
-- · Os códigos de produto (stock_books.book_code) não mudam: continuam com o prefixo do tipo.

-- 1. Contadores -----------------------------------------------------------------
-- Reutiliza private.product_code_counters: os prefixos CLI- e FUN- ficam ao lado dos de produto.
insert into private.product_code_counters (prefix, last_value)
values ('CLI-', 0), ('FUN-', 0)
on conflict (prefix) do nothing;

create or replace function private.codigo_seguinte(p_prefix text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_numero integer;
begin
  insert into private.product_code_counters as c (prefix, last_value) values (p_prefix, 1)
  on conflict (prefix) do update set last_value = c.last_value + 1
  returning c.last_value into v_numero;
  return v_numero;
end;
$$;

create or replace function private.formata_codigo(p_prefix text, p_numero integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select p_prefix || lpad(p_numero::text, case when p_prefix = 'CLI-' then 6 else 3 end, '0');
$$;

revoke all on function private.codigo_seguinte(text) from public, anon, authenticated;
revoke all on function private.formata_codigo(text, integer) from public, anon, authenticated;

-- 2. Clientes sem conta -----------------------------------------------------------
-- Guarda o código de quem comprou só com email. Fica na base de dados, sem acesso pela API.
create table if not exists private.guest_customer_codes (
  email_normalizado text primary key check (email_normalizado = lower(btrim(email_normalizado))),
  customer_code text not null unique,
  created timestamptz not null default now()
);
alter table private.guest_customer_codes enable row level security;

-- Devolve o código do cliente pelo email: primeiro a conta, depois o mapeamento; se não existir, cria um.
create or replace function private.codigo_cliente_por_email(p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_codigo text;
begin
  if v_email = '' then
    return null;
  end if;

  select p.customer_code into v_codigo
  from public.profiles p
  where lower(btrim(coalesce(p.email, ''))) = v_email and p.customer_code is not null
  limit 1;
  if v_codigo is not null then
    return v_codigo;
  end if;

  select g.customer_code into v_codigo
  from private.guest_customer_codes g
  where g.email_normalizado = v_email;
  if v_codigo is null then
    v_codigo := private.formata_codigo('CLI-', private.codigo_seguinte('CLI-'));
    insert into private.guest_customer_codes (email_normalizado, customer_code)
    values (v_email, v_codigo)
    on conflict (email_normalizado) do nothing;
    select g.customer_code into v_codigo
    from private.guest_customer_codes g
    where g.email_normalizado = v_email;
  end if;
  return v_codigo;
end;
$$;

revoke all on function private.codigo_cliente_por_email(text) from public, anon, authenticated;

-- 3. Perfis -----------------------------------------------------------------------
alter table public.profiles
  add column if not exists customer_code text unique,
  add column if not exists staff_code text unique;

-- Antes de gravar: quem não é administrador não altera códigos nem papel; a conta nova entra como cliente;
-- depois atribui o código que faltar. O nome começa por "profiles_c" para correr antes de profiles_protect_privileges.
create or replace function public.profiles_codigos_pessoa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(new.email, '')));
  v_codigo text;
begin
  if auth.uid() is not null and not private.is_admin() then
    if tg_op = 'INSERT' then
      new.role := 'member';
      new.customer_code := null;
      new.staff_code := null;
    else
      new.role := old.role;
      new.customer_code := old.customer_code;
      new.staff_code := old.staff_code;
    end if;
  end if;

  -- Clientes: CLI-. Se a pessoa já tinha comprado sem conta, mantém o mesmo código.
  if new.role = 'member' and new.customer_code is null then
    v_codigo := null;
    if v_email <> '' then
      select g.customer_code into v_codigo
      from private.guest_customer_codes g
      where g.email_normalizado = v_email;
    end if;
    new.customer_code := coalesce(v_codigo, private.formata_codigo('CLI-', private.codigo_seguinte('CLI-')));
  end if;

  -- Equipa (administradores e gestores): FUN-. Quem deixa de ser equipa mantém o código.
  if new.role in ('admin', 'manager') and new.staff_code is null then
    new.staff_code := private.formata_codigo('FUN-', private.codigo_seguinte('FUN-'));
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_codigos_pessoa on public.profiles;
create trigger profiles_codigos_pessoa
  before insert or update on public.profiles
  for each row execute function public.profiles_codigos_pessoa();

-- 4. Encomendas -----------------------------------------------------------------
alter table public.orders add column if not exists customer_code text;
create index if not exists orders_customer_code_idx on public.orders (customer_code);

create or replace function public.orders_codigo_cliente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.customer_email is distinct from old.customer_email then
    new.customer_code := private.codigo_cliente_por_email(new.customer_email);
  end if;
  return new;
end;
$$;

drop trigger if exists orders_codigo_cliente on public.orders;
create trigger orders_codigo_cliente
  before insert or update of customer_email on public.orders
  for each row execute function public.orders_codigo_cliente();

-- 5. Pesquisa por código -----------------------------------------------------------
-- Aceita "cli12", "CLI-000012", " cli 000012 "; "fun3" e "FUN-003" encontram o mesmo.
create or replace function public.normalize_person_code(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when m is null or upper(m[1]) not in ('CLI', 'FUN') then upper(btrim(coalesce(p, '')))
    else upper(m[1]) || '-' || lpad(m[2], case when upper(m[1]) = 'CLI' then 6 else 3 end, '0')
  end
  from (select regexp_match(coalesce(p, ''), '^\s*([a-zA-Z]{3})[-\s]?0*([0-9]+)\s*$') as m) x;
$$;

-- 6. Listagem do módulo Utilizadores -----------------------------------------------
-- Igual à versão de 20261101164811, com customer_code e staff_code e pesquisa por código.
create or replace function public.admin_users_list(
  p_scope text default 'all',
  p_search text default '',
  p_status text default 'all',
  p_limit int default 25,
  p_offset int default 0
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with order_stats as (
    select lower(o.customer_email) as email,
           count(*)::int as orders_count,
           coalesce(sum(o.total), 0)::float8 as orders_total,
           max(o.created) as last_order_at,
           (array_agg(o.customer_name order by o.created desc))[1] as last_name,
           (array_agg(o.phone order by o.created desc))[1] as last_phone
    from public.orders o
    where coalesce(o.customer_email, '') <> ''
    group by 1
  ),
  accounts as (
    select p.id::text as id,
           true as has_account,
           lower(coalesce(nullif(u.email, ''), p.email, '')) as email,
           coalesce(p.name, '') as name,
           coalesce(p.phone, '') as phone,
           coalesce(p.role, 'member') as role,
           p.permissions,
           coalesce(p.avatar, '') as avatar,
           p.created,
           u.last_sign_in_at,
           u.email_confirmed_at is not null as email_confirmed,
           (u.banned_until is not null and u.banned_until > now()) as suspended,
           coalesce((select array_agg(distinct i.provider) from auth.identities i where i.user_id = u.id), '{}'::text[]) as providers,
           coalesce(p.customer_code, '') as customer_code,
           coalesce(p.staff_code, '') as staff_code
    from public.profiles p
    join auth.users u on u.id = p.id
  ),
  guests as (
    select null::text, false, s.email, coalesce(s.last_name, ''), coalesce(s.last_phone, ''), 'guest', null::jsonb, '',
           null::timestamptz, null::timestamptz, false, false, '{}'::text[],
           coalesce(g.customer_code, '') as customer_code,
           ''::text as staff_code
    from order_stats s
    left join private.guest_customer_codes g on g.email_normalizado = lower(btrim(s.email))
    where not exists (select 1 from accounts a where a.email = s.email)
  ),
  everyone as (
    select * from accounts
    union all
    select * from guests
  ),
  enriched as (
    select e.*,
           coalesce(s.orders_count, 0) as orders_count,
           coalesce(s.orders_total, 0) as orders_total,
           s.last_order_at
    from everyone e
    left join order_stats s on s.email = e.email
  ),
  q as (
    select '%' || replace(replace(replace(coalesce(trim(p_search), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern,
           public.normalize_person_code(p_search) as codigo
  ),
  filtered as (
    select en.*
    from enriched en, q
    where (coalesce(p_scope, 'all') = 'all'
           or (p_scope = 'team' and en.role in ('admin', 'manager'))
           or (p_scope = 'customers' and en.role in ('member', 'guest')))
      and (coalesce(trim(p_search), '') = ''
           or en.email ilike q.pattern
           or en.name ilike q.pattern
           or en.phone ilike q.pattern
           or en.customer_code ilike q.pattern
           or en.staff_code ilike q.pattern
           or en.customer_code = q.codigo
           or en.staff_code = q.codigo)
      and (coalesce(p_status, 'all') = 'all'
           or (p_status = 'active' and en.has_account and not en.suspended)
           or (p_status = 'suspended' and en.suspended)
           or (p_status = 'guest' and not en.has_account)
           or (p_status = 'unconfirmed' and en.has_account and not en.email_confirmed)
           or (p_status = 'buyers' and en.orders_count > 0))
  ),
  page as (
    select * from filtered
    order by coalesce(last_order_at, created) desc nulls last, email
    limit greatest(1, least(coalesce(p_limit, 25), 100))
    offset greatest(0, coalesce(p_offset, 0))
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'items', coalesce((select jsonb_agg(to_jsonb(page) order by coalesce(page.last_order_at, page.created) desc nulls last, page.email) from page), '[]'::jsonb),
    'summary', jsonb_build_object(
      'team', (select count(*) from accounts where role in ('admin', 'manager')),
      'admins', (select count(*) from accounts where role = 'admin'),
      'customers', (select count(*) from accounts where role = 'member'),
      'guests', (select count(*) from guests),
      'suspended', (select count(*) from accounts where suspended),
      'buyers', (select count(*) from enriched where orders_count > 0)
    )
  );
$$;

revoke all on function public.admin_users_list(text, text, text, int, int) from public, anon, authenticated;
grant execute on function public.admin_users_list(text, text, text, int, int) to service_role;

-- 7. Dados que já existem ------------------------------------------------------------
-- Perfis: atribui o código que falta, pela ordem de criação (o trigger faz o trabalho).
do $$
declare
  r record;
begin
  for r in
    select p.id from public.profiles p
    where (p.role = 'member' and p.customer_code is null)
       or (p.role in ('admin', 'manager') and p.staff_code is null)
    order by p.created, p.id
  loop
    update public.profiles set role = role where id = r.id;
  end loop;
end;
$$;

-- Clientes sem conta: código pela ordem da primeira compra.
do $$
declare
  r record;
begin
  for r in
    select lower(btrim(o.customer_email)) as email
    from public.orders o
    where coalesce(btrim(o.customer_email), '') <> ''
    group by 1
    order by min(o.created), 1
  loop
    perform private.codigo_cliente_por_email(r.email);
  end loop;
end;
$$;

-- Encomendas: sem disparar os outros triggers (estado, stock, avisos), só o código do cliente.
alter table public.orders disable trigger user;
update public.orders
set customer_code = private.codigo_cliente_por_email(customer_email)
where coalesce(btrim(customer_email), '') <> '';
alter table public.orders enable trigger user;

comment on column public.profiles.customer_code is 'Código do cliente (CLI-000000). Fixo: quem deixa de ser cliente mantém o código.';
comment on column public.profiles.staff_code is 'Código do funcionário (FUN-000). Atribuído a administradores e gestores.';
comment on column public.orders.customer_code is 'Código do cliente que fez a encomenda (CLI-000000), pelo email. Preenchido por trigger.';
