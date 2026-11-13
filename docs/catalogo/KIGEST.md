# O KiGest e o catálogo do site

O **KiGest** (KigestGC) é o programa de facturação que corre no computador da loja
(`DESKTOP-G26LDJM`). É nele que se vende ao balcão: cada venda sai do stock, cada preço cobrado
é o que lá está. O site tem o seu próprio catálogo, em `public.stock_books`.

Até agora os dois viveram de costas voltadas. O preço no site veio da lista da Casa Publicadora
Brasileira — e por isso 63 dos 74 produtos emparelhados tinham o preço certo ao cêntimo — mas o
stock foi posto à mão quando cada produto entrou e nunca mais foi mexido. Na primeira conciliação
(12 de Novembro de 2026) 70 dos 74 tinham stock diferente: somados, 590 unidades no site contra
419 na loja. Sete produtos estavam à venda no site com a loja a zero — o «Interpretando as
Escrituras» dizia 12 — e três davam-se por esgotados tendo livros na prateleira.

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

4. **Ler o relatório antes de abrir o PR.** É onde está o que precisa de decisão: preços que
   mudam, artigos que o mesmo nome não distingue, stock que não pode estar certo.
5. Abrir o PR com a migração, o relatório e o mapa. Publica-se como todas as outras: o merge no
   `main` corre o Actions, que aplica a migração.

O script não escreve na base de dados. Lê o catálogo do site com a chave pública — só o que
qualquer visitante lê — e escreve ficheiros.

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

Na primeira conciliação eram 287 (com seis repetidos do próprio KiGest de fora). Entram todos
**ocultos** — `active = false`, sem capa e sem descrição — com o preço e o stock da loja. Não se
põe um produto à venda sem fotografia e sem uma linha a dizer o que é.

Antes de publicar cada um, no painel:

1. **Ler o título.** Vem do KiGest com a caixa arrumada e as gralhas conhecidas corrigidas
   (`scripts/kigest/titulos.mjs`), mas o que não se conseguiu confirmar ficou como veio — e há
   nomes que só quem tem o produto na mão decifra («TORSAL», «REGRAS PARA QUE»).
2. **Pôr a capa** e escrever a descrição. Sem ela, a página do produto, o resultado no Google e
   a partilha no WhatsApp ficam todos a repetir o título.
3. **Corrigir o editor.** Entram com «Livraria e Editora Adventista», que é o que o catálogo usa
   por omissão; onde o livro é de outra editora, muda-se.
4. **Confirmar o stock** dos que o relatório assinala como improvável (há um folheto com 265 984
   unidades).
5. **Tamanhos** nas peças de vestuário, como variantes — senão a t-shirt compra-se sem escolher
   tamanho.

Para publicar em lote os que já estão prontos:

```sql
update public.stock_books set active = true
 where kigest_ref <> '' and price > 0 and coalesce(cover, '') <> ''
   and coalesce(btrim(regexp_replace(description, '<[^>]*>', '', 'g')), '') <> ''
   and (product_type <> 'vestuario' or jsonb_array_length(coalesce(versions, '[]'::jsonb)) > 0);
```

## Ficheiros

| Ficheiro | O que faz |
|---|---|
| `scripts/kigest/exportacao.mjs` | Lê o `.kigest` e devolve produto, preço e existência |
| `scripts/kigest/titulos.mjs` | Caixa, gralhas, tipo de produto e prateleira |
| `scripts/kigest/conciliar.mjs` | Emparelha, separa o ambíguo, apanha os repetidos |
| `scripts/kigest/migracao.mjs` | Escreve a migração, o relatório e o mapa |
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
