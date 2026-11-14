-- Capas, cores das bíblias, nomes e duplicados do catálogo (2026-11-14).
--
-- 110 capas verdadeiras, encontradas na internet e vistas uma a uma (docs/catalogo/CAPAS-INTERNET.md),
-- foram gravadas por cima das capas tipográficas com o mesmo nome de ficheiro: essas não precisam
-- de nada aqui. Esta migração faz o resto, e cada passo só mexe no que ainda está como estava, para
-- não pisar o que alguém tenha corrigido no painel entretanto.
--
--   1. a capa do «Mensageiro», que não tinha imagem nenhuma;
--   2. dois livros que estavam no site duas vezes;
--   3. as cores das quatro bíblias que a CPB faz em várias capas, para o cliente escolher;
--   4. nomes que vieram truncados ou com gralhas do KiGest e que a capa confirma;
--   5. um ISBN com uma gralha e a descrição errada de «O Último Convite».

-- 1 — Capa do «Mensageiro» (KiGest 14159 = produto 14159 da CPB). Fica oculto: falta a descrição.
update public.stock_books
   set cover = 'https://livrariaadventista.com/images/capas/kigest/mensageiro.webp',
       updated = now()
 where kigest_ref = '14159'
   and coalesce(btrim(cover), '') = ''
   and coalesce(btrim(cover_image), '') = '';

-- 2 — Duplicados. Dois artigos do KiGest entraram como produtos novos, mas o livro já estava no
-- site com outro nome (vindo do catálogo antigo, com capa e uma descrição boa):
--
--   000163 «Por que Não Mas Estpita» (oculto)  →  «Por Que Não Sou Mais Espírita - O Testemunho…»
--          o mesmo ISBN 9788534509305 na capa, o mesmo preço (4 450 Kz)
--   000142 «Por Detrás do Véu» (à venda)        →  «Por Trás do Véu»
--          o mesmo livro de Esmie G. Branner (ISBN 9788534516778); estava à venda duas vezes, e a
--          descrição do duplicado falava do santuário, que não é o assunto do livro
--
-- A referência do KiGest passa para o produto antigo, que fica com o preço e o stock da loja, como
-- todos os outros produtos ligados ao KiGest; o duplicado fica oculto (não se apaga: pode haver
-- histórico a apontar para ele). Os produtos antigos não têm código fixo (foram criados no painel),
-- por isso encontram-se pelo título exacto e por ainda não terem referência do KiGest.
do $$
declare
  par record;
  dup record;
  alvo text;
begin
  for par in
    select * from (values
      ('000163', 'Por Que Não Sou Mais Espírita - O Testemunho de Alguém que Encontrou o Evangelho segundo a Bíblia'),
      ('000142', 'Por Trás do Véu')
    ) as v(ref, titulo)
  loop
    select id, price, stock into dup from public.stock_books where kigest_ref = par.ref;
    select id into alvo from public.stock_books
     where title = par.titulo and coalesce(kigest_ref, '') = '' order by created limit 1;
    continue when dup.id is null or alvo is null or dup.id = alvo;

    update public.stock_books set kigest_ref = '', active = false, updated = now() where id = dup.id;
    update public.stock_books
       set kigest_ref = par.ref, price = dup.price, stock = dup.stock, updated = now()
     where id = alvo;
  end loop;
end $$;

-- 3 — Cores das bíblias. A CPB faz estas bíblias em várias capas e a loja não sabia qual tinha; a
-- fotografia dos Desbravadores laranja e verde e dos Aventureiros azul e rosa (produtos ocultos de
-- 2026-11-10) mostra que tem mais do que uma. Cada cor passa a ser uma variante (`tipo: 'cor'`), com
-- a capa dela: o cliente escolhe a cor na página do produto e a imagem muda. Sem stock próprio, cada
-- cor usa o stock do produto; quando se souber quantas há de cada, põe-se no painel (Versões).
-- A primeira cor é a da capa do produto.
with cores(kigest_ref, versoes) as (values
  ('00048'::text, '[
    {"label": "Capa preta",    "tipo": "cor", "cover": "https://livrariaadventista.com/images/capas/kigest/biblia-andrews.webp",          "isbn": "9788534535380", "format": "", "price": null, "stock": null},
    {"label": "Capa castanha", "tipo": "cor", "cover": "https://livrariaadventista.com/images/capas/kigest/biblia-andrews-castanha.webp", "isbn": "9788534535403", "format": "", "price": null, "stock": null},
    {"label": "Capa rosa",     "tipo": "cor", "cover": "https://livrariaadventista.com/images/capas/kigest/biblia-andrews-rosa.webp",     "isbn": "9788534535397", "format": "", "price": null, "stock": null}
  ]'::jsonb),
  ('OO29', '[
    {"label": "Couro castanho", "tipo": "cor", "cover": "https://livrariaadventista.com/images/capas/kigest/biblia-arqueologica.webp",         "isbn": "9788410361287", "format": "", "price": null, "stock": null},
    {"label": "Couro azul",     "tipo": "cor", "cover": "https://livrariaadventista.com/images/capas/kigest/biblia-arqueologica-azul.webp",    "isbn": "9788410361287", "format": "", "price": null, "stock": null},
    {"label": "P.U. azul",      "tipo": "cor", "cover": "https://livrariaadventista.com/images/capas/kigest/biblia-arqueologica-pu-azul.webp", "isbn": "9788410361270", "format": "", "price": null, "stock": null}
  ]'),
  ('00013', '[
    {"label": "Capa azul", "tipo": "cor", "cover": "https://livrariaadventista.com/images/capas/kigest/biblia-dos-aventureiros.webp",      "isbn": "", "format": "", "price": null, "stock": null},
    {"label": "Capa rosa", "tipo": "cor", "cover": "https://livrariaadventista.com/images/capas/kigest/biblia-dos-aventureiros-rosa.webp", "isbn": "9788472086050", "format": "", "price": null, "stock": null}
  ]'),
  ('00011', '[
    {"label": "Capa rosa",    "tipo": "cor", "cover": "https://livrariaadventista.com/images/capas/kigest/biblia-dos-desbravadores.webp",         "isbn": "", "format": "", "price": null, "stock": null},
    {"label": "Capa azul",    "tipo": "cor", "cover": "https://livrariaadventista.com/images/capas/kigest/biblia-dos-desbravadores-azul.webp",    "isbn": "", "format": "", "price": null, "stock": null},
    {"label": "Capa laranja", "tipo": "cor", "cover": "https://livrariaadventista.com/images/capas/kigest/biblia-dos-desbravadores-laranja.webp", "isbn": "", "format": "", "price": null, "stock": null},
    {"label": "Capa verde",   "tipo": "cor", "cover": "https://livrariaadventista.com/images/capas/kigest/biblia-dos-desbravadores-verde.webp",   "isbn": "", "format": "", "price": null, "stock": null}
  ]')
)
update public.stock_books b
   set versions = c.versoes,
       updated = now()
  from cores c
 where b.kigest_ref = c.kigest_ref
   and coalesce(jsonb_array_length(case when jsonb_typeof(b.versions) = 'array' then b.versions end), 0) = 0;

-- 4 — Nomes. O KiGest corta e abrevia (e erra) os nomes; estes confirmam-se pela capa e pelo ISBN.
-- Só se troca o nome que ainda é o do KiGest.
with nomes(kigest_ref, era, fica) as (values
  ('000211'::text, 'Testemunho para Igreja Vol. 2'::text, 'Testemunhos para a Igreja Vol. 2'::text),
  ('000212', 'Testemunhos para a Igreja 3', 'Testemunhos para a Igreja Vol. 3'),
  ('000213', 'Testemunho para Igreja Vol. 4', 'Testemunhos para a Igreja Vol. 4'),
  ('000215', 'Testemunho para Igreja Vol. 5', 'Testemunhos para a Igreja Vol. 5'),
  ('000216', 'Testemunho para Igreja Vol. 6', 'Testemunhos para a Igreja Vol. 6'),
  ('000217', 'Testemunhos para a Igreja', 'Testemunhos para a Igreja Vol. 7'),      -- o ISBN é o do Vol. 7
  ('000218', 'Testemunhos para Igreja Vol. 8', 'Testemunhos para a Igreja Vol. 8'),
  ('000219', 'Testemunhos para Igreja Vol. 9', 'Testemunhos para a Igreja Vol. 9'),
  ('000194', 'Mensagens Escolhida Vol. 2', 'Mensagens Escolhidas Vol. 2'),
  ('000204', 'Mente Carácter Personalidade Vol. 1', 'Mente, Carácter e Personalidade Vol. 1'),
  ('000205', 'Mente Carácter Personalidade Vol. 2', 'Mente, Carácter e Personalidade Vol. 2'),
  ('14456', 'Nepp-lar Adventista o Encadernado', 'O Lar Adventista'),
  ('21068', 'Nepp-temperança', 'Temperança'),
  ('21002', 'Conselho sobre Saúde', 'Conselhos sobre Saúde'),
  ('15329', 'Casamento Princípio Bíblicos e Teológico', 'Casamento — Princípios Bíblicos e Teológicos'),
  ('14875', 'Patriarcas e Profetas Encadernado', 'Patriarcas e Profetas'),
  ('000503', 'Cartas Jovens Namorados', 'Cartas a Jovens Namorados'),
  ('080620263', 'Como Formar Filho Vencedor', 'Como Formar Filhos Vencedores'),
  ('000500', 'Último Convite', 'O Último Convite'),
  ('234569877', 'Sombras e Realidade', 'Sombra e Realidade'),
  ('00003', 'Bíblia Disciplos', 'Bíblia do Discípulo'),
  ('00011', 'Bíblia dos Desbravadores', 'Bíblia do Desbravador')
)
update public.stock_books b
   set title = n.fica,
       updated = now()
  from nomes n
 where b.kigest_ref = n.kigest_ref
   and b.title = n.era;

-- 5 — O ISBN de «Princípios sobre Aposentadoria» tinha 87/32 no lugar de 85/34 (o da CPB é
-- 9788534534895), e «O Último Convite» era descrito como folheto: é o livro missionário de
-- Clifford Goldstein, «Uma mensagem de esperança».
update public.stock_books
   set isbn = '9788534534895', updated = now()
 where kigest_ref = '000209' and isbn = '9788732534895';

update public.stock_books
   set author = case when coalesce(btrim(author), '') = '' then 'Clifford Goldstein' else author end,
       description = '<p>«O Último Convite — Uma mensagem de esperança», de Clifford Goldstein.</p><p>Livro missionário de formato pequeno, feito para oferecer e para distribuir em campanhas e visitas.</p>',
       updated = now()
 where kigest_ref = '000500'
   and description like '%folheto missionário%';
