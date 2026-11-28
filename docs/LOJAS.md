# Lojas físicas: os dados de cada loja

Guia do que cada loja tem de seu no sistema: as províncias que serve, as suas vendas, os seus
colportores, as suas guias e os produtos que tem. Migração
`supabase/migrations/20261114180000_lojas_donas_dos_dados.sql` (fases 1 e 2 do plano das lojas,
pedidas pelo dono a 2026-11-14).

## As províncias que cada loja serve

| Loja | Serve |
|---|---|
| Catumbela | Benguela e Cuanza Sul |
| Huíla (Lubango) | Huíla, Namibe e Cunene |
| Huambo | Huambo |
| Bié (nova) | Bié, Cuando e Cubango |

- Muda-se no painel: **Vendas → Lojas → editar → «Províncias que serve»** (coluna
  `physical_stores.service_provinces`, com os nomes de 2024 de `lib/angolaGeo.js`). O painel avisa
  quando uma província está em duas lojas (fica com a primeira da lista) e mostra as províncias
  que nenhuma loja serve.
- Uma loja sem lista serve só a sua própria província. Com lista, marque também a da própria loja.
- **A loja do Bié**, no Cuito, foi criada pela migração **escondida do site e sem levantamento**,
  porque ainda não abriu. Tem o telefone e o horário das outras lojas, como o dono pediu (o
  telefone da do Huambo e o horário da porta da do Lubango), e as coordenadas do centro do Cuito
  (12°23′S, 16°56′E). Até ser activada, as encomendas do Bié, do Cuando e do Cubango já ficam com
  ela, mas o cliente não a vê. Para a abrir: em Lojas, confirmar a morada, afinar o ponto no mapa
  («Usar a minha localização», já na loja), juntar as fotografias e ligar «Activa» (e
  «Levantamento», se fizer).
- As províncias que nenhuma loja serve (Luanda, por agora, e as outras) ficam com a equipa central,
  como antes.

## O horário de cada loja

- **Lubango, Huambo e Bié:** «Seg–Qui 8h–17h30 · Sex, Dom e feriados 8h–13h», o que está escrito na
  porta do Lubango (fotografia `lubango-1.webp`). Ao sábado não abrem. No Huambo não há registo do
  horário verdadeiro: tinha o de omissão do formulário, com o sábado aberto, e a 2026-11-14
  decidiu-se pôr o mesmo das outras, como o dono pediu para o Bié. Migração
  `20261114223000_horario_das_lojas_e_texto_do_destaque.sql`.
- **Catumbela:** «Seg–Sex 9h–18h», escrito no painel.
- Uma loja nova já vem com o horário da porta preenchido. Muda-se em **Vendas → Lojas → editar →
  Horário**, e o que lá se escrever é o que o site mostra.

## Para onde vai uma venda

Cada encomenda guarda a sua loja (`orders.store_id`), gravada quando entra:

| A encomenda | A loja |
|---|---|
| Levantamento | a loja escolhida |
| Entrega ao domicílio (normal ou expressa) | a loja que serve a província de entrega |
| Só digital | nenhuma |
| Entrega numa província que nenhuma loja serve | nenhuma (equipa central) |

Muda se mudarem o envio, a loja ou a província da encomenda. O nome da loja escrito na encomenda
(`pickup_store`) fica como o cliente o escolheu; mudar o nome de uma loja já não lhe tira as
encomendas. As encomendas antigas receberam a loja pela mesma regra.

- O painel **Relatórios → Vendas por loja** e o relatório de todas as livrarias contam as vendas do
  sistema por esta loja (no servidor, `private.vendas_encomendas`; ver [RELATORIOS.md](RELATORIOS.md)).
- **As vendas ao balcão** não passam pelo sistema: entram no mesmo painel como totais do mês
  (os relatórios que as lojas mandam).

## Colportores por loja

- Cada colportor tem a sua loja (`colporteurs.store_id`): por omissão, a que serve a província
  dele; a equipa muda-a na ficha (**Colportagem → Colportores → ficha → Loja**), e essa escolha fica.
- **Quantos colportores tem cada loja:** Colportagem → Resumo → «Por loja» (com as horas, as
  vendas e as comissões de cada uma). A lista dos colportores tem também o filtro por loja, e o Excel
  traz a coluna «Loja».
- **As guias** (entrega à consignação, devolução, compra) ficam com a loja do colportor
  (`colporteur_documents.store_id`). O stock continua a ser um só (o do KiGest): a guia diz de que
  loja é, não mexe no stock de uma loja em particular.
- **Entregas por colportor** (decisão do dono, 2026-11-14): a oferta continua a ir por
  proximidade — ao colportor mais perto do cliente —, e quem não tem os livros consigo levanta-os
  **na sua loja**. Um colportor do Namibe levanta no Lubango (a Missão Sul tem a sede na Huíla),
  mesmo a mais de 50 km; antes não tinha loja «ao alcance» e não recebia a oferta. Depois da loja
  dele contam, como antes, a da sua província, a mais perto por GPS e a da província do cliente.
  Ver [COLPORTAGEM.md](COLPORTAGEM.md), secção 5.

## «Temos / não temos» em cada loja

Em **Catálogo → Disponibilidade nas lojas** cada loja marca os produtos que tem:

- **Temos**, **Não temos**, ou nada (**por marcar**: não se sabe). Um a um, ou vários de uma vez
  (seleccionar e «Temos» / «Não temos» / «Por marcar»). Carregar outra vez no botão já marcado
  volta a «por marcar».
- Procura por título, autor ou código, e filtros por estado e por tipo de produto. Os produtos
  só digitais não aparecem: não têm stock.
- **Quem marca:** quem gere o catálogo, em qualquer loja; quem tem a permissão **«Stock da loja»**
  (`manage_store_stock`), só na sua loja — a loja da sua ficha de funcionário (Pessoal →
  Funcionários), que tem de estar ligada à conta. Sem ficha ligada a uma loja, o ecrã explica o que
  falta. A permissão não dá acesso a preços nem a textos dos produtos.
- A regra está na base de dados: a tabela `public.store_stock` só se escreve pela função
  `store_stock_set`, que confirma quem pode marcar cada loja.

### O que o cliente vê

- **Na página do produto:** «Disponível nas lojas: Lubango (Huíla, Namibe e Cunene) · Catumbela
  (Benguela e Cuanza Sul).» Só as lojas que marcaram «temos». Sem nenhuma, fica a linha de sempre
  («Levantamento nas lojas, ver moradas»). «Não temos» e «por marcar» nunca aparecem.
- **No checkout, com entrega:** depois de escolher a província, «Compra na Livraria Adventista —
  Catumbela. Serve Benguela e Cuanza Sul: é ela que prepara e envia a sua encomenda, e é a ela que
  pode ligar: …». Numa província sem loja: «Ainda não há loja a servir Luanda: a encomenda é
  preparada pela equipa central da Livraria.» O resumo antes de confirmar repete a loja.
- **No checkout, com levantamento:** cada loja mostra as províncias que serve. A loja que marcou
  «não temos» num livro do carrinho deixa de se poder escolher e diz qual («Não tem: …»); a que
  tem todos marcados diz «Tem todos os livros»; a que ainda não marcou continua como antes. Se
  nenhuma servir, o checkout sugere a entrega. *Isto é orientação no site: o servidor não recusa
  uma encomenda por causa destas marcas.*
- **Na página /lojas:** cada loja diz as províncias que serve, e o filtro por província encontra a
  loja que a serve (quem é do Namibe encontra a do Lubango).

## Técnico

- Migração `20261114180000_lojas_donas_dos_dados`:
  - colunas `physical_stores.service_provinces`, `orders.store_id`, `colporteurs.store_id`,
    `colporteur_documents.store_id`, com índices;
  - `private.loja_da_provincia_nome` (a loja que serve uma província: a que a tem na lista, depois
    a que fica nela), `private.loja_da_provincia`, `private.loja_da_encomenda` e os gatilhos
    `orders_loja`, `colporteurs_b_loja` e `colporteur_documents_loja`;
  - o preenchimento das encomendas e dos colportores que já existiam, sem acordar os outros
    gatilhos (`disable trigger user`, como em 20261106033302);
  - `public.store_stock` (RLS: o público lê lojas e produtos activos; a equipa do catálogo e do
    stock lê tudo), `public.store_stock_set`, `public.store_stock_my_stores`,
    `private.my_store_ids`, `private.can_edit_store_stock`;
  - a permissão `manage_store_stock` nas três listas de chaves (base de dados,
    `app/web/src/lib/permissions.js`, `supabase/functions/app/permissions.ts`);
  - `private.delivery_pickup_store` com a loja do colportor em primeiro lugar.
- Site: `lib/storeStock.js` (regras e acesso aos dados), `lib/stores.js` (`lojaQueServe`,
  `provinciasServidas`, `conflitosDeZonas`, `cidadeDaLoja`), `components/admin/StoreStockTab.jsx`,
  `components/StoreAvailability.jsx`, e mudanças em `ShoppingCartPanel.jsx`, `StoresPage.jsx`,
  `admin/StoresTab.jsx`, `admin/colportagem/*` e `painel-vendas/adapter.js`.
- O site funciona antes de a migração estar aplicada: sem as colunas, cada ecrã mostra o que
  mostrava (o painel de vendas conta pelo nome e pela província, como antes).
- Testes: `scripts/pglite/lojas.mjs` (74 verificações com as migrações reais, incluindo o
  preenchimento do que já existia e a loja onde o colportor levanta) e testes unitários em `lib/storeStock.test.js`,
  `lib/stores.test.js`, `components/StoreAvailability.test.jsx` e `lib/colporteurReports.test.js`.

## O que vem a seguir (plano das lojas)

1. **Gerente de loja** (fase 3): um papel que vê e gere só a sua loja — as encomendas, o stock, os
   colportores e o painel de vendas dela —, com a regra na base de dados.
2. **Localização** (fase 4): a loja de levantamento mais perto já escolhida no checkout; repor as
   coordenadas do Lubango e de Catumbela, apagadas a 2026-11-05 por estarem erradas.
3. **Portal dos colportores num subdomínio** (fase 5), com pedidos de livros à sua loja.
4. Abrir a loja do Bié quando estiver pronta (ver acima).

## Criar lojas novas sem colisões, no site e no KanGest (28/11)

Pedido do dono: «ter módulos bem organizados e funcionais para criar outras lojas sem riscos de colisão, tanto no KanGest
como na livraria», e «permitir que cada loja seja administrada como já está». Migração
`20261128130000_lojas_novas_sem_colisoes.sql`.

**Automático por omissão, com o manual ao lado:** a base de dados decide. O painel e o KanGest avisam antes, para
ninguém chegar ao erro.

### As peças

| Peça | Onde | O que garante |
|---|---|---|
| A loja | `physical_stores` (painel: *Vendas → Lojas*) | o nome e o código são únicos; uma loja com dados não se apaga |
| O código da loja | `physical_stores.codigo` (HUA, HUI, BIE…) | único; é a base das séries do KanGest da loja |
| O posto do KanGest | `kangest_postos` (painel: *Sistema → Ligação ao KanGest*) | cada computador da loja que factura, com a sua chave |
| O prefixo das séries | `kangest_postos.serie_prefixo` (HUA, HUA2…) | único em toda a rede e nunca reutilizado |
| As séries no KanGest | `postos.serie_prefixo` do KanGest (`sinc/series.rs`) | o KanGest usa o prefixo que o site lhe dá |
| Quem vê cada loja | `private.painel_lojas_proprias`, `lojasDaPessoa` | o gerente vê a sua loja; quem vê os relatórios vê todas |

### Os riscos que fecha

**As séries dos documentos**, que eram o risco principal:
- **o problema:** cada KanGest numera as séries automáticas como «prefixo do posto + ano» (`documentos.rs`,
  `escolher_serie`). Por omissão, o prefixo vem vazio (FR 2026/1); depois de importar o KIGEST, é «N» (FR N2026/1). Duas
  lojas com o mesmo NIF emitiam os mesmos números, e para a AGT eram documentos repetidos;
- **a solução:** cada posto tem um prefixo único na rede, e o KanGest usa-o: FR HUA2026/1 no Huambo, FR HUI2026/1 no
  Lubango.

**Duas lojas com o mesmo nome:** uma loja nova com o nome de outra é recusada. Não contam as maiúsculas, os acentos, os
espaços nem os sinais.

**Apagar uma loja com dados:** deixava os documentos, os fechos, as encomendas e os funcionários sem loja. Agora a base
recusa, e a loja desactiva-se em vez de se apagar. Conta como «dados»:
- os postos do KanGest, os documentos, os fechos e os movimentos de dinheiro;
- as encomendas;
- os funcionários;
- os movimentos de stock.

### Criar uma loja nova, passo a passo

1. **No painel, em *Vendas → Lojas → Nova loja*:**
   - escreve-se o nome, a província e a morada;
   - **o código sai sozinho:** as 3 primeiras letras da província (Huambo → HUA). Se já houver, HUA2, HUA3. O campo
     «Código da loja» mostra o código que a loja vai ter;
   - **à mão:** escreve-se outro (2 a 6 letras ou algarismos, a começar por uma letra), sempre único;
   - um nome ou um código repetido é avisado antes de gravar, e a base recusa-o na mesma.
2. **Em *Sistema → Ligação ao KanGest → Postos*, cria-se o posto** com o nome e a loja:
   - **o prefixo das séries sai sozinho:** o código da loja para o primeiro posto (HUA), e HUA2, HUA3 para os seguintes;
   - **à mão:** muda-se no cartão do posto, sempre para um prefixo livre.
3. **No KanGest da loja, liga-se ao site** (com a conta do site ou com o código do posto). Na primeira volta, o KanGest
   recebe o prefixo, e os postos sem prefixo passam a usá-lo sozinhos. A mudança fica na auditoria (`SERIE_PREFIXO`).
4. **Os funcionários da loja:** a ficha de funcionário diz a loja de cada pessoa. O gerente, com «Painel da sua loja»,
   vê só a sua loja:
   - no Painel de Gestão;
   - no Balcão das lojas (os documentos, os fechos, as dívidas e o dinheiro);
   - nas Fichas do balcão.

### Uma loja que já factura (o Huambo)

**Um KanGest que já tem um prefixo** (o «N» do KIGEST, ou um P2 escolhido à mão) **não muda sozinho.** Mudar a série de
uma loja que já factura é uma decisão. No KanGest, em *Ligação à livraria*, o cartão «Séries dos documentos na rede das
lojas» mostra o aviso e o botão **«Usar o prefixo do site»**:
- os documentos já emitidos ficam na série em que saíram;
- os novos saem com o prefixo do site;
- a mudança fica na auditoria.

**No painel, o aviso das séries repetidas** (`kangest_series_em_colisao`) mostra no topo dos postos as séries emitidas
por mais de um posto. Sem o histórico do KIGEST, porque cada loja tinha o seu.

### O que se testa

- **PGlite `lojas-novas`:**
  - o código automático e à mão, e o nome repetido;
  - os prefixos dos postos: o segundo posto, outra loja da mesma província, sem loja, e o revogado, que não se
    reutiliza;
  - a loja com dados, que não se apaga;
  - o detector das séries repetidas.
- **KanGest, `o_prefixo_das_series_vem_do_site_sem_colisoes`:**
  - o posto sem prefixo muda sozinho, com a auditoria;
  - o «N» espera pelo botão;
  - o posto desta máquina usa logo o prefixo novo.
- **Site:** `lojasCodigos.test.js` e o campo do prefixo em `KanGestPostos.test.jsx`.
