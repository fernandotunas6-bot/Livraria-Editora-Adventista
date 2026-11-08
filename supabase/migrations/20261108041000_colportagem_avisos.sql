-- Colportagem: avisos à equipa (sino do painel e, conforme a equipa, email/WhatsApp/push).
--
-- Até aqui, uma candidatura nova ou um relatório por validar só se viam abrindo o separador
-- Colportagem. Passam a gerar um aviso em staff_notifications para quem gere colportores:
-- administradores e gestores com a permissão "Colportagem". O envio por outros canais é o de
-- sempre (a Edge Function envia os avisos por enviar, em horário de funcionamento).
--
-- Os dois tipos novos JUNTAM-SE à regra que existir, não a reescrevem. Esta migração nasceu como
-- 20261107110000, com uma lista fixa; entretanto entrou em produção o registo de segurança
-- (20261107130000), que acrescenta o tipo `security` — e há avisos desse tipo gravados. A lista
-- fixa apagava-o da regra, e o `add constraint` falhava sobre essas linhas: o `db push` parava e
-- a Edge Function não chegava a ser publicada. Mudou de data (20261108041000) porque o deploy
-- usa `--include-all`: com a data antiga corria depois das mais recentes em produção, mas antes
-- delas no CI, e o CI não via o problema.
-- Lê os dois formatos em que o Postgres guarda a regra; correr duas vezes não muda nada.
-- Reverter: drop dos triggers colporteurs_aviso_candidatura e colporteur_reports_aviso_enviado e
-- da função private.notify_colporteur_staff; tirar os dois tipos da regra.

do $$
declare
  v_def text;
  v_kinds text[];
begin
  select pg_get_constraintdef(c.oid) into v_def
  from pg_constraint c
  where c.conrelid = 'public.staff_notifications'::regclass and c.conname = 'staff_notifications_kind_check';
  select coalesce(array_agg(distinct coalesce(m[1], m[2])), array[]::text[]) into v_kinds
  from regexp_matches(coalesce(v_def, ''), '''([a-z_]+)''|[{,]([a-z_]+)(?=[,}])', 'g') as m;
  if v_def is not null and cardinality(v_kinds) = 0 then
    raise exception 'staff_notifications_kind_check com um formato inesperado: %', v_def;
  end if;
  if not ('colporteur_application' = any (v_kinds)) then
    v_kinds := v_kinds || 'colporteur_application'::text;
  end if;
  if not ('colporteur_report' = any (v_kinds)) then
    v_kinds := v_kinds || 'colporteur_report'::text;
  end if;
  alter table public.staff_notifications drop constraint if exists staff_notifications_kind_check;
  execute format('alter table public.staff_notifications add constraint staff_notifications_kind_check check (kind = any (array[%s]))',
    (select string_agg(quote_literal(k), ', ' order by k) from unnest(v_kinds) as k));
end
$$;

-- Um aviso a cada pessoa que gere colportores (administradores e gestores com a permissão).
create or replace function private.notify_colporteur_staff(p_kind text, p_title text, p_body text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.staff_notifications (staff_id, kind, title, body)
  select p.id, p_kind, left(p_title, 120), left(coalesce(nullif(btrim(p_body), ''), '—'), 500)
  from public.profiles p
  where p.role = 'admin' or (p.role = 'manager' and (p.permissions -> 'manage_colporteurs') = 'true'::jsonb);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function private.notify_colporteur_staff(text, text, text) from public, anon, authenticated;

create or replace function private.colporteurs_aviso_candidatura()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_church text;
begin
  if new.status <> 'candidatura' then return new; end if;
  select c.name || coalesce(' · ' || d.name, '') into v_church
    from public.churches c left join public.church_districts d on d.id = c.district_id where c.id = new.church_id;
  perform private.notify_colporteur_staff('colporteur_application', 'Nova candidatura a colportor',
    new.full_name || ' · ' || coalesce(v_church, nullif(new.church_other, ''), 'igreja não indicada'));
  return new;
end;
$$;
revoke all on function private.colporteurs_aviso_candidatura() from public, anon, authenticated;
drop trigger if exists colporteurs_aviso_candidatura on public.colporteurs;
create trigger colporteurs_aviso_candidatura after insert on public.colporteurs
  for each row execute function private.colporteurs_aviso_candidatura();

create or replace function private.colporteur_reports_aviso_enviado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.colporteurs;
begin
  if new.status <> 'enviado' or (tg_op = 'UPDATE' and old.status = 'enviado') then return new; end if;
  select * into v_c from public.colporteurs where id = new.colporteur_id;
  perform private.notify_colporteur_staff('colporteur_report', 'Relatório de colportor por validar',
    coalesce(v_c.code, '') || ' ' || coalesce(v_c.full_name, '') || ' · semana de ' || to_char(new.week_start, 'DD/MM/YYYY'));
  return new;
end;
$$;
revoke all on function private.colporteur_reports_aviso_enviado() from public, anon, authenticated;
drop trigger if exists colporteur_reports_aviso_enviado on public.colporteur_reports;
create trigger colporteur_reports_aviso_enviado after insert or update of status on public.colporteur_reports
  for each row execute function private.colporteur_reports_aviso_enviado();
