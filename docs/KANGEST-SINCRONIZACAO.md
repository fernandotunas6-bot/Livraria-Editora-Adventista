# KanGest Livraria → base central

A **fase 3** do estudo do ecossistema (`docs/ECOSSISTEMA.md`, no PR #101): o KanGest Livraria, a edição do KanGest só
da livraria, envia as suas facturas para o Supabase da livraria.

- **As facturas continuam a ser emitidas e assinadas na loja**, mesmo sem Internet: a certificação da AGT exige-o.
- **A base central recebe uma cópia que não se altera nem se apaga.** Confere a cadeia de assinaturas de cada série e
  junta as vendas ao balcão às do site.
- **O motor do lado do KanGest é a fase 4**, em `app/kangest-sistema/`: a fila local, o emparelhamento e o envio.
- **A ligação que já existe continua a funcionar como está** ([KANGEST.md](KANGEST.md)): as NE, FR e NC das
  encomendas pela API do KanGest, e o stock e os preços pelos avisos.

## 1. Configurar (uma vez)

O ensaio completo, passo a passo, antes de ligar uma loja a sério, está em [KANGEST-ENSAIO.md](KANGEST-ENSAIO.md),
com o posto de ensaio `scripts/kangest/ensaio-posto.mjs`.


1. **As chaves.**
   - Corra `node scripts/kangest/chaves-sinc.mjs` e cole o comando `supabase secrets set …` que ele mostra.
   - Isso cria dois segredos da Edge Function: `KANGEST_SINC_CHAVES`, a chave X25519 do centro, e
     `KANGEST_DADOS_CHAVE`, a chave dos dados pessoais.
   - Guarde a `KANGEST_DADOS_CHAVE` também num cofre de senhas e **nunca a troque**: sem ela, os NIF e os nomes que
     já chegaram não se voltam a ler.
2. **O posto.** No painel, em **Sistema → Ligação ao KanGest → Postos do KanGest Livraria**, crie o posto: o nome (por
   exemplo «Loja do Huambo») e a loja. O painel mostra uma vez um código de 8 letras, que serve só uma vez e durante 10
   minutos, e o endereço da ligação.
3. **No KanGest Livraria**, em **Livraria → Ligação ao site**, escreva o endereço e o código. O posto gera a sua chave
   Ed25519 e só a parte pública sobe; daí em diante, as facturas saem sozinhas.

Para as pessoas entrarem no KanGest com a conta do site (§8), o script mostra também o comando de
`KANGEST_CHAVE_PUBLICA_SITE`, que é a chave pública do site e não um segredo.

Sem os segredos, as rotas `/kangest/*` respondem 404 e o painel diz o que falta.

## 2. Como um pedido viaja

Um **posto** é uma instalação do KanGest Livraria: o computador servidor de uma loja, não um terminal de venda. O
posto identifica-se só pela sua chave Ed25519; não tem conta no Supabase Auth, por isso não há um token que se possa
roubar.

`POST /functions/v1/app/kangest/sinc`. Os cabeçalhos são estes:

| Cabeçalho | O quê |
|---|---|
| `x-kangest-posto` | O id do posto (uuid) |
| `x-kangest-hora` | Segundos Unix; mais de 5 minutos de diferença para a hora do servidor é recusado (acerte o relógio) |
| `x-kangest-nonce` | 16 a 64 caracteres ao acaso; o mesmo nonce outra vez é recusado (`private.kangest_nonces`) |
| `x-kangest-assinatura` | Ed25519, em base64, de `kangest-sinc/1\n<posto>\n<hora>\n<nonce>\n<sha256 hex do corpo>` |

O corpo é um envelope `{"v":1,"kid":"1","epk":"…","iv":"…","ct":"…"}`:
1. O posto gera uma chave X25519 efémera (`epk`) e faz o acordo X25519 com a chave pública do centro (`kid`).
2. HKDF-SHA256 com sal = `epk ‖ chave do centro` e info = `kangest-sinc/1` dá 64 bytes: os primeiros 32 são a chave do
   pedido e os outros 32 a da resposta.
3. O JSON `{"lote":[…]}` vai em AES-256-GCM com a chave do pedido. Os dados associados são `kangest-sinc/1\n<posto>\n
   <hora>\n<nonce>`, para que o corpo cifrado não se possa colar noutros cabeçalhos.

A resposta `{"v":1,"iv":"…","ct":"…"}` vai em AES-256-GCM com a chave da resposta e os dados associados
`kangest-sinc/1\nresposta\n<nonce>`. Só quem fez o pedido a abre. Leva o resultado do lote, o posto (nome e loja) e a
hora do servidor.

O servidor confere por esta ordem:
1. o formato, a hora e o posto (activo, com chave);
2. a assinatura;
3. o nonce;
4. o envelope.
Só depois toca nos dados. Os vectores de teste da sessão estão em `supabase/functions/app/kangestSinc.test.ts`, e o
KanGest em Rust tem de chegar aos mesmos bytes.

**Rodar a chave do centro.**
1. `node scripts/kangest/chaves-sinc.mjs --rodar '<KANGEST_SINC_CHAVES actual>'` põe uma chave nova à frente; as duas
   anteriores continuam a aceitar-se.
2. No painel, **Rodar a chave** em cada posto dá-lhe um código novo. A chave Ed25519 antiga desse posto deixa de valer
   no mesmo instante.

**Revogar** um posto corta-o já: o pedido seguinte é recusado. As facturas que já chegaram ficam.

## 3. O que fica na base

| Tabela | O quê |
|---|---|
| `kangest_postos` | Os postos: a loja, o estado (`por_emparelhar`, `activo`, `revogado`), a chave pública, o resumo SHA-256 do código (nunca o código), a última sincronização e o último erro. Só o servidor lê e escreve |
| `kangest_documentos` | A cópia de cada documento: a série e o número, o `hash` assinado, o `hash_anterior`, os totais em cêntimos, a loja do posto e o estado da cadeia. Única por posto e documento, e por posto, tipo, série e número |
| `kangest_documento_linhas` | As linhas, com `book_id` = o produto do site com a mesma referência (`stock_books.kigest_ref`) |

**As cópias não se alteram nem se apagam**, nem pelo servidor: um gatilho recusa-o. Só mudam:
- a marca de anulado (ou de facturado, numa proforma), que vem do KanGest;
- a conferência da cadeia;
- a loja, se esta for apagada;
- nas linhas, a ligação ao produto.
Um posto com documentos não se apaga, revoga-se.

**A cadeia da AGT.** O `hash_anterior` de um documento tem de ser o `hash` do anterior da mesma série (o primeiro da
série tem-no vazio). Os estados são estes:
- `certa`;
- `partida`: o painel mostra «elos da cadeia AGT partidos»;
- `por_conferir`: o anterior ainda não chegou ou é de antes da ligação. Quando chegar, os dois ficam conferidos.
- `nao_assinado`.
A assinatura RSA de cada documento (`agt.rs`) não se confere aqui: fica para o SAF-T.

**Dados pessoais.**
- O NIF e o nome do cliente chegam já cifrados pela Edge Function (AES-256-GCM, com a chave derivada de
  `KANGEST_DADOS_CHAVE`).
- O NIF leva também um índice cego (HMAC-SHA256) para se ligarem clientes sem os decifrar.
- O Consumidor Final (NIF vazio ou só noves) não guarda nada.

**Quem lê as cópias:** quem vê os relatórios de vendas (`private.can_read_sales_reports()`).

## 4. Rotas

| Rota | Quem | O quê |
|---|---|---|
| `GET /admin/kangest/postos` | `manage_settings` | Os postos, com os documentos recebidos e os elos partidos de cada um |
| `POST /admin/kangest/postos` | `manage_settings` | Cria um posto e devolve o código (uma vez) e o endereço |
| `POST /admin/kangest/postos/codigo` | `manage_settings` | Outro código: computador novo, chave perdida ou rodar a chave |
| `POST /admin/kangest/postos/revogar` | `manage_settings` | Revoga o posto |
| `POST /admin/kangest/sessoes/revogar` | `manage_settings` | `{posto, sessao}`: pede o fim de uma sessão aberta no KanGest (§14) |
| `GET /admin/kangest/postos/livro?id=` | `manage_settings` | Onde o livro de stock do posto não bate certo com a fotografia (§15) |
| `POST /kangest/emparelhar` | o código de uso único (10 por minuto e por IP) | `{codigo, chave_publica, versao}` → o posto e a chave pública do centro |
| `POST /kangest/sinc` | a assinatura Ed25519 do posto (240 por minuto e por IP) | O lote selado → a resposta selada |

## 5. O que difere do estudo

- **O posto não tem conta no Supabase Auth.** A assinatura Ed25519 de cada pedido chega para o identificar, e assim
  não há um JWT que se possa roubar.
- **Nesta primeira versão, o posto puxa por sondagem, sem tempo real.** Cada envio já traz a resposta do centro, e o
  tempo real fica para quando o KanGest tiver de receber encomendas por aqui.
- **A assinatura RSA de cada documento fica para o SAF-T**, como o estudo admitia nos riscos. Aqui confere-se a
  continuidade da cadeia.

## 6. Testes

- `supabase/functions/app/kangestSinc.test.ts`: os vectores partilhados com o Rust e o pedido selado e aberto.
  Recusa o envelope mexido, os outros cabeçalhos, outra chave, um kid desconhecido, uma assinatura de outro corpo e uma
  hora fora da janela. Cobre também os códigos, a cifra dos dados pessoais e a preparação do lote.
- `scripts/pglite/kangest-central.mjs` (46 cenários com as migrações reais): as permissões, o emparelhamento (código
  errado, fora de prazo ou usado), os nonces, o lote outra vez, a cadeia (certa, partida, fora de ordem), um documento
  estragado que não leva os outros, a anulação, as cópias que não mudam, quem as lê, e revogar e emparelhar outra vez.
- `access.test.ts`: as duas rotas com segredo.

## 7. As novidades para o posto (a Loja online no KanGest)

A fase 6 do estudo. Em cada sincronização, o posto pode mandar os seus cursores (`{"lote": […], "cursores": {…}}`). A
resposta selada traz então, além do resultado do lote, as `novidades` (`public.kangest_novidades`):
- **as encomendas da loja do posto**, só o que mudou desde o cursor. Levam o que a loja precisa para as preparar: o
  estado, o pagamento, a entrega, os totais, os artigos, o levantamento ou a morada, e o nome e o telefone do cliente;
- **o catálogo todo**, também os ocultos: o título, a referência, o preço e a promoção, o stock, se está à venda e a
  capa.

A paginação vai pela alteração `(updated, id)`, por isso nada se perde nem se repete, mesmo quando muitas linhas mudam
na mesma transacção. Uma encomenda ou um produto alterado volta a vir, com o estado novo. Há até 200 de cada por
pedido, e `mais` diz se ficou alguma coisa para trás.

A resposta traz também o endereço público do site (`site`, das definições ou o domínio principal). O KanGest usa-o para
abrir o painel do site no navegador dele.

O KanGest guarda isto numa cópia local, na base cifrada, e mostra-a em **Livraria → Loja online**, também sem Internet
(a última cópia). **Esta parte só lê.** As alterações (confirmar, preparar, publicar um produto) fazem-se no painel do
site, aberto no navegador do KanGest, com o login e o MFA de cada pessoa. O posto não guarda sessões de pessoas.

Testes: as novidades estão em `scripts/pglite/kangest-central.mjs`:
- a paginação sem perder nem repetir;
- só a loja do posto;
- a encomenda alterada volta a vir;
- o catálogo com os ocultos;
- o posto sem loja e o revogado;
- as permissões.

**As igrejas** (migração `20261126160000`): as novidades trazem também as igrejas do registo da Igreja (`igrejas`,
com o cursor e o `mais` delas), para a loja criar o cliente e facturar à igreja (Loja online → Igrejas). Seguem só o
que é preciso para facturar; os pastores, os telefones e as notas ficam no site.

## 8. As pessoas no KanGest com a conta do site

Para alterar encomendas a partir do KanGest (Livraria → Loja online), cada pessoa entra lá com a **sua** conta do site:
o email, a senha e o código MFA, se o tiver. As respostas do emparelhamento e da sincronização trazem o que o KanGest
precisa para isso: `auth: {url, apikey}`, o endereço do Supabase e a chave pública. Esta é a mesma que o site usa no
navegador, e não é segredo: sem a senha e o código de cada pessoa não serve para nada.

A chave vem de `KANGEST_CHAVE_PUBLICA_SITE` (o valor de `VITE_SUPABASE_PUBLISHABLE_KEY`), se o segredo existir; senão,
da chave anon do projecto, que a Edge Function já tem. Sem nenhuma das duas, `auth` vem vazio e o KanGest diz que não é
possível entrar.

Cada alteração vai com a sessão da pessoa, pelos mesmos caminhos do painel, com as permissões dela e os avisos ao
cliente:
- confirmar, pelo PostgREST e com a RLS;
- os passos da entrega, o «entregue» com o pagamento recebido e o cancelamento, por `POST /delivery-event`.

O site não sabe que vem do KanGest; fica registado em nome da pessoa.

## 9. Tempo real

Quando muda uma encomenda da loja de um posto (nova, paga, cancelada…), o gatilho `orders_kangest_realtime_signal`
manda um sinal pelo Realtime: o evento `novidades`, **sem dados**, no tópico público `kangest:<topico>`. O KanGest
desse posto ouve-o e vai logo buscar as novidades pelo canal assinado e cifrado (§7); a encomenda aparece em segundos,
em vez de até 2 minutos, com um aviso no computador da loja.

O tópico é um nome secreto ao acaso de cada posto (122 bits):
- nasce no emparelhamento e chega ao posto na resposta do emparelhamento e na resposta selada da sincronização
  (`tempo_real: {topico}`);
- muda a cada emparelhamento e apaga-se ao revogar.

Sem o tópico, ninguém sabe quando a loja tem encomendas, e mesmo com ele só se fica a saber que algo mudou. Sem o
serviço de tempo real, o sinal perde-se e o KanGest continua a perguntar de 2 em 2 minutos.

Testes (`scripts/pglite/kangest-central.mjs`):
- o tópico de cada posto;
- as encomendas gravam-se com o gatilho;
- novo código e revogar apagam o tópico;
- emparelhar outra vez dá um tópico novo.

## 10. O stock, os preços e os artigos novos (o catálogo)

Desde a migração `20261125140000`, o KanGest Livraria manda ao site, no mesmo lote dos documentos, o **estado** de cada
artigo que mudou. É o que a ligação antiga fazia com os avisos da API, agora pelo posto, sem túnel.
- **`stock`:** a existência, o reservado (NE por facturar) e o disponível de cada armazém.
- **`artigo`:** o nome, o tipo, o preço com IVA, se está activo e o código de barras.

O lado do KanGest está em `app/kangest-sistema/docs/SINCRONIZACAO.md` («Catálogo»).

**No centro** (`kangest_receber`), com a lógica que o site já tinha:
- o stock vai para `kangest_stock`, com a ligação `posto:<id>` e a loja do posto. Um armazém que deixou de vir sai;
- `kangest_recalcular_stock_lote` actualiza o produto e o «temos / não temos» de cada loja (`store_stock`);
- o artigo actualiza o preço (`stock_books.price`, de cêntimos para kwanzas) e, se o site não tem a referência, cria o
  produto **oculto** com `kangest_artigo_novo` (§4.1 de KANGEST.md). Só os artigos de venda (tipo P), activos e com
  nome.

**Dois interruptores em cada posto** (painel, Sistema → Ligação ao KanGest → Postos), os dois desligados por omissão,
para ligar as lojas uma a uma sem estragar o que o site tem:

| Interruptor | Ligado | Desligado |
|---|---|---|
| Conta para o stock à venda no site (`stock_online`) | O disponível deste KanGest soma-se ao stock à venda (`stock_books.stock`) | Só o «temos / não temos» da loja do posto |
| Manda no catálogo (`manda_catalogo`) | Os preços do site e os produtos novos vêm daqui. **Só um posto** | O artigo chega e é ignorado |

- Um posto **sem loja** e sem «stock à venda» não mexe no stock: o item conta como «ignorado», não como erro, e o
  KanGest não repete.
- O recálculo deixou de zerar o stock à venda de uma referência que nenhum armazém «online» mandou. Antes, a primeira
  loja ligada passava a ser o stock do site todo.
- **Revogar** um posto tira o stock dele do site, desliga os interruptores e recalcula os produtos.
- Rota: `POST /admin/kangest/postos/configurar` (`manage_settings`), com `{ id, stock_online?, manda_catalogo? }`.

Testes (`scripts/pglite/kangest-central.mjs`):
- o estado do armazém, sem dobrar;
- o armazém que sai e a loja a «não temos»;
- os postos que contam somam-se, e deixar de contar tira;
- o posto sem loja é ignorado;
- o preço e o produto novo oculto só do posto do catálogo, e um só posto do catálogo;
- os serviços e os inactivos não entram;
- o tipo desconhecido dá erro;
- o revogar e as permissões.

A limpeza do lote (`prepararLote`) está em `kangestSinc.test.ts`.

## 11. Os documentos das encomendas online pelo posto

Desde a migração `20261125150000`, o KanGest Livraria da loja pode emitir os documentos das encomendas online:
- a **NE** de cada encomenda (reserva o stock na loja);
- a **FR** quando o pagamento é confirmado no site;
- a **NC** dos reembolsos;
- a **anulação** das canceladas.

Reutiliza tudo o que a ligação antiga tinha:
- **a fila** (`kangest_fila`) e os gatilhos das encomendas;
- **a reserva** sem dobrar e o tratamento do cancelamento a meio;
- **os corpos dos documentos** (`corpoNE`, `corpoFR` e `corpoNC`, em `kangest.ts`);
- **as regras** dos erros e das tentativas;
- **o quadro do painel** «Documentos das encomendas para o KanGest», com os contadores, os erros e o «Repetir».

**A diferença é quem emite.** Em vez de a Edge Function chamar a API de cada KanGest por um túnel:
1. **A reserva** — na sincronização, `kangest_reservar_posto` reserva as linhas das encomendas da loja do posto, com o
   `posto_id` e «processando». Uma linha reservada há mais de 10 minutos volta a sair.
2. **As tarefas** — `tarefasDoPosto` monta o passo de cada linha (`passoDaFila`, o mesmo da ligação antiga) e manda-as
   na resposta selada: `tarefas: [{ id, accao, metodo, caminho, corpo, idem }]`. A FR espera pela NE.
3. **A emissão** — o KanGest emite-as pela **própria API**, por dentro (`api::chamar_interno`), com a chave interna «Loja
   online (ligação ao site)». São as mesmas validações, as mesmas permissões e a mesma `Idempotency-Key`
   (`ne-<número>`, `fr-<número>`…).
4. **O resultado** — segue no lote seguinte: `{ tipo: "tarefa", id, ok, documento }` ou `{ …, ok: false, erro, estado }`.
   `resultadosDoPosto` marca a linha feita (e recalcula o stock das referências da NE), ou com erro. Um 4xx do KanGest
   pede alguém, salvo o 408 e o 429, como na ligação antiga.

**Garantias:**
- **Repetir não dobra nada.** Uma tarefa que volte a sair depois de emitida, porque o resultado não chegou, dá o mesmo
  documento, pela chave de idempotência. O KanGest também guarda o resultado (`sinc_tarefas`) e manda-o outra vez em
  vez de emitir.
- **Só a loja do posto.** Só conta o resultado de uma linha que **este** posto tem reservada.
- **O pagamento confirma-se no site.** A FR só sai depois de o site dizer que está pago.

**No painel** (Sistema → Ligação ao KanGest → Postos), em cada posto com loja:
- «Emitir os documentos das encomendas online», desligado por omissão. **Só um posto por loja**, e um posto sem loja
  não emite;
- o artigo dos portes e o artigo genérico, os da ligação antiga;
- o modo de pagamento do KanGest por omissão: `pagamentos["*"]`, e sem ele TB.

Rota: `POST /admin/kangest/postos/configurar` com `{ emitir_encomendas?, artigo_portes?, artigo_generico?, modo_pagamento? }`.

**No KanGest** (Livraria → Ligação ao site → Encomendas online), escolhe-se:
- **em nome de quem** se emite, um utilizador com as permissões dos documentos (o KanGest recusa um que não as tenha);
- **o posto**, que dá a série e o armazém.

Sem isso, as tarefas voltam ao site com o erro «ainda não tem quem emita», e repetem-se depois de configurar.

**Testes:**
- `scripts/pglite/kangest-central.mjs`:
  - o interruptor e a fila só da loja do posto;
  - um emissor por loja e o posto sem loja;
  - a reserva sem dobrar e a volta ao fim de 10 minutos;
  - o cancelamento, o revogar e as permissões.
- `kangest.test.ts`:
  - as tarefas e a espera da FR;
  - o resultado da NE e o stock;
  - os erros 4xx e 5xx, e o resultado de outro posto.
- `cargo test` (`sinc_encomendas_pela_api_interna`):
  - sem quem emita;
  - a NE pela API, sem dobrar;
  - a FR a partir da NE e a anulação;
  - o pedido recusado e desligar.

## 12. O estado dos computadores no painel

Em cada volta, o KanGest manda também o **estado do computador** (`dados.estado`, dentro do envelope assinado e
cifrado; `app/kangest-sistema/src-tauri/src/sinc/estado.rs`). A Edge Function guarda-o em
`kangest_postos.estado_computador` (com a hora, `estado_em`), só com os campos de uma lista fechada
(`kangestSinc.ts`, `limparEstadoComputador`; migração `20261126150000`):

| Campo | O quê |
|---|---|
| `versao`, `sistema`, `nucleos`, `memoria` | o programa e o computador |
| `espaco_livre`, `base_bytes` | o espaço livre no disco dos dados e o tamanho da base |
| `ultima_copia`, `copia_externa_erro` | a última cópia de segurança e se a externa falhou |
| `modo` | `sozinho`, `servidor` (dos postos em rede) ou `cliente` |
| `fe_rejeitados`, `por_enviar` | os documentos rejeitados pela AGT e os que esperam para seguir para o site |
| `verificacao` | a última verificação da base: `ok`, `avisos` ou `graves` |
| `bandeja`, `acordado` | as opções do servidor sempre ligado |

**Nunca seguem** nomes, NIF, caminhos de pastas nem dados da loja: o KanGest não os põe, e o site deita fora tudo o que
não estiver na lista ou tiver o tipo errado.

Em **Configurações → KanGest → Postos**, cada posto mostra o seu computador, com o que precisa de atenção
(`app/web/src/lib/kangestComputadores.js`, `problemasDoComputador`):

- **graves, a vermelho:**
  - disco quase cheio (não cabe a próxima cópia: a base, mais um décimo, mais 200 MB);
  - verificação da base com problemas graves;
  - documentos rejeitados pela AGT;
  - sem contacto há mais de um dia;
- **avisos, a amarelo:**
  - sem cópia há mais de 2 dias, ou nenhuma;
  - cópia externa falhou;
  - verificação com avisos;
  - mais de 20 documentos por enviar;
  - sem contacto há mais de 30 minutos.

No topo da lista aparece quantos computadores precisam de atenção. Um posto com um KanGest anterior à 1.4.8 ainda não
manda o estado: o painel diz só isso.

## 13. O ERP financeiro central (os movimentos da tesouraria)

Cada movimento da tesouraria do KanGest segue para o site no mesmo lote assinado que os documentos e os fechos
(`app/kangest-sistema/src-tauri/src/sinc/financeiro.rs`; fila `sinc_financeiro`, migração 0068). Gatilhos enchem a fila
ao gravar um movimento e ao anulá-lo, só com o posto ligado. Ao ligar o posto, seguem também os dos últimos 400 dias.

No site fica **uma cópia que não se altera** (`public.kangest_movimentos`, migração `20261126170000`):

- um gatilho recusa qualquer alteração ou apagamento. A única coisa que muda é marcar como anulado, e isso não volta
  atrás;
- um movimento repetido não se grava em dobro;
- uma anulação que chegue depois só o marca.

**Sem dados pessoais:** a descrição livre e o cliente ou fornecedor do movimento ficam no KanGest. Seguem a conta, o
tipo (entrada ou saída), o valor, a data, o centro de custo e o número do documento.

No painel, em **Configurações → KanGest**, o quadro «Dinheiro das lojas» (`KanGestFinanceiro.jsx`,
`public.kangest_financeiro`) mostra, por período, as entradas, as saídas e o saldo, por loja e por centro de custo, sem
os anulados (que se contam à parte). Só o vê quem lê os pagamentos (`can_read_payments`), e o período tem no máximo 400
dias.

## 14. As sessões abertas em cada KanGest (KANGEST ONE, fase A3)

Em cada volta, o KanGest manda também **quem está dentro** (`dados.sessoes`, dentro do envelope assinado e cifrado;
`app/kangest-sistema/src-tauri/src/sinc/sessoes.rs`):
- a sessão deste computador e as dos postos e browsers em rede (num KanGest que é o servidor da loja);
- de cada uma: o nome, o login, o perfil, se é uma conta do site, se é o ADMIN local de recurso, o aparelho, o local,
  se entrou sem Internet e a hora de entrada.

**Nunca seguem tokens nem senhas.** Cada sessão vai com uma chave de 16 letras, tirada do aparelho, da pessoa e da
hora de entrada (uma entrada nova dá uma chave nova). O site ainda filtra por uma lista fechada de campos
(`kangestSinc.ts`, `limparSessoesKanGest`; no máximo 100).

Na base (`public.kangest_sessoes`, migração `20261126180000`; só o servidor lê e escreve):
- **`kangest_sessoes_receber`** grava as que vieram e dá por terminadas as que deixaram de vir (`terminou`, ou
  `revogada` se o painel o tinha pedido). Guarda um mês de histórico por posto. Um KanGest antigo, que não manda a
  lista, não mexe em nada.
- **Cada entrada do ADMIN de recurso** fica no registo de segurança (`private.audit_write`) e avisa os administradores
  do site (`staff_notifications`, tipo `security`). Avisa uma vez por entrada, não a cada volta.
- **`kangest_sessao_revogar`** marca o pedido de fim (quem pediu, no registo de segurança). A volta seguinte do posto
  traz a chave em `sessoes_revogar`. O KanGest termina a sessão (este computador ou o posto em rede volta ao ecrã de
  entrada, e a sessão do site dessa pessoa acaba) e regista-a em `acessos` (`SESSAO_REVOGADA`).

No painel, em **Configurações → KanGest → Postos**, cada posto mostra quem está dentro, com «Terminar»
(`KanGestPostos.jsx`, `SessoesDoPosto`):
- o ADMIN de recurso a vermelho;
- as contas locais a amarelo (têm de se ligar a uma conta do site);
- as sessões sem Internet;
- as terminadas nos últimos 7 dias.

Testes:
- `scripts/pglite/kangest-sessoes.mjs`: a volta, o registo e o aviso do ADMIN de recurso, o pedido de fim e o acesso
  recusado de fora;
- `kangestSinc.test.ts` (`limparSessoesKanGest`) e `KanGestPostos.test.jsx`;
- Rust: `sessoes_para_o_painel_do_site`.

## 15. O livro único de stock, em sombra (KANGEST ONE, fase B1)

O plano do KANGEST ONE pede um só livro de stock no Postgres central. A fase B1 põe-no a correr ao lado do que já
existe:
- cada entrada e saída de stock do KanGest passa a ter uma linha no livro central (`public.stock_movimentos`,
  migração `20261126190000`), com a chave de idempotência;
- o stock à venda no site **continua a sair das fotografias** de cada posto (`kangest_stock`, §10) até à fase B3,
  quando o livro bater certo no staging e na produção.

**No KanGest** (`app/kangest-sistema/src-tauri/src/sinc/livro.rs`, migração 0071):
- **A abertura.** Na primeira volta com o livro, ao ligar a outro posto e depois de desligar, a existência de cada
  artigo em cada armazém fica por enviar (`sinc_stock_abertura`), com uma época (`stock_livro.epoca`). Faz-se numa
  transacção que começa por escrever, e nenhum movimento se mete a meio.
- **Os movimentos.** Depois da abertura deste posto, cada linha nova de `movimentos_stock` entra na fila
  `sinc_stock_livro` (um gatilho). Segue só depois das aberturas todas, até 500 por volta.
- **O que segue de cada movimento:** o armazém, a referência, a quantidade com sinal, o número do documento e a hora.
  O tipo sai do documento:

  | Tipo | Quando |
  |---|---|
  | `venda` | a saída de uma venda |
  | `devolucao` | a entrada de uma nota de crédito |
  | `compra` | a entrada de uma compra |
  | `transferencia` | uma transferência de stock |
  | `ajuste` | os acertos, o inventário e as anulações |

  **Nunca seguem** o cliente, o custo nem a descrição.
- **A resposta** (`stock_livro`):
  - o que foi aceite sai da fila;
  - o recusado fica com o erro e tenta outra vez mais tarde;
  - um site ainda sem o livro faz tudo esperar meia hora.

**No site:**
- **`stock_livro_receber(posto, época, aberturas, movimentos)`** trata um posto de cada vez (`pg_advisory_xact_lock`).
  - A abertura grava a **diferença** para o livro: a existência toda na primeira vez, e só o que faltava ao voltar a
    ligar.
  - Um movimento repetido não conta outra vez, mas volta como aceite.
  - Um tipo desconhecido volta como erro.
- **O livro não se altera nem se apaga:** corrige-se com um movimento inverso. Só as ligações ao posto, à loja e ao
  produto ficam vazias quando o que apontam sai.
- **Quem lê e escreve:** lê quem gere o catálogo (`manage_catalog`), e só o servidor escreve.
- **`stock_livro_conferir(posto)`** mostra onde a soma do livro difere da fotografia do posto, por armazém e
  referência. `stock_livro_resumo()` dá, por posto, os movimentos, se já abriu e quantas diferenças há.

**O stock negativo** (migração `20261126240000`): uma venda sem Internet que deixe o livro de um posto abaixo de zero
entra assim mesmo, porque a venda foi real e a factura está assinada. Mas fica à vista para acerto:
- `stock_livro_resumo` conta os artigos com o livro abaixo de zero;
- `stock_livro_negativos(posto)` diz quais;
- o painel mostra-os a vermelho.

**No painel,** em Configurações → KanGest → Postos, cada posto mostra o seu livro (`LivroDoPosto`):
- «à espera da abertura»;
- «bate certo com o posto»;
- ou as diferenças, com «Ver».

**Testes:**
- `scripts/pglite/stock-livro.mjs`: a abertura, os movimentos, o repetido, a recusa, o não alterar, a conferência, o
  voltar a ligar e o acesso;
- `kangestSinc.test.ts` (`limparLivroStock`) e `KanGestPostos.test.jsx`;
- Rust: `livro_de_stock_para_o_site`.

### As encomendas do site no livro (fase B2)

Migração `20261126200000`, também em sombra. O site já regista no histórico de stock (`stock_movements`) a venda do
checkout e o cancelamento, com o número da encomenda. O livro recebe o mesmo, por gatilhos:

| No site | No livro |
|---|---|
| o checkout desconta o stock | uma `reserva` por linha, na loja da encomenda (depois de a encomenda estar gravada) |
| a encomenda é cancelada | `libertacao` das reservas dela que ainda estão por libertar |
| o posto emite a FR da encomenda (`kangest_fila`, «fr» feito, com o posto) | `libertacao`: a saída passa a ser a venda do posto, que chega pelo livro dele (B1) |

- **Cada reserva liberta-se uma vez só.** Depois de uma FR, a anulação chega pelo livro do posto, e o cancelamento no
  site não liberta outra vez.
- **Uma FR sem posto** (a ligação antiga ao KiGest) não liberta: essa venda não chega pelo livro.
- **As devoluções físicas** fazem-se no KanGest (a nota de crédito) e chegam pelo livro do posto. O reembolso do site só
  mexe no dinheiro.
- **Sem referência do KanGest,** o produto entra com `livro:<id>`.
- **As variantes** com stock próprio ainda não entram.
- **Nada disto impede uma encomenda nem um cancelamento:** um erro fica num aviso, e o livro fica por acertar.

O painel mostra as reservas do site por libertar das encomendas ainda em curso (`stock_livro_site_resumo`, `LivroDoSite`;
a migração `20261126230000` tira as entregues e as canceladas: numa encomenda que o site entrega sem posto, a reserva
fica no livro como a saída).

Testes:
- `scripts/pglite/stock-livro-site.mjs`: reservar, cancelar, a FR do posto, a FR sem posto, o resumo, e um erro no livro
  que não impede a encomenda;
- os cenários do checkout, do KanGest, dos pagamentos e das lojas continuam certos.

**A seguir:** a **B3**, o stock à venda a sair do livro, depois de ele bater certo no staging e numa cópia da produção.

## 16. A versão mínima do KanGest (KANGEST ONE, fase E)

**Quando o site a pede:** com o segredo `KANGEST_MIN_VERSION` na Edge Function (por exemplo `1.4.9`), cada volta da
sincronização leva-o em `kangest_min_version`. O KanGest guarda-o em `config` (`site.kangest_min_version`;
`sinc/versao.rs`). Sem o segredo, a versão mínima apaga-se, e o mesmo acontece ao desligar o posto.

**Um KanGest ligado e abaixo dela:**
- **cada sessão só consulta:** fica com «Ver relatórios» e «Atualizações» (`services/auth.rs`, `sessao_de`);
- **por cima de cada ecrã** aparece «Este KanGest precisa de ser actualizado», com o caminho para «Sobre o KanGest»;
- **no Centro de Integrações,** o cartão «Servidor central» fica em erro.
  - Com a versão cumprida, o cartão mostra a versão e o estado do livro de stock (a abertura, a fila e os recusados).

**No painel do site,** a saúde do ecossistema (`/api/v1/system/health`) marca em aviso os postos abaixo da versão mínima.

**No KanGest, o cartão «Servidor central»** do Centro de Integrações mostra também a saúde do site (a mesma rota),
pedida com a conta do site da pessoa (`integracoes.servidor`, `sinc/saude.rs`). Mostra a base, as contas, os ficheiros,
os emails, os postos em aviso e a última migração. Sem a conta do site nesta sessão, ou sem «Gerir configurações» no
site, diz porquê. Teste: `a_saude_do_servidor_central_no_kangest`.

Num KanGest isolado, a versão mínima não vale.

Testes:
- `abaixo_da_versao_minima_do_site` (Rust);
- `comparar_versoes` (Rust);
- `saude.test.ts` (`compararVersoes`).

## 17. As fotografias dos artigos para as capas do site (KANGEST ONE, integração total)

- **O pedido:** no campo `fotos` vai no máximo uma fotografia por volta: `{ artigo_id, referencia, versao, imagem }`, em
  que `imagem` é uma data URL. Vai só se o pedido inteiro ficar abaixo de 700 kB antes de cifrar (o limite do site é
  1 MB).
- **O site:**
  - `limparFotosKanGest` confere o tipo pelos primeiros bytes (JPEG, PNG ou WebP) e o tamanho (750 kB);
  - `capasDoKanGest` só aceita a fotografia do posto com `manda_catalogo`;
  - o produto encontra-se pela referência (`kigest_ref`);
  - o ficheiro vai para `media/stock_books/<id>/`, e o `cover_image` muda só se estiver vazio.
- **A resposta** (`fotos`): para cada fotografia, `{ artigo_id, estado, erro? }`, com o estado `posta`, `tem_capa`,
  `sem_produto`, `recusada` ou `erro`. O posto regista-a em `capas_enviadas` (migração 0074).
- **Um site sem este campo** não responde à fotografia: o posto conta como erro e espera cada vez mais.
- O pormenor está em [LOJA-ONLINE.md](../app/kangest-sistema/docs/LOJA-ONLINE.md) («As fotografias dos artigos para o
  site»).

## 18. Os dados dos livros nas fichas dos artigos (KANGEST ONE, integração total)

- **As novidades** (`kangest_novidades`, 20261127100000): cada produto leva também `autor`, `editora`, `idioma`, `ano` e
  `paginas`. Um campo vazio, e o ano ou as páginas a 0, seguem como `null`.
- **O posto** (`sinc/fichas.rs`), depois de aplicar uma volta com produtos:
  - completa os dados do livro que faltam na ficha do artigo com a mesma referência;
  - põe o ISBN como código de barras de um artigo sem nenhum, se o ISBN for válido e nenhum outro artigo o usar. Este
    código não volta ao site: a linha que o gatilho do catálogo criaria sai na mesma transacção.
- **O que veio fica em `fichas_do_site`** (migração 0075), campo a campo, e não volta. Nunca se substitui o que está na
  ficha.
- **A migração 0075 apaga o cursor dos produtos:** o catálogo vem todo uma vez, já com os dados novos.
- O pormenor está em [LOJA-ONLINE.md](../app/kangest-sistema/docs/LOJA-ONLINE.md) («Os dados dos livros do site nas
  fichas dos artigos»).

## 19. Os dados das fichas nos produtos do site (KANGEST ONE, integração total)

- **O pedido:** no campo `livros` vão até 50 livros por volta:
  `{ artigo_id, referencia, autor?, editora?, idioma?, ano?, paginas?, isbn? }`. Vão só os campos que a ficha tem e o
  produto do site (na cópia da Loja online) não.
- **O site:**
  - `limparLivrosKanGest` limpa os textos e confere os números e o ISBN-13;
  - um posto que não manda no catálogo é recusado;
  - `public.kangest_dados_dos_livros` (20261127110000) preenche só o que está vazio. O ISBN só entra se nenhum outro
    produto o tiver.
- **A resposta** (`livros`): para cada livro, `{ artigo_id, estado, erro? }`, com o estado `feito`, `sem_produto`,
  `recusado` ou `erro`. O posto regista-a em `livros_enviados` (migração 0076).
- **Um site sem este campo** não responde: o posto conta como erro e espera cada vez mais.
- O pormenor está em [LOJA-ONLINE.md](../app/kangest-sistema/docs/LOJA-ONLINE.md) («Os dados das fichas para os
  produtos do site»).
