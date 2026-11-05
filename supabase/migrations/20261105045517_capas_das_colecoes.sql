-- Capas das colecções: trocar as fotos genéricas do Unsplash (bibliotecas quaisquer, nada a
-- ver com os livros à venda) pelas imagens feitas com as capas reais do catálogo, 1920×1080.
-- Promovida de docs/migracoes-pendentes a 2026-11-04, com o domínio novo (o SQL antigo
-- apontava para livraria-adventista.pages.dev, o projecto antigo). As quatro imagens
-- respondem 200 em https://livrariaadventista.com/images/site/opcoes/.
--
-- Só troca as capas que ainda são do Unsplash: uma capa escolhida entretanto no painel
-- (Admin → Colecções → Capa da colecção) fica como está.

update public.book_collections set
  cover = case id
    -- Essenciais da Fé → Fé e doutrina
    when '5958xsw75k3929q' then 'https://livrariaadventista.com/images/site/opcoes/slide-doutrina-leque.webp'
    -- Obras de Ellen G. White → Ellen G. White
    when '311xv9lv292i7d1' then 'https://livrariaadventista.com/images/site/opcoes/slide-ellen-white-prateleira.webp'
    -- Família e Educação → Família e relacionamentos
    when '3i9kf14o7kbo7bi' then 'https://livrariaadventista.com/images/site/opcoes/slide-familia-leque.webp'
    -- Devocionais Diários → Destaques
    when 'u30yl9sx68nx1zt' then 'https://livrariaadventista.com/images/site/opcoes/slide-destaques-duas-filas.webp'
    else cover
  end,
  updated = now()
where id in ('5958xsw75k3929q', '311xv9lv292i7d1', '3i9kf14o7kbo7bi', 'u30yl9sx68nx1zt')
  and coalesce(cover, '') like 'https://images.unsplash.com/%';
