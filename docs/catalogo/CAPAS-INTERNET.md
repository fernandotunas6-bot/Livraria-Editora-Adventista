# Capas da internet para os produtos sem fotografia (2026-11-14)

Os produtos que vieram do KiGest entraram com uma **capa tipográfica** (o título sobre o
gradiente da casa), porque não havia fotografia de nenhum ([KIGEST.md](KIGEST.md)). Desses, os
154 que são livros, bíblias, revistas e o hinário têm capa publicada algures; os outros
(certificados, blocos, lenços, emblemas) não.

Procurou-se a capa de cada um na internet, viu-se cada candidata ao lado do título do produto, e
só entrou a que é de facto aquele livro. **Entraram 109**; um outro afinal era um duplicado de um livro que já tinha
capa (ver «Duplicados»); e **ficam 44**, listados no fim com o motivo.
As quatro bíblias que a CPB faz em várias capas passaram a ter **as cores todas à escolha** (mais
8 capas), e corrigiram-se de caminho dois duplicados e os nomes que as capas desmentiam.

| | Quantas |
|---|---:|
| Capa da Casa Publicadora Brasileira (`imagens.cpb.com.br`) | 95 |
| Capa da Estante Virtual (livros que a CPB já não vende) | 14 |
| Confirmadas pelo **ISBN** da loja | 40 |
| Confirmadas pela **referência do KiGest**, que é o código do produto na CPB | 23 |
| Confirmadas pelo título (e vistas uma a uma) | 46 |

O registo de cada capa — de onde veio, o código na fonte, o título na fonte, como se confirmou e
o tratamento — está em [capas-internet.json](capas-internet.json).

## Como se procurou

1. **Loja da CPB.** `scripts/catalogo/procurar_capas.py` pesquisa o título (e variantes sem
   «Vol.», «Encadernado», «(Livro Infantil)»…) em `cpb.com.br`, abre a página de cada resultado e
   lê o título completo, o ISBN e o endereço da capa.
   - Descobriu-se que **as referências do KiGest com 4 ou 5 algarismos são o código do produto
     na CPB**: «Bíblia da Mulher» tem a referência 16206, e o produto 16206 da CPB é a «Bíblia da
     Mulher (Capa Cinza)». O script usa-as como primeiro candidato.
   - A pesquisa da CPB não acha grafias diferentes: «Testemunho para Igreja Vol. 2» (é
     «Testemunhos para a Igreja, Vol. 2»), «Mente Carácter Personalidade» («Mente, Caráter e
     Personalidade»). Esses procuraram-se à mão e confirmaram-se pelo ISBN.
2. **Estante Virtual.** Para os livros que a CPB já não vende (livros missionários de anos
   anteriores, edições antigas), `scripts/catalogo/estante.py` pesquisa pelo ISBN e pelo título.
   As fotos são dos livreiros: só entraram as que mostram a capa inteira, de frente, sem mão,
   etiqueta ou autocolante.
3. OpenLibrary e Google Books não têm estes ISBN (o Google Books recusava por limite de pedidos);
   a loja da SBB só pesquisa no navegador.

## A auditoria visual

**Primeira passagem — é este o livro?** Folhas com a capa tipográfica actual à esquerda e as
candidatas ao lado, produto a produto (126 com candidata). Rejeitou-se o que não é o livro, e
houve de tudo:

- a pesquisa pelo ISBN devolveu livros sem relação: «250 Receitas», «A Saúde pelos Alimentos»,
  «Manual dos Anciãos», «Corpo Saudável», «Desfrutar da Vida», «Mente Positiva», «Manual Diáconos
  e Diaconisas», «Guia de Secretaria» (romances, livros de arquitectura, de culinária);
- a referência do KiGest de «Corte» (23568) não existe na CPB, e a de «Por que Saí do
  Escritório» (16086) é outro livro, «Por Que Mudei de Exército»;
- «Viagem ao Desconhecido» deu «Xarana — Viagem ao desconhecido», outro livro;
- «Vida de Jesus» e «Guia para Diáconos» só tinham fotos com uma etiqueta ou um autocolante
  colados na capa;
- «Meditação da Mulher» e «Meditação 2026»: há uma por ano e não se sabe qual é a da loja;
- «Sinta-se Bem» e «O Poder Medicinal dos Sucos»: o ISBN da loja é da edição portuguesa e só se
  encontrou a brasileira, que pode ter outra capa.

Entre várias edições do mesmo livro escolheu-se a do ISBN: «Felizes no Amor» (ISBN de 2018, capa
cinzenta, não a dos anos 90), «Como Formar Filhos Vencedores» (edição amarela). Entre fotos da
mesma capa, a digitalizada de frente.

**Segunda passagem — ficou bem?** As capas tratadas viram-se todas de novo em grelha. Isto
apanhou erros do tratamento: uma dúzia de capas impressas até à borda (as da Ellen G. White, bege
ou cinzentas) e algumas digitalizações da Estante Virtual tinham sido cortadas a mais, porque a cor da própria capa foi tomada pelo fundo; e duas fotos ficaram tortas ou só com um canto.
Corrigiu-se (ver «Tratamento») e voltou-se a ver tudo.

## Tratamento

`scripts/catalogo/capas_internet.py` lê o registo e grava cada capa a **400×600 WebP** por cima
da tipográfica, **com o mesmo nome de ficheiro**, em `app/web/public/images/capas/kigest/`:

- maqueta da CPB com fundo transparente, preto ou branco: endireita a frente pelas quatro arestas
  (`achatar.py`, a que ganhou o parâmetro `tam`);
- capa digitalizada de frente («plano»): apara a margem **só se ela for branca ou preta** e ajusta
  a 2:3 sem perspectiva — era aqui o erro da primeira volta;
- foto do livro com fundo real: cantos dados à mão (`quad` no registo) — foi o caso de «Guiados
  por Deus».

Como os nomes não mudaram, **a base de dados não muda** para as capas. O resto está na migração
`20261114160000_capas_cores_e_nomes_do_catalogo.sql`, que só mexe no que ainda está como estava
(não pisa o que alguém tenha corrigido no painel) e que se testou em PGlite sobre o esquema real,
duas vezes seguidas, com o mesmo resultado.

Quem já tinha visitado a loja vê a capa tipográfica mais uma vez: o service worker serve as
imagens da cache e actualiza-as em segundo plano, por isso na visita seguinte já aparece a nova.

## As cores das bíblias

A CPB faz estas bíblias em várias capas e não se sabia qual a loja tinha. As fotografias dos
produtos ocultos de 2026-11-10 (Desbravador laranja e verde, Aventureiros azul e rosa) mostram que
tem mais do que uma. Cada cor passou a ser uma **variante** do produto, com a sua capa:

| Bíblia | Cores |
|---|---|
| Andrews (NAA, couro) | preta, castanha, rosa |
| Arqueológica | couro castanho, couro azul, P.U. azul |
| Aventureiros | azul, rosa |
| Desbravador | rosa, azul, laranja, verde |

Na página do produto o cliente escolhe a **cor** (não «a edição»: as variantes marcadas
`tipo: 'cor'` chamam-se cores — `variantNames` em `lib/productTypes.js`) e a imagem muda para a
capa dessa cor (`withVariantImages` em `api/EcommerceApi.js` junta as capas das variantes à galeria).
A cor escolhida vai na encomenda, no carrinho e no recibo, como os tamanhos.

**Por fazer na loja:** cada cor ainda usa o stock do produto inteiro. Quando se souber quantas há
de cada, põe-se no painel (produto → Versões → stock); uma cor que não haja fica a 0 e aparece
riscada.

## Duplicados

Dois artigos do KiGest tinham entrado como produtos novos, mas o livro já estava no site, vindo do
catálogo antigo com outro nome:

| Do KiGest | Já existia | O que se fez |
|---|---|---|
| 000163 «Por que Não Mas Estpita» (oculto) | «Por Que Não Sou Mais Espírita - O Testemunho…» (à venda) | O ISBN 9788534509305 e o preço são os mesmos. |
| 000142 «Por Detrás do Véu» (à venda) | «Por Trás do Véu» (à venda) | O mesmo livro de Esmie G. Branner estava à venda **duas vezes**, e a descrição do duplicado falava do santuário, que não é o assunto do livro. |

A referência do KiGest passa para o produto antigo (que fica com o preço e o stock da loja, como os
outros produtos ligados ao KiGest) e o duplicado fica oculto. «Por Trás do Véu» passa assim de
16 155 Kz para 20 298,76 Kz, que é o preço no KiGest.

## Nomes

Os nomes que vieram truncados ou com gralhas do KiGest e que a capa e o ISBN confirmam:

| Era | Fica |
|---|---|
| Testemunho para Igreja Vol. 2 / 4 / 5 / 6, Testemunhos para Igreja Vol. 8 / 9, Testemunhos para a Igreja 3 | Testemunhos para a Igreja Vol. N |
| Testemunhos para a Igreja (000217) | Testemunhos para a Igreja **Vol. 7** (pelo ISBN) |
| Mensagens Escolhida Vol. 2 | Mensagens Escolhidas Vol. 2 |
| Mente Carácter Personalidade Vol. 1 / 2 | Mente, Carácter e Personalidade Vol. 1 / 2 |
| Nepp-lar Adventista o Encadernado | O Lar Adventista |
| Nepp-temperança | Temperança |
| Conselho sobre Saúde | Conselhos sobre Saúde |
| Casamento Princípio Bíblicos e Teológico | Casamento — Princípios Bíblicos e Teológicos |
| Patriarcas e Profetas Encadernado | Patriarcas e Profetas |
| Cartas Jovens Namorados | Cartas a Jovens Namorados |
| Como Formar Filho Vencedor | Como Formar Filhos Vencedores |
| Último Convite | O Último Convite (e a descrição, que lhe chamava folheto; é o livro de Clifford Goldstein) |
| Sombras e Realidade | Sombra e Realidade |
| Bíblia Disciplos | Bíblia do Discípulo |
| Bíblia dos Desbravadores | Bíblia do Desbravador |

E o ISBN de «Princípios sobre Aposentadoria», que tinha uma gralha (`9788732534895` →
`9788534534895`).

## Descrições revistas

As descrições dos produtos do KiGest foram escritas só a partir do nome do artigo, antes de se saber
que livro era cada um. Com a capa e a página da editora identificadas, leram-se todas ao lado da
sinopse da CPB (95) ou da capa (14). **25 foram reescritas** e a do «Mensageiro», que não tinha
nenhuma, é nova. As outras dizem o mesmo que a editora e ficaram.

| Porquê | Livros |
|---|---|
| Falavam de outro assunto | «Livre das Garras do Sucesso» (é sobre música, não sobre carreiras), «Vida e Ensinos» (a autobiografia de Ellen White, não a vida de Jesus), «Simples Demais» (a saúde da mente, não viver com menos), «Administração Eficaz» (mordomia, não gestão de instituições), «Profecias Surpreendentes» (as predições de Ellen White, não Daniel e o Apocalipse), «Sucesso em Dose Dupla» (empreendedores e colaboradores, não a família), «A Chave da Virada» (saúde emocional), «21 Dias para Mudar» (saúde), «Hinário Novo» (dizia «a numeração de sempre»; tem 600 hinos e numeração nova), «Por Detrás do Véu» (o duplicado) |
| Chamavam folheto a um livro | «A Única Esperança», «Em Busca de Esperança», «Sinais de Esperança» (e «O Último Convite», no passo 5) |
| Outro público ou outro género | «Inigualável» (estudo teológico, não leitura devocional), «Maravilhas da Criação» (13–16 anos), «Bíblia dos Aventureiros» (dizia «Desbravadores e Aventureiros»), «Chamados para Salvar» (guia de evangelismo), «Revolucione Seu Futuro» (carreira profissional) |
| Prometiam o que ninguém confirmou | «Prazer em Conhecer Ellen White» («cem mil páginas»), «Orando como Nunca por Seu Marido», «O Ciclo da Infelicidade», «Ministério para as Cidades», «Além da Magia», «Bíblia do Desbravador», «Testemunhos para a Igreja Vol. 7» |

Cada descrição nova diz o que o livro é, de que trata e para quem é, com o título completo e o autor
tirados da capa, e só o que a editora ou a capa dizem. A migração só troca a descrição que ainda é a
que foi escrita (compara a impressão md5 do texto), por isso não pisa uma descrição mudada no painel.
O ficheiro de origem, [descricoes-kigest.json](descricoes-kigest.json), tem os textos novos.

**Autores:** os 93 livros com autor conhecido (da página da CPB ou da capa) passam a tê-lo; as bíblias
e o hinário ficam sem, porque na CPB o «autor» deles é a tradução ou a editora.

**O «Mensageiro»** (Dirceu Madalena e Hirailton Vinhote Correa) tem agora capa, descrição e autor, e
vai à venda pela mesma regra dos outros produtos do KiGest (preço, capa, descrição, nome legível).

**Editora:** todo o catálogo, incluindo os livros antigos da CPB, tem a editora «Livraria e Editora
Adventista». Parece ser a regra da casa, por isso não se mexeu; se a ideia for mostrar a editora de
cada livro, os 95 com capa da CPB são da Casa Publicadora Brasileira.

## Notas para a equipa

| Produto | Nota |
|---|---|
| «O Grande Conflito Infantil» (00033) | Pôs-se «Deus e o Anjo Rebelde — O Grande Conflito recontado», a versão para crianças da CPB. Provável, não confirmado. |
| «Conselhos sobre Mordomia» | O ISBN da loja é de uma edição antiga; a capa é a da edição actual. |
| «Conselhos sobre Escola Sabatina» (00700) e «Conselhos sobre a Escola Sabatina» (000201058) | São dois artigos no KiGest, ambos à venda no site, provavelmente duas edições do mesmo livro. Ficaram como estão. |
| «Kit de Comentários» (00049, 160 000 Kz) | Pode ser o «Comentário Bíblico Andrews — 4 volumes» (161 100 Kz); não está confirmado e ficou como está. |
| Bíblias dos Aventureiros e do Desbravador ocultas de 2026-11-10 (BIB-021 a BIB-024) | São as fotografias de cada cor; com as cores à escolha nas bíblias do KiGest, ficam ocultas. |
| «Guia de Liberdade Religiosa», «Guiados por Deus», «Guia para Anciãos» | Só havia fotos pequenas (184–240 px de largura): ficam legíveis mas menos nítidas. |
| «Guiados por Deus» e «Estarei Pronta no Sábado» | Não se encontrou de que tratam (só a capa); as descrições são as que foram escritas pelo nome. **Convém confirmar com o livro na mão.** |

## Os 44 que ficam com a capa tipográfica

Precisam de uma fotografia do exemplar da loja (de frente, sem plástico) ou de quem saiba qual é
a edição.

| Motivo | Produtos |
|---|---|
| Bíblias de edição local ou missionária, sem capa na internet | Missionária «Eu Vou», «Nova Semente» (2), «Recomeçar», «Se o Filho Libertar», «Semeando a Palavra que Transforma», com Concordância ARC, RA Rosa, «Sociedade Bíblica Brasil», Novo Testamento em Umbundo |
| Edição portuguesa ou espanhola (Publicadora Atlântico, Servir, Safeliz) sem capa encontrada | «Corpo Saudável», «Desfrutar da Vida», «Mente Positiva», «Sinta-se Bem», «O Poder Medicinal dos Sucos», «Manual dos Anciãos», «Manual Diáconos e Diaconisas», «250 Receitas», «A Saúde pelos Alimentos» |
| O resultado era outro livro, ou só havia fotos com etiqueta | «Guia de Secretaria da Igreja», «Guia do Diácono», «Vida de Jesus», «Viagem ao Desconhecido» (2), «Por que Saí do Escritório», «Corte» |
| Não se sabe que edição é (anual, série, nome vago) | «Meditação 2026», «Meditação da Mulher», «Quebrando o Silêncio», «Trimestrais», «Revista Viva», «Revista Esperança Novo Tempo», «Kit de Comentários», «Pesquisador», «101 Segredos», «111 Administrar Dinheiro», «111 Estudante», «111 Dicas para Criar Filhos», «Mensagens e Mensageiros», «Esperança para Família Infantil», «Guia do Ministério da Criança», «100 Anos de Missão, Fé e Esperança» |
| Ocultos, sem nome legível | «Bilingue», «Regras para que» |

Para pôr a fotografia: no painel, no produto, trocar a capa. Para refazer uma destas capas a
partir de outra fonte, acrescenta-se a entrada em `capas-internet.json` e corre-se:

```bash
python3 scripts/catalogo/capas_internet.py docs/catalogo/capas-internet.json pasta-das-fontes/ --so <id>
```

(com `opencv-python-headless`, `pillow` e `numpy`; as fontes descarregam-se do `url` de cada
entrada para a pasta, com o nome do campo `fonte`).
