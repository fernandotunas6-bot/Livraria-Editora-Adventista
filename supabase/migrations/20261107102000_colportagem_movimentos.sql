-- Colportagem: guias (entrega à consignação, devolução, compra com desconto), relatório semanal,
-- conta corrente e pagamentos.
--
-- A conta corrente é uma só por colportor. Valor positivo = o colportor fica a dever à Livraria.
--   entrega à consignação   +  preço de capa × quantidade
--   compra com desconto     +  (preço de capa − desconto) × quantidade
--   devolução               −  preço de capa × quantidade
--   comissão de venda       −  percentagem × preço de capa × quantidade (fica com ela)
--   pagamento recebido      −  o que entregou em dinheiro
--   pagamento feito         +  o que a Livraria lhe pagou (ex.: comissões de vendas no site)
-- Exemplo: leva 10 livros de 1 000 Kz (+10 000), vende 6 a 30% (−1 800), paga 4 200 (−4 200) e
-- devolve 4 (−4 000): saldo 0.
--
-- Decisões:
-- · O preço é o de capa (stock_books.price), sem promoções do site: é o preço a que o colportor
--   vende. Fica gravado em cada linha, tal como a percentagem.
-- · Produtos com variantes (tamanhos) não entram em guias: o stock deles é por variante.
-- · Nada mexe em valores sem a equipa validar: o relatório enviado pelo colportor só gera
--   vendas, comissão e saída do stock em mão quando é validado.
-- · Vendas de livros comprados (stock próprio do colportor) entram no relatório só para as
--   estatísticas: já foram pagos na compra.
-- · O limite em consignação (colporteurs.credit_limit, ou o das definições; 0 = sem limite)
--   aplica-se ao saldo da conta depois da entrega.
-- · Os movimentos do stock da loja ficam em stock_movements com motivos próprios.
--
-- Reverter: drop das funções colporteur_issue_document, colporteur_report_*,
-- colporteur_record_payment, colporteur_ledger_adjust, colporteur_overview e das tabelas criadas
-- aqui; repor o check de stock_movements.reason.

-- 1. Motivos novos no histórico de stock -----------------------------------------------------
alter table public.stock_movements drop constraint if exists stock_movements_reason_check;
alter table public.stock_movements add constraint stock_movements_reason_check
  check (reason in ('inicial', 'venda', 'cancelamento', 'ajuste', 'consignacao', 'devolucao_consignacao', 'compra_colportor'));

insert into private.product_code_counters (prefix, last_value) values ('GUI-', 0)
on conflict (prefix) do nothing;

-- 2. Tabelas ------------------------------------------------------------------------------------
create table if not exists public.colporteur_documents (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  colporteur_id uuid not null references public.colporteurs(id) on delete restrict,
  kind text not null check (kind in ('entrega', 'devolucao', 'compra')),
  lines jsonb not null default '[]'::jsonb,
  total_value numeric(14,2) not null default 0,
  discount_value numeric(14,2) not null default 0,
  amount numeric(14,2) not null default 0,
  notes text not null default '' check (length(notes) <= 500),
  created_by uuid,
  created timestamptz not null default now()
);
create index if not exists colporteur_documents_colporteur_idx on public.colporteur_documents (colporteur_id, created desc);
comment on table public.colporteur_documents is 'Guias numeradas (GUI-): entrega à consignação, devolução, compra com desconto. lines = [{book_id, book_code, title, qty, unit_price, pct}].';

create table if not exists public.colporteur_reports (
  id uuid primary key default gen_random_uuid(),
  colporteur_id uuid not null references public.colporteurs(id) on delete restrict,
  week_start date not null check (extract(isodow from week_start) = 1),
  hours numeric(5,1) not null default 0 check (hours between 0 and 120),
  visits integer not null default 0 check (visits between 0 and 5000),
  prayers integer not null default 0 check (prayers between 0 and 5000),
  free_literature integer not null default 0 check (free_literature between 0 and 50000),
  bible_studies integer not null default 0 check (bible_studies between 0 and 5000),
  interests integer not null default 0 check (interests between 0 and 5000),
  baptisms integer not null default 0 check (baptisms between 0 and 500),
  interest_contacts jsonb not null default '[]'::jsonb,
  sales jsonb not null default '[]'::jsonb,
  notes text not null default '' check (length(notes) <= 2000),
  status text not null default 'rascunho' check (status in ('rascunho', 'enviado', 'validado', 'devolvido')),
  return_reason text not null default '' check (length(return_reason) <= 500),
  sales_value numeric(14,2) not null default 0,
  commission_value numeric(14,2) not null default 0,
  submitted_at timestamptz,
  validated_by uuid,
  validated_at timestamptz,
  created_by uuid,
  created timestamptz not null default now(),
  updated timestamptz not null default now(),
  unique (colporteur_id, week_start)
);
create index if not exists colporteur_reports_week_idx on public.colporteur_reports (week_start desc);
comment on table public.colporteur_reports is 'Relatório semanal (segunda a domingo). sales = [{book_id, qty, source: consignacao|proprio}]. Valores só depois de validado.';

create table if not exists public.colporteur_stock_moves (
  id bigint generated always as identity primary key,
  colporteur_id uuid not null references public.colporteurs(id) on delete restrict,
  book_id text not null references public.stock_books(id) on delete restrict,
  qty integer not null check (qty <> 0),
  kind text not null check (kind in ('entrega', 'devolucao', 'venda', 'ajuste')),
  unit_price numeric(12,2) not null default 0,
  pct numeric(5,2),
  document_id uuid references public.colporteur_documents(id) on delete restrict,
  report_id uuid references public.colporteur_reports(id) on delete restrict,
  actor uuid,
  created timestamptz not null default now()
);
create index if not exists colporteur_stock_moves_idx on public.colporteur_stock_moves (colporteur_id, book_id);
comment on table public.colporteur_stock_moves is 'Livros à consignação com cada colportor. Em mão = soma de qty por livro.';

create table if not exists public.colporteur_ledger (
  id bigint generated always as identity primary key,
  colporteur_id uuid not null references public.colporteurs(id) on delete restrict,
  entry_date date not null default current_date,
  kind text not null check (kind in ('entrega', 'devolucao', 'compra', 'comissao', 'pagamento_recebido', 'pagamento_feito', 'ajuste')),
  amount numeric(14,2) not null,
  description text not null default '' check (length(description) <= 300),
  method text not null default '' check (length(method) <= 40),
  reference text not null default '' check (length(reference) <= 80),
  document_id uuid references public.colporteur_documents(id) on delete restrict,
  report_id uuid references public.colporteur_reports(id) on delete restrict,
  order_id text,
  actor uuid,
  created timestamptz not null default now()
);
create index if not exists colporteur_ledger_idx on public.colporteur_ledger (colporteur_id, entry_date, id);
-- Uma comissão por encomenda (vendas no site).
create unique index if not exists colporteur_ledger_uma_por_encomenda on public.colporteur_ledger (order_id, kind) where order_id is not null;
comment on table public.colporteur_ledger is 'Conta corrente. amount > 0 = o colportor deve à Livraria; < 0 = a Livraria deve-lhe. Saldo = soma.';

-- 3. RLS: a equipa lê tudo; o colportor lê o seu. Escrita só pelas funções. -----------------------
do $$
declare t text;
begin
  foreach t in array array['colporteur_documents', 'colporteur_reports', 'colporteur_stock_moves', 'colporteur_ledger'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('drop policy if exists %I on public.%I', t || ': equipa ou o próprio lê', t);
    execute format($p$create policy %I on public.%I for select to authenticated using (
      (select private.can_manage_colporteurs())
      or exists (select 1 from public.colporteurs c where c.id = colporteur_id and c.profile_id = (select auth.uid())))$p$, t || ': equipa ou o próprio lê', t);
  end loop;
end $$;

-- 4. Saldos ----------------------------------------------------------------------------------------
create or replace function private.colporteur_balance(p_colporteur uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(amount), 0) from public.colporteur_ledger where colporteur_id = p_colporteur;
$$;
revoke all on function private.colporteur_balance(uuid) from public, anon, authenticated;

create or replace function private.colporteur_in_hand(p_colporteur uuid, p_book text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(qty), 0)::int from public.colporteur_stock_moves where colporteur_id = p_colporteur and book_id = p_book;
$$;
revoke all on function private.colporteur_in_hand(uuid, text) from public, anon, authenticated;

-- 5. Guias -------------------------------------------------------------------------------------------
-- p_lines = [{book_id, qty}]. Devolve {id, number, amount, discount}.
create or replace function public.colporteur_issue_document(p_colporteur uuid, p_kind text, p_lines jsonb, p_notes text default '')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.colporteurs;
  v_line jsonb;
  v_book public.stock_books;
  v_qty integer;
  v_price numeric;
  v_pct numeric;
  v_lines jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_discount numeric := 0;
  v_amount numeric;
  v_doc uuid;
  v_number text;
  v_limit numeric;
  v_seen text[] := '{}';
begin
  perform private.assert_colporteurs();
  if p_kind not in ('entrega', 'devolucao', 'compra') then raise exception 'Tipo de guia inválido.'; end if;
  select * into v_c from public.colporteurs where id = p_colporteur for update;
  if v_c.id is null then raise exception 'Colportor não encontrado.'; end if;
  if p_kind <> 'devolucao' and v_c.status <> 'activo' then raise exception 'Só um colportor activo recebe livros.'; end if;
  if v_c.status not in ('activo', 'suspenso', 'inactivo') then raise exception 'Este colportor nunca foi aprovado.'; end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'A guia não tem livros.'; end if;
  if jsonb_array_length(p_lines) > 200 then raise exception 'Guia demasiado grande (máximo 200 linhas).'; end if;

  v_number := private.formata_codigo('GUI-', private.codigo_seguinte('GUI-'));
  insert into public.colporteur_documents (number, colporteur_id, kind, notes, created_by)
  values (v_number, p_colporteur, p_kind, left(coalesce(p_notes, ''), 500), auth.uid()) returning id into v_doc;

  perform set_config('app.stock_reason', case p_kind when 'entrega' then 'consignacao' when 'devolucao' then 'devolucao_consignacao' else 'compra_colportor' end, true);
  perform set_config('app.stock_ref', v_number, true);

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty := (v_line ->> 'qty')::int;
    if v_qty is null or v_qty <= 0 or v_qty > 10000 then raise exception 'Quantidade inválida.'; end if;
    if (v_line ->> 'book_id') = any(v_seen) then raise exception 'O mesmo livro aparece duas vezes na guia.'; end if;
    v_seen := v_seen || (v_line ->> 'book_id');
    select * into v_book from public.stock_books where id = v_line ->> 'book_id' for update;
    if v_book.id is null then raise exception 'Produto não encontrado.'; end if;
    if jsonb_typeof(v_book.versions) = 'array' and jsonb_array_length(v_book.versions) > 0 then
      raise exception '"%" tem variantes (tamanhos): não entra em guias.', v_book.title;
    end if;
    v_price := round(coalesce(v_book.price, 0)::numeric, 2);
    v_pct := null;
    if p_kind = 'devolucao' then
      if private.colporteur_in_hand(p_colporteur, v_book.id) < v_qty then
        raise exception 'O colportor só tem % de "%" à consignação.', private.colporteur_in_hand(p_colporteur, v_book.id), v_book.title;
      end if;
      update public.stock_books set stock = coalesce(stock, 0) + v_qty where id = v_book.id;
      insert into public.colporteur_stock_moves (colporteur_id, book_id, qty, kind, unit_price, document_id, actor)
      values (p_colporteur, v_book.id, -v_qty, 'devolucao', v_price, v_doc, auth.uid());
    else
      if coalesce(v_book.stock, 0) < v_qty then raise exception 'Stock insuficiente de "%" (há %).', v_book.title, coalesce(v_book.stock, 0); end if;
      update public.stock_books set stock = coalesce(stock, 0) - v_qty where id = v_book.id;
      if p_kind = 'entrega' then
        insert into public.colporteur_stock_moves (colporteur_id, book_id, qty, kind, unit_price, document_id, actor)
        values (p_colporteur, v_book.id, v_qty, 'entrega', v_price, v_doc, auth.uid());
      else
        v_pct := private.colporteur_pct(p_colporteur, coalesce(v_book.product_type, 'livro'), 'compra', current_date);
        v_discount := v_discount + round(v_price * v_qty * v_pct / 100, 2);
      end if;
    end if;
    v_total := v_total + v_price * v_qty;
    v_lines := v_lines || jsonb_build_object('book_id', v_book.id, 'book_code', v_book.book_code, 'title', v_book.title,
      'qty', v_qty, 'unit_price', v_price, 'pct', v_pct);
  end loop;
  perform set_config('app.stock_reason', '', true);
  perform set_config('app.stock_ref', '', true);

  v_amount := case p_kind when 'devolucao' then -v_total when 'compra' then v_total - v_discount else v_total end;
  update public.colporteur_documents set lines = v_lines, total_value = v_total, discount_value = v_discount, amount = v_amount where id = v_doc;
  insert into public.colporteur_ledger (colporteur_id, kind, amount, description, document_id, actor)
  values (p_colporteur, p_kind, v_amount, v_number, v_doc, auth.uid());

  if p_kind = 'entrega' then
    v_limit := coalesce(v_c.credit_limit, (select default_credit_limit from public.colporteur_settings where id = 1), 0);
    if v_limit > 0 and private.colporteur_balance(p_colporteur) > v_limit then
      raise exception 'Passa o limite em consignação (% Kz): o saldo ficaria em % Kz. Receba pagamentos ou devoluções antes.',
        to_char(v_limit, 'FM999G999G990'), to_char(private.colporteur_balance(p_colporteur), 'FM999G999G990');
    end if;
  end if;
  return jsonb_build_object('id', v_doc, 'number', v_number, 'amount', v_amount, 'discount', v_discount);
end;
$$;

-- 6. Relatório semanal ---------------------------------------------------------------------------------
-- Limpa e valida o que vem do formulário (do colportor ou da equipa).
create or replace function private.colporteur_report_clean(p jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sales jsonb := '[]'::jsonb;
  v_contacts jsonb := '[]'::jsonb;
  v_line jsonb;
  v_n integer := 0;
begin
  for v_line in select * from jsonb_array_elements(case when jsonb_typeof(p -> 'sales') = 'array' then p -> 'sales' else '[]'::jsonb end) loop
    v_n := v_n + 1;
    if v_n > 200 then raise exception 'Demasiadas linhas de vendas.'; end if;
    if coalesce((v_line ->> 'qty')::int, 0) <= 0 then continue; end if;
    if not exists (select 1 from public.stock_books where id = v_line ->> 'book_id') then raise exception 'Livro desconhecido no relatório.'; end if;
    v_sales := v_sales || jsonb_build_object('book_id', v_line ->> 'book_id', 'qty', least((v_line ->> 'qty')::int, 10000),
      'source', case when v_line ->> 'source' = 'proprio' then 'proprio' else 'consignacao' end);
  end loop;
  v_n := 0;
  for v_line in select * from jsonb_array_elements(case when jsonb_typeof(p -> 'interest_contacts') = 'array' then p -> 'interest_contacts' else '[]'::jsonb end) loop
    v_n := v_n + 1;
    exit when v_n > 100;
    continue when length(btrim(coalesce(v_line ->> 'name', ''))) = 0;
    v_contacts := v_contacts || jsonb_build_object('name', left(btrim(v_line ->> 'name'), 120), 'phone', left(regexp_replace(coalesce(v_line ->> 'phone', ''), '\D', '', 'g'), 15),
      'place', left(btrim(coalesce(v_line ->> 'place', '')), 120), 'request', left(btrim(coalesce(v_line ->> 'request', '')), 200));
  end loop;
  return jsonb_build_object('sales', v_sales, 'interest_contacts', v_contacts);
end;
$$;
revoke all on function private.colporteur_report_clean(jsonb) from public, anon, authenticated;

-- Guarda (e, com p_submit, envia) o relatório de uma semana. O colportor só mexe no seu, e só
-- enquanto não está enviado/validado; a equipa pode lançar por ele (quem não tem telemóvel).
create or replace function public.colporteur_report_save(p_report jsonb, p_submit boolean default false, p_colporteur uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff boolean := private.can_manage_colporteurs();
  v_colp uuid;
  v_status text;
  v_week date := date_trunc('week', (p_report ->> 'week_start')::date)::date;
  v_clean jsonb := private.colporteur_report_clean(p_report);
  v_id uuid;
  v_line jsonb;
begin
  if v_staff and p_colporteur is not null then
    v_colp := p_colporteur;
  else
    select id into v_colp from public.colporteurs where profile_id = auth.uid() and status = 'activo';
    if v_colp is null then raise exception 'Só um colportor activo envia relatórios.' using errcode = '42501'; end if;
  end if;
  if v_week is null then raise exception 'Indique a semana.'; end if;
  if v_week > current_date then raise exception 'Essa semana ainda não começou.'; end if;
  if v_week < current_date - 400 then raise exception 'Semana demasiado antiga.'; end if;

  select status into v_status from public.colporteur_reports where colporteur_id = v_colp and week_start = v_week;
  if v_status = 'validado' then raise exception 'O relatório dessa semana já foi validado.'; end if;
  if v_status = 'enviado' and not v_staff then raise exception 'O relatório dessa semana já foi enviado. Peça à equipa para o devolver se precisar de corrigir.'; end if;

  -- As vendas à consignação não podem passar o que o colportor tem em mão.
  if p_submit then
    for v_line in select * from jsonb_array_elements(v_clean -> 'sales') loop
      if v_line ->> 'source' = 'consignacao' and private.colporteur_in_hand(v_colp, v_line ->> 'book_id') < (v_line ->> 'qty')::int then
        raise exception 'Vendeu mais "%" do que tem à consignação (%).', (select title from public.stock_books where id = v_line ->> 'book_id'),
          private.colporteur_in_hand(v_colp, v_line ->> 'book_id');
      end if;
    end loop;
  end if;

  insert into public.colporteur_reports as r (colporteur_id, week_start, hours, visits, prayers, free_literature, bible_studies, interests, baptisms,
    interest_contacts, sales, notes, status, submitted_at, created_by)
  values (v_colp, v_week, coalesce((p_report ->> 'hours')::numeric, 0), coalesce((p_report ->> 'visits')::int, 0), coalesce((p_report ->> 'prayers')::int, 0),
    coalesce((p_report ->> 'free_literature')::int, 0), coalesce((p_report ->> 'bible_studies')::int, 0), coalesce((p_report ->> 'interests')::int, 0),
    coalesce((p_report ->> 'baptisms')::int, 0), v_clean -> 'interest_contacts', v_clean -> 'sales', left(coalesce(p_report ->> 'notes', ''), 2000),
    case when p_submit then 'enviado' else 'rascunho' end, case when p_submit then now() end, auth.uid())
  on conflict (colporteur_id, week_start) do update set
    hours = excluded.hours, visits = excluded.visits, prayers = excluded.prayers, free_literature = excluded.free_literature,
    bible_studies = excluded.bible_studies, interests = excluded.interests, baptisms = excluded.baptisms,
    interest_contacts = excluded.interest_contacts, sales = excluded.sales, notes = excluded.notes,
    status = case when p_submit then 'enviado' else r.status end,
    submitted_at = case when p_submit then now() else r.submitted_at end,
    updated = now()
  returning id into v_id;
  return v_id;
end;
$$;

-- Validar: as vendas à consignação saem do stock em mão e a comissão entra na conta. A percentagem
-- é a que vigorava no último dia da semana.
create or replace function public.colporteur_report_validate(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r public.colporteur_reports;
  v_line jsonb;
  v_book public.stock_books;
  v_qty integer;
  v_price numeric;
  v_pct numeric;
  v_value numeric := 0;
  v_commission numeric := 0;
  v_sales jsonb := '[]'::jsonb;
begin
  perform private.assert_colporteurs();
  select * into v_r from public.colporteur_reports where id = p_id for update;
  if v_r.id is null then raise exception 'Relatório não encontrado.'; end if;
  if v_r.status = 'validado' then raise exception 'Já estava validado.'; end if;
  if v_r.status = 'rascunho' then raise exception 'O relatório ainda não foi enviado.'; end if;
  perform 1 from public.colporteurs where id = v_r.colporteur_id for update;

  for v_line in select * from jsonb_array_elements(v_r.sales) loop
    v_qty := (v_line ->> 'qty')::int;
    select * into v_book from public.stock_books where id = v_line ->> 'book_id';
    v_price := round(coalesce(v_book.price, 0)::numeric, 2);
    v_pct := null;
    if v_line ->> 'source' = 'consignacao' then
      if private.colporteur_in_hand(v_r.colporteur_id, v_book.id) < v_qty then
        raise exception 'O colportor só tem % de "%" à consignação. Devolva o relatório para corrigir.', private.colporteur_in_hand(v_r.colporteur_id, v_book.id), v_book.title;
      end if;
      v_pct := private.colporteur_pct(v_r.colporteur_id, coalesce(v_book.product_type, 'livro'), 'consignacao', v_r.week_start + 6);
      insert into public.colporteur_stock_moves (colporteur_id, book_id, qty, kind, unit_price, pct, report_id, actor)
      values (v_r.colporteur_id, v_book.id, -v_qty, 'venda', v_price, v_pct, v_r.id, auth.uid());
      v_commission := v_commission + round(v_price * v_qty * v_pct / 100, 2);
    end if;
    v_value := v_value + v_price * v_qty;
    v_sales := v_sales || (v_line || jsonb_build_object('title', v_book.title, 'book_code', v_book.book_code, 'unit_price', v_price, 'pct', v_pct));
  end loop;

  if v_commission > 0 then
    insert into public.colporteur_ledger (colporteur_id, entry_date, kind, amount, description, report_id, actor)
    values (v_r.colporteur_id, v_r.week_start + 6, 'comissao', -v_commission, 'Comissão da semana de ' || to_char(v_r.week_start, 'DD/MM/YYYY'), v_r.id, auth.uid());
  end if;
  update public.colporteur_reports set status = 'validado', sales = v_sales, sales_value = v_value, commission_value = v_commission,
    validated_by = auth.uid(), validated_at = now(), return_reason = '', updated = now()
  where id = p_id;
  return jsonb_build_object('sales_value', v_value, 'commission', v_commission);
end;
$$;

create or replace function public.colporteur_report_return(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_colporteurs();
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Diga ao colportor o que corrigir.'; end if;
  update public.colporteur_reports set status = 'devolvido', return_reason = left(p_reason, 500), updated = now()
   where id = p_id and status = 'enviado';
  if not found then raise exception 'Só se devolve um relatório enviado e por validar.'; end if;
end;
$$;

-- 7. Pagamentos e acertos -------------------------------------------------------------------------------
create or replace function public.colporteur_record_payment(
  p_colporteur uuid, p_direction text, p_amount numeric, p_method text default '', p_reference text default '',
  p_date date default current_date, p_notes text default ''
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform private.assert_colporteurs();
  if p_direction not in ('recebido', 'pago') then raise exception 'Indique se o dinheiro foi recebido do colportor ou pago a ele.'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000000 then raise exception 'Valor inválido.'; end if;
  if not exists (select 1 from public.colporteurs where id = p_colporteur and code is not null) then raise exception 'Colportor não encontrado.'; end if;
  if coalesce(p_date, current_date) > current_date then raise exception 'A data não pode ser no futuro.'; end if;
  insert into public.colporteur_ledger (colporteur_id, entry_date, kind, amount, description, method, reference, actor)
  values (p_colporteur, coalesce(p_date, current_date), case p_direction when 'recebido' then 'pagamento_recebido' else 'pagamento_feito' end,
          case p_direction when 'recebido' then -round(p_amount, 2) else round(p_amount, 2) end,
          left(coalesce(p_notes, ''), 300), left(coalesce(p_method, ''), 40), left(coalesce(p_reference, ''), 80), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Correcção à mão (com motivo obrigatório). Positivo = o colportor passa a dever mais.
create or replace function public.colporteur_ledger_adjust(p_colporteur uuid, p_amount numeric, p_description text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform private.assert_colporteurs();
  if p_amount is null or p_amount = 0 then raise exception 'Valor inválido.'; end if;
  if length(btrim(coalesce(p_description, ''))) < 5 then raise exception 'Explique a correcção.'; end if;
  if not exists (select 1 from public.colporteurs where id = p_colporteur and code is not null) then raise exception 'Colportor não encontrado.'; end if;
  insert into public.colporteur_ledger (colporteur_id, kind, amount, description, actor)
  values (p_colporteur, 'ajuste', round(p_amount, 2), left(p_description, 300), auth.uid()) returning id into v_id;
  return v_id;
end;
$$;

-- 8. Resumo para o painel e para o próprio colportor ------------------------------------------------------
-- Saldo, livros em mão (com valor) e totais do ano, por colportor. A equipa vê todos; o colportor só o seu.
create or replace function public.colporteur_overview(p_colporteur uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_staff boolean := private.can_manage_colporteurs();
  v_self uuid := (select id from public.colporteurs where profile_id = auth.uid());
begin
  if not v_staff then
    if v_self is null then raise exception 'Sem acesso.' using errcode = '42501'; end if;
    p_colporteur := v_self;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'colporteur_id', c.id,
      'balance', private.colporteur_balance(c.id),
      'in_hand', coalesce((
        select jsonb_agg(jsonb_build_object('book_id', m.book_id, 'title', b.title, 'book_code', b.book_code, 'qty', m.qty, 'unit_price', b.price, 'product_type', b.product_type) order by b.title)
        from (select book_id, sum(qty)::int qty from public.colporteur_stock_moves where colporteur_id = c.id group by book_id having sum(qty) <> 0) m
        join public.stock_books b on b.id = m.book_id), '[]'::jsonb),
      'in_hand_value', coalesce((
        select sum(m.qty * b.price) from (select book_id, sum(qty) qty from public.colporteur_stock_moves where colporteur_id = c.id group by book_id) m
        join public.stock_books b on b.id = m.book_id), 0),
      'year_hours', coalesce((select sum(hours) from public.colporteur_reports where colporteur_id = c.id and status = 'validado' and week_start >= date_trunc('year', current_date)), 0),
      'year_sales', coalesce((select sum(sales_value) from public.colporteur_reports where colporteur_id = c.id and status = 'validado' and week_start >= date_trunc('year', current_date)), 0),
      'year_commission', coalesce((select -sum(amount) from public.colporteur_ledger where colporteur_id = c.id and kind = 'comissao' and entry_date >= date_trunc('year', current_date)), 0),
      'last_report', (select max(week_start) from public.colporteur_reports where colporteur_id = c.id and status in ('enviado', 'validado'))
    ))
    from public.colporteurs c
    where c.code is not null and (p_colporteur is null or c.id = p_colporteur)
  ), '[]'::jsonb);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.colporteur_issue_document(uuid, text, jsonb, text)',
    'public.colporteur_report_save(jsonb, boolean, uuid)',
    'public.colporteur_report_validate(uuid)',
    'public.colporteur_report_return(uuid, text)',
    'public.colporteur_record_payment(uuid, text, numeric, text, text, date, text)',
    'public.colporteur_ledger_adjust(uuid, numeric, text)',
    'public.colporteur_overview(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
