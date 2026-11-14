-- Fotografias das lojas físicas, e os contactos reais da loja do Huambo.
--
-- A página das lojas mostrava de cada loja uma morada, um horário e um mapa; a miniatura do
-- cartão era um lugar reservado com as iniciais, porque nenhuma loja tinha fotografia. Quem
-- escolhe levantar lá a encomenda não fazia ideia do que ia encontrar.
--
-- A coluna `image_url` guarda uma fotografia só, a da miniatura. As lojas mandam várias (montra,
-- prateleiras, equipa, artigos de igreja), por isso junta-se `gallery`: uma lista ordenada de
-- `{ url, caption }`, mostrada na página das lojas (app/web/src/components/StoreGallery.jsx).
-- Aceita também uma lista de URLs sem legenda, para quem carregar fotografias sem as descrever
-- (ver `storeGallery`, app/web/src/lib/stores.js).
--
-- As fotografias do Huambo são as que a loja enviou, convertidas para WebP em dois tamanhos por
-- `scripts/imagens/lojas.py` e servidas pelo próprio site (/images/lojas/), não por Storage: são
-- ficheiros fixos do site e assim entram no CSP `img-src 'self'` sem excepções.
--
-- O telefone do Huambo estava vazio desde a limpeza dos números provisórios
-- (20261105045627_limpeza_dados_provisorios.sql); fica o número que a loja deu, o mesmo para
-- chamadas e para WhatsApp.
--
-- Reverter: alter table public.physical_stores drop column gallery (as fotografias ficam no site).

alter table public.physical_stores
  add column if not exists gallery jsonb not null default '[]'::jsonb;

comment on column public.physical_stores.gallery is
  'Fotografias da loja, por ordem: [{"url": "/images/lojas/…webp", "caption": "…"}]. A miniatura continua em image_url.';

-- A galeria tem de ser mesmo uma lista, e não pode crescer sem limite: é de leitura pública e
-- vai em cada pedido de /stores.
alter table public.physical_stores
  drop constraint if exists physical_stores_gallery_lista;
alter table public.physical_stores
  add constraint physical_stores_gallery_lista
  check (jsonb_typeof(gallery) = 'array' and jsonb_array_length(gallery) <= 24
         and pg_column_size(gallery) <= 4000);

-- A loja do Huambo: fotografias, miniatura e contactos.
update public.physical_stores
set gallery = jsonb_build_array(
      jsonb_build_object('url', '/images/lojas/huambo-1.webp',
                         'caption', 'Balcão de atendimento e prateleiras de Bíblias e livros'),
      jsonb_build_object('url', '/images/lojas/huambo-2.webp',
                         'caption', 'A equipa da loja do Huambo'),
      jsonb_build_object('url', '/images/lojas/huambo-3.webp',
                         'caption', 'Prateleiras de literatura denominacional e de Ellen G. White'),
      jsonb_build_object('url', '/images/lojas/huambo-4.webp',
                         'caption', 'Artigos de igreja: bandejas para a Santa Ceia')
    ),
    image_url = case when coalesce(image_url, '') = '' and coalesce(image, '') = ''
                     then '/images/lojas/huambo-1.webp' else image_url end,
    phone = case when coalesce(phone, '') = '' then '+244 923 428 459' else phone end,
    whatsapp = case when coalesce(whatsapp, '') = '' then '+244 923 428 459' else whatsapp end,
    updated = now()
where province ilike 'huambo' or name ilike '%huambo%';
