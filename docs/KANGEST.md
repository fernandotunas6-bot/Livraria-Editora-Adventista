# O KanGest e o site

O **KanGest** é o programa de facturação das livrarias (o sucessor do KiGest). A ligação ao site substitui a
exportação manual do KiGest ([catalogo/KIGEST.md](catalogo/KIGEST.md)) e trabalha em três sentidos:

| Sentido | O quê | Como |
|---|---|---|
| KanGest → site | Stock e preços | O KanGest avisa (webhook assinado) quando muda o stock ou o artigo; de hora a hora o site traz o stock todo |
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
   `vendas.fatura_recibo` (FR), `documentos.anular`, `clientes`, `relatorios.ver` e `pos.alterar_preco` (o site cobra
   o preço dele, com as promoções).
4. Dois artigos de serviço: **portes** (ex.: referência `PORTES`) e, para as edições digitais e produtos que não
   existam no KanGest, um **genérico** (ex.: `DIGITAL`; a linha leva o título do produto).
5. **Avisos automáticos → Novo aviso**: endereço
   `https://<projecto>.supabase.co/functions/v1/app/webhooks/kangest?ligacao=<id>`, eventos `stock.alterado` e
   `artigo.alterado`. Guarde o segredo (`whsec_…`).

## 3. No site

**Os produtos ligam-se pela referência**: `stock_books.kigest_ref` é a referência do artigo no KanGest (a mesma do
KiGest: a migração do KiGest para o KanGest mantém as referências). Um produto sem ela não recebe stock nem preço,
e uma encomenda com ele fica com erro na fila, a não ser que a ligação tenha o artigo genérico.

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

O desconto das encomendas por reservar evita vender duas vezes o mesmo livro enquanto a NE não sai (a loja sem
Internet, por exemplo). No histórico de stock aparece com o motivo **KanGest**. O «temos / não temos» de cada loja
(`store_stock`) passa a vir do disponível do armazém dela. Produtos com tamanhos e variantes (`versions`) não são
tocados: o stock é de cada variante, e o KanGest não o tem.

## 5. Encomendas e documentos

| Na encomenda | Na fila | No KanGest |
|---|---|---|
| Criada | `ne` | NE com o preço com IVA cobrado no site, os portes numa linha, `referencia` = n.º da encomenda, no armazém da loja; `Idempotency-Key` `ne-<n.º>` |
| Paga (`payment_status` → `paid`) | `fr` | FR a partir da NE (as linhas e os preços vêm da NE), paga pelo total da NE no modo correspondente; `fr-<n.º>` |
| Cancelada antes de a NE sair | a NE fica `ignorado` | nada |
| Cancelada com a NE no KanGest | `anular` | NE anulada (a reserva desaparece) |
| Cancelada depois de facturada | `anular` fica com erro | a nota de crédito faz-se no KanGest |

O cliente com **NIF** (`orders.customer_nif`) fica identificado na factura (o KanGest procura-o ou cria-o); sem NIF, é
Consumidor Final. Os números e o QR da AGT ficam em `kangest_fila.resultado`; o painel lê-os com
`public.kangest_da_encomenda(id)`.

**Erros.** Um erro do pedido (artigo sem referência, stock insuficiente no KanGest, permissão da chave) fica
`erro` até alguém o resolver: `GET /admin/kangest` lista-os e `POST /admin/kangest/repetir {id}` volta a pô-lo na
fila. Sem ligação, limite de pedidos ou erro do KanGest: nova tentativa ao fim de 1, 2, 4, 8… minutos (até 6 horas),
12 vezes.

## 6. Rotas da Edge Function

| Rota | Quem | O quê |
|---|---|---|
| `POST /webhooks/kangest?ligacao=<id>` | o KanGest (assinatura HMAC com o segredo da ligação) | Avisos de stock e de artigos |
| `POST /cron/kangest` | o `pg_cron` (`x-kangest-token`) | Fila; de hora a hora, stock completo e vendas do ano |
| `GET /admin/kangest` | `manage_settings` | Ligações (sem chaves), fila e erros |
| `POST /admin/kangest/repetir` | `manage_settings` | Repetir um documento com erro |
| `POST /admin/kangest/sincronizar` | `manage_settings` | Correr já a fila, o stock e as vendas |

## 7. Testes

- `supabase/functions/app/kangest.test.ts` (vitest, com `npm test`): ligações, documentos, assinatura, stock, vendas
  e a fila com um KanGest falso.
- `scripts/pglite/kangest.mjs` (cenários com as migrações reais): fila pelos gatilhos, pagamento pelo caminho real,
  cancelamentos, stock à venda, «temos / não temos» e permissões.
