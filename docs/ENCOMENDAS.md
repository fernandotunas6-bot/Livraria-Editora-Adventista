# Encomendas: produtos, passos, avisos e vigilância

Estado em 2026-11-05. Complementa [AUTENTICACAO_E_EMAILS.md](AUTENTICACAO_E_EMAILS.md).

**Publicado:** Edge Function `app` com tudo isto (06:31 UTC, a partir do ramo `claude/tender-archimedes-gq0s8m`, que contém o `main`); push ligado (`push_enabled`, chave pública em site_settings, `VAPID_PRIVATE_KEY` nos segredos da função); vigilância verificada em produção (3 alertas → 3 admins avisados). O site com as páginas novas está só em pré-visualização (`claude-tender-archimedes-gq0.livraria-editora-adventista-ben.pages.dev`) até ao merge no `main`.

## 1. Produtos

O catálogo (`stock_books`) deixou de ser só de livros. Cada produto tem um `product_type`, e o código (`book_code`) é gerado com o prefixo do tipo, com contagem própria (`private.product_code_counters`):

| Tipo | Prefixo | Campos de livro (autor, ISBN, páginas) | Tamanhos |
|---|---|---|---|
| Livro | `LIV-` (ou o de Configurações) | sim | — |
| Bíblia / Hinário | `BIB-` | sim | — |
| Lição / Revista | `REV-` | sim | — |
| Material de igreja / Papelaria | `MAT-` | não | — |
| Música / Multimédia | `MUS-` | não | — |
| T-shirt / Vestuário | `VES-` | não | sim |
| Uniforme escolar | `UNI-` | não | sim |
| Material didáctico | `DID-` | não | — |
| Desbravadores | `DBV-` | não | sim |

A lista existe em dois sítios que têm de andar juntos: `app/web/src/lib/productTypes.js` e a base de dados (`stock_books_product_type_check`, `public.product_code_prefix`).

**Tamanhos e variantes** ficam em `versions` (`[{label, format, price, sale_price, stock}]`). A encomenda guarda a variante escolhida (`variant`, `variant_label`), com o preço e o stock dela; cancelar devolve o stock à variante (`place_order`, `orders_before_update`).

**Pesquisa por código**, escrito de qualquer forma (`liv63`, `UNI-4`, `dbv 12`): na loja, no catálogo do admin e nas encomendas (encontra as encomendas que têm esse produto). Normalização em `normalizeProductCode` (JS) e `public.normalize_product_code` (SQL).

**Painel → Produtos:** separadores por tipo com contagem, "Adicionar" por tipo, etiqueta do tipo e número de tamanhos em cada linha, "Mudar tipo" nas acções em massa. Na loja, filtro "Tipo de produto" (`/shop?tipo=uniforme`).

### 1.1 Códigos de cliente e de funcionário

Três identificadores, todos fixos depois de atribuídos:

| Código | Quem recebe | Onde fica | Formato |
|---|---|---|---|
| `LIV-`, `UNI-`, … (produto) | cada produto | `stock_books.book_code` | 3 dígitos, prefixo do tipo |
| `CLI-` (cliente) | cada conta de cliente; cada pessoa que comprou só com email | `profiles.customer_code`, ou `private.guest_customer_codes` (sem conta) | 6 dígitos, ex.: `CLI-000001` |
| `FUN-` (funcionário) | cada administrador e gestor | `profiles.staff_code` | 3 dígitos, ex.: `FUN-001` |

- **Mesma pessoa, mesmo código.** Quem comprou sem conta e depois cria conta fica com o `CLI-` que já tinha: o trigger `profiles_codigos_pessoa` vai buscar o código ao mapeamento do email.
- **Equipa que também compra.** Um administrador com encomendas não tem `CLI-` no perfil; a listagem e as encomendas usam o código do email. Se deixar de ser equipa e passar a cliente, mantém esse código.
- **Encomendas.** `orders.customer_code` é preenchido pelo trigger `orders_codigo_cliente` a partir do email (na criação e quando o email muda). A encomenda, portanto, fica ligada ao cliente mesmo sem conta.
- **Contadores.** Partilham `private.product_code_counters` com os de produto (`CLI-`, `FUN-`); a atribuição é `private.codigo_seguinte`.
- **Pesquisa.** Em `/admin/users` a pesquisa aceita o código em qualquer grafia (`cli1`, `CLI-000001`, ` fun 3 `), via `public.normalize_person_code`. A listagem `admin_users_list` devolve `customer_code` e `staff_code`.
- **Privacidade.** Os clientes só vêem o próprio perfil (RLS de `profiles`); os códigos de outros clientes não são acessíveis pela API. `private.guest_customer_codes` tem RLS activo e sem políticas: só o service role e as funções da base de dados leem.
- **Migrações:** `20261106033302_codigos_cliente_funcionario` (esquema, triggers, pesquisa e dados existentes) e `20261106033425_codigo_cliente_tambem_na_equipa` (listagem).

### 1.2 Pagamento e envio

- **Pagar depois de encomendar** (transferência e Multicaixa Express, `type` `transfer`/`p2p`). O checkout já não pede a referência: a encomenda nasce com `payment_status = pending` e o stock reservado. O cliente paga com o número da encomenda no descritivo e indica a referência na página de sucesso ou no rastreio (`POST /order/payment-reference`, com número + email, ou número + telefone no levantamento sem email). A encomenda passa a `awaiting_confirmation`, a equipa recebe o aviso `payment_reported` e confirma no painel (`/admin/orders/payment-status`). Se o cliente já trouxer a referência no checkout, a encomenda nasce `awaiting_confirmation`.
- **Pagamento por envio**: `payment_methods.shipping_methods` (vazio = todos). "Pagar no Balcão" só no levantamento. O servidor recusa combinações que não servem.
- **Portes**: 0 é um valor válido nas definições (portes grátis, ou limiar 0 = sempre grátis). O expresso por configurar vale o dobro da entrega normal. Regra igual no servidor (`checkoutRules.settingNumber`, `place_order`) e no site (`lib/shipping.js`).
- **Canal de venda** só `web_purchase` ou `whatsapp`; outro valor conta como compra online.
- **Assinatura no checkout opcional**; na confirmação de entrega só PNG até 300 KB.
- **Cancelar por falta de pagamento** (Configurações → Regras da loja, `unpaid_cancel_days`; 0 = nunca, o valor por omissão). A vigilância de hora a hora cancela as encomendas de transferência/Multicaixa ainda pendentes, sem referência e não preparadas, mais velhas que o prazo. O stock volta pelo trigger, o cliente recebe "Encomenda cancelada" e a equipa um aviso. Quem já indicou a referência nunca é cancelado pelo relógio. Regra em `checkoutRules.unpaidOrdersToCancel`, com testes.
- **Painel → Pagamentos**: cada método tem "Disponível para" (entrega, expresso, levantamento); nenhum marcado = todos.
- Migração `20261106050000_pagamentos_por_envio`: aplica-se no merge, com a Edge Function e o site.

## 2. Passos e avisos ao cliente

`notifyOrderStep` (Edge Function) é o ponto único para cada passo: pagamento confirmado e cada estado da entrega (confirmada, a preparar, expedida/pronta para levantar, em trânsito, saiu para entrega, entregue, cancelada).

| Canal | Como | Condição |
|---|---|---|
| Email | `sendLetter`, com faixa de livros e sugestões | SMTP/SendGrid configurado e `order_email_enabled` |
| Aviso na conta | trigger `orders_notify_activity` (texto em português por passo) | encomenda com `customer_id` |
| WhatsApp | API Meta, uma vez por passo (`wa:order:<id>:<passo>`) | Integração WhatsApp activa e telefone na encomenda |
| Push | `web-push` para `push_subscriptions` do cliente | `push_enabled`, `vapid_public_key` e o segredo `VAPID_PRIVATE_KEY` |

Cancelar no painel passa pela API (`/delivery-event` com `cancelled`), para o cliente ser avisado.

**Agradecimento:** ao marcar "Entregue", fica na fila de emails uma nota de agradecimento para 24 h depois (`order:thanks:<id>`), com "Recebi tudo bem" e "Tive um problema". Os botões levam a `/confirmar-encomenda` com o segredo da encomenda (`receipt_token`); a resposta (`POST /order-feedback`) fica em `customer_feedback`, na linha do tempo, e avisa a equipa.

## 3. Vigilância

Regras em `supabase/functions/app/orderWatch.ts` (com testes):

| Passo | Alerta depois de | Crítico depois de |
|---|---|---|
| Por pagar | 48 h | 96 h |
| Paga, por preparar | 24 h | 48 h |
| Em preparação | 48 h | 96 h |
| Expedida / em trânsito | 72 h | 144 h |
| Pronta para levantamento | 7 dias | 14 dias |
| Saiu para entrega | 24 h | 48 h |
| Problema reportado pelo cliente | logo | logo (até "Marcar resolvido") |

- **pg_cron `vigilancia-encomendas`** (minuto 17 de cada hora) → `POST /cron/order-watch`: grava em `order_alerts`, avisa a equipa (`staff_notifications`) só de alertas novos ou que passaram a críticos, fecha os resolvidos.
- **pg_cron `resumo-diario-encomendas`** (06:29 UTC = 07:29 Luanda): o mesmo, mais um email de resumo a admins e gestores com "manage_orders" (uma vez por dia).
- **Painel → Vendas → Acompanhamento:** encomendas por passo, alertas por gravidade, "Verificar agora", "Enviar resumo" e "Marcar resolvido".

Os agendadores usam o endereço e o token do Vault da fila de emails (`email_queue_url`, `email_queue_token`). Enquanto a Edge Function publicada não tiver `/cron/order-watch`, a chamada responde 404 e não faz nada.

## 4. Migrações

`tipos_de_produto`, `variantes_nas_encomendas`, `confirmacao_do_cliente`, `avisos_de_encomenda_em_portugues`, `vigilancia_encomendas` (todas aplicadas em 2026-11-05).
