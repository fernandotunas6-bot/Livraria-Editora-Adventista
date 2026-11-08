# Pagamentos

Estado em 2026-11-07. Ramo `claude/pagamentos-premium`. Migrações `20261107200000_pagamentos_registados`, `20261107201000_tamanhos_e_comissoes`, `20261107201500_gateway_de_pagamentos` e `20261107202000_relatorio_de_pagamentos`. Complementa [ENCOMENDAS.md](ENCOMENDAS.md).

## 1. A regra

Um pagamento só fica confirmado de duas maneiras (regra do dono, 2026-11-07):

1. **Pelo gateway de pagamentos.** O gateway avisa a loja por webhook assinado, e o pagamento fica confirmado sem ninguém lhe tocar.
2. **Por um funcionário com a permissão «Confirmar pagamentos»**, que processa o pagamento do cliente: dinheiro ou TPA no balcão, dinheiro recebido na entrega, transferência vista no extracto.

O cliente nunca confirma. Numa transferência sem gateway, a referência que ele indica é só uma pista para a equipa: a encomenda fica «a aguardar confirmação» até alguém da equipa a confirmar no extracto. Num método com gateway, o site nem pede a referência.

Antes disto, o estado do pagamento (`orders.payment_status`) era um texto que qualquer pessoa com «Gerir encomendas» mudava com um clique, pela API ou directamente na tabela, sem valor, data, conta nem nome de quem confirmou. Em produção, a 2026-11-07, havia uma encomenda de 245 000 Kz entregue com o pagamento pendente, e nada o assinalava. Um relatório chamava «Receita» a 316 670 Kz, quando só 21 665 Kz estavam pagos.

## 2. O modelo

### Pagamentos e reembolsos: `public.order_payments`

Cada pagamento e cada reembolso é uma linha. Só se acrescentam linhas: uma decisão muda o estado da linha e nunca a apaga.

| Campo | O que é |
|---|---|
| `kind` | `payment` ou `refund` |
| `status` | `reported` (indicado, por verificar), `confirmed`, `rejected` (não se encontrou), `voided` (estava confirmado e foi anulado) |
| `amount` | valor em Kz, `numeric(14,2)` |
| `source` | `gateway` (webhook), `staff` (equipa), `customer` (o cliente indicou; a equipa confirmou), `migration` (encomendas anteriores) |
| `provider`, `transaction_id` | gateway e id da transacção dele; únicos juntos, por isso um reenvio do webhook não conta duas vezes |
| `reference` | referência do pagamento (transferência, talão do TPA, referência Multicaixa) |
| `received_at` | quando o dinheiro entrou (ou saiu, num reembolso) |
| `account`, `collected_by` | conta ou caixa onde entrou; quem recebeu o dinheiro em mão |
| `created_by`, `decided_by`, `decision_reason` | quem registou, quem decidiu e porquê |

As passagens permitidas são duas: `reported` → `confirmed` ou `rejected`, e `confirmed` → `voided`. Um gatilho recusa as outras, e também recusa apagar linhas ou mudar a encomenda, o tipo, o método, a referência ou a transacção. A escrita só passa pelas funções `order_payment_*`, que marcam a transacção (`app.payments_write`). A service role também não escreve directamente na tabela.

### Estado da encomenda, calculado

As encomendas ganham `amount_paid`, `amount_refunded` e `paid_at`, calculados a partir dos pagamentos confirmados. O `payment_status` passa a resultar deles (`private.order_payment_status`), por esta ordem:

| Condição | Estado |
|---|---|
| reembolsado ≥ pago, com algo pago | `refunded` |
| pago ≥ total | `paid` (um reembolso parcial não o tira daqui) |
| há um pagamento indicado por verificar | `awaiting_confirmation` |
| pago > 0 | `partially_paid` |
| a última decisão foi rejeitar | `failed` |
| nada | `pending` |

`paid_at` é a data em que entrou o dinheiro que completou o total. Se o total mudar depois de pago (por exemplo, com um artigo a mais), o estado é recalculado e a encomenda pode voltar a «pago em parte».

### O que deixou de ser possível

- **Escrever o pagamento à mão.** O gatilho `orders_0_pagamento` corre antes de todos os outros e recusa mudanças a `payment_status`, `amount_paid`, `amount_refunded`, `paid_at` e `payment_reference` que não venham do cálculo.
- **Mudar o total sozinho.** O total é sempre a soma dos artigos mais os portes; um total mudado à mão volta ao valor certo.
- **Gravar pelo painel o que não é seguimento.** O papel `authenticated` só pode actualizar `status`, `tracking_number`, `carrier`, `estimated_delivery` e `colporteur_code`. Pagamento, total, artigos, portes, entrega e stock devolvido mudam pela Edge Function ou pelas funções da base de dados.
- **Valores fora da lista.** `payment_status`, `status` e `delivery_status` só aceitam os valores conhecidos.

### Quem pode o quê

| Permissão | O que dá |
|---|---|
| Confirmar pagamentos (`confirm_payments`, nova) | confirmar, rejeitar e anular pagamentos, registar dinheiro recebido e reembolsos |
| Pagamentos (`manage_payments`) | métodos de pagamento (IBAN, links, QR, quem confirma cada método) |
| Gerir encomendas (`manage_orders`) | ver os pagamentos e os relatórios; marcar «Entregue» (o dinheiro que recebeu fica por confirmar na caixa) |

A permissão nova é separada de propósito: quem confirma dinheiro não muda para onde ele vai. Os gestores que já tinham «Gerir encomendas» ficaram com ela, para nada parar. Em produção, a 2026-11-07, não havia nenhum: só os administradores confirmam. O administrador tira-a a quem não deve confirmar.

## 3. Gateway (webhook)

```
POST https://bggqkjjqbjhbjsckzopj.supabase.co/functions/v1/app/webhooks/pagamentos
Content-Type: application/json
X-Signature: sha256=<HMAC-SHA256 em hex do corpo exacto, com o segredo partilhado>

{
  "transaction_id": "TX-123",          obrigatório, único por pagamento no gateway
  "order_number":   "ENC-ABC123",      a encomenda (o número que o cliente usou)
  "amount":         11500,             Kz; número ou texto ("11500.00", "11 500,00")
  "status":         "paid",            paid, completed, success… (os outros ficam registados e não mexem na encomenda)
  "paid_at":        "2026-11-07T20:41:00Z",  opcional
  "reference":      "MCX 123 456 789"  opcional: a referência do pagamento no gateway
}
```

- **Assinatura:** HMAC-SHA256 do corpo, exactamente como foi enviado, com o segredo `PAYMENT_WEBHOOK_SECRET`. Também se aceitam o hex sozinho (em maiúsculas ou minúsculas) e o mesmo valor em base64, no cabeçalho `X-Signature` ou `X-Webhook-Signature`.
- **Respostas:** `200 {ok, outcome}` quando a chamada foi tratada. Os resultados possíveis são `recorded`, `duplicate`, `orphan` e `ignored`; o gateway não deve repetir nenhum deles. As outras respostas são `401` (assinatura errada), `400` (falta `transaction_id`, `order_number` ou `amount`), `404` (o gateway ainda não está ligado) e `429` (demasiados pedidos).
- **Sem duplicados:** a mesma transacção outra vez devolve `duplicate` e não conta duas vezes.
- **Valor diferente do total:** grava o que entrou. A menos, a encomenda fica «pago em parte»; a mais, a vigilância assinala «pago a mais». A equipa é avisada em ambos os casos.
- **Sem encomenda:** fica como `orphan` no registo, e a equipa de pagamentos é avisada para conciliar à mão.
- **Registo:** cada chamada, também as recusadas, fica em `public.payment_gateway_events`, só de acrescentar. Aparece em Relatórios → Pagamentos e caixa.

### Ligar um gateway

1. Escolher o gateway (por exemplo ProxyPay, o GPO da EMIS ou a AppyPay) e pedir-lhe as credenciais e um segredo para os webhooks.
2. Guardar os segredos da Edge Function:
   `npx supabase secrets set PAYMENT_WEBHOOK_SECRET=… PAYMENT_GATEWAY_PROVIDER=proxypay --project-ref bggqkjjqbjhbjsckzopj`.
   Sem `PAYMENT_WEBHOOK_SECRET`, a rota responde 404 e ninguém consegue marcar pagamentos por ali.
3. No painel, em Vendas → Pagamentos, marcar cada método que o gateway confirma com «Quem confirma o pagamento → O gateway». O cartão no topo mostra o endereço a dar ao fornecedor.
4. Configurar no gateway o endereço do webhook.

Um gateway que mande os avisos noutro formato liga-se com um adaptador em `paymentWebhook.ts` (`parseGatewayEvent` já aceita os nomes mais comuns: `id`, `merchant_reference`, `state`…) ou com um intermediário que produza este JSON.

Hoje nenhum gateway está ligado. O Multicaixa Express em produção tem um link fixo de demonstração (`pay.kursinha.com/…`, ver a secção 9), que não avisa a loja de nada.

### Experimentar

```sh
SEGREDO='…'
CORPO='{"transaction_id":"TESTE-1","order_number":"ENC-XXXX","amount":1000,"status":"paid"}'
ASSINATURA="sha256=$(printf '%s' "$CORPO" | openssl dgst -sha256 -hmac "$SEGREDO" -hex | sed 's/^.* //')"
curl -s -X POST "https://bggqkjjqbjhbjsckzopj.supabase.co/functions/v1/app/webhooks/pagamentos" \
  -H "Content-Type: application/json" -H "X-Signature: $ASSINATURA" -d "$CORPO"
```

## 4. No painel

- **Cada encomenda** tem o painel «Pagamento»: total, recebido, em falta e reembolsado, cada pagamento com a origem e com quem o confirmou, e as referências repetidas noutras encomendas. Quem tem «Confirmar pagamentos» pode:
  - **Confirmar** um pagamento indicado, com o valor que entrou, a data e a conta;
  - **Rejeitar**, com um motivo que vai para o cliente;
  - **Anular** um pagamento confirmado por engano, o que avisa os administradores;
  - **Registar pagamento** já verificado (balcão, entrega, extracto);
  - **Registar reembolso**, no máximo o que ficou pago.

  Uma referência que já confirmou outra encomenda pede que se confirme no extracto que a mesma transferência pagou as duas.
- **Marcar «Entregue»** uma encomenda com dinheiro por receber pergunta quanto se recebeu e quem recebeu. Com «Confirmar pagamentos», fica confirmado; sem ela, fica por confirmar na caixa. Também se pode entregar sem pagamento, com um motivo que vai para o registo de segurança e avisa os administradores. O servidor recusa entregar sem uma das duas coisas.
- **Relatórios → Pagamentos e caixa:**
  - recebido no período, automático (gateway) e manual;
  - por dia, por método e por canal (site, WhatsApp, colportor);
  - por receber, por antiguidade;
  - a fila «Por verificar», para decidir ali mesmo;
  - entregues sem pagamento e pagas e canceladas por reembolsar;
  - a colportagem (recebido dos colportores, pago a eles, comissões);
  - as últimas chamadas do gateway;
  - a exportação dos movimentos para a contabilidade.
- **Vendas → Pagamentos:** em cada método, quem o confirma (a equipa ou o gateway) e o estado do gateway.
- **Configurações:** nome legal e NIF da empresa (no recibo), e «Encomendas por pagar ao mesmo tempo, por cliente» (3 por omissão; 0 = sem limite).

### Vigilância e resumo diário

| Alerta | Quando | Crítico |
|---|---|---|
| Entregue sem pagamento registado | logo | 48 h depois da entrega |
| Paga e cancelada: falta reembolsar | logo | 72 h |
| Pago a mais: falta devolver a diferença | logo | — |
| Pagamento indicado por verificar | 12 h | 24 h |
| Pagamento por confirmar (sem nada indicado) | 48 h | 96 h |

Todos vão para a função «Pagamentos» das equipas. O resumo diário passa a dizer quanto entrou ontem, quanto falta receber e o que espera pela equipa.

O cancelamento automático por falta de pagamento (Configurações → Regras da loja) passa a contar também os pagamentos rejeitados (desde a rejeição). Nunca cancela uma encomenda já paga em parte.

## 5. O cliente

- **Rastreio e página de sucesso** mostram quanto falta (pago em parte), a referência indicada e, se a equipa não a encontrou, o motivo e o pedido de outra. Num método com gateway não pedem a referência: dizem que a confirmação é automática.
- **Avisos** (na conta, por email, WhatsApp e push):
  - pagamento confirmado;
  - recebido em parte, com quanto entrou e quanto falta;
  - não encontrado, com o motivo;
  - reembolso, total ou parcial.
- **Recibo:** só se chama «Recibo» com o pagamento confirmado. Antes disso é «Nota de encomenda: não é recibo nem factura», com o pago e o que falta, e leva o nome legal e o NIF quando estão nas configurações.
- **Página de sucesso:** antes de pagar, a notificação diz «Encomenda registada — falta o pagamento», em vez de «Encomenda confirmada!».
- **Encomendas por pagar ao mesmo tempo:** o stock é reservado ao encomendar. Por isso o checkout recusa mais encomendas por pagar do mesmo telefone ou email acima do limite.

## 6. Uma só definição de dinheiro

| Nome | O que é | Onde |
|---|---|---|
| Recebido (a receita) | pago menos reembolsado, pela data em que o dinheiro entrou | painel, Relatórios de Vendas, exportação, Pagamentos e caixa, resumo diário |
| Vendido | total das encomendas activas; **não é receita** | Relatórios de Vendas, Pagamentos e caixa |
| Por receber | o que falta pagar das encomendas activas | idem |
| Por reembolsar | pagas (no todo ou em parte) e canceladas | idem |

O painel de vendas por loja (Huambo) conta as vendas pagas pelo mês em que o dinheiro entrou (`paid_at`), pelo pago menos o reembolsado, sem portes. A regra está em `app/web/src/lib/payments.js` (`moneySummary`) e em `supabase/functions/app/payments.ts`; o `payments.test.js` confirma que dizem o mesmo.

## 7. Colportagem e tamanhos

- **Comissão das vendas no site, acertada pela diferença.** A encomenda deve a comissão inteira se estiver paga, entregue e não cancelada, e zero em qualquer outro caso; entra só a diferença para o que já está na conta corrente. Antes, um pagamento que voltava de «pago» a «pendente» deixava a comissão, e uma encomenda reembolsada e paga outra vez nunca voltava a dar comissão.
- **Tamanho (ou edição) sem preço próprio é o produto, com a promoção do produto**, no site e no `place_order`. O painel gravava `price: ''`, que a loja mostrava como 0 Kz enquanto o servidor cobrava outro valor. Agora grava números, ou `null` quando o campo fica por preencher.

## 8. Migração das encomendas que já existiam

As encomendas pagas ou reembolsadas ganham um pagamento confirmado pelo total, na data do passo «paid» da linha do tempo; as reembolsadas, também o reembolso. As que aguardavam confirmação ganham o pagamento indicado, e as falhadas com referência, o indicado rejeitado. O estado calculado é igual ao que estava, por isso ninguém é avisado. A encomenda de 245 000 Kz entregue por pagar continua por pagar, e a vigilância passa a assinalá-la.

## 9. Por decidir (dono)

1. **Que gateway usar,** e as credenciais (secção 3). Até lá, os pagamentos confirmam-se só pela equipa.
2. **O link do Multicaixa Express** (`https://pay.kursinha.com/c/6ae5ab5718cca2df1c3e8f94`, da migração `20261101205308`, «a retirar depois»). Está activo em produção e é o único caminho de pagamento desse método. Se a conta não for da Livraria, apagar o link em Vendas → Pagamentos.
3. **A encomenda de 245 000 Kz** («Pagar no Balcão», entregue com o pagamento pendente): registar o pagamento, se entrou, ou investigar.
4. **Prazo de cancelamento por falta de pagamento** (hoje 0 = nunca).
5. **Quem fica com «Confirmar pagamentos».**
6. **Nome legal e NIF** nas configurações. Sobre facturação com software certificado pela AGT, confirmar com o contabilista: o recibo do site não é uma factura.

## 10. Testes

- **PGlite** (Postgres em WASM, sem Docker), com todas as migrações reais: 91 cenários em `scripts/pglite/pagamentos.mjs`. Cobrem o cliente a indicar, confirmações parciais e totais, referência repetida, rejeição, reembolso, anulação, escrita directa recusada, comissões, tamanhos, relatório, gateway e as encomendas antigas.
  ```sh
  npm i --prefix /tmp/pglite @electric-sql/pglite@0.2.17
  PGLITE_MODULE=/tmp/pglite/node_modules/@electric-sql/pglite/dist/index.js node scripts/pglite/pagamentos.mjs supabase/migrations
  ```
  Com o mesmo módulo: `scripts/pglite/entregas.mjs` (44, entregas por colportor), `scripts/pglite/conta.mjs` (35, cancelamento pelo cliente e avisos "assumir") e `scripts/pglite/versoes.mjs` (39, versões da app e o aviso por push a todos os aparelhos).
- **vitest:**
  - `payments.test.ts`, `paymentWebhook.test.ts`, `orderWatch.test.ts`, `checkoutRules.test.ts` e `emails.test.ts` (Edge Function);
  - `payments.test.js`, `pricing.test.js` e `receipt.test.js` (site).
- **`deno check`** da Edge Function, no CI.
