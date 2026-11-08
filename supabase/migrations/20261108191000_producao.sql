-- Produção da Editora (2026-11-08): cada título que se produz — novo, nova edição ou reimpressão —
-- passa a ter uma ordem de produção, com as etapas do processo, quem é responsável por cada uma e o
-- prazo, os custos e o fornecedor. Ao concluir, a tiragem entra no stock do produto no catálogo.
--
-- 1. public.suppliers: gráficas, papel, design, revisão, transporte… (código FOR-).
-- 2. public.production_orders: o título (um produto do catálogo; um título novo pode começar sem
--    produto e ligá-lo antes de concluir), o tipo, a tiragem, a gráfica, as datas e o estado
--    (planeada, em curso, concluída, cancelada). Código PRD-.
-- 3. public.production_stages: as etapas, por ordem, cada uma com responsável (uma ficha de
--    funcionário, migração funcionarios), prazo e estado. Uma ordem nova recebe as etapas do seu
--    tipo (production_default_stages), que a equipa ajusta. Começar uma etapa põe a ordem "em curso".
-- 4. public.production_costs: os custos da ordem, com o fornecedor. O custo por exemplar é o total a
--    dividir pela tiragem; o que se deve a cada fornecedor é o que custou menos o que se pagou
--    (pagamentos na migração saidas).
-- 5. public.production_complete: conclui a ordem e põe a tiragem recebida no stock do produto, uma
--    só vez, com o motivo "produção" e o código da ordem no histórico do stock. Exige as etapas todas
--    feitas (ou marcadas "não se aplica").
--
-- 6. Tempo real: um sinal «producao» no tópico «painel» por instrução.
--
-- Permissões: manage_production gere tudo isto; manage_finance lê (precisa dos custos e dos
-- fornecedores para pagar). Escrever o stock é só pela função, que confere a permissão.
--
-- Reverter: drop das tabelas e funções criadas aqui; repor o check de stock_movements.reason (sem
-- 'producao').

insert into private.product_code_counters (prefix, last_value) values ('FOR-', 0), ('PRD-', 0)
on conflict (prefix) do nothing;

-- O histórico do stock aceita a entrada de produção.
alter table public.stock_movements drop constraint if exists stock_movements_reason_check;
alter table public.stock_movements add constraint stock_movements_reason_check
  check (reason in ('inicial', 'venda', 'cancelamento', 'ajuste', 'consignacao', 'devolucao_consignacao', 'compra_colportor', 'producao'));

-- ---------------------------------------------------------------------------------------------
-- 1. Fornecedores
-- ---------------------------------------------------------------------------------------------
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^FOR-[0-9]{3,}$'),
  name text not null check (length(btrim(name)) between 2 and 120),
  kind text not null default 'grafica'
    check (kind in ('grafica', 'papel', 'design', 'revisao', 'traducao', 'transporte', 'outro')),
  nif text not null default '' check (length(nif) <= 30),
  contact_name text not null default '' check (length(contact_name) <= 120),
  phone text not null default '' check (phone = '' or phone ~ '^\+244 [0-9]{3} [0-9]{3} [0-9]{3}$'),
  email text not null default '' check (email = '' or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  address text not null default '' check (length(address) <= 300),
  iban text not null default '' check (length(iban) <= 40),
  notes text not null default '' check (length(notes) <= 2000),
  active boolean not null default true,
  created timestamptz not null default now(),
  updated timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);
create index if not exists suppliers_created_by_idx on public.suppliers (created_by);

-- ---------------------------------------------------------------------------------------------
-- 2. Ordens de produção
-- ---------------------------------------------------------------------------------------------
create table if not exists public.production_orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^PRD-[0-9]{3,}$'),
  title text not null check (length(btrim(title)) between 2 and 200),
  book_id text references public.stock_books (id) on delete restrict,
  kind text not null default 'reimpressao' check (kind in ('novo_titulo', 'nova_edicao', 'reimpressao', 'outro')),
  quantity integer not null check (quantity > 0 and quantity <= 1000000),
  supplier_id uuid references public.suppliers (id) on delete restrict,
  status text not null default 'planeada' check (status in ('planeada', 'em_curso', 'concluida', 'cancelada')),
  start_date date,
  due_date date,
  received_quantity integer check (received_quantity is null or (received_quantity >= 0 and received_quantity <= 1000000)),
  completed_at timestamptz,
  completed_by uuid references auth.users (id) on delete set null,
  cancelled_at timestamptz,
  cancel_reason text not null default '' check (length(cancel_reason) <= 300),
  notes text not null default '' check (length(notes) <= 2000),
  created timestamptz not null default now(),
  updated timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  constraint production_orders_datas check (due_date is null or start_date is null or due_date >= start_date)
);
create index if not exists production_orders_book_idx on public.production_orders (book_id);
create index if not exists production_orders_supplier_idx on public.production_orders (supplier_id);
create index if not exists production_orders_status_idx on public.production_orders (status);
create index if not exists production_orders_created_by_idx on public.production_orders (created_by);
create index if not exists production_orders_completed_by_idx on public.production_orders (completed_by);

create table if not exists public.production_stages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.production_orders (id) on delete cascade,
  position smallint not null check (position between 1 and 50),
  name text not null check (length(btrim(name)) between 2 and 80),
  responsible_id uuid references public.staff_members (id) on delete set null,
  due_date date,
  status text not null default 'por_fazer' check (status in ('por_fazer', 'em_curso', 'concluida', 'nao_aplica')),
  started_at timestamptz,
  done_at timestamptz,
  notes text not null default '' check (length(notes) <= 1000),
  updated timestamptz not null default now(),
  unique (order_id, position) deferrable initially deferred
);
create index if not exists production_stages_responsible_idx on public.production_stages (responsible_id);

create table if not exists public.production_costs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.production_orders (id) on delete cascade,
  supplier_id uuid references public.suppliers (id) on delete restrict,
  description text not null check (length(btrim(description)) between 2 and 200),
  amount numeric(14, 2) not null check (amount >= 0 and amount <= 1000000000),
  incurred_on date not null default ((now() at time zone 'Africa/Luanda')::date),
  created timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);
create index if not exists production_costs_order_idx on public.production_costs (order_id);
create index if not exists production_costs_supplier_idx on public.production_costs (supplier_id);
create index if not exists production_costs_created_by_idx on public.production_costs (created_by);

-- ---------------------------------------------------------------------------------------------
-- 3. Gatilhos: códigos, textos limpos, etapas por omissão, estados coerentes
-- ---------------------------------------------------------------------------------------------
create or replace function private.supplier_before_save()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.name := btrim(coalesce(new.name, ''));
  new.nif := btrim(coalesce(new.nif, ''));
  new.contact_name := btrim(coalesce(new.contact_name, ''));
  new.email := lower(btrim(coalesce(new.email, '')));
  new.iban := upper(regexp_replace(coalesce(new.iban, ''), '\s+', ' ', 'g'));
  new.iban := btrim(new.iban);
  new.phone := btrim(coalesce(new.phone, ''));
  if new.phone <> '' then
    new.phone := coalesce(public.normalize_angola_phone(new.phone), new.phone);
  end if;
  if tg_op = 'INSERT' then
    new.code := private.formata_codigo('FOR-', private.codigo_seguinte('FOR-'));
    new.created := now();
    new.created_by := coalesce(new.created_by, auth.uid());
  else
    new.code := old.code;
    new.created := old.created;
    new.created_by := old.created_by;
  end if;
  new.updated := now();
  return new;
end;
$$;
revoke all on function private.supplier_before_save() from public, anon, authenticated;
drop trigger if exists suppliers_before_save on public.suppliers;
create trigger suppliers_before_save before insert or update on public.suppliers
  for each row execute function private.supplier_before_save();

-- As etapas de cada tipo de ordem. A equipa acrescenta, tira, muda o nome e a ordem em cada ordem.
create or replace function public.production_default_stages(p_kind text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'reimpressao' then array['Ficheiros conferidos', 'Prova da gráfica aprovada', 'Impressão', 'Acabamento', 'Recepção na loja']
    else array['Original recebido', 'Revisão', 'Paginação', 'Capa', 'Prova aprovada', 'Impressão', 'Acabamento', 'Recepção na loja']
  end;
$$;
grant execute on function public.production_default_stages(text) to authenticated;

create or replace function private.production_order_before_save()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.title := btrim(coalesce(new.title, ''));
  new.notes := coalesce(new.notes, '');
  new.book_id := nullif(btrim(coalesce(new.book_id, '')), '');
  if tg_op = 'INSERT' then
    new.code := private.formata_codigo('PRD-', private.codigo_seguinte('PRD-'));
    new.created := now();
    new.created_by := coalesce(new.created_by, auth.uid());
    -- Concluir e cancelar são pela função (o stock e o registo vão com eles).
    if new.status in ('concluida', 'cancelada') then
      raise exception 'Uma ordem nova começa planeada ou em curso.';
    end if;
    new.completed_at := null;
    new.completed_by := null;
    new.received_quantity := null;
    new.cancelled_at := null;
  else
    new.code := old.code;
    new.created := old.created;
    new.created_by := old.created_by;
    -- Fechada (concluída ou cancelada): só as notas mudam.
    if old.status in ('concluida', 'cancelada') then
      if (to_jsonb(new) - array['notes', 'updated']) is distinct from (to_jsonb(old) - array['notes', 'updated'])
         and coalesce(current_setting('livraria.producao_funcao', true), '') <> '1' then
        raise exception 'A ordem % já está %: só as notas mudam.', old.code,
          case old.status when 'concluida' then 'concluída' else 'cancelada' end;
      end if;
    elsif new.status in ('concluida', 'cancelada')
          and coalesce(current_setting('livraria.producao_funcao', true), '') <> '1' then
      raise exception 'Concluir ou cancelar uma ordem é pelos botões (a tiragem entra no stock ao concluir).';
    end if;
  end if;
  new.updated := now();
  return new;
end;
$$;
revoke all on function private.production_order_before_save() from public, anon, authenticated;
drop trigger if exists production_orders_before_save on public.production_orders;
create trigger production_orders_before_save before insert or update on public.production_orders
  for each row execute function private.production_order_before_save();

-- Apagar é para enganos: só uma ordem ainda planeada. As outras cancelam-se (fica o registo do que
-- se gastou e, na concluída, do que entrou no stock).
create or replace function private.production_order_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status <> 'planeada' then
    raise exception 'A ordem % não se apaga (está %): cancele-a.', old.code,
      case old.status when 'em_curso' then 'em curso' when 'concluida' then 'concluída' else 'cancelada' end;
  end if;
  return old;
end;
$$;
revoke all on function private.production_order_before_delete() from public, anon, authenticated;
drop trigger if exists production_orders_before_delete on public.production_orders;
create trigger production_orders_before_delete before delete on public.production_orders
  for each row execute function private.production_order_before_delete();

-- Ordem nova: as etapas do tipo, numa só instrução (um sinal de tempo real, não um por etapa).
create or replace function private.production_order_add_stages()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.production_stages (order_id, position, name)
  select new.id, e.pos, e.name
  from unnest(public.production_default_stages(new.kind)) with ordinality as e(name, pos);
  return null;
end;
$$;
revoke all on function private.production_order_add_stages() from public, anon, authenticated;
drop trigger if exists production_orders_add_stages on public.production_orders;
create trigger production_orders_add_stages after insert on public.production_orders
  for each row execute function private.production_order_add_stages();

-- Etapas: as datas acompanham o estado; começar ou acabar uma etapa põe a ordem planeada "em
-- curso"; uma ordem fechada não muda as etapas.
create or replace function private.production_stage_before_save()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select o.status into v_status from public.production_orders o where o.id = new.order_id;
  if v_status in ('concluida', 'cancelada') and coalesce(current_setting('livraria.producao_funcao', true), '') <> '1' then
    raise exception 'A ordem já está fechada: as etapas não mudam.';
  end if;
  new.name := btrim(coalesce(new.name, ''));
  new.notes := coalesce(new.notes, '');
  if new.status = 'por_fazer' then
    new.started_at := null;
    new.done_at := null;
  elsif new.status = 'em_curso' then
    new.started_at := coalesce(new.started_at, now());
    new.done_at := null;
  elsif new.status = 'concluida' then
    new.started_at := coalesce(new.started_at, now());
    new.done_at := coalesce(new.done_at, now());
  else
    new.done_at := null;
  end if;
  new.updated := now();
  return new;
end;
$$;
revoke all on function private.production_stage_before_save() from public, anon, authenticated;
drop trigger if exists production_stages_before_save on public.production_stages;
create trigger production_stages_before_save before insert or update on public.production_stages
  for each row execute function private.production_stage_before_save();

create or replace function private.production_stage_after_save()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('em_curso', 'concluida') then
    update public.production_orders
    set status = 'em_curso', start_date = coalesce(start_date, (now() at time zone 'Africa/Luanda')::date)
    where id = new.order_id and status = 'planeada';
  end if;
  return null;
end;
$$;
revoke all on function private.production_stage_after_save() from public, anon, authenticated;
drop trigger if exists production_stages_after_save on public.production_stages;
create trigger production_stages_after_save after insert or update of status on public.production_stages
  for each row execute function private.production_stage_after_save();

-- Custos: só em ordens abertas (uma ordem fechada tem o custo final).
create or replace function private.production_cost_before_save()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select o.status into v_status from public.production_orders o
  where o.id = coalesce(new.order_id, old.order_id);
  if v_status in ('concluida', 'cancelada') then
    raise exception 'A ordem já está fechada: os custos não mudam.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  new.description := btrim(coalesce(new.description, ''));
  if tg_op = 'INSERT' then
    new.created := now();
    new.created_by := coalesce(new.created_by, auth.uid());
  else
    new.created := old.created;
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;
revoke all on function private.production_cost_before_save() from public, anon, authenticated;
drop trigger if exists production_costs_before_save on public.production_costs;
create trigger production_costs_before_save before insert or update or delete on public.production_costs
  for each row execute function private.production_cost_before_save();

-- ---------------------------------------------------------------------------------------------
-- 4. Concluir (com a entrada no stock) e cancelar
-- ---------------------------------------------------------------------------------------------
create or replace function public.production_complete(p_order_id uuid, p_received integer default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.production_orders;
  v_qty integer;
  v_falta text;
  v_stock integer;
begin
  if not private.has_permission('manage_production') then
    raise exception 'Sem permissão para concluir ordens de produção.' using errcode = '42501';
  end if;
  select * into v_order from public.production_orders where id = p_order_id for update;
  if not found then raise exception 'Ordem de produção não encontrada.'; end if;
  if v_order.status = 'concluida' then raise exception 'A ordem % já foi concluída.', v_order.code; end if;
  if v_order.status = 'cancelada' then raise exception 'A ordem % está cancelada.', v_order.code; end if;
  if v_order.book_id is null then
    raise exception 'Ligue a ordem % a um produto do catálogo antes de concluir: é aí que a tiragem entra no stock.', v_order.code;
  end if;
  select string_agg(s.name, ', ' order by s.position) into v_falta
  from public.production_stages s
  where s.order_id = p_order_id and s.status not in ('concluida', 'nao_aplica');
  if v_falta is not null then
    raise exception 'Faltam etapas por concluir: %.', v_falta;
  end if;
  v_qty := coalesce(p_received, v_order.quantity);
  if v_qty < 0 or v_qty > 1000000 then raise exception 'Quantidade recebida inválida.'; end if;

  perform set_config('livraria.producao_funcao', '1', true);
  -- O histórico do stock regista a entrada como "produção", com o código da ordem.
  perform set_config('app.stock_reason', 'producao', true);
  perform set_config('app.stock_ref', v_order.code, true);
  update public.stock_books set stock = coalesce(stock, 0) + v_qty
  where id = v_order.book_id
  returning stock into v_stock;
  if not found then raise exception 'O produto da ordem já não existe no catálogo.'; end if;

  update public.production_orders
  set status = 'concluida', received_quantity = v_qty, completed_at = now(), completed_by = auth.uid(),
      start_date = coalesce(start_date, (now() at time zone 'Africa/Luanda')::date)
  where id = p_order_id;
  perform set_config('livraria.producao_funcao', '', true);
  perform set_config('app.stock_reason', '', true);
  perform set_config('app.stock_ref', '', true);

  return jsonb_build_object('code', v_order.code, 'received', v_qty, 'stock', v_stock);
end;
$$;
revoke all on function public.production_complete(uuid, integer) from public, anon;
grant execute on function public.production_complete(uuid, integer) to authenticated;

create or replace function public.production_cancel(p_order_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.production_orders;
begin
  if not private.has_permission('manage_production') then
    raise exception 'Sem permissão para cancelar ordens de produção.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Diga porque se cancela.'; end if;
  select * into v_order from public.production_orders where id = p_order_id for update;
  if not found then raise exception 'Ordem de produção não encontrada.'; end if;
  if v_order.status in ('concluida', 'cancelada') then
    raise exception 'A ordem % já está fechada.', v_order.code;
  end if;
  perform set_config('livraria.producao_funcao', '1', true);
  update public.production_orders
  set status = 'cancelada', cancelled_at = now(), cancel_reason = left(btrim(p_reason), 300)
  where id = p_order_id;
  perform set_config('livraria.producao_funcao', '', true);
end;
$$;
revoke all on function public.production_cancel(uuid, text) from public, anon;
grant execute on function public.production_cancel(uuid, text) to authenticated;

-- Subir ou descer uma etapa: troca de lugar com a vizinha, numa só transacção (a posição é única
-- por ordem; dois pedidos seguidos pela API deixavam-nas um instante no mesmo lugar).
create or replace function public.production_stage_move(p_stage_id uuid, p_delta integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage public.production_stages;
  v_other public.production_stages;
begin
  if not private.has_permission('manage_production') then
    raise exception 'Sem permissão para mudar as etapas.' using errcode = '42501';
  end if;
  select * into v_stage from public.production_stages where id = p_stage_id for update;
  if not found then raise exception 'Etapa não encontrada.'; end if;
  if p_delta < 0 then
    select * into v_other from public.production_stages
    where order_id = v_stage.order_id and position < v_stage.position order by position desc limit 1 for update;
  else
    select * into v_other from public.production_stages
    where order_id = v_stage.order_id and position > v_stage.position order by position limit 1 for update;
  end if;
  if not found then return; end if;
  update public.production_stages set position = v_other.position where id = v_stage.id;
  update public.production_stages set position = v_stage.position where id = v_other.id;
end;
$$;
revoke all on function public.production_stage_move(uuid, integer) from public, anon;
grant execute on function public.production_stage_move(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. Acesso
-- ---------------------------------------------------------------------------------------------
alter table public.suppliers enable row level security;
alter table public.production_orders enable row level security;
alter table public.production_stages enable row level security;
alter table public.production_costs enable row level security;

revoke all on public.suppliers, public.production_orders, public.production_stages, public.production_costs
  from public, anon, authenticated;
grant all on public.suppliers, public.production_orders, public.production_stages, public.production_costs to service_role;
grant select, insert, update, delete on public.suppliers, public.production_orders, public.production_stages,
  public.production_costs to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['suppliers', 'production_orders', 'production_stages', 'production_costs'] loop
    execute format('drop policy if exists %I on public.%I', t || ': produção ou finanças lê', t);
    execute format($p$create policy %I on public.%I for select to authenticated
      using ((select private.has_permission('manage_production')) or (select private.has_permission('manage_finance')))$p$,
      t || ': produção ou finanças lê', t);
    execute format('drop policy if exists %I on public.%I', t || ': produção cria', t);
    execute format($p$create policy %I on public.%I for insert to authenticated
      with check ((select private.has_permission('manage_production')))$p$, t || ': produção cria', t);
    execute format('drop policy if exists %I on public.%I', t || ': produção altera', t);
    execute format($p$create policy %I on public.%I for update to authenticated
      using ((select private.has_permission('manage_production')))
      with check ((select private.has_permission('manage_production')))$p$, t || ': produção altera', t);
    execute format('drop policy if exists %I on public.%I', t || ': produção apaga', t);
    execute format($p$create policy %I on public.%I for delete to authenticated
      using ((select private.has_permission('manage_production')))$p$, t || ': produção apaga', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 6. Tempo real
-- ---------------------------------------------------------------------------------------------
-- Um sinal «producao» no tópico «painel» por instrução (private.painel_realtime_signal, migração
-- funcionarios). Concluir uma ordem mexe no stock e dá também o sinal «catalogo» de sempre.
do $$
declare
  t text;
begin
  foreach t in array array['suppliers', 'production_orders', 'production_stages', 'production_costs'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_realtime_signal', t);
    execute format($g$create trigger %I after insert or update or delete on public.%I
      for each statement execute function private.painel_realtime_signal('producao')$g$, t || '_realtime_signal', t);
  end loop;
end;
$$;
