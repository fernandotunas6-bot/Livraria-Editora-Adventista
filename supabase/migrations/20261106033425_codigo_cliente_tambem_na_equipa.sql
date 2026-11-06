-- Quem é da equipa e também já comprou (ex.: um administrador com encomendas) mostra na listagem o
-- CLI- das suas compras. A conta não ganha CLI- próprio: usa o código do email (private.guest_customer_codes),
-- o mesmo que ficou nas encomendas. Se deixar de ser equipa e passar a cliente, mantém esse código.
-- Resto igual à versão de 20261106033302.

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
           coalesce(p.customer_code, mc.customer_code, '') as customer_code,
           coalesce(p.staff_code, '') as staff_code
    from public.profiles p
    join auth.users u on u.id = p.id
    left join private.guest_customer_codes mc
      on mc.email_normalizado = lower(btrim(coalesce(nullif(u.email, ''), p.email, '')))
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
