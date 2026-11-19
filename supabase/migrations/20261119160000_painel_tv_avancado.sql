-- Modo TV avançado e rodapé com imagens (docs/PAINEL-GESTAO.md §6.8–6.11):
--   * os vídeos e as imagens da publicidade carregam-se do computador (bucket «painel-tv», público para ler);
--   * vinhetas: vídeos curtos da marca que passam entre os anúncios, como nos canais de televisão;
--   * as mensagens do rodapé podem levar uma imagem pequena.

-- 1. Os ficheiros da TV. Público para ler (a TV e o painel mostram-nos pelo endereço), escrever só quem edita a TV.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('painel-tv', 'painel-tv', true, 104857600,
        array['video/mp4', 'video/webm', 'video/quicktime', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.pode_editar_tv()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_permission('manage_settings') or private.has_permission('edit_reports');
$$;
revoke all on function private.pode_editar_tv() from public, anon;
grant execute on function private.pode_editar_tv() to authenticated, service_role;

drop policy if exists "painel-tv: envia quem edita a TV" on storage.objects;
create policy "painel-tv: envia quem edita a TV" on storage.objects for insert to authenticated
  with check (bucket_id = 'painel-tv' and (select private.pode_editar_tv()));
drop policy if exists "painel-tv: actualiza quem edita a TV" on storage.objects;
create policy "painel-tv: actualiza quem edita a TV" on storage.objects for update to authenticated
  using (bucket_id = 'painel-tv' and (select private.pode_editar_tv()))
  with check (bucket_id = 'painel-tv' and (select private.pode_editar_tv()));
drop policy if exists "painel-tv: apaga quem edita a TV" on storage.objects;
create policy "painel-tv: apaga quem edita a TV" on storage.objects for delete to authenticated
  using (bucket_id = 'painel-tv' and (select private.pode_editar_tv()));

-- 2. Vinhetas: um vídeo marcado como vinheta passa entre os anúncios (e não como anúncio).
alter table public.painel_tv_midia
  add column if not exists papel text not null default 'publicidade' check (papel in ('publicidade', 'vinheta'));

-- 3. Uma imagem pequena nas mensagens do rodapé (um logótipo, uma capa, um cartaz).
alter table public.painel_rodape
  add column if not exists imagem text check (imagem is null or (imagem ~ '^https://' and char_length(imagem) <= 1000));
