# O KanGest e o site

O **KanGest** é o programa de facturação das livrarias (o sucessor do KiGest). A ligação ao site substitui a
exportação manual do KiGest ([catalogo/KIGEST.md](catalogo/KIGEST.md)) e trabalha em três sentidos:

| Sentido | O quê | Como |
|---|---|---|
| KanGest → site | Stock, preços e artigos novos | O KanGest avisa (webhook assinado) quando muda o stock ou o artigo; de hora a hora o site traz o stock todo e os artigos que mudaram. Um artigo que o site não tem entra **oculto**, à espera de fotografia (§4.1) |
| Site → KanGest | Encomendas | Encomenda feita → **NE** (reserva o stock na loja); pagamento confirmado → **FR** a partir da NE; cancelada → a NE é anulada |
| KanGest → painel | Vendas ao balcão | Totais de cada loja e de cada mês (`kangest_vendas`), ao lado das vendas do site |

Os gatilhos da base só põem os documentos numa fila (`kangest_fila`); quem fala com o KanGest é a Edge Function, de
5 em 5 minutos, com novas tentativas. **Uma loja sem Internet nunca impede uma compra no site**: os documentos
saem quando ela voltar.

## 1. Lojas: um KanGest central ou um por loja

As duas formas funcionam, e podem misturar-se:

- **Servidor central** — um só KanGest para a empresa; cada livraria é um **armazém** (com os seus postos e séries).
  Uma ligação, com `lojas` a dizer o armazém de cada loja do site.
- **Um KanGest por loja** — cada livraria tem o seu computador servidor. Uma ligação por loja, cada uma com a sua
  loja em `lojas`. As encomendas sem loja vão para a ligação `padrao`.

A loja de uma encomenda é a de `orders.store_id` (a do levantamento, ou a que serve a província da entrega —
[LOJAS.md](LOJAS.md)). A NE reserva o stock no armazém dessa loja, e a FR sai desse mesmo stock.

## 2. No KanGest

1. **Sistema → API e Integrações**: ligar a API «só desta máquina» e publicá-la com HTTPS pelo túnel da Cloudflare
   (docs do KanGest: `API.md` §3). O endereço fica `https://<nome>/api/v1`.
2. Um utilizador e um posto próprios para o site (prefixo de série `W`: as vendas do site saem como `FR W2026/15`).
3. **Chave de acesso** com: `api.artigos`, `api.stock`, `api.documentos`, `vendas.proforma` (NE),
   `vendas.fatura_recibo` (FR), `vendas.nota_credito` (NC dos reembolsos), `documentos.anular`, `clientes`,
   `relatorios.ver` e `pos.alterar_preco` (o site cobra o preço dele, com as promoções).
4. Dois artigos de serviço: **portes** (ex.: referência `PORTES`) e, para as edições digitais e produtos que não
   existam no KanGest, um **genérico** (ex.: `DIGITAL`; a linha leva o título do produto).
5. **Avisos automáticos → Novo aviso**: endereço
   `https://<projecto>.supabase.co/functions/v1/app/webhooks/kangest?ligacao=<id>`, eventos `stock.alterado`,
   `artigo.alterado`, `documento.emitido` e `documento.anulado` (estes dois trazem as vendas do balcão ao vivo para o
   Painel de Gestão — [PAINEL-GESTAO.md](PAINEL-GESTAO.md)). Guarde o segredo (`whsec_…`).

## 3. No site

**Os produtos ligam-se pela referência**: `stock_books.kigest_ref` é a referência do artigo no KanGest (a mesma do
KiGest: a migração do KiGest para o KanGest mantém as referências). Um produto sem ela não recebe stock nem preço,
e uma encomenda com ele fica com erro na fila, a não ser que a ligação tenha o artigo genérico.

**Atalho:** o painel monta tudo isto — **Sistema → Ligação ao KanGest → Configurar a ligação** (§5.1) gera o JSON de
`KANGEST_LIGACOES`, o comando `supabase secrets set` e o token e o SQL do agendador; depois, **Testar ligação**.

Segredos da Edge Function (Supabase → Edge Functions → Secrets; nunca no repositório, que é público):

| Segredo | Valor |
|---|---|
| `KANGEST_LIGACOES` | JSON com as ligações (abaixo) |
| `KANGEST_CRON_TOKEN` | Um token comprido ao acaso, o mesmo do Vault |

```json
[{
  "id": "central",
  "url": "https://empresa.exemplo.ao/api/v1",
  "chave": "kg_…",
  "segredo": "whsec_…",
  "lojas": { "<physical_stores.id do Huambo>": 1, "<… do Lubango>": 2, "<… da Catumbela>": 3 },
  "armazens_online": [1],
  "padrao": true,
  "portes": "PORTES",
  "generico": "DIGITAL",
  "pagamentos": { "multicaixa_express": "MB", "transfer": "TB", "cash": "NU" },
  "precos": true
}]
```

- `armazens_online`: os armazéns cujo **disponível** (existência − reservado) se vende no site. Omitido = todos.
- `pagamentos`: `payment_method_code` (ou `payment_category`) do site → modo de pagamento do KanGest. Sem
  correspondência, `TB` (transferência).
- `precos: false` deixa os preços do site como estão (o KanGest só manda no stock).

E no **Vault** (como a fila de emails — [AUTENTICACAO_E_EMAILS.md](AUTENTICACAO_E_EMAILS.md)): `kangest_cron_url`
= `https://<projecto>.supabase.co/functions/v1/app/cron/kangest` e `kangest_cron_token` = o mesmo
`KANGEST_CRON_TOKEN`. O `pg_cron` chama-a de 5 em 5 minutos.

A ligação fica **activa** na primeira volta do agendador com `KANGEST_LIGACOES` preenchido
(`kangest_estado.activo`). As encomendas de antes não vão para a fila, a não ser que sejam pagas depois.

## 4. O stock à venda

Cada aviso guarda o stock de cada armazém em `kangest_stock`, e `public.kangest_recalcular_stock(referência)`
escreve em `stock_books.stock`:

```
stock à venda = Σ disponível dos armazéns online − encomendas do site que ainda não têm NE no KanGest
```

A sincronização de hora a hora recalcula em lotes de 500 referências (`kangest_recalcular_stock_lote`), num pedido
à base por lote em vez de um por livro.

O desconto das encomendas por reservar evita vender duas vezes o mesmo livro enquanto a NE não sai (a loja sem
Internet, por exemplo). No histórico de stock aparece com o motivo **KanGest**. O «temos / não temos» de cada loja
(`store_stock`) passa a vir do disponível do armazém dela. Produtos com tamanhos e variantes (`versions`) não são
tocados: o stock é de cada variante, e o KanGest não o tem.

## 4.1 Artigos novos: entram ocultos, à espera de fotografia

Um artigo que o site não conhece (nenhum produto com aquela `kigest_ref`) entra no catálogo **oculto**:
- leva o nome, o PVP com IVA, o código de barras (no ISBN) e o stock do KanGest;
- vai sem capa e sem descrição, como os 201 da importação do KiGest;
- **nunca se publica sozinho**: alguém revê o nome, põe a capa e a descrição e publica.

Chega pelo aviso `artigo.alterado`, que sai quando o artigo é criado ou mudado. Se esse aviso se perder, chega na
sincronização de hora a hora: `GET /artigos?alterado_desde=…`, a começar 10 minutos antes da volta anterior, com o
cursor em `kangest_estado` (`artigos:<ligação>`). A primeira volta lê o catálogo activo todo. A sincronização só
pergunta à base pelas referências que o site não tem e não mexe em preços.

**Ficam de fora:**
- os serviços (tipo `S`);
- os artigos desactivados;
- os artigos dos portes e genérico da ligação.

**Uma vez só.** Cada referência dá no máximo um rascunho (`private.kangest_referencias_vistas`): se alguém o apagar por
não o querer na loja, não volta. As **397 referências** que passaram por pessoas na importação de 12/11 (as ligadas,
as novas, as repetidas e as ambíguas que ficaram para o dono; [catalogo/KIGEST.md](catalogo/KIGEST.md)) entram já como
vistas, para o que foi decidido à mão não voltar.

**Parecidos.** Um rascunho com o nome (sem acentos, caixa nem pontuação) ou o código de barras de um produto do site
fica marcado (`stock_books.kangest_parecido_com`). Nada se liga sozinho, porque foi assim que os lenços de membro
apanharam o preço dos de líder.

**No painel:**
- **Produtos → Mostrar: Novos do KanGest, por rever** e o aviso no Início («N artigos novos do KanGest por rever»);
- cada rascunho leva a marca **Novo do KanGest**;
- os parecidos dizem «Parece «…»» e têm duas acções, só para quem gere o catálogo:
  - **É o mesmo**: a referência passa para o produto que o site já tinha, que passa a receber o stock e o preço do
    KanGest, e o rascunho é apagado. Não se faz se esse produto já tiver outra referência.
  - **É outro produto**: a marca sai e o rascunho fica, à espera de capa e descrição.

As funções são `public.kangest_artigo_novo` (só o servidor) e `public.kangest_rascunho_decidir` (`manage_catalog`).

## 5. Encomendas e documentos

| Na encomenda | Na fila | No KanGest |
|---|---|---|
| Criada | `ne` | NE com o preço com IVA cobrado no site, os portes numa linha, `referencia` = n.º da encomenda, no armazém da loja; `Idempotency-Key` `ne-<n.º>` |
| Paga (`payment_status` → `paid`) | `fr` | FR a partir da NE (as linhas e os preços vêm da NE), paga pelo total da NE no modo correspondente; `fr-<n.º>` |
| Cancelada antes de a NE sair | a NE fica `ignorado` | nada |
| Cancelada com a NE no KanGest | `anular` | NE anulada (a reserva desaparece) |
| Reembolsada (toda) depois de facturada | `nc` | **Nota de crédito** a partir da FR (as mesmas linhas, os preços da FR); `nc-<n.º>` |
| Cancelada depois de facturada | — | nada (o reembolso é que faz a nota de crédito) |

O cliente com **NIF** — pede-se no checkout, «NIF para a factura (opcional)», e fica em `orders.customer_nif` —
fica identificado na factura (o KanGest procura-o ou cria-o); sem NIF, é
Consumidor Final. Os números e o QR da AGT ficam em `kangest_fila.resultado`; o painel lê-os com
`public.kangest_da_encomenda(id)`.

**Erros.** Um erro do pedido (artigo sem referência, stock insuficiente no KanGest, permissão da chave) fica
`erro` até alguém o resolver: `GET /admin/kangest` lista-os e `POST /admin/kangest/repetir {id}` volta a pô-lo na
fila. Sem ligação, limite de pedidos ou erro do KanGest: nova tentativa ao fim de 1, 2, 4, 8… minutos (até 6 horas),
12 vezes.

**Nunca em dobro.** Cada documento é **reservado** antes de sair (`kangest_reservar`: passa a `processando` numa
transacção, saltando os que outro já reservou), por isso o agendador e o **Sincronizar já** a correr ao mesmo tempo
não emitem o mesmo documento duas vezes; a `Idempotency-Key` protege ainda a NE, a FR e a NC do lado do KanGest. Um
reservado há mais de 10 minutos (a função caiu a meio) volta a sair sozinho. A fila sai um documento de cada vez,
com um prazo de 90 segundos por volta: o que não couber fica para a volta seguinte. Se a encomenda for cancelada (ou
reembolsada) enquanto a NE (ou a FR) está a sair, a anulação (ou a NC) entra na fila assim que o documento chega ao
KanGest (gatilho `kangest_fila_concluida`). Uma NE em curso continua a descontar no stock do site.

**Onde se vê:** o cliente vê o número da factura (e da nota de crédito) e o **QR da AGT** na página de rastreio; a
equipa vê os documentos de cada encomenda (NE, FR, anulação, NC, com o estado e o erro) no painel das encomendas.
Um reembolso parcial não faz nota de crédito sozinho: faz-se no KanGest.

## 5.1 No painel: Sistema → Ligação ao KanGest

O estado da ligação (activa, última sincronização), o que falta configurar (segredos, agendador, avisos, livros
ligados pela referência, artigo dos portes), cada ligação com as suas lojas e o endereço do aviso para copiar, a fila
dos documentos (na fila, a sair agora, feitos, com erro) e os erros com **Repetir**; **Sincronizar já** corre a
fila, o stock e as vendas sem esperar pelo agendador.

**Testar ligação** confere tudo sem emitir nada e diz o que corrigir: chega a cada KanGest (e em quanto tempo), a
versão (1.3.0 ou mais recente), as permissões que faltam à chave, se os armazéns das lojas e dos `armazens_online`
existem, se os modos de `pagamentos` existem, se os artigos dos portes e genérico existem e estão activos, se há
segredo dos avisos, lojas activas do site sem armazém em nenhuma ligação, `KANGEST_CRON_TOKEN` e se o agendador
sincronizou nas últimas 2 horas.

**Configurar a ligação** é um assistente: por ligação, o identificador, o endereço (basta o domínio do túnel), a
chave, o segredo, o armazém de cada loja, os armazéns online e os artigos de serviço; os métodos de pagamento do site
com o modo do KanGest sugerido. Confere com as mesmas regras da Edge Function e dá o comando `supabase secrets set …`
(ou o JSON para colar em Secrets). Para o agendador, gera um token e dá o comando e o SQL do Vault (cria ou
actualiza `kangest_cron_url` e `kangest_cron_token`). A chave e o segredo ficam só no navegador: não vão para o
servidor nem ficam guardados.

## 5.2 Relatórios

Em **Relatórios → Todas as livrarias → Carregar vendas do sistema**, as vendas ao balcão do KanGest somam-se às do
site, loja a loja e mês a mês. O Painel de Gestão mostra-as ao vivo ([PAINEL-GESTAO.md](PAINEL-GESTAO.md)).

## 6. Rotas da Edge Function

| Rota | Quem | O quê |
|---|---|---|
| `POST /webhooks/kangest?ligacao=<id>` | o KanGest (assinatura HMAC com o segredo da ligação) | Avisos de stock e de artigos |
| `POST /cron/kangest` | o `pg_cron` (`x-kangest-token`) | Fila; de hora a hora, stock completo e vendas do ano |
| `GET /admin/kangest` | `manage_settings` | Ligações (sem chaves), fila e erros |
| `POST /admin/kangest/repetir` | `manage_settings` | Repetir um documento com erro |
| `POST /admin/kangest/sincronizar` | `manage_settings` | Correr já a fila, o stock e as vendas |
| `POST /admin/kangest/testar` | `manage_settings` | Conferir a configuração sem emitir nada (10 por minuto) |

## 7. Testes

- `supabase/functions/app/kangest.test.ts` (vitest, com `npm test`): ligações, documentos, assinatura, stock, vendas
  a fila com um KanGest falso (incluindo dois ciclos ao mesmo tempo) e o **Testar ligação**.
- `app/web/src/lib/kangestConfig.test.js`: o assistente da configuração (JSON, erros, comandos, SQL do Vault).
- `scripts/pglite/kangest-artigos.mjs`: os artigos novos (oculto, uma vez só, as referências de 12/11, os parecidos,
  o stock que já tinha chegado, as permissões, e o «é o mesmo» e o «é outro produto»).
- `scripts/pglite/kangest.mjs` (cenários com as migrações reais): fila pelos gatilhos, pagamento pelo caminho real,
  cancelamentos, stock à venda, «temos / não temos», permissões, a reserva da fila (sem dobrar, presos há 10
  minutos, cancelada ou reembolsada durante a emissão) e o recálculo em lote.
