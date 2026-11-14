-- Relatórios de vendas de todas as livrarias (pedido do dono, 2026-11-14).
--
-- O painel «Vendas por loja» mostrava uma loja de cada vez, e só um administrador gravava os
-- números. Passa a haver o relatório conjunto (todas as livrarias num só sítio, com estatísticas
-- e vídeo) e os números passam a poder ser geridos por quem tem a permissão para isso — à mão,
-- ou a partir das vendas que o sistema já regista (encomendas pagas de cada loja).
--
-- 1. Permissão nova `edit_reports` («Editar relatórios de vendas»): ver e gravar as vendas
--    mensais de cada loja (Vendas por loja e o relatório conjunto) — os meses, as metas, os
--    critérios e as observações. Não abre o resto da facturação (o relatório de caixa e os
--    números do mês no Início continuam com «Ver relatórios»): serve para a pessoa da loja que
--    lança os números do mês. Ninguém a recebe nesta migração (nem os cargos que já existem):
--    o administrador dá-a a quem preenche os números, por exemplo ao cargo Contabilidade.
--    As chaves estão em três sítios: lib/permissions.js, supabase/functions/app/permissions.ts e
--    private.permission_keys() aqui (o teste lib/permissions.test.js obriga-os a bater certo).
--
-- 2. Ler vendas_anos e painel_vendas_docs: «Ver relatórios» ou «Editar relatórios de vendas».
--    Gravar: «Editar relatórios de vendas» (ou administrador). APAGAR um ano inteiro continua só
--    do administrador.
--
-- 3. O servidor regista quem gravou e quando (`actualizado`, `actualizado_por`), em cada escrita —
--    antes só na criação, e com a hora que o navegador mandava. E a origem dos números
--    (`origem`: manual, sistema, misto ou importação), que o painel indica ao gravar.
--
-- 4. Histórico no servidor: public.vendas_alteracoes, uma linha por gravação com os meses que
--    mudaram (de → para), quem e de onde vieram os números. Escrita só pelo gatilho; ninguém a
--    altera pela API. Até aqui o histórico era um documento que o próprio painel escrevia
--    (painel_vendas_docs <loja>/historico/registo): servia de lembrete, não de prova.
--
-- 5. Documentos do relatório conjunto em painel_vendas_docs, no caminho consolidado/…
--    (por exemplo consolidado/notas/ano-2026, a nota que acompanha o relatório desse ano).
--
-- 6. As vendas do sistema por loja e por mês, calculadas no servidor (public.vendas_do_sistema):
--    a base para preencher os relatórios automaticamente. Antes o painel descarregava as
--    encomendas todas do ano para o navegador e só funcionava a quem gere encomendas (que vê os
--    clientes, as moradas e os telefones); agora devolve só totais, sem dados pessoais, a quem
--    vê ou edita os relatórios. As regras são as do painel: o dinheiro que entrou (pago menos
--    reembolsado, até ao total, sem os portes), pelo mês do pagamento na hora de Luanda, sem as
--    canceladas; o levantamento conta para a loja onde se levanta e a entrega para a loja da
--    província. Uma entrega numa província com duas lojas conta só para uma (a primeira activa
--    pela ordem do separador Lojas) — na rede não se pode contar duas vezes — e a que não tem
--    loja na província vem à parte (loja_id nulo), para o total da rede bater com as encomendas.
--
-- Reverter: drop da tabela vendas_alteracoes e dos gatilhos vendas_anos_before_save e
-- vendas_anos_historico (e das suas funções), drop da coluna vendas_anos.origem e da função
-- private.can_edit_reports; voltar as políticas de escrita a private.is_admin(), o check de
-- painel_vendas_docs.path ao de 20261101205332 e private.permission_keys() ao de 20261108190000.

-- ---------------------------------------------------------------------------------------------
-- 1. A permissão
-- ---------------------------------------------------------------------------------------------
create or replace function private.permission_keys()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['manage_catalog','manage_orders','manage_settings','manage_users','manage_payments',
               'confirm_payments','view_reports','manage_marketing','manage_church_registry','manage_colporteurs',
               'manage_production','manage_staff','manage_finance','edit_reports'];
$$;
revoke all on function private.permission_keys() from public, anon;
grant execute on function private.permission_keys() to authenticated, service_role;

-- Quem grava os relatórios de vendas: o administrador (has_permission dá-lhe tudo) ou o gestor
-- com «Editar relatórios de vendas». Com MFA, exige a sessão aal2, como has_permission.
create or replace function private.can_edit_reports()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_permission('edit_reports');
$$;
comment on function private.can_edit_reports() is
  'Grava os relatórios de vendas (vendas_anos, painel_vendas_docs): admin, ou gestor com edit_reports.';
revoke all on function private.can_edit_reports() from public, anon;
grant execute on function private.can_edit_reports() to authenticated, service_role;

-- Quem lê os relatórios de vendas: «Ver relatórios» ou «Editar relatórios de vendas».
create or replace function private.can_read_sales_reports()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_permission('view_reports') or private.has_permission('edit_reports');
$$;
comment on function private.can_read_sales_reports() is
  'Lê os relatórios de vendas (vendas_anos, painel_vendas_docs, vendas_alteracoes, vendas_do_sistema): view_reports ou edit_reports.';
revoke all on function private.can_read_sales_reports() from public, anon;
grant execute on function private.can_read_sales_reports() to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 2. Quem lê e quem escreve
-- ---------------------------------------------------------------------------------------------
drop policy if exists "vendas_anos: relatórios lê" on public.vendas_anos;
create policy "vendas_anos: relatórios lê" on public.vendas_anos for select to authenticated
  using ((select private.can_read_sales_reports()));
drop policy if exists "painel_vendas_docs: relatórios lê" on public.painel_vendas_docs;
create policy "painel_vendas_docs: relatórios lê" on public.painel_vendas_docs for select to authenticated
  using ((select private.can_read_sales_reports()));

drop policy if exists "vendas_anos: admin cria" on public.vendas_anos;
drop policy if exists "vendas_anos: admin edita" on public.vendas_anos;
drop policy if exists "vendas_anos: relatórios cria" on public.vendas_anos;
drop policy if exists "vendas_anos: relatórios edita" on public.vendas_anos;
create policy "vendas_anos: relatórios cria" on public.vendas_anos for insert to authenticated
  with check ((select private.can_edit_reports()));
create policy "vendas_anos: relatórios edita" on public.vendas_anos for update to authenticated
  using ((select private.can_edit_reports())) with check ((select private.can_edit_reports()));
-- "vendas_anos: admin apaga" fica como estava: apagar um ano inteiro é só do administrador.

drop policy if exists "painel_vendas_docs: admin cria" on public.painel_vendas_docs;
drop policy if exists "painel_vendas_docs: admin edita" on public.painel_vendas_docs;
drop policy if exists "painel_vendas_docs: relatórios cria" on public.painel_vendas_docs;
drop policy if exists "painel_vendas_docs: relatórios edita" on public.painel_vendas_docs;
create policy "painel_vendas_docs: relatórios cria" on public.painel_vendas_docs for insert to authenticated
  with check ((select private.can_edit_reports()));
create policy "painel_vendas_docs: relatórios edita" on public.painel_vendas_docs for update to authenticated
  using ((select private.can_edit_reports())) with check ((select private.can_edit_reports()));

-- ---------------------------------------------------------------------------------------------
-- 3. Quem gravou, quando e de onde vieram os números
-- ---------------------------------------------------------------------------------------------
alter table public.vendas_anos add column if not exists origem text not null default 'manual';
alter table public.vendas_anos drop constraint if exists vendas_anos_origem_check;
alter table public.vendas_anos add constraint vendas_anos_origem_check
  check (origem in ('manual', 'sistema', 'misto', 'importacao'));
comment on column public.vendas_anos.origem is
  'De onde vieram os números da última gravação: manual, sistema (vendas registadas nas encomendas), misto ou importacao.';

-- Os valores dos meses: números não negativos ou nulos (o painel já só grava isso; a base passa a
-- recusar o resto, para uma escrita directa pela API não estragar as somas).
create or replace function private.vendas_meses_validos(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'array' and jsonb_array_length(p) = 12
     and not exists (
       select 1 from jsonb_array_elements(p) e
       where not (jsonb_typeof(e) = 'null' or (jsonb_typeof(e) = 'number' and (e #>> '{}')::numeric >= 0))
     );
$$;
alter table public.vendas_anos drop constraint if exists vendas_anos_meses_validos;
alter table public.vendas_anos add constraint vendas_anos_meses_validos
  check (private.vendas_meses_validos(meses)) not valid;

create or replace function private.vendas_anos_before_save()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado := now();
  new.actualizado_por := coalesce(auth.uid(), case when tg_op = 'UPDATE' then old.actualizado_por end);
  return new;
end;
$$;
revoke all on function private.vendas_anos_before_save() from public, anon, authenticated;
drop trigger if exists vendas_anos_before_save on public.vendas_anos;
create trigger vendas_anos_before_save
  before insert or update on public.vendas_anos
  for each row execute function private.vendas_anos_before_save();

-- O relatório conjunto lê todas as lojas de um ano de uma vez.
create index if not exists vendas_anos_ano_idx on public.vendas_anos (ano);

-- ---------------------------------------------------------------------------------------------
-- 4. Histórico no servidor
-- ---------------------------------------------------------------------------------------------
create table if not exists public.vendas_alteracoes (
  id bigint generated always as identity primary key,
  em timestamptz not null default now(),
  loja_id text not null,
  ano integer not null,
  accao text not null check (accao in ('insert', 'update', 'delete')),
  por uuid references public.profiles (id) on delete set null,
  origem text,
  -- [{ "mes": 3, "de": 1200.5, "para": 1300 }, …] — só os meses que mudaram.
  meses jsonb not null default '[]'::jsonb,
  -- Outras mudanças do registo do ano: mês em curso, meta, critério, fonte, observações.
  outros jsonb not null default '{}'::jsonb
);
comment on table public.vendas_alteracoes is
  'Histórico das gravações dos relatórios de vendas (vendas_anos), escrito só pelo gatilho vendas_anos_historico. Lê quem vê os relatórios.';
create index if not exists vendas_alteracoes_loja_em_idx on public.vendas_alteracoes (loja_id, ano, em desc);
create index if not exists vendas_alteracoes_em_idx on public.vendas_alteracoes (em desc);
create index if not exists vendas_alteracoes_por_idx on public.vendas_alteracoes (por);

alter table public.vendas_alteracoes enable row level security;
drop policy if exists "vendas_alteracoes: relatórios lê" on public.vendas_alteracoes;
create policy "vendas_alteracoes: relatórios lê" on public.vendas_alteracoes for select to authenticated
  using ((select private.can_read_sales_reports()));
revoke insert, update, delete, truncate, trigger, references on public.vendas_alteracoes from anon, authenticated;
revoke all on public.vendas_alteracoes from anon;

create or replace function private.vendas_anos_historico()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else '{}'::jsonb end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else '{}'::jsonb end;
  v_meses jsonb := '[]'::jsonb;
  v_outros jsonb := '{}'::jsonb;
  v_de jsonb;
  v_para jsonb;
  v_campo text;
  i int;
begin
  for i in 0..11 loop
    v_de := coalesce(v_old -> 'meses' -> i, 'null'::jsonb);
    v_para := coalesce(v_new -> 'meses' -> i, 'null'::jsonb);
    -- Compara como números: 1300 e 1300.00 são o mesmo valor.
    if (case when jsonb_typeof(v_de) = 'number' then (v_de #>> '{}')::numeric end)
       is distinct from (case when jsonb_typeof(v_para) = 'number' then (v_para #>> '{}')::numeric end) then
      v_meses := v_meses || jsonb_build_object('mes', i + 1, 'de', v_de, 'para', v_para);
    end if;
  end loop;
  foreach v_campo in array array['mes_em_curso', 'meta_anual', 'criterio', 'fonte', 'observacoes'] loop
    -- Ao criar, só o que nasce com valor; ao apagar, os meses chegam (o resto vai com a linha).
    if tg_op = 'DELETE' then
      continue;
    end if;
    if tg_op = 'INSERT' and coalesce(v_new -> v_campo, 'null'::jsonb)
         in ('null'::jsonb, '""'::jsonb, '"media"'::jsonb, '["","","","","","","","","","","",""]'::jsonb) then
      continue;
    end if;
    if (v_old -> v_campo) is distinct from (v_new -> v_campo) then
      v_outros := v_outros || jsonb_build_object(v_campo, jsonb_build_object('de', v_old -> v_campo, 'para', v_new -> v_campo));
    end if;
  end loop;
  -- Uma gravação que não mudou nada (o painel grava o ano inteiro de cada vez) não fica no histórico.
  if tg_op = 'UPDATE' and v_meses = '[]'::jsonb and v_outros = '{}'::jsonb then
    return null;
  end if;
  insert into public.vendas_alteracoes (loja_id, ano, accao, por, origem, meses, outros)
  values (
    coalesce(new.loja_id, old.loja_id),
    coalesce(new.ano, old.ano),
    lower(tg_op),
    auth.uid(),
    case when tg_op = 'DELETE' then null else new.origem end,
    v_meses,
    v_outros
  );
  return null;
exception when others then
  -- Como no registo de segurança: o histórico nunca impede a gravação que observa.
  raise warning 'Histórico das vendas: não foi possível registar a gravação (%).', sqlerrm;
  return null;
end;
$$;
revoke all on function private.vendas_anos_historico() from public, anon, authenticated;
drop trigger if exists vendas_anos_historico on public.vendas_anos;
create trigger vendas_anos_historico
  after insert or update or delete on public.vendas_anos
  for each row execute function private.vendas_anos_historico();

-- ---------------------------------------------------------------------------------------------
-- 5. Documentos do relatório conjunto
-- ---------------------------------------------------------------------------------------------
alter table public.painel_vendas_docs drop constraint if exists painel_vendas_docs_path_check;
alter table public.painel_vendas_docs add constraint painel_vendas_docs_path_check
  check (path ~ '^([a-z0-9]{15}|consolidado)/(historico/registo|notas/[a-z0-9-]{1,40})$');

-- ---------------------------------------------------------------------------------------------
-- 6. As vendas do sistema, por loja e por mês
-- ---------------------------------------------------------------------------------------------
-- Nome e província comparados sem acentos nem maiúsculas («Huíla» = «huila»), como o painel:
-- private.plain_text (migração entregas_loja_e_robustez).
-- As encomendas de um ano que contam para os relatórios, cada uma com a sua loja, o seu mês (na
-- hora de Luanda), o valor em cêntimos e os itens. As regras estão só aqui: vendas_do_sistema
-- (totais) e produtos_mais_vendidos (por produto, migração imagens_e_mais_vendidos_dos_videos) leem
-- ambas esta função, para os dois números baterem sempre.
create or replace function private.vendas_encomendas(p_ano integer, p_so_pagas boolean)
returns table (encomenda text, loja_id text, mes integer, centimos numeric, itens jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with lojas as (
    select s.id,
           private.plain_text(s.name) as nome,
           private.plain_text(s.province) as prov,
           row_number() over (partition by private.plain_text(s.province)
                              order by s.active desc, s.sort_order nulls last, s.name, s.id) as ordem
    from public.physical_stores s
  ),
  limites as (
    -- Luanda está em UTC+1 todo o ano: o ano começa às 23:00 UTC de 31 de Dezembro.
    select make_timestamptz(p_ano, 1, 1, 0, 0, 0, 'UTC') - interval '1 hour' as de,
           make_timestamptz(p_ano + 1, 1, 1, 0, 0, 0, 'UTC') - interval '1 hour' as ate
  ),
  enc as (
    select
      o.id,
      case when p_so_pagas then o.paid_at else o.created end as quando,
      (coalesce(o.shipping_method, '') = 'pickup' or coalesce(o.pickup_store, '') <> '') as levanta,
      private.plain_text(o.pickup_store) as loja_nome,
      private.plain_text(o.delivery_province) as prov,
      case when p_so_pagas
        then least(round(coalesce(o.amount_paid, 0) * 100) - round(coalesce(o.amount_refunded, 0) * 100),
                   round(coalesce(o.total, 0)::numeric * 100))
             - round(coalesce(o.shipping_cost, 0)::numeric * 100)
        else round(coalesce(o.total, 0)::numeric * 100) - round(coalesce(o.shipping_cost, 0)::numeric * 100)
      end as centimos,
      case when jsonb_typeof(o.items) = 'array' then o.items else '[]'::jsonb end as itens
    from public.orders o, limites l
    where (case when p_so_pagas then o.paid_at else o.created end) >= l.de
      and (case when p_so_pagas then o.paid_at else o.created end) < l.ate
      and coalesce(o.status, '') <> 'cancelled'
      and coalesce(o.delivery_status, '') <> 'cancelled'
  )
  select
    e.id,
    case when e.levanta
      then (select l.id from lojas l where l.nome = e.loja_nome order by l.ordem limit 1)
      else (select l.id from lojas l where l.prov = e.prov and l.ordem = 1)
    end,
    extract(month from (e.quando + interval '1 hour') at time zone 'UTC')::integer,
    e.centimos,
    e.itens
  from enc e
  where not p_so_pagas or e.centimos > 0;
$$;
revoke all on function private.vendas_encomendas(integer, boolean) from public, anon, authenticated;

create or replace function public.vendas_do_sistema(p_ano integer, p_so_pagas boolean default true)
returns table (loja_id text, mes integer, valor numeric, encomendas integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_read_sales_reports() then
    raise exception 'Sem permissão para ver as vendas.' using errcode = '42501';
  end if;
  if p_ano is null or p_ano < 2000 or p_ano > 2100 then
    raise exception 'Ano inválido.' using errcode = '22023';
  end if;
  return query
  select e.loja_id, e.mes, (sum(greatest(e.centimos, 0)) / 100.0)::numeric(16, 2), count(*)::integer
  from private.vendas_encomendas(p_ano, p_so_pagas) e
  group by e.loja_id, e.mes
  order by e.loja_id nulls last, e.mes;
end;
$$;
comment on function public.vendas_do_sistema(integer, boolean) is
  'Totais das encomendas por loja e por mês (sem dados pessoais), para os relatórios de vendas. Quem vê ou edita os relatórios.';
revoke all on function public.vendas_do_sistema(integer, boolean) from public, anon;
grant execute on function public.vendas_do_sistema(integer, boolean) to authenticated, service_role;

-- A leitura pela data do pagamento usa orders_paid_at_idx (migração pagamentos_registados).
