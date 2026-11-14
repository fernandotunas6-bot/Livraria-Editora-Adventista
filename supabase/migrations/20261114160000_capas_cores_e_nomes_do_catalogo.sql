-- Capas, cores das bíblias, nomes e duplicados do catálogo (2026-11-14).
--
-- 109 capas verdadeiras, encontradas na internet e vistas uma a uma (docs/catalogo/CAPAS-INTERNET.md),
-- foram gravadas por cima das capas tipográficas com o mesmo nome de ficheiro: essas não precisam
-- de nada aqui. Esta migração faz o resto, e cada passo só mexe no que ainda está como estava, para
-- não pisar o que alguém tenha corrigido no painel entretanto.
--
--   1. a capa do «Mensageiro», que não tinha imagem nenhuma, e (1b) as descrições revistas contra o
--      livro verdadeiro, incluindo a do «Mensageiro»;
--   2. dois livros que estavam no site duas vezes;
--   3. as cores das quatro bíblias que a CPB faz em várias capas, para o cliente escolher;
--   4. nomes que vieram truncados ou com gralhas do KiGest e que a capa confirma;
--   5. um ISBN com uma gralha e a descrição errada de «O Último Convite»;
--   6. os autores, que os produtos do KiGest não tinham;
--   7. o «Mensageiro» à venda.

-- 1 — Capa do «Mensageiro» (KiGest 14159 = produto 14159 da CPB). A descrição vem no passo 1b e a
-- publicação no passo 7.
update public.stock_books
   set cover = 'https://livrariaadventista.com/images/capas/kigest/mensageiro.webp',
       updated = now()
 where kigest_ref = '14159'
   and coalesce(btrim(cover), '') = ''
   and coalesce(btrim(cover_image), '') = '';

-- 1b — Descrições revistas. As dos produtos do KiGest foram escritas só a partir do nome do artigo,
-- antes de se saber que livro era cada um. Com a capa e a página da editora identificadas, leu-se
-- cada uma ao lado da sinopse da editora (ou da capa): estas falavam de outro assunto («Livre das
-- Garras do Sucesso» é sobre música, não sobre carreiras; «Vida e Ensinos» é a autobiografia de Ellen
-- White, não a vida de Jesus; «Simples Demais» é sobre a saúde da mente), chamavam folheto a um livro,
-- ou prometiam conteúdo que ninguém confirmou. Só se troca a descrição que ainda é a que foi escrita
-- (pela impressão md5 do texto); o «Mensageiro» não tinha nenhuma.
with textos(kigest_ref, era_md5, nova) as (values
  ('14159'::text, ''::text, '<p>«Mensageiro — Histórias de um homem apaixonado pelo seu ideal», de Dirceu Madalena e Hirailton Vinhote Correa.</p><p>A vida e o ministério de Dirceu Madalena, colportor no estado de São Paulo, contados para inspirar quem leva o evangelho de casa em casa pela página impressa. Leitura para colportores e para quem pensa em sê-lo.</p>'),
  ('000360', '21755462fdefab4b3fead7d4e3427e67', '<p>«A Única Esperança — Encontre o real sentido da vida», de Alejandro Bullón.</p><p>Histórias de pessoas comuns, contadas como enredos do dia a dia, que encontraram resposta para as perguntas mais sérias da vida. Para ler e para oferecer a quem anda à procura de sentido.</p>'),
  ('000227', '541e3b57edaa56badafbe79403188bf6', '<p>«Administração Eficaz — Como multiplicar os recursos com sabedoria», de Ellen G. White.</p><p>Sobre a mordomia cristã: reconhecer que Deus é o dono de tudo e administrar com fidelidade o que Ele confia a cada um. Para quem quer pôr a fé também na maneira como usa o que tem.</p>'),
  ('00020', '4a4fa584cbdf9c31492573ca96c446a5', '<p>«Além da Magia», de Denis Cruz — livro para crianças dos 10 aos 12 anos.</p><p>Pedro queria ser bruxo, e ficou muito curioso quando Tiago, um rapaz diferente de todos, começou a frequentar a sua escola. Uma história sobre a «magia» de um bom exemplo, para quem já lê sozinho.</p>'),
  ('00013', 'c32b93aac2424257f9172612e3428c27', '<p>Bíblia dos Aventureiros — a bíblia das crianças do Clube de Aventureiros, na Nova Versão Internacional.</p><p>O texto bíblico com ilustrações coloridas e as palavras de Jesus em vermelho, e páginas próprias do clube: as especialidades, o voto, a lei e os objectivos, o hino, os sinais de pista e os nós. Em capa azul ou rosa.</p>'),
  ('00011', 'a01c8ac98da64ed6c171fb9601f4f12d', '<p>Bíblia do Desbravador — a bíblia do Clube de Desbravadores, na Nova Versão Internacional, para os 10 a 12 anos.</p><p>Antes do texto bíblico, as páginas do clube: a lista de especialidades, o alvo, o voto, o lema e a lei, a história do clube, os sinais de pista e os nós. O texto traz ilustrações coloridas. Em capa rosa, azul, laranja ou verde.</p>'),
  ('15766', 'b287b5232936c624daec2d77daebdddd', '<p>«Em Busca de Esperança», de Ellen G. White.</p><p>Um pequeno livro sobre como o mundo chegou ao ponto em que está e sobre Aquele que é a esperança do fim do mal e do sofrimento: a história do resgate da humanidade, contada a quem a ouve pela primeira vez. Para ler e para oferecer.</p>'),
  ('20837', '069050202ad9bbaab24754ce4d6951fc', '<p>O novo Hinário Adventista do Sétimo Dia, na edição com música — pautas e cifras.</p><p>Reúne 600 hinos, 220 deles novos em relação ao hinário de 1996, organizados por temas a partir das crenças fundamentais da Igreja. Para quem toca e para quem dirige o canto no culto.</p>'),
  ('0030', '462da29922bf55aac2868c1d11ef7794', '<p>«Inigualável», de Atilio René Dupertuis.</p><p>Um estudo bíblico, histórico e teológico sobre quem é Jesus Cristo e o que fez: a sua natureza divina e humana, como a igreja a entendeu ao longo dos séculos e como a compreensão adventista do tema se foi aprofundando. Para quem quer estudar o assunto a fundo.</p>'),
  ('0018', '5411d429a4dc632a14642ca4b51d59cb', '<p>«Livre das Garras do Sucesso — A música é a arma e você o alvo», de Miguel Bispo dos Santos.</p><p>Sobre o poder da música na vida espiritual: o relato de uma experiência pessoal, informação e análise para quem quer pensar no que ouve, e no fim as perguntas que muita gente faz sobre música e raramente vê respondidas.</p>'),
  ('299874', '1655033a48c8320dd90de23c1625b018', '<p>«Maravilhas da Criação — Evidências de um projeto inteligente», de Gerald E. Vyhmeister, para os 13 a 16 anos.</p><p>Ciência ou revelação: de onde vêm a Terra e a vida? O livro põe as duas respostas lado a lado e mostra pormenores da natureza que a maior parte das pessoas nunca vê.</p>'),
  ('000220', '2e3113bc5bc7585a465957b7d6fb1adc', '<p>«Ministério para as Cidades», de Ellen G. White — como levar o evangelho onde vive muita gente.</p><p>As cidades e o que têm de próprio — a solidão no meio da multidão, a pobreza, a pressa — e a compaixão de Jesus como motivo e método da igreja para chegar a quem lá vive.</p>'),
  ('004', 'ea7de506fbd7471a00616ceaf9514a6d', '<p>«O Ciclo da Infelicidade — Como se livrar do descontentamento e ter uma atitude positiva», de Carol Cannon.</p><p>Sobre os padrões que alimentam a infelicidade crónica — a queixa constante, o papel de vítima, a autossabotagem — e como se quebra o ciclo, no plano emocional, mental e espiritual. Com exemplos práticos.</p>'),
  ('16707', 'c165f88ef15acc093459872f828254c9', '<p>«Prazer em Conhecer Ellen White — Quem ela foi, o que fez e a diferença que faz», de George R. Knight.</p><p>Uma introdução à vida de Ellen G. White e ao papel que teve na Igreja Adventista do Sétimo Dia, escrita a pensar nos mais novos e em quem chegou há pouco à igreja.</p>'),
  ('007', '06d2a046308741427db5a78f274617c8', '<p>«Orando como Nunca por Seu Marido», de Tamyra Horst.</p><p>Para a mulher que quer orar pelo marido, mesmo quando o casamento parece prestes a desabar: não se pode mudar o outro, mas pode-se interceder por ele e confiar a Deus o que não está nas nossas mãos.</p>'),
  ('000142', '91dd8751e884997bcf79a9e14de15473', '<p>«Por Trás do Véu», de Esmie G. Branner.</p><p>O relato verdadeiro de uma mulher cristã que sobreviveu à oposição e aos abusos do ex-marido muçulmano, e de como, arrependida das escolhas que fez, se aproximou de Deus e venceu.</p>'),
  ('123', '9af61b70a4d027d0058b9edcf40b6fa8', '<p>«Profecias Surpreendentes — Predições dramáticas de Ellen White sobre eventos mundiais», de Herbert E. Douglass.</p><p>Reúne mensagens de Ellen G. White que foram ridicularizadas quando as escreveu e que a história veio a confirmar, e aponta as que ainda estão por se cumprir. Para quem quer conhecer o dom de profecia pelos seus frutos.</p>'),
  ('024365', '672e483019bb8faee42d17ec33f5a01f', '<p>«Simples Demais — Um modelo bíblico para a cura da mente», de Timothy R. Jennings.</p><p>Sobre as lutas que se travam na mente — a sensação de inutilidade, a autoestima baixa, a culpa sem razão, a incapacidade de perdoar, a amargura — e as ferramentas para cooperar com Deus no caminho do bem-estar mental.</p>'),
  ('129954', '10b2c50ed207d1c6708884d0be38228c', '<p>«Sinais de Esperança — Uma leitura surpreendente dos acontecimentos atuais», de Alejandro Bullón.</p><p>Catástrofes, violência e ansiedade lidas à luz das profecias da Bíblia: os sinais de que se aproxima um novo tempo e as razões para encarar o futuro com esperança.</p>'),
  ('000217', 'be14d3e3127a1dc02d1b0b64b4a4cea2', '<p>Sétimo volume dos «Testemunhos para a Igreja», de Ellen G. White: cartas e artigos escritos a igrejas, a famílias e a pessoas concretas, com instrução para a vida cristã e para o trabalho da igreja. São nove volumes.</p>'),
  ('0037', 'fd2a4f46f6a88d44f6fae5b8efc9c772', '<p>«Vida e Ensinos», de Ellen G. White — o relato que ela própria fez da sua vida.</p><p>A infância e a adolescência, os primeiros anos do ministério e o nascimento da Igreja Adventista do Sétimo Dia, contados por quem os viveu. Para conhecer Ellen G. White pelas suas próprias palavras.</p>'),
  ('080620262', 'b8101246f84c855bee00671f8675bb89', '<p>«21 Dias para Mudar — Um guia prático de revitalização da saúde e superação de doenças crónicas», de Jorge Pamplona e Marcello Niek.</p><p>Um programa de três semanas para quem quer recuperar a saúde e enfrentar as doenças crónicas com mudanças práticas no dia a dia.</p>'),
  ('015062026', 'f88153ffe9ff84a682f686784929f444', '<p>«Chamados para Salvar — Um guia para o ministério evangelístico», de Roy Allan Anderson.</p><p>Para pastores, evangelistas e todos os que se dedicam à evangelização.</p>'),
  ('00004', '174dfae1a73ff96945bc18e4d09ca7ed', '<p>«A Chave da Virada — Guia prático para melhorar sua saúde emocional», de Marcello Niek e Bruno Raso.</p><p>Um guia prático para cuidar da saúde emocional no dia a dia.</p>'),
  ('080620261', '24e93af436efd3c00fe808b1759ca434', '<p>«Sucesso em Dose Dupla — Empreendedores e colaboradores podem chegar juntos ao topo», de Wélida Dancini.</p><p>Sobre a relação entre quem dirige uma empresa e quem nela trabalha, e como podem crescer juntos. Para empresários, líderes e profissionais em início de carreira.</p>'),
  ('080620264', 'd6ab0f5dcf2ddd0117b79d06e038d80b', '<p>«Revolucione Seu Futuro — Como chegar ao topo da carreira profissional», de Rosana Alves.</p><p>Sobre a carreira profissional e o caminho para crescer no trabalho. Para quem está a começar e para quem quer dar o passo seguinte.</p>')
)
update public.stock_books b
   set description = t.nova,
       updated = now()
  from textos t
 where b.kigest_ref = t.kigest_ref
   and (case when t.era_md5 = '' then coalesce(btrim(regexp_replace(b.description, '<[^>]*>', '', 'g')), '') = ''
             else md5(b.description) = t.era_md5 end);

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

-- 6 — Autores. Os produtos do KiGest entraram sem autor; o da CPB vem da página do produto e o dos
-- livros da Estante Virtual está na capa. Ficam de fora as bíblias e o hinário (na CPB o «autor» é a
-- tradução ou a editora). Só onde o autor está vazio.
with autores(kigest_ref, autor) as (values
  ('00001'::text, 'Emilson dos Reis'::text),
  ('00004', 'Marcello Niek e Bruno Raso'),
  ('000142', 'Esmie G. Branner'),
  ('00017', 'Nicolás Chaij'),
  ('00018', 'Ellen G. White'),
  ('00019', 'Ellen G. White'),
  ('000191', 'Ellen G. White'),
  ('000192', 'Ellen G. White'),
  ('000193', 'Ellen G. White'),
  ('000194', 'Ellen G. White'),
  ('000196', 'Ellen G. White'),
  ('000197', 'Ellen G. White'),
  ('000199', 'Ellen G. White'),
  ('00020', 'Denis Cruz'),
  ('000200', 'Ellen G. White'),
  ('0002010', 'Ellen G. White'),
  ('000201058', 'Ellen G. White'),
  ('000203', 'Ellen G. White'),
  ('000204', 'Ellen G. White'),
  ('000205', 'Ellen G. White'),
  ('000206', 'Ellen G. White'),
  ('000207', 'Ellen G. White'),
  ('000208', 'Ellen G. White'),
  ('000209', 'Ellen G. White'),
  ('000211', 'Ellen G. White'),
  ('000212', 'Ellen G. White'),
  ('000213', 'Ellen G. White'),
  ('000215', 'Ellen G. White'),
  ('000216', 'Ellen G. White'),
  ('000217', 'Ellen G. White'),
  ('000218', 'Ellen G. White'),
  ('000219', 'Ellen G. White'),
  ('000220', 'Ellen G. White'),
  ('000221', 'Ellen G. White'),
  ('000222', 'Ellen G. White'),
  ('000224', 'Ellen G. White'),
  ('000227', 'Ellen G. White'),
  ('00033', 'Sally P. Dillon'),
  ('00035', 'Carl Dreizler e Mary E. Ehemann'),
  ('000360', 'Alejandro Bullón'),
  ('000502', 'Ellen G. White'),
  ('000503', 'Ellen G. White'),
  ('0010', 'Ellen G. White'),
  ('0012', 'Rodolpho Belz'),
  ('0013', 'Ellen G. White'),
  ('0014', 'Ellen G. White'),
  ('0015', 'Luiz Waldvogel'),
  ('0018', 'Miguel Bispo dos Santos'),
  ('0019', 'Michelson Borges'),
  ('0020', 'Ellen G. White'),
  ('0023', 'Larry Yeagley'),
  ('0025', 'Karl Haffner'),
  ('0026', 'Ellen G. White'),
  ('0027', 'Ellen G. White'),
  ('0030', 'Atilio René Dupertuis'),
  ('0036', 'Ellen G. White'),
  ('0037', 'Ellen G. White'),
  ('0038', 'Ellen G. White'),
  ('004', 'Carol Cannon'),
  ('007', 'Tamyra Horst'),
  ('00700', 'Ellen G. White'),
  ('015062026', 'Roy Allan Anderson'),
  ('024365', 'Timothy R. Jennings'),
  ('08062026', 'Nancy Van Pelt e Mirian M. Grudtner'),
  ('080620261', 'Wélida Dancini'),
  ('080620262', 'Jorge Pamplona e Marcello Niek'),
  ('080620263', 'Nancy Van Pelt'),
  ('080620264', 'Rosana Alves'),
  ('123', 'Herbert E. Douglass'),
  ('129954', 'Alejandro Bullón'),
  ('13165', 'George R. Knight'),
  ('13348', 'Cesar Vasconcellos de Souza'),
  ('14159', 'Dirceu Madalena e Hirailton Vinhote Correa'),
  ('14456', 'Ellen G. White'),
  ('14499', 'Bryan W. Ball'),
  ('14875', 'Ellen G. White'),
  ('14878', 'Ellen G. White'),
  ('15329', 'Ekkehardt Mueller e Elias Brasil de Souza (org.)'),
  ('15439', 'Roy Gane'),
  ('15528', 'Fernando Beier'),
  ('15766', 'Ellen G. White'),
  ('16373', 'Ninayette Galleguillos Triviño'),
  ('16707', 'George R. Knight'),
  ('16711', 'Antonio Tostes'),
  ('195', 'Ellen G. White'),
  ('19964', 'Ellen G. White'),
  ('19989', 'Ellen G. White'),
  ('20092', 'Salete Rios'),
  ('21002', 'Ellen G. White'),
  ('21068', 'Ellen G. White'),
  ('234569877', 'Roberto Gullón'),
  ('299874', 'Gerald E. Vyhmeister'),
  ('5100', 'Alejandro Bullón')
)
update public.stock_books b
   set author = a.autor,
       updated = now()
  from autores a
 where b.kigest_ref = a.kigest_ref
   and coalesce(btrim(b.author), '') = '';

-- 7 — O «Mensageiro» vai à venda: tem preço, stock, capa (passo 1) e agora descrição (passo 1b). É a
-- mesma regra da publicação dos produtos do KiGest (20261112142000), nomeado um a um.
update public.stock_books
   set active = true, updated = now()
 where kigest_ref = '14159'
   and not active
   and coalesce(price, 0) > 0
   and coalesce(btrim(cover), '') <> ''
   and coalesce(btrim(regexp_replace(description, '<[^>]*>', '', 'g')), '') <> ''
   and product_type <> 'vestuario';
