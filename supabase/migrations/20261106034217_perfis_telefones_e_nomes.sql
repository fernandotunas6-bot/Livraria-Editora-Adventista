-- Dados fidedignos nos perfis e nas encomendas.
-- · Telefone no formato +244 XXX XXX XXX, com a mesma regra de app/web/src/lib/angolaPhone.js.
--   Números incompletos ficam como estão (são assinalados na ficha do utilizador, não se inventam dígitos).
-- · Nome vazio num perfil passa a ser o nome mais recente usado numa encomenda com o mesmo email.

-- 1. Normalização do telefone (igual a normalizeAngolaPhone em JS) ------------------------
create or replace function public.normalize_angola_phone(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p is null then null
    when length(local9) = 9 then '+244 ' || substr(local9, 1, 3) || ' ' || substr(local9, 4, 3) || ' ' || substr(local9, 7, 3)
    else btrim(p)
  end
  from (
    select left(
             case when left(d2, 1) = '0' then substr(d2, 2) else d2 end,
             9) as local9
    from (
      select case when left(d, 3) = '244' then substr(d, 4) else d end as d2
      from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x
    ) y
  ) z;
$$;

-- 2. Encomendas e perfis: só o telefone (sem disparar os triggers de estado, stock e avisos) ---
alter table public.orders disable trigger user;
update public.orders
set phone = public.normalize_angola_phone(phone)
where public.normalize_angola_phone(phone) is distinct from phone
  and public.normalize_angola_phone(phone) ~ '^\+244 [0-9]{3} [0-9]{3} [0-9]{3}$';
alter table public.orders enable trigger user;

update public.profiles
set phone = public.normalize_angola_phone(phone)
where public.normalize_angola_phone(phone) is distinct from phone
  and public.normalize_angola_phone(phone) ~ '^\+244 [0-9]{3} [0-9]{3} [0-9]{3}$';

-- 3. Nome vazio: a partir da encomenda mais recente com o mesmo email ----------------------
update public.profiles p
set name = (
  select o.customer_name
  from public.orders o
  where lower(btrim(o.customer_email)) = lower(btrim(p.email))
    and btrim(coalesce(o.customer_name, '')) <> ''
  order by o.created desc
  limit 1
)
where btrim(coalesce(p.name, '')) = ''
  and exists (
    select 1 from public.orders o
    where lower(btrim(o.customer_email)) = lower(btrim(p.email))
      and btrim(coalesce(o.customer_name, '')) <> ''
  );
