-- Catálogo alinhado com o KiGest (exportação de 2026-11-12 12:53:23, DESKTOP-G26LDJM/KigestGC).
--
-- O KiGest é o programa de facturação que corre no computador da loja. É nele que se vende ao
-- balcão todos os dias, por isso é dele que vem a contagem do stock e o preço que o cliente
-- paga à porta. O site tinha os seus próprios números: o preço veio da lista da editora e o
-- stock foi posto à mão quando o produto entrou, e desde então nunca mais bateu com a loja.
--
-- Esta migração faz três coisas, por esta ordem:
--
--  1. Dá ao catálogo uma coluna kigest_ref — a referência do artigo no KiGest. É a chave que
--     faltava: sem ela, cada exportação obriga a emparelhar os dois catálogos pelos títulos,
--     e os títulos do KiGest estão em maiúsculas e com gralhas. Com ela, a próxima exportação
--     actualiza o stock sem adivinhar nada.
--  2. Liga 121 produtos que já existiam ao artigo do KiGest e passa a usar o stock e o preço
--     da loja. 108 tinham stock diferente e 50 tinham preço diferente. Preenche também
--     o ISBN em 74 livros que estavam sem ele.
--  3. Traz 225 artigos que a loja vende e o site não tinha, TODOS OCULTOS (active = false),
--     com o preço e o stock do KiGest e sem capa. Ficam à espera de fotografia, descrição e de
--     uma leitura ao título antes de serem publicados — ver docs/catalogo/KIGEST.md.
--
-- Fica tudo registado em private.kigest_import: que exportação, quantos produtos mexeu e
-- quando. Correr duas vezes a mesma exportação não duplica nada (a chave é o kigest_ref).

alter table public.stock_books
  add column if not exists kigest_ref text not null default '';

comment on column public.stock_books.kigest_ref is
  'Referência do artigo no KiGest (tbArtigos.Referencia). Vazio = produto que só existe no site.';

-- Dois produtos do site não podem apontar para o mesmo artigo da loja: seria o mesmo stock
-- contado duas vezes.
create unique index if not exists stock_books_kigest_ref_idx
  on public.stock_books (kigest_ref) where kigest_ref <> '';

-- O registo de cada importação: que exportação entrou, o que mexeu e quando. Serve para
-- responder à pergunta «este stock é de quando?» sem ir ao computador da loja.
create table if not exists private.kigest_import (
  id bigserial primary key,
  exportacao timestamptz not null,
  origem text not null default '',
  ligados integer not null default 0,
  criados integer not null default 0,
  corrido_em timestamptz not null default now()
);
alter table private.kigest_import enable row level security;
revoke all on private.kigest_import from public, anon, authenticated;
revoke all on sequence private.kigest_import_id_seq from public, anon, authenticated;

-- 1 de 3 — os que já estavam à venda. Só entra aqui quem ganhou com folga: o artigo do KiGest
-- era o único candidato no topo e nenhum outro artigo da loja andava perto do mesmo produto. O
-- que ficou ambíguo (42 artigos — as bíblias à cabeça, e os lenços, onde a loja separa o do
-- membro do de líder e o site tem um só) não entra aqui: está no relatório, para o dono decidir.
with pares(book_code, kigest_ref, preco, stock, ean) as (values
  ('LIV-142'::text, '0006'::text, 2000::numeric, 24::numeric, ''::text),
  ('LIV-063', '0008', 20000, 67, '9788534526203'),
  ('LIV-030', '00034', 3571, 35, ''),
  ('DBV-003', '00039', 2000, 22, ''),
  ('LIV-054', '9788534527248', 5520, 6, ''),
  ('LIV-001', '00055', 21895, 9, '9788534517843'),
  ('LIV-002', '00056', 11425, 0, '9788534525510'),
  ('LIV-003', '00057', 15755, 5, '9788534532242'),
  ('LIV-004', '00059', 18475, 0, ''),
  ('LIV-013', '00061', 11030, 4, '9788534503082'),
  ('LIV-006', 'id-59', 36135, 9, '9788534522076'),
  ('LIV-007', '00063', 3150, 1, '9788534510288'),
  ('LIV-009', '00065', 14180, 2, '9788534527996'),
  ('LIV-011', '00067', 13925, 6, '9788534526753'),
  ('LIV-012', '00069', 18910, 1, '9788534521352'),
  ('LIV-014', '00070', 42438, 9, '9788534512268'),
  ('COL-001', '00076', 6000, 3, '9788534520775'),
  ('LIV-015', '00078', 22925, 5, '9788534513791'),
  ('LIV-016', '00079', 22450, 0, '9788534526104'),
  ('LIV-017', '00080', 28701.41, 0, '9788534511582'),
  ('LIV-018', '00081', 11425, 0, '9788534536233'),
  ('LIV-010', '00084', 20485, 3, '9788534509282'),
  ('LIV-024', '00086', 15365, 6, '9788534518833'),
  ('LIV-034', '00092', 16260, 1, '9788534508841'),
  ('LIV-027', '00093', 10605, 3, '9788534510424'),
  ('LIV-028', '00094', 14575, 5, '9788534535755'),
  ('LIV-029', '00095', 19695, 6, '9788534511407'),
  ('LIV-032', '00098', 12215, 5, '9788534515313'),
  ('LIV-033', '00099', 16940, 5, '9788534510578'),
  ('LIV-035', '000100', 48925, 6, '9788534521840'),
  ('LIV-036', '000101', 12605, 5, '9788534509275'),
  ('LIV-040', '000102', 12605, 6, '9788534521185'),
  ('LIV-037', '000103', 16765, 9, '9786586391022'),
  ('LIV-038', '000104', 18135, 6, '9788534535908'),
  ('LIV-039', '000105', 13790, 0, '9788534509619'),
  ('LIV-042', '000106', 21275, 6, '9788534512404'),
  ('LIV-043', '000107', 16545, 5, '9788534534581'),
  ('LIV-076', '000111', 27970, 4, ''),
  ('LIV-075', '000112', 31510, 3, '9788534504720'),
  ('LIV-069', '000118', 17790, 4, '9788534523608'),
  ('LIV-087', '000122', 15395, 8, '9788534520812'),
  ('LIV-074', '000123', 16490, 8, '9786589895831'),
  ('LIV-095', '000124', 18135, 7, '9788534530927'),
  ('LIV-096', '000125', 15755, 7, '9786586391589'),
  ('LIV-025', '000126', 25605, 5, ''),
  ('LIV-082', '000127', 30105, 9, '9788534509053'),
  ('LIV-044', '000128', 58737, 0, '9788534533027'),
  ('LIV-041', '000129', 8210, 2, '9786586391084'),
  ('LIV-053', '000130', 15055, 2, '9788534520386'),
  ('LIV-086', '000134', 19855, 7, '9788534531078'),
  ('LIV-080', '000136', 16765, 5, '9788534525183'),
  ('LIV-049', '000138', 31820, 0, ''),
  ('LIV-048', '000141', 24030, 6, '9788534511445'),
  ('LIV-081', '000143', 20875, 4, '9788534507981'),
  ('LIV-094', '000144', 22850, 4, '9788534511438'),
  ('LIV-056', '000145', 13340, 4, '9788534510837'),
  ('LIV-060', '000147', 16765, 9, '9788534526739'),
  ('LIV-062', '000149', 18120, 1, '9788534526975'),
  ('LIV-084', '000150', 26395, 6, '9788534513456'),
  ('LIV-050', '000152', 9455, 5, '9788534532976'),
  ('LIV-083', '000153', 7160, 1, '9788534507318'),
  ('LIV-089', '000154', 13790, 5, '9788534515290'),
  ('LIV-090', '000155', 11030, 6, '9788534535960'),
  ('LIV-092', '000156', 10265, 6, '9788534523530'),
  ('LIV-093', '000157', 20085, 2, '9788534535410'),
  ('LIV-091', '000158', 13495, 2, '9788534515801'),
  ('LIV-068', '000160', 13790, 7, '9786589895947'),
  ('LIV-079', '000161', 22455, 4, '9788534531238'),
  ('LIV-065', '00068', 11030, 1, '9788534513388'),
  ('LIV-020', '000168', 15755, 5, ''),
  ('LIV-055', '0', 11820, 5, '9788534527064'),
  ('LIV-052', '000170', 14820, 3, ''),
  ('LIV-051', '000179', 13790, 7, '9788534536042'),
  ('LIV-067', '000175', 9420, 5, '9788534528429'),
  ('LIV-045', '000180', 13790, 3, '9788534536240'),
  ('LIV-019', '000183', 19695, 7, '9788534512398'),
  ('LIV-085', '000184', 13790, 5, ''),
  ('LIV-047', '000226', 13685, 4, '9788534523332'),
  ('LIV-064', '000229', 18135, 6, '9788534536424'),
  ('LIV-100', '000231', 18515, 5, '9788534533867'),
  ('LIV-099', '000232', 22060, 5, '9788534517850'),
  ('LIV-149', '5487963', 5000, 0, ''),
  ('LIV-059', '000450', 19593, 2, ''),
  ('LIV-088', '000504', 15755, 2, ''),
  ('LIV-147', '000523', 3000, 38, ''),
  ('BIB-020', '000790', 25000, 1, ''),
  ('LIV-046', '455475126', 26016, 3, '')
)
update public.stock_books b
   set kigest_ref = p.kigest_ref,
       price = p.preco,
       stock = p.stock,
       -- O ISBN só se escreve onde estava vazio: onde o site já tem um, é o da edição que o
       -- site vende e o do KiGest pode ser de outra.
       isbn = case when coalesce(b.isbn, '') = '' then p.ean else b.isbn end,
       updated = now()
  from pares p
 where b.book_code = p.book_code
   and coalesce(b.kigest_ref, '') in ('', p.kigest_ref);

-- 2 de 3 — os 34 que estão ocultos desde a migração 20261110090000 e que a loja também vende.
-- Estes ganham finalmente preço e stock, que era o que lhes faltava para poderem ser publicados.
-- A ligação é pelo título exacto, porque o código que o gatilho lhes deu em produção não está
-- escrito em lado nenhum. 12 deles confirmam-se pelo id na loja da editora, que o
-- KiGest usa como referência do artigo.
with pares(titulo, kigest_ref, preco, stock, ean) as (values
  ('Olhando para o Criador e Salvador — Meditações diárias'::text, '000030'::text, 5700::numeric, 18::numeric, ''::text),
  ('Ouvindo a Voz de Deus — Guia de estudos bíblicos', '000031', 2000, 295, ''),
  ('Comentário Bíblico Andrews — Colecção completa em 4 volumes', '000135', 161100, 0, ''),
  ('Momentos de Paz — O descanso que traz calma para uma vida agitada', '0000667766', 5000, 0, ''),
  ('O Limite do Prazer — O que a Bíblia diz sobre a identidade sexual', '19032026', 15720, 0, '9788534510462'),
  ('Liderança & Missão — Uma perspectiva bíblica', '190320261', 17310, 2, '9781732301962'),
  ('Unidade e Foco na Missão — O segredo para uma organização eclesiástica eficaz', '01052026', 5000, 2, '9786501436289'),
  ('Além da Imaginação — Os surpreendentes mistérios da vida', '961000', 16019, 5, ''),
  ('Nunca Vou Me Render — A resistência de um jovem polonês ao nazismo', '99456', 35883, 0, ''),
  ('A Grande Extinção em Massa — Evidências e implicações da maior tragédia ambiental da história da Terra', '005', 51561, 0, ''),
  ('Proteja Sua Família — Os desafios de cada ciclo da vida', '006', 11324, 1, ''),
  ('O Altar da Família — Restaurando a comunhão com Deus', '009', 24153, 4, ''),
  ('Sonhe Alto — Como dar o melhor de si mesmo', '0011', 30026, 2, ''),
  ('Só para Jovens — Dicas para você aproveitar o melhor da vida', '0016', 21081, 5, ''),
  ('Proibido para Meninos, Indispensável para Meninas', '0021', 18561, 5, ''),
  ('Segredos da Vitória no Amor — Como aumentar sua capacidade de dar e receber afeto', '0024', 20440, 5, ''),
  ('Visões do Futuro — As sete ideias centrais da escatologia bíblica', '0028', 70741, 0, ''),
  ('Revelação de Jesus Cristo — Comentário sobre o livro do Apocalipse', '0031', 67755, 0, ''),
  ('Tempo de Esperança — 24 horas para você renovar suas energias', '11631', 3571, 9, ''),
  ('O Reavivamento Prometido — Como receber a plenitude do Espírito Santo', '12382', 9257, 5, ''),
  ('Nem Tudo Que Cai na Rede é Peixe — Como encontrar o verdadeiro amor', '13167', 19829, 5, ''),
  ('Depois do Perdão — Experimente o fruto de uma vida santificada', '14504', 22226, 5, ''),
  ('Crer Faz Bem — Pesquisas comprovam os benefícios da espiritualidade cristã', '14620', 25203, 5, ''),
  ('Natural Naturalmente — Renove sua culinária e ganhe mais saúde', '15120', 24580, 4, ''),
  ('Lágrimas — Como enfrentar a dor e superar o sofrimento', '15529', 29917, 5, ''),
  ('Devocional da Família — Pedacinho do Céu', '16298', 25139, 3, ''),
  ('Chuvas de Bênçãos — Liderança fiel até o fim', '16686', 4511, 13, ''),
  ('Primeiro o Reino — Como uma pobre viúva nos ensina os princípios da verdadeira adoração', '19612', 12346, 2, ''),
  ('Viver Para Deus — Redescubra a alegria da virtude cristã', '20147', 19876, 0, ''),
  ('O Atirador Convertido — E outras histórias de salvação e milagres', '21411', 15882, 3, ''),
  ('Ainda Existe Esperança — A solução para os problemas da vida', '0035', 3571, 18, ''),
  ('A Igreja Remanescente', '0040', 7941, 0, ''),
  ('Esperança para Viver — O verdadeiro caminho da felicidade', '6218731', 6000, 2, ''),
  ('Saúde & Bem-Estar — Segredos que podem mudar a sua vida', '45992', 6000, 4790, '9781920579128')
)
update public.stock_books b
   set kigest_ref = p.kigest_ref,
       price = p.preco,
       stock = p.stock,
       -- O ISBN só se escreve onde estava vazio: onde o site já tem um, é o da edição que o
       -- site vende e o do KiGest pode ser de outra.
       isbn = case when coalesce(b.isbn, '') = '' then p.ean else b.isbn end,
       updated = now()
  from pares p
 where lower(btrim(b.title)) = lower(btrim(p.titulo))
   and coalesce(b.kigest_ref, '') in ('', p.kigest_ref);

-- 3 de 3 — os que a loja vende e o site não tinha. Entram OCULTOS: sem capa e sem descrição,
-- um produto não se põe à venda. O título vem do KiGest com a caixa arrumada e as gralhas
-- conhecidas corrigidas (scripts/kigest/titulos.mjs); o que não se conseguiu confirmar ficou
-- como veio e está assinalado no relatório.
--
-- As três guardas do «not exists» são contra o produto repetido, e a do título e a do ISBN
-- valem por si: a chave pública não vê o que está oculto, por isso o emparelhamento em
-- JavaScript pode não ter visto um produto que já existe. Em SQL vê-se tudo.
insert into public.stock_books
  (title, product_type, genre, kigest_ref, isbn, price, stock, author, publisher, cover, description, active, featured)
select v.title, v.tipo, v.genero, v.kigest_ref, v.ean, v.preco, v.stock,
       '', 'Livraria e Editora Adventista', '', '', false, false
  from (values
  ('100 Anos de Missão, Fé e Esperança'::text, 'livro'::text, 'Catálogo Geral'::text, '06042026'::text, ''::text, 7000::numeric, 5::numeric),
  ('101 Segredos', 'livro', 'Catálogo Geral', '00006', '', 22000, 95),
  ('111 Administrar Dinheiro', 'livro', 'Catálogo Geral', '01234', '', 7000, 0),
  ('111 Dicas para Criar Filhos que Seguem a Deus', 'livro', 'Família & Relacionamentos', '190320262', '9781920579357', 7000, 8),
  ('111 Estudante', 'livro', 'Catálogo Geral', '4568213', '', 7000, 2),
  ('21 Dias para Mudar', 'livro', 'Catálogo Geral', '080620262', '9786586391534', 40000, 2),
  ('250 Receitas', 'livro', 'Saúde & Estilo de Vida', '010520263', '9788472083639', 52000, 2),
  ('A Ciência do Bom Viver', 'livro', 'Catálogo Geral', '0010', '', 26030, 1),
  ('A Mensagem de 1888', 'livro', 'Catálogo Geral', '000113', '', 14180, 4),
  ('A Saúde Pelos Alimentos', 'livro', 'Saúde & Estilo de Vida', '0050', '9788472083592', 52000, 1),
  ('A Única Esperança', 'livro', 'Catálogo Geral', '000360', '9788534519533', 2000, 0),
  ('A Verdadeira Riqueza', 'livro', 'Fé & Doutrina', '000185', '9788534530125', 10245, 2),
  ('A Volta por Cima', 'livro', 'Catálogo Geral', '0025', '', 28476, 5),
  ('Abelhinhas', 'livro', 'Desbravadores', '00009999', '', 250, 0),
  ('Administração Eficaz', 'livro', 'Catálogo Geral', '000227', '9788534531139', 17339, 0),
  ('Além da Magia (Livro Infantil)', 'livro', 'Catálogo Geral', '00020', '9788534511919', 7000, 1),
  ('Além da Morte', 'livro', 'Catálogo Geral', '00064', '9788534529648', 12215, 2),
  ('Amigos', 'livro', 'Catálogo Geral', '2225588', '', 250, 0),
  ('Anciãos Anciãs, Manual dos Anciãos Adventistas', 'livro', 'Catálogo Geral', '00016', '9789898799906', 7200, 9),
  ('Bandeja de Santa Ceia', 'papelaria', 'Santa Ceia', '00022', '', 40000, 1),
  ('Bebe Saúde para Mãe e Filhos', 'livro', 'Saúde & Estilo de Vida', '000339', '', 37465, 4),
  ('Bíblia Andrews', 'biblia', 'Bíblias', '00048', '', 89350, 0),
  ('Bíblia Arqueológica', 'biblia', 'Bíblias', 'OO29', '', 99350, 0),
  ('Bíblia da Mulher', 'biblia', 'Bíblias', '16206', '', 55250, 0),
  ('Bíblia Disciplos', 'biblia', 'Bíblias', '00003', '', 62000, 83),
  ('Bíblia dos Desbravadores', 'biblia', 'Bíblias', '00011', '9788472085688', 25000, 2),
  ('Bíblia Ilustrada', 'biblia', 'Bíblias', '0009', '9788472085695', 35000, 1),
  ('Bíblia Missionária Eu Vou', 'biblia', 'Bíblias', '000404', '', 25000, 0),
  ('Bíblia Nova Semente', 'biblia', 'Bíblias', '000300', '', 4950, 338),
  ('Bíblia Recomeçar', 'biblia', 'Bíblias', '000406', '', 6500, 0),
  ('Bíblia Sagrada Almeida Revista Corrida', 'biblia', 'Bíblias', '000307', '', 12820, 0),
  ('Bíblia Sagrada Almeida Revista Corrigida', 'biblia', 'Bíblias', '000335', '', 12850, 0),
  ('Bíblia Sagrada com Concordancia ARC', 'biblia', 'Bíblias', '04032026', '', 35000, 0),
  ('Bíblia Sagrada da Mulher Rosa', 'biblia', 'Bíblias', '16044', '', 61172, 0),
  ('Bíblia Sagrada Missionária Capa Dura', 'biblia', 'Bíblias', '000333', '', 15000, 1),
  ('Bíblia Sagrada Nova Almeida Actualizada', 'biblia', 'Bíblias', '000311', '', 9500, 0),
  ('Bíblia Sagrada Nova Semente', 'biblia', 'Bíblias', 'LV00021', '', 6000, 7),
  ('Bíblia Sagrada RA Rosa', 'biblia', 'Bíblias', '000329', '', 49630, 8),
  ('Bíblia Sagrada RC', 'biblia', 'Bíblias', '000315', '', 49630, 0),
  ('Bíblia Sagrada se o Filhos Libertar', 'biblia', 'Bíblias', '000304', '', 13790, 20),
  ('Bíblia Sagrada Semeando a Palavra que Transforma', 'biblia', 'Bíblias', '000455', '', 9500, 0),
  ('Bíblia Sagrada Sociedade Bíblica Brasil', 'biblia', 'Bíblias', '000305', '', 15755, 0),
  ('Bilingue', 'livro', 'Catálogo Geral', '000313', '9788531117176', 55000, 1),
  ('Bloco de Factura', 'papelaria', 'Material de Igreja', '000560', '', 5000, 2),
  ('Bloco de Folhetos Jesus Esta Voltando', 'papelaria', 'Material de Igreja', '000340', '', 5000, 3),
  ('Brochuras', 'papelaria', 'Material de Igreja', '000700', '', 200, 100),
  ('Cartão', 'papelaria', 'Material de Igreja', '26498', '', 200, 0),
  ('Cartão de Dedicação de Crianças', 'papelaria', 'Material de Igreja', 'CDC0001', '', 200, 135),
  ('Cartão de Voto', 'papelaria', 'Material de Igreja', '023876', '', 845, 116),
  ('Cartas Jovens Namorados', 'livro', 'Família & Relacionamentos', '000503', '', 9733, 1),
  ('Cartões da Escola Sabatina', 'papelaria', 'Material de Igreja', '000350', '', 400, 47),
  ('Casamento Princípio Bíblicos e Teológico', 'biblia', 'Bíblias', '15329', '', 35242, 5),
  ('Catalogo', 'papelaria', 'Material de Igreja', '0004050', '', 50, 10),
  ('Certificado', 'papelaria', 'Material de Igreja', '00099444', '', 250, 7295),
  ('Certificado A4', 'papelaria', 'Material de Igreja', '060520261', '', 600, 101),
  ('Certificado de Batismo', 'papelaria', 'Material de Igreja', '03957684', '', 200, 19050),
  ('Certificado de Obreiros', 'papelaria', 'Material de Igreja', '090320261', '', 250, 29),
  ('Certificado do Ministério Pessoal', 'papelaria', 'Material de Igreja', '2564000', '', 250, 5),
  ('Certificado Honroso', 'papelaria', 'Material de Igreja', '000462', '', 714.33, 0),
  ('Chamados para Salvar', 'livro', 'Catálogo Geral', '015062026', '', 15000, 0),
  ('Chave da Virada', 'livro', 'Catálogo Geral', '00004', '', 3000, 2),
  ('Ciclo da Infelicidade', 'livro', 'Catálogo Geral', '11486', '', 27818, 0),
  ('Comece Hoje a Perder Peso', 'livro', 'Saúde & Estilo de Vida', '00035', '', 7000, 3),
  ('Como Formar Filhos Vencedor', 'livro', 'Família & Relacionamentos', '080620263', '9786589895039', 40000, 0),
  ('Como Lidar com as Emoções', 'livro', 'Saúde & Estilo de Vida', '0020', '', 11747, 5),
  ('Companheiro', 'livro', 'Catálogo Geral', '1111999', '', 250, 0),
  ('Conduta Sexual', 'livro', 'Família & Relacionamentos', '000222', '9788534533409', 14945, 6),
  ('Conhecer Jesus é Tudo', 'livro', 'Catálogo Geral', '5100', '', 8176, 0),
  ('Conselho sobre Saúde', 'livro', 'Saúde & Estilo de Vida', '21002', '', 27271, 0),
  ('Conselhos aos Pais, Professores e Estudantes', 'livro', 'Família & Relacionamentos', '000199', '9788534531450', 22810, 8),
  ('Conselhos sobre a Escola Sabatina', 'livro', 'Catálogo Geral', '000201058', '9788534533560', 14160, 4),
  ('Conselhos sobre Escola Sabatina', 'livro', 'Catálogo Geral', '00700', '', 14950, 0),
  ('Conselhos sobre Mordomia', 'livro', 'Catálogo Geral', '00019', '9788534501941', 16100, 14),
  ('Conselhos sobre Regime Alimentar', 'livro', 'Saúde & Estilo de Vida', '000196', '', 18310, 0),
  ('Coração Restaurado', 'livro', 'Catálogo Geral', '193883', '', 30680, 0),
  ('Cordeirinho', 'livro', 'Desbravadores', '33339999', '', 250, 0),
  ('Corpo Saudável', 'livro', 'Saúde & Estilo de Vida', '300420261', '9789728891657', 65000, 3),
  ('Corte', 'livro', 'Catálogo Geral', '23568', '', 30000, 1),
  ('Crenças Populares', 'livro', 'Fé & Doutrina', '00083', '9788534513401', 35925, 7),
  ('Crise Existencial', 'livro', 'Catálogo Geral', '00085', '9788534523707', 7485, 6),
  ('Daniel Interpretação', 'livro', 'Apocalipse & Profecia', '00091', '9788534534604', 42675, 0),
  ('Declarações da Igreja', 'livro', 'Catálogo Geral', '0017', '', 41693, 10),
  ('Desfrutar da Vida', 'livro', 'Catálogo Geral', '010520262', '9789728891893', 65000, 0),
  ('Edificadores', 'livro', 'Desbravadores', '55556666', '', 250, 0),
  ('Educação', 'livro', 'Catálogo Geral', '000200', '9786589448785', 14945, 5),
  ('Em Busca de Esperança', 'livro', 'Catálogo Geral', '15766', '', 3571, 10),
  ('Emblemas de JA. Adultos', 'desbravadores', 'Desbravadores', '16032026', '', 1000, 91),
  ('Envelope de Dízimo', 'papelaria', 'Material de Igreja', '30032026', '', 250, 63),
  ('Esperança para Viver', 'livro', 'Catálogo Geral', '06052026', '9788534511186', 6000, 2),
  ('Estarei Pronta no Sábado', 'livro', 'Fé & Doutrina', '000459', '', 6000, 3),
  ('Evangelismo', 'livro', 'Catálogo Geral', '0027', '', 29791, 2),
  ('Eventos Finais', 'livro', 'Apocalipse & Profecia', '0036', '', 17527, 2),
  ('Excursionista', 'livro', 'Catálogo Geral', '666677', '', 250, 0),
  ('Experimente um Recomeço', 'livro', 'Catálogo Geral', '15528', '', 14426, 5),
  ('Fé e Obras', 'livro', 'Catálogo Geral', '0013', '', 9240, 0),
  ('Felizes no Amor', 'livro', 'Família & Relacionamentos', '08062026', '9788534526098', 40000, 0),
  ('Folheto Impacto', 'papelaria', 'Material de Igreja', '000408', '', 110, 68),
  ('Folheto Momento de Paz', 'papelaria', 'Material de Igreja', '000401', '', 7500, 2),
  ('Folhetos', 'papelaria', 'Material de Igreja', '444444', '', 68, 4211),
  ('Folhetos Amigos para Sempre', 'papelaria', 'Material de Igreja', '000353', '', 5000, 1),
  ('Folhetos as Cinco Colunas da Verdade', 'papelaria', 'Material de Igreja', '000456', '', 65, 265984),
  ('Folhetos em Papel Couche', 'papelaria', 'Material de Igreja', '0000', '', 68, 0),
  ('Fundamentos da Educação Cristã', 'livro', 'Catálogo Geral', '0038', '', 28570, 2),
  ('Guia de Liberdade Religiosa', 'livro', 'Catálogo Geral', '15062026', '', 15000, 0),
  ('Guia de Secretaria da Igreja', 'livro', 'Pregação & Liderança', '00015', '9788534531153', 6000, 10),
  ('Guia do Ancião', 'livro', 'Catálogo Geral', '00037', '', 7200, 1),
  ('Guia do Diácono', 'livro', 'Pregação & Liderança', '00036', '', 7200, 34),
  ('Guia do Ministério da Criança', 'livro', 'Pregação & Liderança', '100320264', '', 7000, 8),
  ('Guiados por Deus', 'livro', 'Catálogo Geral', '01042026', '', 55000, 4),
  ('Hinário Novo', 'musica', 'Hinários', '20837', '', 32966, 1),
  ('História da Redençaõ', 'livro', 'Catálogo Geral', '19989', '', 24434, 1),
  ('Inigualável', 'livro', 'Catálogo Geral', '0030', '', 26508, 0),
  ('Interpretação da as Escrituras', 'livro', 'Catálogo Geral', '000109', '9788534521789', 31820, 0),
  ('Ira sob Controle', 'livro', 'Catálogo Geral', '0023', '', 20498, 3),
  ('Juízo sem Medo', 'livro', 'Apocalipse & Profecia', '15439', '', 19125, 5),
  ('Kit de Comentários', 'livro', 'Catálogo Geral', '00049', '', 160000, 1),
  ('Lenço Aventureiro', 'desbravadores', 'Desbravadores', '00025', '', 2000, 18),
  ('Lenço de Desbravadores', 'desbravadores', 'Desbravadores', '00050', '', 2000, 6),
  ('Lenço de Lider Jovem', 'desbravadores', 'Desbravadores', '09032026', '', 3000, 1),
  ('Lenço JA', 'desbravadores', 'Desbravadores', '000508', '', 2000, 61),
  ('Liderança Cristã', 'livro', 'Pregação & Liderança', '000221', '9788534531115', 10620, 8),
  ('Livre das Garras do Sucesso', 'livro', 'Catálogo Geral', '0018', '', 16117, 5),
  ('Livro de Actas', 'papelaria', 'Material de Igreja', '30072026', '', 25000, 4),
  ('Livro de Registo de Casamento', 'papelaria', 'Material de Igreja', '140820261', '', 12000, 1),
  ('Livro de Registo de Membro', 'papelaria', 'Material de Igreja', '14082026', '', 12000, 0),
  ('Luminares', 'livro', 'Desbravadores', '333999', '', 250, 0),
  ('Manual da Igreja', 'livro', 'Catálogo Geral', '000457', '', 7000, 1588),
  ('Manual Diáconos e Diaconisas', 'livro', 'Pregação & Liderança', '00002', '9789898799456', 7200, 47),
  ('Mãos Ajudadoras', 'livro', 'Catálogo Geral', '444499', '', 250, 0),
  ('Maravilhas da Criação', 'livro', 'Catálogo Geral', '299874', '', 27271, 5),
  ('Medicina e Salvação', 'livro', 'Saúde & Estilo de Vida', '000203', '9788534534819', 18090, 8),
  ('Meditação 2026', 'livro', 'Catálogo Geral', '000452', '', 14725, 2),
  ('Meditação da Mulher', 'livro', 'Catálogo Geral', '000405', '', 14725, 0),
  ('Meditações Diárias — Maravilhoso Deus', 'livro', 'Catálogo Geral', '00001', '9788534529860', 10000, 47),
  ('Mensageiro', 'livro', 'Catálogo Geral', '14159', '', 14942, 3),
  ('Mensagem aos Jovens', 'livro', 'Catálogo Geral', '0026', '', 26030, 2),
  ('Mensagem Escolhida Vol. 2', 'livro', 'Catálogo Geral', '000194', '9788534530828', 23990, 3),
  ('Mensagem Escolhidas Vol. 1', 'livro', 'Catálogo Geral', '000193', '9788534528979', 21240, 4),
  ('Mensagem Escolhidas Vol. 3', 'livro', 'Catálogo Geral', '195', '9788534530323', 22420, 4),
  ('Mensagens e Mensageiros', 'livro', 'Catálogo Geral', '100320262', '', 2000, 3),
  ('Mente Carácter Personalidade Vol. 1', 'livro', 'Catálogo Geral', '000204', '9788534531429', 18485, 8),
  ('Mente Carácter Personalidade Vol. 2', 'livro', 'Catálogo Geral', '000205', '9788534534093', 19665, 7),
  ('Mente Positiva', 'livro', 'Catálogo Geral', '300420262', '9789728891664', 65000, 0),
  ('Ministério para as Cidades', 'livro', 'Pregação & Liderança', '000220', '9788534534192', 14945, 7),
  ('Ministério Pastoral', 'livro', 'Pregação & Liderança', '000207', '9788534533805', 18090, 8),
  ('Movidos a Internet', 'livro', 'Catálogo Geral', '20092', '', 33147, 0),
  ('Música Sua Influencia', 'livro', 'Catálogo Geral', '000190', '9788534509824', 7880, 11),
  ('Nepp-lar Adventista o Encadernado', 'livro', 'Família & Relacionamentos', '14456', '', 24385, 6),
  ('Nepp-temperança', 'livro', 'Saúde & Estilo de Vida', '21068', '', 21051, 2),
  ('No Deserto da Tentação', 'livro', 'Catálogo Geral', '0014', '', 8411, 1),
  ('No Princípio', 'livro', 'Catálogo Geral', '14499', '', 37767, 5),
  ('Nos Bastidores da Mídia', 'livro', 'Catálogo Geral', '0019', '', 21286, 3),
  ('Novo Testamento em Umbundo', 'biblia', 'Bíblias', '00044', '', 3000, 5),
  ('O Ciclo da Infelicidade', 'livro', 'Catálogo Geral', '004', '', 27818, 5),
  ('O Colportor de Êxito', 'livro', 'Pregação & Liderança', '00017', '9788534523424', 17660, 3),
  ('O Colportor Evangelista', 'livro', 'Pregação & Liderança', '000224', '9788534534727', 14160, 4),
  ('O Desejado de Todas as Nações', 'livro', 'Ellen G. White', '00018', '9786589448631', 35838, 5),
  ('O Grande Conflito', 'livro', 'Apocalipse & Profecia', '000502', '', 5000, 1),
  ('O Grande Conflito Infantil', 'livro', 'Apocalipse & Profecia', '00033', '', 3000, 5),
  ('O Poder Medicinal dos Sucos', 'livro', 'Saúde & Estilo de Vida', '30042026', '9789898799180', 65000, 1),
  ('Obreiros Evangélicos', 'livro', 'Pregação & Liderança', '000197', '9788534533119', 23205, 9),
  ('Onda das Alianças', 'livro', 'Catálogo Geral', '00097', '9786589448822', 49370, 0),
  ('Orientação da Criança', 'livro', 'Catálogo Geral', '000192', '9786589448747', 23202, 6),
  ('Origens', 'livro', 'Catálogo Geral', '000114', '9788534507233', 31627, 6),
  ('Palavras de Esperança', 'livro', 'Catálogo Geral', '30062026', '', 500, 91),
  ('Passarinhos', 'livro', 'Catálogo Geral', '25559888', '', 250, 0),
  ('Patriarcas e Profetas Encadernado', 'livro', 'Apocalipse & Profecia', '14875', '', 33909, 6),
  ('Pecado e Salvação', 'livro', 'Catálogo Geral', '13165', '', 27207, 3),
  ('Pesquisador', 'livro', 'Catálogo Geral', '999999', '', 250, 0),
  ('Pioneiro', 'livro', 'Catálogo Geral', '33338844', '', 250, 0),
  ('Por Detrás do Véu', 'livro', 'Catálogo Geral', '000142', '9788534516778', 20298.76, 5),
  ('Por que Não Mas Estpita', 'livro', 'Catálogo Geral', '000163', '9788534509305', 4450, 5),
  ('Por que Sai do Escritório', 'livro', 'Catálogo Geral', '16086', '', 21427, 0),
  ('Porque Senhor', 'livro', 'Catálogo Geral', '000146', '9788534523684', 16545, 4),
  ('Prazer em Conhecer Ellen White', 'livro', 'Ellen G. White', '16707', '', 21662, 3),
  ('Prendedor de Lenço de Jovem Adulto JA', 'desbravadores', 'Desbravadores', '12032026', '', 750, 1),
  ('Prendedor de Lenço de Líder', 'desbravadores', 'Desbravadores', '00041', '', 1000, 151),
  ('Prendedores Diverssos', 'desbravadores', 'Desbravadores', '000562', '', 750, 46),
  ('Primeiros Escritos', 'livro', 'Ellen G. White', '000208', '9786589895978', 18485, 1),
  ('Princípios para Lideres Cristaõs', 'livro', 'Pregação & Liderança', '000206', '9788534533539', 14945, 10),
  ('Princípios sobre Aposentadoria', 'livro', 'Catálogo Geral', '000209', '9788732534895', 14550, 8),
  ('Profecias Surpreendentes', 'livro', 'Apocalipse & Profecia', '123', '', 31353, 5),
  ('Profetas e Reis', 'livro', 'Apocalipse & Profecia', '14878', '', 27271, 6),
  ('Quando Tudo Falha', 'livro', 'Catálogo Geral', '0012', '', 7471, 5),
  ('Quebrando o Silêncio', 'livro', 'Catálogo Geral', '000403', '', 2000, 20),
  ('Questões sobre Doutrinas', 'livro', 'Fé & Doutrina', '000116', '9788534510943', 56325, 6),
  ('Reavivamento Verdadeiro', 'livro', 'Fé & Doutrina', '000460', '9788534513760', 6160, 0),
  ('Regras para que', 'livro', 'Catálogo Geral', '100320263', '', 2000, 57),
  ('Revista Esperança Novo Tempo', 'revista', 'Catálogo Geral', '24032026', '', 3500, 1),
  ('Revista Viva', 'revista', 'Catálogo Geral', '00027', '', 3000, 10),
  ('Revolucione Seu Futuro', 'livro', 'Catálogo Geral', '080620264', '9788534529303', 40000, 0),
  ('Saldo Extra', 'livro', 'Catálogo Geral', '16711', '', 24106, 5),
  ('Saúde Total', 'livro', 'Saúde & Estilo de Vida', '13348', '', 24998, 5),
  ('Série Adoraçaõ', 'livro', 'Catálogo Geral', '00060', '9788534528894', 12660, 6),
  ('Série Essencial Política', 'livro', 'Catálogo Geral', '000181', '9788534529761', 12660, 0),
  ('Serviço Cristão', 'livro', 'Catálogo Geral', '19964', '', 18514, 2),
  ('Simples Demais', 'livro', 'Catálogo Geral', '024365', '', 27680, 5),
  ('Sinais de Esperança', 'livro', 'Apocalipse & Profecia', '129954', '', 3571, 18),
  ('Sinta-se Bem', 'livro', 'Catálogo Geral', '010520264', '9789728891572', 42000, 3),
  ('Sombras e Realidade', 'livro', 'Catálogo Geral', '234569877', '', 29774, 0),
  ('Sucesso em Dose Dupla', 'livro', 'Catálogo Geral', '080620261', '9788534516785', 40000, 1),
  ('Suco de Uva', 'papelaria', 'Santa Ceia', '000029', '', 12000, 1),
  ('T-shirt de Mordomia', 'vestuario', 'Vestuário', 'T-SHIRT20', '', 2000, 8),
  ('T-shirt do Centenário', 'vestuario', 'Vestuário', 'T-SHIRT23', '', 1500, 448),
  ('T-shirt UmaVoz27', 'vestuario', 'Vestuário', '21102026', '', 3500, 11),
  ('Testemunho para a Igreja Vol. 1', 'livro', 'Ellen G. White', '27082026', '', 27925, 2),
  ('Testemunho para Igreja Vol. 2', 'livro', 'Ellen G. White', '000211', '9786589448839', 27140, 3),
  ('Testemunho para Igreja Vol. 4', 'livro', 'Ellen G. White', '000213', '9786589448877', 26745, 4),
  ('Testemunho para Igreja Vol. 5', 'livro', 'Ellen G. White', '000215', '9786589448938', 28320, 3),
  ('Testemunho para Igreja Vol. 6', 'livro', 'Ellen G. White', '000216', '9786589448976', 22420, 4),
  ('Testemunhos para a Igreja', 'livro', 'Ellen G. White', '000217', '9786589448921', 16125, 4),
  ('Testemunhos para a Igreja 3', 'livro', 'Ellen G. White', '000212', '9786589448952', 25565, 4),
  ('Testemunhos para a Igreja Vol. 1', 'livro', 'Ellen G. White', '0002010', '9786589448969', 27925, 4),
  ('Testemunhos para Igreja Vol. 8', 'livro', 'Ellen G. White', '000218', '9786589448884', 17305, 3),
  ('Testemunhos para Igreja Vol. 9', 'livro', 'Ellen G. White', '000219', '9786589448907', 14945, 4),
  ('Testemunhos para Ministros', 'livro', 'Ellen G. White', '000191', '9788534535366', 25565, 7),
  ('Torsal', 'desbravadores', 'Catálogo Geral', '31082026', '', 3000, 2),
  ('Trimestrais', 'revista', 'Catálogo Geral', '000051', '', 1400, 25001),
  ('Último Convite', 'livro', 'Catálogo Geral', '000500', '', 1500, 0),
  ('Viagem ao Desconhecido Caderno de Actividade', 'livro', 'Catálogo Geral', '100320261', '', 2000, 3),
  ('Viagem ao Desconhecido Temas Semanais', 'livro', 'Catálogo Geral', '10032026', '', 2000, 7),
  ('Vida de Jesus', 'livro', 'Catálogo Geral', '00005', '', 18000, 101),
  ('Vida e Ensinos', 'livro', 'Catálogo Geral', '0037', '', 18514, 1),
  ('Vinho de Santa Ceia', 'papelaria', 'Santa Ceia', '00023', '', 10350, 0),
  ('Você e Deus', 'livro', 'Catálogo Geral', '0015', '', 10854, 10)
  ) as v(title, tipo, genero, kigest_ref, ean, preco, stock)
 where not exists (select 1 from public.stock_books b where b.kigest_ref = v.kigest_ref)
   and not exists (select 1 from public.stock_books b where lower(btrim(b.title)) = lower(btrim(v.title)))
   and not exists (select 1 from public.stock_books b where v.ean <> '' and b.isbn = v.ean);

insert into private.kigest_import (exportacao, origem, ligados, criados)
values ('2026-11-12 12:53:23'::timestamptz, 'DESKTOP-G26LDJM/KigestGC', 121, 225);
