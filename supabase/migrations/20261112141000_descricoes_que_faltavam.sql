-- Descrições em falta: 24 produtos tinham o campo vazio ou tinham lá o próprio título outra
-- vez («Biblia Sagrada», «Lenço do Clube de Aventureiros — bordô»). Não é um detalhe de
-- apresentação: a descrição é o texto da página do produto, é a meta description que o Google
-- mostra nos resultados e é o que aparece quando alguém partilha o livro no WhatsApp — sem ela,
-- o seo-catalogo.mjs cai para o título e as três coisas ficam a repetir a mesma linha.
--
-- Uma estava trocada: o LIV-147 («Esperança para a Família») tinha a descrição do LIV-149
-- («Amor em Família»), copiada de um para o outro.
--
-- O que se diz de cada produto é o que se vê nele — a capa, a cor, o material, para que serve
-- e quem o usa. Nada de números que não estejam na ficha (páginas, ano, tiragem) nem de
-- promessas de conteúdo que ninguém confirmou. Onde o produto não tem autor (bíblias, lenços,
-- emblemas, hinários, t-shirts) o campo fica vazio de propósito: a página do produto só mostra
-- a linha do autor quando ele existe.
--
-- Escreve-se só onde falta. Quem já tem um texto escrito no painel não é tocado: a condição é
-- a descrição estar vazia ou ser o título repetido (o mesmo texto, sem etiquetas nem acentos).

-- Duas ajudas para a comparação, em private porque só servem a esta migração.
create or replace function private.texto_simples(p_html text)
returns text language sql immutable set search_path = '' as $fn$
  select regexp_replace(coalesce(p_html, ''), '<[^>]*>', '', 'g');
$fn$;

create or replace function private.chave_texto(p_texto text)
returns text language sql immutable set search_path = '' as $fn$
  select lower(regexp_replace(translate(private.texto_simples(p_texto),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'), '[^a-zA-Z0-9]', '', 'g'));
$fn$;

do $$
declare
  v_pares text[][] := array[
    -- Bíblias
    ['BIB-010', '<p>Bíblia Sagrada de capa dura, com a ilustração das aves do céu e a frase de Mateus 6:26 — «Olhai para as aves do céu». Antigo e Novo Testamento completos, em português, num volume para levar à igreja e para a leitura de todos os dias.</p><p>A capa dura protege o miolo do uso diário e a encadernação aguenta ser aberta todos os dias no mesmo sítio.</p>'],
    ['BIB-013', '<p>Bíblia Sagrada de capa dura bordô, decorada com flores e um pássaro. Antigo e Novo Testamento completos, em português.</p><p>Um volume de presente: a capa é de cor sóbria e o acabamento resiste ao uso de quem a leva à igreja todas as semanas.</p>'],
    ['BIB-016', '<p>Bíblia Sagrada de capa dura castanha, lisa, sem aplicações. Antigo e Novo Testamento completos, em português.</p><p>É a edição mais simples da loja: a mesma Palavra, numa capa discreta e resistente, ao preço mais baixo da prateleira das bíblias.</p>'],
    ['BIB-018', '<p>Bíblia Sagrada na tradução Almeida Revista e Atualizada, de capa dura azul-marinho. Antigo e Novo Testamento completos.</p><p>A Almeida Revista e Atualizada é a tradução que a maior parte das igrejas de língua portuguesa usa no púlpito e nos estudos bíblicos — é a que acompanha a letra dos sermões e das lições da Escola Sabatina.</p>'],
    ['BIB-020', '<p>Bíblia «Jesus», de capa castanha com o nome em relevo. Antigo e Novo Testamento completos, em português.</p><p>O relevo da capa dá-lhe o toque de um volume de presente, sem deixar de ser uma bíblia de uso: capa resistente e um corpo de letra que se lê sem esforço.</p>'],
    -- Desbravadores, Aventureiros e Jovens
    ['DBV-001', '<p>Lenço dos Jovens Adventistas (JA), azul-marinho com debrum azul e amarelo.</p><p>É a peça que identifica o membro dos Jovens Adventistas no uniforme: usa-se ao pescoço, dobrado e preso pelo prendedor, nos cultos, nas investiduras e nas actividades do clube.</p>'],
    ['DBV-002', '<p>Lenço de liderança, bordô, com faixas arco-íris e o emblema do Clube de Desbravadores.</p><p>Distingue quem dirige o clube — director, directores associados e conselheiros — do restante uniforme. As faixas arco-íris são a marca da liderança.</p>'],
    ['DBV-003', '<p>Lenço do Clube dos Embaixadores, azul-claro.</p><p>Os Embaixadores são a classe dos jovens dos 16 aos 21 anos. O lenço usa-se ao pescoço com o uniforme da classe, nos cultos, nas investiduras e nas actividades do clube.</p>'],
    ['DBV-004', '<p>Lenço do Clube de Desbravadores, amarelo com faixas arco-íris.</p><p>Faz parte do uniforme de gala do desbravador — a peça que se põe ao pescoço, dobrada e presa pelo prendedor, nos cultos, nas investiduras e nos campori.</p>'],
    ['DBV-005', '<p>Lenço LJS (Líderes Juvenis), amarelo com debrum vermelho.</p><p>Identifica quem já concluiu o curso de Liderança Juvenil Superior e orienta as classes mais novas do clube.</p>'],
    ['DBV-006', '<p>Lenço do Clube de Aventureiros, bordô.</p><p>Os Aventureiros são a classe das crianças dos 6 aos 9 anos. O lenço usa-se ao pescoço com o uniforme, nos cultos, nas investiduras e nas actividades do clube — para muitas crianças é a primeira peça do uniforme que recebem.</p>'],
    ['DBV-007', '<p>Emblema bordado do Clube de Desbravadores, para coser na manga ou no bolso do uniforme.</p><p>Bordado a fio, com o triângulo e o escudo dos Desbravadores. Vai no uniforme de gala, no lugar que o manual do clube indica.</p>'],
    ['DBV-008', '<p>Emblema bordado dos Jovens Adventistas, para coser no uniforme.</p><p>Bordado a fio, com o símbolo dos JA. Cose-se na manga ou no bolso, no lugar que o manual indica.</p>'],
    ['DBV-009', '<p>Cordão de apito trançado à mão, em amarelo e verde.</p><p>Passa-se pelo ombro e segura o apito do conselheiro ou do director. O trançado aguenta o uso ao ar livre, nos acampamentos e nas marchas.</p>'],
    -- Hinários
    ['MUS-001', '<p>Hinário Adventista em umbundo e português, de capa rosa. Os hinos vêm nas duas línguas, lado a lado.</p><p>É o hinário das igrejas onde se canta em umbundo e em português no mesmo culto: cada hino tem o número de sempre e a letra nas duas línguas, para a congregação cantar junta sem ninguém ficar de fora.</p>'],
    ['MUS-002', '<p>Hinário Adventista em umbundo e português, de capa castanha. Os hinos vêm nas duas línguas, lado a lado.</p><p>A mesma edição bilingue, na capa castanha. Serve a congregação que canta nas duas línguas e quem acompanha os cultos no interior.</p>'],
    ['MUS-003', '<p>Hinário Adventista em umbundo e português, de capa branca. Os hinos vêm nas duas línguas, lado a lado.</p><p>A capa branca é a mais recente da edição bilingue. Cada hino tem o número de sempre e a letra nas duas línguas.</p>'],
    -- Vestuário
    ['VES-001', '<p>T-shirt preta com o logótipo da Igreja Adventista do Sétimo Dia estampado à frente.</p><p>Algodão, corte recto, para o dia a dia e para as actividades da igreja. Antes de comprar, escolha o tamanho na ficha do produto.</p>'],
    ['VES-002', '<p>T-shirt branca da campanha UmaVoz27 — «Missão para Todos» — com a estampa à frente.</p><p>Algodão, corte recto. É a peça que as igrejas usam nas acções de missão da campanha; antes de comprar, escolha o tamanho na ficha do produto.</p>'],
    -- Livros e folhetos
    ['LIV-057', '<p>Herbert E. Douglass percorre o ministério profético de Ellen G. White: a vida, as visões, os escritos e o lugar que ocupam na Igreja Adventista do Sétimo Dia.</p><p>É um estudo de fundo, feito com as fontes à vista, para quem quer ir além do que se diz de passagem — sobre o dom profético, sobre o que ela escreveu e sobre como se lê hoje.</p>'],
    ['LIV-072', '<p>José Pereira pega na pergunta que todos fazem quando a vida dói — «por que, Senhor?» — e procura a resposta onde ela está: na Bíblia.</p><p>Um livro para quem perdeu alguém, para quem adoeceu, para quem viu a vida virar do avesso e não entende o silêncio de Deus. Não despacha a dor com frases feitas: senta-se com ela.</p>'],
    ['LIV-142', '<p>Guia de estudos da classe baptismal: os pontos da fé, um a um, com os textos bíblicos ao lado, para acompanhar quem se prepara para o baptismo.</p><p>Serve ao instrutor para dar a lição e ao candidato para estudar em casa e levar as dúvidas à aula seguinte.</p>'],
    ['LIV-147', '<p>Folheto missionário sobre a família: o caminho para um final feliz, em linguagem simples e com as passagens bíblicas à mão.</p><p>É dos títulos que mais sai para distribuição — leva-se à mão cheia para as visitas, para as campanhas e para deixar a quem se visita em casa.</p>'],
    ['LIV-149', '<p>Folheto missionário sobre o amor dentro de casa: o segredo da alegria no lar, contado em poucas páginas e com os textos bíblicos ao lado.</p><p>Feito para dar: cabe no bolso, lê-se de uma vez e abre conversa com quem se visita.</p>']
  ];
  v_par text[];
  v_sem_descricao integer;
begin
  foreach v_par slice 1 in array v_pares loop
    -- A descrição considera-se em falta quando está vazia, quando é curta a ponto de não
    -- dizer nada (menos de 60 caracteres de texto) ou quando é um pedaço do título — «Biblia
    -- Sagrada» contra «Bíblia Sagrada — capa dura bordô com flores e pássaro». A comparação
    -- ignora etiquetas, acentos e pontuação. Só neste sentido: uma descrição a sério nomeia o
    -- livro de que fala, e seria apagada se se olhasse ao contrário. A mesma regra está em
    -- descricaoEmFalta(), no scripts/kigest/migracao.mjs.
    update public.stock_books b
       set description = v_par[2], updated = now()
     where b.book_code = v_par[1]
       and (
         coalesce(btrim(private.texto_simples(b.description)), '') = ''
         or length(btrim(private.texto_simples(b.description))) < 60
         or private.chave_texto(b.title) like '%' || private.chave_texto(b.description) || '%'
       );
  end loop;

  -- Fica registado quantos ficaram sem descrição, para se ver no log do deploy se escapou algum.
  select count(*) into v_sem_descricao
    from public.stock_books
   where active and coalesce(btrim(private.texto_simples(description)), '') = '';
  raise notice 'produtos activos ainda sem descrição: %', v_sem_descricao;
end;
$$;

drop function if exists private.chave_texto(text);
drop function if exists private.texto_simples(text);
