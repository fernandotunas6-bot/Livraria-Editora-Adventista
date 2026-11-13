# O KiGest e o catálogo do site

O **KiGest** (KigestGC) é o programa de facturação que corre no computador da loja
(`DESKTOP-G26LDJM`). É nele que se vende ao balcão: cada venda sai do stock, cada preço cobrado
é o que lá está. O site tem o seu próprio catálogo, em `public.stock_books`.

Até agora os dois viveram de costas voltadas. O preço no site veio da lista da Casa Publicadora
Brasileira — e por isso 61 dos 106 produtos emparelhados tinham o preço certo ao cêntimo — mas o
stock foi posto à mão quando cada produto entrou e nunca mais foi mexido. Na primeira conciliação
(12 de Novembro de 2026) 94 dos 106 tinham stock diferente. Sete produtos estavam à venda no site
com a loja a zero — o «Interpretando as Escrituras» dizia 12 — e três davam-se por esgotados tendo
livros na prateleira.

Outros 34 estavam ocultos desde a migração das fotografias (20261110090000) à espera de preço: é
o KiGest que lho dá, e com isso ficam prontos a publicar.

Agora há uma chave entre os dois: a coluna **`stock_books.kigest_ref`**, que guarda a referência
do artigo no KiGest (`tbArtigos.Referencia`). Com ela, cada exportação nova actualiza o stock sem
ter de adivinhar nada.

## Fazer uma exportação nova

1. No computador da loja, exportar do KiGest. Sai um ficheiro `KIGEST-exportacao-<data>.kigest`.
2. Copiar o ficheiro para a raiz do projecto (não vai para o git: está no `.gitignore` — traz
   clientes, facturas e salários, e nada disso tem que estar num repositório).
3. Correr:

```bash
node scripts/kigest/migracao.mjs KIGEST-exportacao-<data>.kigest \
  --sql supabase/migrations/<AAAAMMDDHHMMSS>_catalogo_do_kigest.sql \
  --relatorio docs/catalogo/KIGEST-<AAAAMMDD>.md \
  --mapa docs/catalogo/mapa-kigest-<AAAAMMDD>.json
```

4. **Ler o relatório antes de seguir.** É onde está o que precisa de decisão: preços que mudam,
   artigos que o mesmo nome não distingue, stock que não pode estar certo. As decisões tomadas
   escrevem-se em `docs/catalogo/kigest-decisoes.json`, cada uma com a prova, e o passo 3
   corre-se outra vez.
5. Gerar as capas dos produtos novos:

```bash
python3 scripts/catalogo/capa_tipografica.py docs/catalogo/mapa-kigest-<data>.json
```

6. Escrever a migração das descrições, das capas e da publicação:

```bash
node scripts/kigest/descricoes.mjs docs/catalogo/mapa-kigest-<data>.json --sql supabase/migrations/<AAAAMMDDHHMMSS>_kigest_descricoes_e_publicacao.sql
```

   Recusa escrever enquanto faltar a descrição ou a capa de algum produto, e é de propósito: um
   produto publicado sem descrição é uma página que repete o título três vezes. Escreva as que
   faltarem em `docs/catalogo/descricoes-kigest.json` e corra outra vez.

7. Abrir o PR com as migrações, o relatório e o mapa. Publica-se como todas as outras: o merge
   no `main` corre o Actions, que aplica as migrações.

O script não escreve na base de dados. Lê o catálogo do site com a chave pública — só o que
qualquer visitante lê — e escreve ficheiros.

## O catálogo tem duas camadas, e a chave pública só vê uma

A chave pública lê o catálogo como qualquer visitante — e um visitante não vê o que está oculto:
as regras de RLS escondem tudo o que tem `active = false`. Na primeira conciliação isso deixou de
fora **72 produtos**, os que a migração das fotografias trouxe e que ainda esperam preço.

Sem eles, a conciliação dava-os por inexistentes e a loja ficava com cada um **duas vezes**: o
«ATIRADOR COVERTIDO» do KiGest entraria como produto novo ao lado do «O Atirador Convertido — E
outras histórias de salvação e milagres» que já lá estava. Eram 50 produtos repetidos.

Por isso o `scripts/kigest/catalogo-oculto.mjs` lê esses 72 do próprio repositório — da migração
que os criou e da tabela curada das fotografias. Ligam-se pelo **título exacto**, porque o código
que o gatilho lhes deu em produção não está escrito em lado nenhum.

E a migração repete as guardas **em SQL**, onde se vê o catálogo todo: um produto novo não entra
se já existir um com aquela referência do KiGest, com aquele título ou com aquele ISBN.

## O que a exportação traz e o que se usa

O `.kigest` é um gzip de JSON por linhas, com 164 objectos: a facturação toda, contas correntes,
recursos humanos. Destes usam-se **dois**: `tbArtigos` (o catálogo) e `tbArtigosStock` (a
existência por armazém). O `artigos()` do `scripts/kigest/exportacao.mjs` devolve só produto,
preço e quantidade — nomes de clientes, facturas e salários nunca saem do ficheiro.

De cada artigo vêm: a referência, a descrição, o código de barras, `Preco1` (o preço de venda ao
público; na exportação de 2026-11-12 `Idtaxa` é 0 e `Preco1Taxa` é igual, portanto é preço final)
e `QtdExistente` no armazém 1, que é a loja.

## Como se emparelham os dois catálogos

Não havia chave comum, e os títulos não ajudam: no site estão escritos como a editora os
publica («O Sábado na Bíblia — Por que Deus Faz Questão…») e no KiGest como quem os digitou ao
balcão os escreveu («O SÁBADO NA BIBLIA», «COMO SAIR SAIR DA DEPRESSAÕ»). O emparelhamento é por
palavras, e é conservador de propósito — o que se vai escrever é preço e stock, e um par errado
põe o preço de um livro noutro:

- **Já ligado** (`kigest_ref` preenchido) — é a chave boa e dispensa adivinhar.
- **Id na loja da editora.** Em muitos artigos o KiGest usa como referência o próprio código do
  produto na Casa Publicadora Brasileira, e a ronda das fotografias guardou esse código para 44
  produtos do site (`scripts/catalogo/produtos.py`). Quando os dois batem é o mesmo produto, e o
  título nem precisa de se parecer: foi assim que «PEDACINHO DO CEU» encontrou o «Devocional da
  Família — Pedacinho do Céu». São 12 pares que nenhuma outra regra apanharia.
- **Código de barras** igual nos dois lados, com 13 dígitos.
- **Palavras do título**, com duas medidas: quanto os dois títulos se parecem e quanto do título
  do KiGest cabe no do site (é esta que salva os abreviados — «MÚSICA NA IGREJA» está todo dentro
  de «Música na Igreja — Aspectos Teológicos, Críticos…»).

E só conta como par quem **ganha com folga**: o artigo tem de ser o único candidato no topo e
nenhum outro artigo da loja pode andar a menos de 0,25 de nota do mesmo produto. O resto fica
para decidir à mão e vai no relatório.

É o caso das bíblias — o site tem seis descritas pela capa («capa dura castanha») e a loja tem
vinte descritas pela tradução («RA», «NTLH», «Letra Gigante», «Umbundu»). E é o caso dos lenços,
que é o que mostra para que serve a folga: a loja separa o lenço do membro (2 000 Kz) do lenço de
líder (5 000 Kz) e o site tem um só. Na exportação de 12 de Novembro o do membro está lançado no
singular («LENÇO DE DESBRAVADORE»), o que lhe tira a palavra que o identificava; sem a regra da
folga, o site ficava a vender o lenço do membro ao preço do de líder — mais do dobro.

Quando um artigo não ganha de ninguém mas se parecia com algum produto do site, entra como
produto novo **com o aviso** na última coluna da lista dos ocultos: pode ser o mesmo produto com
outro nome, e é melhor olhar do que ficar com ele duas vezes na loja.

Para resolver um desses à mão basta pôr a referência do KiGest no campo da ficha do produto; a
exportação seguinte passa a emparelhá-lo por ela.

## Os produtos que a loja tem e o site não

Na primeira conciliação eram 189, depois de postos de lado 8 repetidos do próprio KiGest e 5 que
davam o mesmo título depois de corrigido («CORDERINNHO» e «CORDERINHO» dão os dois
«Cordeirinho»). Entram com o preço e o stock da loja, e com duas coisas que lhes faltavam:

- **A descrição.** Estão escritas à mão em `docs/catalogo/descricoes-kigest.json`, uma a uma —
  179 para estes e 28 para os que a migração das fotografias trouxe sem texto. Cada uma diz o
  que o produto é, para que serve e quem o usa, e nada mais: nenhum número que não esteja na
  ficha, nenhuma promessa de conteúdo que ninguém confirmou.
- **A capa.** Não há fotografia de nenhum deles. O `scripts/catalogo/capa_tipografica.py` gera
  uma capa tipográfica por produto no desenho da casa — o gradiente, o emblema e a moldura da
  `capa-por-definir.webp` — com o título no lugar onde aquela diz «Capa por definir». Vê-se que
  é tipográfica: não imita a arte da editora. Quando houver fotografia, substitui-se no painel.
  O ficheiro de cada produto fica em `docs/catalogo/capas-kigest.json`, que é o que a migração
  lê: dois títulos diferentes podem dar o mesmo nome de ficheiro.

E publicam-se. Entra à venda quem tem as quatro coisas: **preço acima de zero, capa, descrição e
um nome que um cliente consiga ler.** Com isto o catálogo passou de 124 produtos à venda para
334.

### Quem fica oculto, e porquê

| Quantos | Porquê | Quem resolve |
|---:|---|---|
| 39 | sem preço — o KiGest não tem par para eles | o dono, no painel, ou dá-se-lhes referência no KiGest |
| 10 | o nome no KiGest não se lê («POR QUE NAO MAS ESTPITA») ou não diz que produto é («CARTÃO», «FOLHETOS») | corrige-se o nome no KiGest e entram na exportação seguinte |
| 2 | vestuário sem tamanhos — uma t-shirt sem tamanhos compra-se sem escolher o tamanho | põem-se os tamanhos no painel, como variantes |

Os 10 sem nome legível estão na secção `sem_nome` do ficheiro das descrições, cada um com a razão.

Depois de pôr os tamanhos, o vestuário publica-se com:

```sql
update public.stock_books set active = true
 where product_type = 'vestuario' and price > 0
   and jsonb_array_length(coalesce(versions, '[]'::jsonb)) > 0;
```

E há duas coisas que continuam a valer a pena fazer no painel, produto a produto:

1. **Corrigir o editor.** Entram com «Livraria e Editora Adventista», que é o que o catálogo usa
   por omissão; onde o livro é de outra editora, muda-se.
2. **Confirmar o stock** dos que o relatório assinala como improvável (há um folheto com 265 984
   unidades).

## Ficheiros

| Ficheiro | O que faz |
|---|---|
| `scripts/kigest/exportacao.mjs` | Lê o `.kigest` e devolve produto, preço e existência |
| `scripts/kigest/titulos.mjs` | Caixa, gralhas, tipo de produto e prateleira |
| `scripts/kigest/conciliar.mjs` | Emparelha, separa o ambíguo, apanha os repetidos |
| `scripts/kigest/decisoes.mjs` | Aplica as decisões tomadas à mão, cada uma com a prova |
| `scripts/kigest/migracao.mjs` | Escreve a migração, o relatório e o mapa |
| `scripts/kigest/descricoes.mjs` | Escreve a migração das descrições, das capas e da publicação |
| `scripts/catalogo/capa_tipografica.py` | Gera uma capa tipográfica por produto sem fotografia |
| `docs/catalogo/descricoes-kigest.json` | As descrições, escritas à mão |
| `docs/catalogo/kigest-decisoes.json` | As decisões à mão sobre o que o automático não resolve |
| `docs/catalogo/capas-kigest.json` | Qual é a capa de qual produto |
| `scripts/kigest/kigest.test.mjs` | Testes dos módulos (correm no `npm test`) |
| `scripts/pglite/kigest.mjs` | Corre as migrações sobre o esquema real, em PGlite |
| `docs/catalogo/KIGEST-<data>.md` | O relatório de cada conciliação |
| `docs/catalogo/mapa-kigest-<data>.json` | Número a número, para quem revê o PR |

## Correr os testes

```bash
npm test
```

```bash
npm install --prefix /tmp/pglite @electric-sql/pglite@0.2.17
PGLITE_MODULE=/tmp/pglite/node_modules/@electric-sql/pglite/dist/index.js \
  node scripts/pglite/kigest.mjs supabase/migrations
```

## As descrições em falta

A par da primeira conciliação, 24 produtos activos ficaram com descrição: tinham o campo vazio,
tinham lá o próprio título outra vez («Biblia Sagrada», «Lenço do Clube de Aventureiros — bordô»)
ou tinham uma linha demasiado curta para dizer algo — uma delas trocada (o `LIV-147`, «Esperança
para a Família», tinha a descrição do `LIV-149`, «Amor em Família»).

Não é um detalhe de apresentação: a descrição é o texto da página do produto, é a
`meta description` que o Google mostra e é o que aparece quando alguém partilha o livro numa
conversa. Sem ela o `seo-catalogo.mjs` cai para o título, e as três coisas ficam iguais.

A migração `20261112141000_descricoes_que_faltavam` escreve só onde falta: a descrição tem de
estar vazia, ter menos de 60 caracteres de texto, ou ser um pedaço do título. **O que estiver
escrito no painel não é tocado** — e a comparação só se faz nesse sentido, porque uma descrição
a sério nomeia o livro de que fala e seria apagada se se olhasse ao contrário.
