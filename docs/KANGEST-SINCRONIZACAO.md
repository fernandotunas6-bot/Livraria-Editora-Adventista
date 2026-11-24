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
