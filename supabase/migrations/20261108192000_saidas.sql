-- Saídas de dinheiro (2026-11-08): o que a livraria e a Editora pagam — aos fornecedores (gráfica,
-- papel, transporte…) e aos funcionários (salários) — e o relatório de entradas e saídas.
--
-- 1. public.supplier_payments: cada pagamento a um fornecedor, ligado se quiser a uma ordem de
--    produção. Não se apaga nem se corrige: anula-se, com o motivo (fica o registo). O que se deve
--    a cada fornecedor é o que custou (production_costs) menos o que se pagou.
-- 2. public.staff_pay_profiles: o salário base, os subsídios fixos, o IBAN e o NIF de cada
--    funcionário. Só as finanças lêem e escrevem (a ficha, migração funcionarios, não tem dinheiro).
-- 3. public.staff_payroll: os salários de cada mês, uma linha por pessoa: base, subsídios,
--    descontos (INSS, IRT, faltas — escritos pelas finanças: o sistema não calcula impostos) e o
--    líquido. Por pagar → pago (data, forma, referência) ou anulado (motivo). Pago ou anulado, não
--    muda mais. public.payroll_generate cria as linhas do mês a partir dos salários de cada um.
-- 4. public.cash_flow_report: entradas (pagamentos dos clientes confirmados, menos reembolsos — a
--    mesma conta do payments_report) e saídas (fornecedores e salários pagos) num período, por dia,
--    com o saldo e o que está por pagar.
--
-- Tudo exige manage_finance (migração funcionarios); quem gere a produção lê os pagamentos aos
-- fornecedores (para saber o que falta pagar). O registo de segurança guarda cada pagamento, cada
-- anulação e cada mudança de salário ou IBAN; mudar um IBAN ou um salário avisa os administradores
-- (é por aí que se desvia dinheiro).
--
-- 5. Tempo real: sinais «financas» (e «producao», nos pagamentos a fornecedores) no tópico «painel».
--
-- Reverter: drop das tabelas e funções criadas aqui e do gatilho order_payments_realtime_signal.

-- ---------------------------------------------------------------------------------------------
-- 1. Pagamentos a fornecedores
-- ---------------------------------------------------------------------------------------------
create table if not exists public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id) on delete restrict,
  order_id uuid references public.production_orders (id) on delete set null,
  amount numeric(14, 2) not null check (amount > 0 and amount <= 1000000000),
  paid_on date not null default ((now() at time zone 'Africa/Luanda')::date),
  method text not null default 'transferencia' check (method in ('transferencia', 'numerario', 'multicaixa', 'cheque', 'outro')),
  reference text not null default '' check (length(reference) <= 80),
  notes text not null default '' check (length(notes) <= 500),
  status text not null default 'pago' check (status in ('pago', 'anulado')),
  void_reason text not null default '' check (length(void_reason) <= 300),
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  created timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);
create index if not exists supplier_payments_supplier_idx on public.supplier_payments (supplier_id, paid_on desc);
create index if not exists supplier_payments_order_idx on public.supplier_payments (order_id);
create index if not exists supplier_payments_paid_on_idx on public.supplier_payments (paid_on);
create index if not exists supplier_payments_created_by_idx on public.supplier_payments (created_by);
create index if not exists supplier_payments_voided_by_idx on public.supplier_payments (voided_by);

create or replace function private.supplier_payment_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoje date := (now() at time zone 'Africa/Luanda')::date;
begin
  if tg_op = 'DELETE' then
    raise exception 'Os pagamentos não se apagam: anule-o, com o motivo (fica o registo).';
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'pago' then raise exception 'Um pagamento novo entra como pago.'; end if;
    if new.paid_on > v_hoje then raise exception 'A data do pagamento não pode ser no futuro.'; end if;
    new.reference := btrim(coalesce(new.reference, ''));
    new.notes := btrim(coalesce(new.notes, ''));
    new.void_reason := '';
    new.voided_at := null;
    new.voided_by := null;
    new.created := now();
    new.created_by := auth.uid();
    return new;
  end if;
  -- Só se anula, e uma vez.
  if old.status = 'anulado' then raise exception 'Este pagamento já está anulado.'; end if;
  if new.status <> 'anulado'
     or (to_jsonb(new) - array['status', 'void_reason', 'voided_at', 'voided_by'])
        is distinct from (to_jsonb(old) - array['status', 'void_reason', 'voided_at', 'voided_by']) then
    raise exception 'Um pagamento registado não se corrige: anule-o e registe outro.';
  end if;
  if length(btrim(coalesce(new.void_reason, ''))) < 3 then raise exception 'Diga porque se anula.'; end if;
  new.void_reason := left(btrim(new.void_reason), 300);
  new.voided_at := now();
  new.voided_by := auth.uid();
  return new;
end;
$$;
revoke all on function private.supplier_payment_guard() from public, anon, authenticated;
drop trigger if exists supplier_payments_guard on public.supplier_payments;
create trigger supplier_payments_guard before insert or update or delete on public.supplier_payments
  for each row execute function private.supplier_payment_guard();

-- ---------------------------------------------------------------------------------------------
-- 2. Salários: os dados de cada pessoa (só finanças)
-- ---------------------------------------------------------------------------------------------
create table if not exists public.staff_pay_profiles (
  staff_id uuid primary key references public.staff_members (id) on delete cascade,
  base_salary numeric(14, 2) not null default 0 check (base_salary >= 0 and base_salary <= 100000000),
  allowances numeric(14, 2) not null default 0 check (allowances >= 0 and allowances <= 100000000),
  iban text not null default '' check (length(iban) <= 40),
  nif text not null default '' check (length(nif) <= 30),
  notes text not null default '' check (length(notes) <= 500),
  updated timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
create index if not exists staff_pay_profiles_updated_by_idx on public.staff_pay_profiles (updated_by);

create or replace function private.staff_pay_profile_before_save()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.iban := btrim(upper(regexp_replace(coalesce(new.iban, ''), '\s+', ' ', 'g')));
  new.nif := btrim(coalesce(new.nif, ''));
  new.notes := btrim(coalesce(new.notes, ''));
  new.updated := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
revoke all on function private.staff_pay_profile_before_save() from public, anon, authenticated;
drop trigger if exists staff_pay_profiles_before_save on public.staff_pay_profiles;
create trigger staff_pay_profiles_before_save before insert or update on public.staff_pay_profiles
  for each row execute function private.staff_pay_profile_before_save();

-- ---------------------------------------------------------------------------------------------
-- 3. Salários de cada mês
-- ---------------------------------------------------------------------------------------------
create table if not exists public.staff_payroll (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_members (id) on delete restrict,
  period date not null check (extract(day from period) = 1),
  base_salary numeric(14, 2) not null default 0 check (base_salary >= 0 and base_salary <= 100000000),
  allowances numeric(14, 2) not null default 0 check (allowances >= 0 and allowances <= 100000000),
  deductions numeric(14, 2) not null default 0 check (deductions >= 0 and deductions <= 100000000),
  net numeric(14, 2) generated always as (base_salary + allowances - deductions) stored,
  status text not null default 'por_pagar' check (status in ('por_pagar', 'pago', 'anulado')),
  paid_on date,
  method text not null default '' check (method in ('', 'transferencia', 'numerario', 'multicaixa', 'cheque', 'outro')),
  reference text not null default '' check (length(reference) <= 80),
  notes text not null default '' check (length(notes) <= 500),
  void_reason text not null default '' check (length(void_reason) <= 300),
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  created timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated timestamptz not null default now(),
  constraint staff_payroll_liquido check (base_salary + allowances - deductions >= 0),
  constraint staff_payroll_pago check (status <> 'pago' or (paid_on is not null and method <> ''))
);
-- Uma linha por pessoa e por mês (as anuladas não contam: anula-se e faz-se outra).
create unique index if not exists staff_payroll_um_por_mes on public.staff_payroll (staff_id, period) where status <> 'anulado';
create index if not exists staff_payroll_period_idx on public.staff_payroll (period);
create index if not exists staff_payroll_paid_on_idx on public.staff_payroll (paid_on);
create index if not exists staff_payroll_decided_by_idx on public.staff_payroll (decided_by);
create index if not exists staff_payroll_created_by_idx on public.staff_payroll (created_by);

create or replace function private.staff_payroll_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoje date := (now() at time zone 'Africa/Luanda')::date;
begin
  if tg_op = 'DELETE' then
    -- Uma linha por pagar pode sair (gerada por engano); paga ou anulada fica.
    if old.status <> 'por_pagar' then
      raise exception 'Um salário % não se apaga.', case old.status when 'pago' then 'pago' else 'anulado' end;
    end if;
    return old;
  end if;
  new.reference := btrim(coalesce(new.reference, ''));
  new.notes := btrim(coalesce(new.notes, ''));
  if tg_op = 'INSERT' then
    if new.status <> 'por_pagar' then raise exception 'Um salário novo entra por pagar.'; end if;
    new.paid_on := null;
    new.method := '';
    new.void_reason := '';
    new.decided_at := null;
    new.decided_by := null;
    new.created := now();
    new.created_by := auth.uid();
    new.updated := now();
    return new;
  end if;
  if old.status <> 'por_pagar' then
    raise exception 'Este salário já está %: não muda mais.', case old.status when 'pago' then 'pago' else 'anulado' end;
  end if;
  new.staff_id := old.staff_id;
  new.period := old.period;
  new.created := old.created;
  new.created_by := old.created_by;
  if new.status = 'pago' then
    new.paid_on := coalesce(new.paid_on, v_hoje);
    if new.paid_on > v_hoje then raise exception 'A data do pagamento não pode ser no futuro.'; end if;
    if coalesce(new.method, '') = '' then raise exception 'Diga como se pagou.'; end if;
    new.decided_at := now();
    new.decided_by := auth.uid();
  elsif new.status = 'anulado' then
    if length(btrim(coalesce(new.void_reason, ''))) < 3 then raise exception 'Diga porque se anula.'; end if;
    new.void_reason := left(btrim(new.void_reason), 300);
    new.paid_on := null;
    new.method := '';
    new.decided_at := now();
    new.decided_by := auth.uid();
  else
    new.paid_on := null;
    new.method := '';
  end if;
  new.updated := now();
  return new;
end;
$$;
revoke all on function private.staff_payroll_guard() from public, anon, authenticated;
drop trigger if exists staff_payroll_guard on public.staff_payroll;
create trigger staff_payroll_guard before insert or update or delete on public.staff_payroll
  for each row execute function private.staff_payroll_guard();

-- As linhas do mês, a partir do salário de cada um: quem está activo, de férias ou de baixa, com
-- salário base, e ainda sem linha nesse mês. Quem saiu antes do mês não entra.
create or replace function public.payroll_generate(p_period date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period date := date_trunc('month', p_period)::date;
  v_n integer;
begin
  if not private.has_permission('manage_finance') then
    raise exception 'Sem permissão para os salários.' using errcode = '42501';
  end if;
  if p_period is null then raise exception 'Indique o mês.'; end if;
  insert into public.staff_payroll (staff_id, period, base_salary, allowances)
  select s.id, v_period, pp.base_salary, pp.allowances
  from public.staff_members s
  join public.staff_pay_profiles pp on pp.staff_id = s.id
  where pp.base_salary > 0
    and (s.status <> 'saiu' or (s.left_on is not null and s.left_on >= v_period))
    and (s.hired_on is null or s.hired_on < (v_period + interval '1 month')::date)
    and not exists (select 1 from public.staff_payroll p where p.staff_id = s.id and p.period = v_period and p.status <> 'anulado');
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.payroll_generate(date) from public, anon;
grant execute on function public.payroll_generate(date) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. Registo de segurança
-- ---------------------------------------------------------------------------------------------
create or replace function private.audit_saidas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changes jsonb;
  v_quem text := '';
  v_kz text;
  v_summary text;
  v_alert boolean := false;
begin
  if tg_table_name = 'supplier_payments' then
    select s.code || ' ' || s.name into v_quem from public.suppliers s where s.id = (v_row ->> 'supplier_id')::uuid;
    v_kz := private.kz((v_row ->> 'amount')::numeric);
    v_changes := private.audit_diff(v_old, v_new, array['amount', 'paid_on', 'method', 'reference', 'status', 'void_reason', 'order_id']);
    v_summary := case when tg_op = 'INSERT' then 'Pagamento a fornecedor: ' || coalesce(v_quem, '') || ', ' || v_kz
                      else 'Pagamento a fornecedor anulado: ' || coalesce(v_quem, '') || ', ' || v_kz end;
  elsif tg_table_name = 'staff_pay_profiles' then
    select s.code || ' ' || s.full_name into v_quem from public.staff_members s where s.id = (v_row ->> 'staff_id')::uuid;
    v_changes := private.audit_diff(v_old, v_new, array['base_salary', 'allowances', 'iban', 'nif']);
    if tg_op = 'UPDATE' and v_changes = '{}'::jsonb then return null; end if;
    v_summary := 'Salário ou dados de pagamento de ' || coalesce(v_quem, 'um funcionário')
      || case tg_op when 'INSERT' then ' registados' when 'DELETE' then ' apagados' else ' alterados' end;
    -- Um IBAN ou um salário mudado é por onde se desvia dinheiro: avisa os administradores.
    v_alert := tg_op = 'UPDATE' and (v_changes ? 'iban' or v_changes ? 'base_salary');
  elsif tg_table_name = 'staff_payroll' then
    if tg_op = 'INSERT' then return null; end if;
    select s.code || ' ' || s.full_name into v_quem from public.staff_members s where s.id = (v_row ->> 'staff_id')::uuid;
    v_changes := private.audit_diff(v_old, v_new, array['base_salary', 'allowances', 'deductions', 'status', 'paid_on', 'method', 'reference', 'void_reason']);
    if v_changes = '{}'::jsonb then return null; end if;
    v_kz := private.kz((v_row ->> 'net')::numeric);
    v_summary := case
      when tg_op = 'DELETE' then 'Salário por pagar apagado: '
      when v_new ->> 'status' = 'pago' and v_old ->> 'status' <> 'pago' then 'Salário pago: '
      when v_new ->> 'status' = 'anulado' and v_old ->> 'status' <> 'anulado' then 'Salário anulado: '
      else 'Salário alterado: ' end
      || coalesce(v_quem, '') || ', ' || to_char((v_row ->> 'period')::date, 'MM/YYYY') || ', ' || v_kz;
  elsif tg_table_name = 'suppliers' then
    v_changes := private.audit_diff(v_old, v_new, array['iban', 'nif', 'name']);
    if tg_op = 'UPDATE' and not (v_changes ? 'iban') then return null; end if;
    if tg_op <> 'UPDATE' and coalesce(v_row ->> 'iban', '') = '' then return null; end if;
    v_summary := 'IBAN do fornecedor ' || coalesce(v_row ->> 'code', '') || ' ' || coalesce(v_row ->> 'name', '')
      || case tg_op when 'INSERT' then ' registado' when 'DELETE' then ' apagado com o fornecedor' else ' alterado' end;
    v_alert := tg_op = 'UPDATE';
  else
    return null;
  end if;
  perform private.audit_write(tg_table_name, coalesce(v_new ->> 'id', v_old ->> 'id', v_row ->> 'staff_id'),
    lower(tg_op), v_summary, coalesce(v_changes, '{}'::jsonb), v_alert);
  return null;
end;
$$;
revoke all on function private.audit_saidas() from public, anon, authenticated;

drop trigger if exists supplier_payments_audit on public.supplier_payments;
create trigger supplier_payments_audit after insert or update on public.supplier_payments
  for each row execute function private.audit_saidas();
drop trigger if exists staff_pay_profiles_audit on public.staff_pay_profiles;
create trigger staff_pay_profiles_audit after insert or update or delete on public.staff_pay_profiles
  for each row execute function private.audit_saidas();
drop trigger if exists staff_payroll_audit on public.staff_payroll;
create trigger staff_payroll_audit after update or delete on public.staff_payroll
  for each row execute function private.audit_saidas();
drop trigger if exists suppliers_audit on public.suppliers;
create trigger suppliers_audit after insert or update or delete on public.suppliers
  for each row execute function private.audit_saidas();

-- ---------------------------------------------------------------------------------------------
-- 5. Entradas e saídas
-- ---------------------------------------------------------------------------------------------
create or replace function public.cash_flow_report(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- O dia conta pela hora de Luanda, como no payments_report.
  v_from timestamptz;
  v_to timestamptz;
begin
  if not private.has_permission('manage_finance') then
    raise exception 'Sem acesso às entradas e saídas.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Período inválido.'; end if;
  if p_to - p_from > 400 then raise exception 'Período demasiado longo (máximo 400 dias).'; end if;
  v_from := (p_from::timestamp) at time zone 'Africa/Luanda';
  v_to := ((p_to + 1)::timestamp) at time zone 'Africa/Luanda';

  return (
    with entradas as (
      select (p.received_at at time zone 'Africa/Luanda')::date as day,
             case when p.kind = 'payment' then p.amount else -p.amount end as valor,
             p.kind, p.amount
      from public.order_payments p
      where p.status = 'confirmed' and p.received_at >= v_from and p.received_at < v_to
    ),
    fornecedores as (
      select sp.paid_on as day, sp.amount, sp.supplier_id
      from public.supplier_payments sp
      where sp.status = 'pago' and sp.paid_on between p_from and p_to
    ),
    salarios as (
      select sr.paid_on as day, sr.net as amount
      from public.staff_payroll sr
      where sr.status = 'pago' and sr.paid_on between p_from and p_to
    ),
    dias as (
      select day, sum(valor) as entradas, 0::numeric as saidas from entradas group by day
      union all select day, 0, sum(amount) from fornecedores group by day
      union all select day, 0, sum(amount) from salarios group by day
    ),
    custos as (
      select c.supplier_id, sum(c.amount) as total from public.production_costs c where c.supplier_id is not null group by c.supplier_id
    ),
    pagos as (
      select sp.supplier_id, sum(sp.amount) as total from public.supplier_payments sp where sp.status = 'pago' group by sp.supplier_id
    )
    select jsonb_build_object(
      'period', jsonb_build_object('from', p_from, 'to', p_to),
      'entradas', jsonb_build_object(
        'clientes', coalesce((select sum(amount) from entradas where kind = 'payment'), 0),
        'reembolsos', coalesce((select sum(amount) from entradas where kind = 'refund'), 0),
        'liquido', coalesce((select sum(valor) from entradas), 0)),
      'saidas', jsonb_build_object(
        'fornecedores', coalesce((select sum(amount) from fornecedores), 0),
        'salarios', coalesce((select sum(amount) from salarios), 0),
        'total', coalesce((select sum(amount) from fornecedores), 0) + coalesce((select sum(amount) from salarios), 0)),
      'saldo', coalesce((select sum(valor) from entradas), 0)
               - coalesce((select sum(amount) from fornecedores), 0) - coalesce((select sum(amount) from salarios), 0),
      'by_day', coalesce((select jsonb_agg(jsonb_build_object('day', d.day, 'entradas', d.entradas, 'saidas', d.saidas) order by d.day)
                          from (select day, sum(entradas) as entradas, sum(saidas) as saidas from dias group by day) d), '[]'::jsonb),
      'por_fornecedor', coalesce((select jsonb_agg(jsonb_build_object('supplier_id', s.id, 'code', s.code, 'name', s.name, 'paid', f.total)
                                                   order by f.total desc)
                                  from (select supplier_id, sum(amount) as total from fornecedores group by supplier_id) f
                                  join public.suppliers s on s.id = f.supplier_id), '[]'::jsonb),
      -- O que está por pagar hoje, seja qual for o período.
      'por_pagar', jsonb_build_object(
        'fornecedores', coalesce((select sum(greatest(coalesce(c.total, 0) - coalesce(p.total, 0), 0))
                                  from custos c full join pagos p on p.supplier_id = c.supplier_id), 0),
        'salarios', coalesce((select sum(net) from public.staff_payroll where status = 'por_pagar'), 0),
        'salarios_count', (select count(*) from public.staff_payroll where status = 'por_pagar'))
    )
  );
end;
$$;
revoke all on function public.cash_flow_report(date, date) from public, anon;
grant execute on function public.cash_flow_report(date, date) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 6. Acesso
-- ---------------------------------------------------------------------------------------------
alter table public.supplier_payments enable row level security;
alter table public.staff_pay_profiles enable row level security;
alter table public.staff_payroll enable row level security;
revoke all on public.supplier_payments, public.staff_pay_profiles, public.staff_payroll from public, anon, authenticated;
grant all on public.supplier_payments, public.staff_pay_profiles, public.staff_payroll to service_role;
grant select, insert, update on public.supplier_payments to authenticated;
grant select, insert, update, delete on public.staff_pay_profiles, public.staff_payroll to authenticated;

drop policy if exists "supplier_payments: finanças ou produção lê" on public.supplier_payments;
create policy "supplier_payments: finanças ou produção lê" on public.supplier_payments for select to authenticated
  using ((select private.has_permission('manage_finance')) or (select private.has_permission('manage_production')));
drop policy if exists "supplier_payments: finanças regista" on public.supplier_payments;
create policy "supplier_payments: finanças regista" on public.supplier_payments for insert to authenticated
  with check ((select private.has_permission('manage_finance')));
drop policy if exists "supplier_payments: finanças anula" on public.supplier_payments;
create policy "supplier_payments: finanças anula" on public.supplier_payments for update to authenticated
  using ((select private.has_permission('manage_finance')))
  with check ((select private.has_permission('manage_finance')));

do $$
declare
  t text;
begin
  foreach t in array array['staff_pay_profiles', 'staff_payroll'] loop
    execute format('drop policy if exists %I on public.%I', t || ': só finanças', t);
    execute format($p$create policy %I on public.%I for all to authenticated
      using ((select private.has_permission('manage_finance')))
      with check ((select private.has_permission('manage_finance')))$p$, t || ': só finanças', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 7. Tempo real
-- ---------------------------------------------------------------------------------------------
-- Um sinal por instrução no tópico «painel» (private.painel_realtime_signal, migração
-- funcionarios): «financas» para as Entradas e saídas e os Salários; os pagamentos a fornecedores
-- também «producao» (as contas dos fornecedores). Os pagamentos dos clientes (order_payments)
-- mudam as entradas.
do $$
declare
  t text;
begin
  foreach t in array array['staff_pay_profiles', 'staff_payroll', 'order_payments'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_realtime_signal', t);
    execute format($g$create trigger %I after insert or update or delete on public.%I
      for each statement execute function private.painel_realtime_signal('financas')$g$, t || '_realtime_signal', t);
  end loop;
end;
$$;
drop trigger if exists supplier_payments_realtime_signal on public.supplier_payments;
create trigger supplier_payments_realtime_signal after insert or update on public.supplier_payments
  for each statement execute function private.painel_realtime_signal('financas', 'producao');
