# Encomendas: produtos, passos, avisos e vigilância

Estado em 2026-11-05. Complementa [AUTENTICACAO_E_EMAILS.md](AUTENTICACAO_E_EMAILS.md).

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
