-- Funcionários (2026-11-08): a ficha de cada pessoa que trabalha na livraria e na Editora, com ou
-- sem conta no painel — vendedores das lojas, gráfica, estafetas, administração.
--
-- Até aqui "funcionário" era só uma conta da equipa com acesso ao painel (profiles com papel admin
-- ou manager, código FUN-). Quem não usa o painel não existia no sistema: não podia ser responsável
-- por uma etapa da produção nem ter o salário registado.
--
-- 1. public.staff_members: nome, cargo, departamento, loja, contactos, admissão, saída, estado e
--    notas. O código FUN- sai do mesmo contador das contas e cada pessoa fica com um só: a ficha
--    ligada a uma conta da equipa usa o código da conta; uma conta promovida a equipa mais tarde usa
--    o da ficha (public.profiles_codigos_pessoa, abaixo).
-- 2. Permissões novas, pelo private.has_permission de sempre (chaves em profiles.permissions). As
--    três listas de chaves — private.permission_keys (abaixo), a do painel em
--    app/web/src/lib/permissions.js e a da Edge Function em supabase/functions/app/permissions.ts —
--    têm de ser iguais: uma chave que falte numa delas é apagada ao gravar um gestor ou um cargo.
--      manage_staff       as fichas dos funcionários;
--      manage_production  a produção da Editora e os fornecedores (migração producao);
--      manage_finance     pagamentos a fornecedores, salários, entradas e saídas (migração saidas).
--    Lêem as fichas: quem gere funcionários, a produção (escolhe os responsáveis das etapas), as
--    finanças (salários) e a própria pessoa. Os dados de pagamento (salário, IBAN, NIF) não ficam
--    aqui: estão numa tabela só das finanças (migração saidas).
-- 3. Tempo real (migração sinais_em_tempo_real): um sinal «funcionarios» no tópico «painel» por
--    instrução que mexe nas fichas, sem dados — o painel volta a pedir pelo caminho de sempre, com
--    o RLS de sempre. A função private.painel_realtime_signal serve também à produção e às saídas.
--
-- Reverter: drop de public.staff_members, de private.staff_member_before_save e de
-- private.painel_realtime_signal; repor public.profiles_codigos_pessoa (migração
-- codigos_cliente_funcionario) e private.permission_keys (migração cargos_e_ver_relatorios).

-- ---------------------------------------------------------------------------------------------
-- 1. Fichas
-- ---------------------------------------------------------------------------------------------
create table if not exists public.staff_members (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^FUN-[0-9]{3,}$'),
  profile_id uuid unique references public.profiles (id) on delete set null,
  full_name text not null check (length(btrim(full_name)) between 3 and 120),
  job_title text not null default '' check (length(job_title) <= 80),
  department text not null default 'loja'
    check (department in ('loja', 'producao', 'entregas', 'administracao', 'colportagem', 'outro')),
  store_id text references public.physical_stores (id) on delete set null,
  phone text not null default '' check (phone = '' or phone ~ '^\+244 [0-9]{3} [0-9]{3} [0-9]{3}$'),
  email text not null default '' check (email = '' or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  hired_on date,
  left_on date,
  status text not null default 'activo' check (status in ('activo', 'ferias', 'baixa', 'saiu')),
  notes text not null default '' check (length(notes) <= 2000),
  created timestamptz not null default now(),
  updated timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  constraint staff_members_datas check (left_on is null or hired_on is null or left_on >= hired_on)
);
create index if not exists staff_members_store_idx on public.staff_members (store_id);
create index if not exists staff_members_created_by_idx on public.staff_members (created_by);
create index if not exists staff_members_status_idx on public.staff_members (status);

-- Antes de gravar: textos limpos, telefone no formato do site, o código (nunca o que vem do
-- navegador) e a data de saída quando a pessoa "saiu".
create or replace function private.staff_member_before_save()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta text;
begin
  new.full_name := btrim(coalesce(new.full_name, ''));
  new.job_title := btrim(coalesce(new.job_title, ''));
  new.email := lower(btrim(coalesce(new.email, '')));
  new.phone := btrim(coalesce(new.phone, ''));
  if new.phone <> '' then
    new.phone := coalesce(public.normalize_angola_phone(new.phone), new.phone);
  end if;
  new.notes := coalesce(new.notes, '');
  new.store_id := nullif(btrim(coalesce(new.store_id, '')), '');
  if new.status = 'saiu' and new.left_on is null then
    new.left_on := (now() at time zone 'Africa/Luanda')::date;
  end if;

  if tg_op = 'INSERT' then
    new.created := now();
    new.created_by := coalesce(new.created_by, auth.uid());
    new.code := null;
  else
    new.created := old.created;
    new.created_by := old.created_by;
    new.code := old.code;
  end if;

  -- Ligada a uma conta da equipa com código: a ficha usa esse (uma pessoa, um código).
  if new.profile_id is not null and (tg_op = 'INSERT' or new.profile_id is distinct from old.profile_id) then
    select p.staff_code into v_conta from public.profiles p where p.id = new.profile_id;
    if v_conta is not null then
      new.code := v_conta;
    end if;
  end if;
  if new.code is null then
    new.code := private.formata_codigo('FUN-', private.codigo_seguinte('FUN-'));
  end if;

  new.updated := now();
  return new;
end;
$$;
revoke all on function private.staff_member_before_save() from public, anon, authenticated;

drop trigger if exists staff_members_before_save on public.staff_members;
create trigger staff_members_before_save
  before insert or update on public.staff_members
  for each row execute function private.staff_member_before_save();

-- Uma conta promovida a equipa usa o código da ficha que já tinha (antes gerava outro FUN-). Igual
-- à versão da migração codigos_cliente_funcionario, tirando esse passo.
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

  -- Equipa (administradores e gestores): FUN-. Quem deixa de ser equipa mantém o código; quem já
  -- tem ficha de funcionário fica com o código da ficha.
  if new.role in ('admin', 'manager') and new.staff_code is null then
    v_codigo := null;
    if tg_op = 'UPDATE' then
      select s.code into v_codigo from public.staff_members s where s.profile_id = new.id;
    end if;
    new.staff_code := coalesce(v_codigo, private.formata_codigo('FUN-', private.codigo_seguinte('FUN-')));
  end if;

  return new;
end;
$$;

alter table public.staff_members enable row level security;
revoke all on public.staff_members from public, anon, authenticated;
grant all on public.staff_members to service_role;
grant select, insert, update, delete on public.staff_members to authenticated;

drop policy if exists "staff_members: quem gere ou a própria pessoa lê" on public.staff_members;
create policy "staff_members: quem gere ou a própria pessoa lê" on public.staff_members
  for select to authenticated
  using (
    (select private.has_permission('manage_staff'))
    or (select private.has_permission('manage_production'))
    or (select private.has_permission('manage_finance'))
    or profile_id = (select auth.uid())
  );
drop policy if exists "staff_members: funcionários cria" on public.staff_members;
create policy "staff_members: funcionários cria" on public.staff_members
  for insert to authenticated with check ((select private.has_permission('manage_staff')));
drop policy if exists "staff_members: funcionários altera" on public.staff_members;
create policy "staff_members: funcionários altera" on public.staff_members
  for update to authenticated
  using ((select private.has_permission('manage_staff')))
  with check ((select private.has_permission('manage_staff')));
-- Apagar é para enganos: quem tem salários registados não se apaga (fica "saiu").
drop policy if exists "staff_members: funcionários apaga" on public.staff_members;
create policy "staff_members: funcionários apaga" on public.staff_members
  for delete to authenticated using ((select private.has_permission('manage_staff')));

-- ---------------------------------------------------------------------------------------------
-- 2. As chaves das permissões
-- ---------------------------------------------------------------------------------------------
-- Igual à versão da migração cargos_e_ver_relatorios, mais manage_production, manage_staff e
-- manage_finance. private.clean_permissions (users_admin_update e os cargos) só guarda as chaves
-- desta lista.
create or replace function private.permission_keys()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['manage_catalog','manage_orders','manage_settings','manage_users','manage_payments',
               'confirm_payments','view_reports','manage_marketing','manage_church_registry','manage_colporteurs',
               'manage_production','manage_staff','manage_finance'];
$$;
revoke all on function private.permission_keys() from public, anon;
grant execute on function private.permission_keys() to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 3. Tempo real
-- ---------------------------------------------------------------------------------------------
-- Um sinal por instrução no tópico «painel», com os nomes dados ao gatilho (uma ordem nova com
-- oito etapas é um sinal só). private.realtime_signal (migração sinais_em_tempo_real) não deixa
-- que um serviço de tempo real em baixo estrague a escrita.
create or replace function private.painel_realtime_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event text;
begin
  foreach v_event in array tg_argv loop
    perform private.realtime_signal('painel', v_event);
  end loop;
  return null;
end;
$$;
revoke all on function private.painel_realtime_signal() from public, anon, authenticated;

drop trigger if exists staff_members_realtime_signal on public.staff_members;
create trigger staff_members_realtime_signal
  after insert or update or delete on public.staff_members
  for each statement execute function private.painel_realtime_signal('funcionarios');
