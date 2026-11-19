-- Bloquear uma pessoa na comunidade de leitores (regra 1.2 da App Store para conteúdo publicado
-- pelos utilizadores: denunciar, filtrar e bloquear quem abusa).
--
-- Cada pessoa guarda as chaves públicas de leitor (`profiles.reader_key`, a mesma que vai em
-- `author_key` nas publicações) de quem não quer ver. O site deixa de lhe mostrar as publicações
-- e as respostas dessas pessoas, em qualquer aparelho com a mesma conta (lib/communityBlocks.js).
-- Só o próprio lê e mexe na sua lista; quem foi bloqueado não sabe. O nome fica guardado como
-- estava no dia, só para a lista «Pessoas bloqueadas» do perfil.
--
-- Reverter: drop table public.community_blocks;

create table if not exists public.community_blocks (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  blocked_key text not null,
  blocked_name text not null default '',
  created timestamptz not null default now(),
  primary key (user_id, blocked_key),
  constraint community_blocks_key_len check (char_length(blocked_key) between 1 and 64),
  constraint community_blocks_name_len check (char_length(blocked_name) <= 100)
);

alter table public.community_blocks enable row level security;

drop policy if exists "community_blocks: o próprio lê" on public.community_blocks;
create policy "community_blocks: o próprio lê" on public.community_blocks
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "community_blocks: o próprio bloqueia" on public.community_blocks;
create policy "community_blocks: o próprio bloqueia" on public.community_blocks
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "community_blocks: o próprio desbloqueia" on public.community_blocks;
create policy "community_blocks: o próprio desbloqueia" on public.community_blocks
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.community_blocks from anon;
revoke all on public.community_blocks from authenticated;
grant select, insert, delete on public.community_blocks to authenticated;

comment on table public.community_blocks is
  'Quem cada pessoa bloqueou na comunidade (chave pública de leitor). O site esconde as publicações e respostas dessas pessoas; só o próprio vê a sua lista.';
