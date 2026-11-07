-- Domínio oficial passa a ser https://livrariaadventista.ao (2026-11-07). O .com fica a
-- redireccionar para lá, mas um endereço guardado na base de dados deve apontar já para o
-- destino: os emails usam `site_settings.site_url` nos botões e as capas em `cover`.
--
-- Muda só o início dos endereços `https://livrariaadventista.com/` e
-- `https://www.livrariaadventista.com/`; o resto do caminho fica igual. Guarda antes o valor
-- antigo em private.correcoes_dados (migracao = '20261107180000'). Pode repetir-se sem efeito.
-- Os registos de notificações enviadas (notification_logs) são histórico e não se mexem.

insert into private.correcoes_dados (migracao, tabela, accao, linha)
select '20261107180000', 'stock_books', 'alterada', jsonb_build_object('id', id, 'cover', cover)
from public.stock_books where cover ~* '^https://(www\.)?livrariaadventista\.com/';

update public.stock_books
   set cover = regexp_replace(cover, '^https://(www\.)?livrariaadventista\.com/', 'https://livrariaadventista.ao/', 'i')
 where cover ~* '^https://(www\.)?livrariaadventista\.com/';

insert into private.correcoes_dados (migracao, tabela, accao, linha)
select '20261107180000', 'book_collections', 'alterada', jsonb_build_object('id', id, 'cover', cover)
from public.book_collections where cover ~* '^https://(www\.)?livrariaadventista\.com/';

update public.book_collections
   set cover = regexp_replace(cover, '^https://(www\.)?livrariaadventista\.com/', 'https://livrariaadventista.ao/', 'i')
 where cover ~* '^https://(www\.)?livrariaadventista\.com/';

insert into private.correcoes_dados (migracao, tabela, accao, linha)
select '20261107180000', 'site_settings', 'alterada', jsonb_build_object('id', id, 'site_url', site_url)
from public.site_settings where site_url ~* '^https://(www\.)?livrariaadventista\.com/?$';

update public.site_settings
   set site_url = 'https://livrariaadventista.ao'
 where site_url ~* '^https://(www\.)?livrariaadventista\.com/?$';
