-- O bucket `media` deixa de poder ser listado por qualquer pessoa.
--
-- O bucket é público: cada imagem abre pelo endereço público
-- (`/storage/v1/object/public/media/…`), que não passa pela RLS. A regra de leitura para
-- `anon` e `authenticated` só servia, na prática, para LISTAR o bucket pela API — e listava
-- tudo: as pastas de cada área e `users/<id>/`, ou seja, os ids das contas de quem pôs foto.
-- Confirmado em produção a 2026-11-07 com a chave pública (`POST /storage/v1/object/list/media`).
-- O site nunca lista o bucket: só envia (`upload`), apaga (`remove`) e mostra pelo endereço
-- público.
--
-- O `upsert: true` do envio e o `remove` precisam de poder LER o objecto. Por isso a leitura
-- passa a valer para quem pode escrever nesse caminho (`private.can_write_media`, a mesma regra
-- do envio): a equipa na sua área, e cada pessoa na pasta do próprio avatar.
--
-- Para reverter: recriar a regra antiga,
--   create policy "media: leitura pública" on storage.objects for select
--     to anon, authenticated using (bucket_id = 'media');

drop policy if exists "media: leitura pública" on storage.objects;
drop policy if exists "media: lê quem pode escrever" on storage.objects;
create policy "media: lê quem pode escrever"
  on storage.objects for select to authenticated
  using (bucket_id = 'media' and private.can_write_media(name));
