-- Rodapé do Painel de Gestão (docs/PAINEL-GESTAO.md §6.10): uma faixa a passar no fundo do ecrã, como nos
-- noticiários. As notícias saem dos números do painel (hoje, a meta, a loja que lidera, o mais vendido, a última
-- venda); a direcção junta as suas mensagens (uma promoção, um aviso à equipa, os parabéns a uma loja).

create table if not exists public.painel_rodape (
  id bigint generated always as identity primary key,
  texto text not null check (char_length(btrim(texto)) between 3 and 200),
  ordem int not null default 0,
  activo boolean not null default true,
  -- o último dia em que passa (vazio = sem fim): uma promoção da semana sai sozinha
  ate date,
  criado timestamptz not null default now()
);
alter table public.painel_rodape enable row level security;
revoke all on public.painel_rodape from anon, authenticated;
grant select, insert, update, delete on public.painel_rodape to authenticated;
drop policy if exists "painel_rodape: quem vê o painel" on public.painel_rodape;
create policy "painel_rodape: quem vê o painel" on public.painel_rodape
  for select to authenticated
  using ((select private.painel_ve_tudo()) or cardinality((select private.painel_lojas_proprias())) > 0);
drop policy if exists "painel_rodape: configurações ou relatórios" on public.painel_rodape;
create policy "painel_rodape: configurações ou relatórios" on public.painel_rodape
  for all to authenticated
  using ((select private.has_permission('manage_settings')) or (select private.has_permission('edit_reports')))
  with check ((select private.has_permission('manage_settings')) or (select private.has_permission('edit_reports')));
comment on table public.painel_rodape is
  'Mensagens da direcção no rodapé do Painel de Gestão (a passar, como nos noticiários). Edita quem tem Configurações ou Editar relatórios.';

-- As TVs recebem logo uma mensagem nova (o mesmo canal «painel» das vendas).
create or replace function private.painel_rodape_sinal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.realtime_signal('painel', 'rodape', '{}'::jsonb);
  return null;
end;
$$;
drop trigger if exists painel_rodape_sinal on public.painel_rodape;
create trigger painel_rodape_sinal
  after insert or update or delete on public.painel_rodape
  for each statement execute function private.painel_rodape_sinal();
