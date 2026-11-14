-- Capas encontradas na internet para os produtos que tinham capa tipográfica (2026-11-14).
--
-- 110 capas foram procuradas na loja da Casa Publicadora Brasileira e na Estante Virtual, vistas
-- uma a uma ao lado do título do produto, endireitadas e gravadas por cima da capa tipográfica,
-- com o mesmo nome de ficheiro (images/capas/kigest/<ficheiro>.webp). Essas 108 não precisam de
-- nada na base de dados. O registo de cada uma está em docs/catalogo/capas-internet.json e o
-- relatório em docs/catalogo/CAPAS-INTERNET.md.
--
-- Esta migração trata só dos dois produtos que não tinham imagem nenhuma: ficaram sem capa
-- tipográfica porque estão ocultos (sem preço, ou com o nome ilegível no KiGest). Ganham a capa;
-- continuam ocultos. Escreve-se só onde a capa está vazia, para não pisar uma fotografia que
-- alguém já tenha posto no painel.
--
--   14159  «Mensageiro» (CPB 14159, a referência do KiGest é o código do produto na CPB)
--   000163 «Por que Não Mas Estpita» no KiGest: pelo ISBN 9788534509305 é «Por Que Não Sou Mais
--          Espírita», de Maurício Braga. O nome fica como está até alguém o corrigir no painel.

with capas(kigest_ref, capa) as (values
  ('14159'::text, 'https://livrariaadventista.com/images/capas/kigest/mensageiro.webp'::text),
  ('000163', 'https://livrariaadventista.com/images/capas/kigest/por-que-nao-sou-mais-espirita.webp')
)
update public.stock_books b
   set cover = c.capa,
       updated = now()
  from capas c
 where b.kigest_ref = c.kigest_ref
   and coalesce(btrim(b.cover), '') = ''
   and coalesce(btrim(b.cover_image), '') = '';
