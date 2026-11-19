-- A app Android para descarregar (docs/APPS.md, página /app).
--
-- O APK fica num bucket público próprio, «apps», e não no «downloads»: esse guarda os PDFs das
-- edições digitais compradas e é privado. Aqui só entram APKs (até 20 MB; o app tem ~5 MB), e
-- quem lê é qualquer pessoa: o endereço público é
--   <projecto>.supabase.co/storage/v1/object/public/apps/livraria-adventista.apk
-- Escrever só com a chave de serviço (o envio é feito por quem publica o app): não há políticas
-- de escrita para os papéis do site.
--
-- Reverter: delete from storage.objects where bucket_id = 'apps'; delete from storage.buckets where id = 'apps';
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('apps', 'apps', true, 20971520, array['application/vnd.android.package-archive'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
