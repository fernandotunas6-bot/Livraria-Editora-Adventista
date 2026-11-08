-- Erros e avisos vistos em produção (registos e avisos do Supabase, 2026-11-08).
--
-- 1. Criar ou mudar o email de um contacto pelo painel falhava sempre, desde 20261102150000
--    ("permission denied for function new_unsubscribe_token"). O gatilho corria como quem chama, e
--    a função que gera o token está fechada a quem usa o site (e bem: o token serve para cancelar a
--    subscrição de alguém). Sem email não falhava, e por isso o CRM parecia estar bem. Agora o
--    gatilho é security definer; a função continua fechada.
-- 2. A política de leitura de delivery_positions reavaliava auth.uid() em cada linha.
-- 3. Índices nas chaves estrangeiras que os não tinham (aviso unindexed_foreign_keys). Sem eles, apagar
--    uma linha da tabela referida percorre a tabela inteira.
--
-- Reverter: repor private.set_unsubscribe_token de 20261102110000 (sem security definer) e a
-- política de 20261108211000; drop dos índices *_fk_idx.

create or replace function private.set_unsubscribe_token()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.unsubscribe_token is null and coalesce(new.email, '') <> '' then
    new.unsubscribe_token := private.new_unsubscribe_token();
  end if;
  return new;
end;
$$;
revoke all on function private.set_unsubscribe_token() from public, anon, authenticated;

drop policy if exists "delivery_positions: quem entrega ou a equipa lê" on public.delivery_positions;
create policy "delivery_positions: quem entrega ou a equipa lê" on public.delivery_positions
  for select to authenticated
  using (courier_profile = (select auth.uid()) or (select private.has_permission('manage_orders')));

create index if not exists app_releases_created_by_fk_idx on public.app_releases (created_by);
create index if not exists church_districts_municipality_fk_idx on public.church_districts (municipality_id);
create index if not exists church_districts_province_fk_idx on public.church_districts (province_id);
create index if not exists church_fields_parent_fk_idx on public.church_fields (parent_id);
create index if not exists churches_delegate_pastor_fk_idx on public.churches (delegate_pastor_id);
create index if not exists churches_field_fk_idx on public.churches (field_id);
create index if not exists churches_municipality_fk_idx on public.churches (municipality_id);
create index if not exists churches_province_fk_idx on public.churches (province_id);
create index if not exists colporteur_invites_colporteur_fk_idx on public.colporteur_invites (colporteur_id);
create index if not exists colporteur_ledger_document_fk_idx on public.colporteur_ledger (document_id);
create index if not exists colporteur_ledger_report_fk_idx on public.colporteur_ledger (report_id);
create index if not exists colporteur_stock_moves_book_fk_idx on public.colporteur_stock_moves (book_id);
create index if not exists colporteur_stock_moves_document_fk_idx on public.colporteur_stock_moves (document_id);
create index if not exists colporteur_stock_moves_report_fk_idx on public.colporteur_stock_moves (report_id);
create index if not exists colporteurs_approved_by_fk_idx on public.colporteurs (approved_by);
create index if not exists colporteurs_municipality_fk_idx on public.colporteurs (municipality_id);
create index if not exists colporteurs_province_fk_idx on public.colporteurs (province_id);
create index if not exists colporteurs_recommended_by_pastor_fk_idx on public.colporteurs (recommended_by_pastor_id);
create index if not exists download_blocks_blocked_by_fk_idx on public.download_blocks (blocked_by);
create index if not exists pastors_province_fk_idx on public.pastors (province_id);
