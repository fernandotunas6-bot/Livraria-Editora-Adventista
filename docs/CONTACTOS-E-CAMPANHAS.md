# Contactos e campanhas

O CRM da loja: contactos, grupos, campanhas agendadas e o registo de envios. Vive no painel em
**Integrações → Contactos** e, para quem tem a permissão, no separador CRM do perfil.

## Modelo de dados

| Tabela | O que guarda |
|--------|--------------|
| `contacts` | pessoa, com `email`, `phone`, `source`, `external_id`, `tags`, `is_buyer` |
| `contact_groups` | grupo, com `member_ids` (ver abaixo) e `channels` |
| `contact_group_members` | **a fonte da verdade dos membros**: `(group_id, contact_id)` |
| `contact_campaigns` | campanha: `message_template`, `channel`, `frequency`, `next_send_at`, `group` |
| `contact_notifications` | um registo por tentativa de envio, com `status` e `whatsapp_url` |

### Porque existe a `contact_group_members`

Os membros viviam num `member_ids` jsonb dentro do grupo. Três problemas, e o primeiro era
silencioso:

1. **Sem integridade.** Apagar um contacto deixava o id dentro do array. O envio fazia
   `select ... in (member_ids)`, não encontrava esse contacto, e seguia sem dizer nada: o
   grupo mostrava 40 membros e a campanha saía para 37.
2. **Sem índice.** "Em que grupos está este contacto?" obrigava a ler todos os grupos.
3. **Escrita por substituição.** Acrescentar um membro reescrevia o array inteiro, por isso
   duas pessoas a trabalhar ao mesmo tempo perdiam o trabalho uma da outra.

O `member_ids` **continua a existir** e é actualizado por um trigger
(`private.sync_contact_group_member_ids`), para o painel e a Edge Function publicada não
quebrarem. Código novo lê a tabela; `groupMemberIds()` na Edge Function recua para o
`member_ids` quando a tabela ainda não existe, porque a função é publicada à parte das
migrações e há sempre uma janela em que a versão nova corre contra a base de dados antiga.

## Quem não recebe

A etiqueta `nao-contactar` no contacto, ou um cancelamento de subscrição por token. A
verificação é feita **no momento do envio** e não apenas em quem escolhe os destinatários: uma
lista montada antes do cancelamento voltaria a apanhar quem já tinha saído.

Confirmações, pagamentos, entregas e mensagens de conta saem sempre — são a prova de uma compra
e o acesso a uma conta. Só boas-vindas, progresso da encomenda e campanhas podem ser desligadas.

## Campanhas agendadas

`pg_cron` chama `POST /cron/contact-campaigns` de 15 em 15 minutos (migração
`20261103231000`). Quinze e não cinco: as frequências são diária, semanal e mensal.

Antes disto, o `next_send_at` era calculado e guardado mas **nada o disparava** — a rota
`/contacts/campaigns/run-due` exige sessão de staff e era chamada por um botão no painel. Uma
campanha "semanal" saía quando alguém se lembrava de abrir o separador.

### O agendador não agenda o que não entrega

Sem a API do WhatsApp Cloud, "enviar" não envia: produz um link `wa.me` e marca a notificação
como `manual`. Num botão isso faz sentido — há uma pessoa para clicar. Num agendador às três da
manhã, fabricaria links que ninguém vê, marcaria a campanha como enviada e avançaria a data.

Por isso:

- **Caminho agendado:** um canal que não entrega faz a campanha ser saltada **sem avançar o
  `next_send_at`**, com o motivo em `skipped`. Volta a ser tentada quando o canal ficar
  configurado.
- **Caminho do painel:** continua a produzir os links manuais, porque aí há quem os clique.
- **`both` com um só lado configurado:** sai pelo lado que entrega, e o outro é assinalado em
  `skipped` com `partial: true` — a campanha consta como enviada, e isso não pode esconder que
  metade dos destinatários não foi contactada por esse meio.

A decisão vive em `supabase/functions/app/campaigns.ts`, sem nada de Deno, com testes em
`campaigns.test.ts`. O que conta como "entrega":

| Canal | Entrega quando |
|-------|----------------|
| email | `order_email_enabled` ligado **e** fornecedor com credenciais (`smtp_host`, ou `sendgrid_api_key` se o fornecedor for sendgrid) |
| whatsapp | `getWhatsAppConfig()` devolve configuração (token e `phone_number_id` da Meta) |

Ligado sem fornecedor é o estado mais enganador, porque o painel mostra o interruptor verde.

### Pôr o agendador a funcionar

A migração cria a função e o agendamento, mas **não traz segredos**. Falta um, uma vez: no
Vault do Supabase, `contact_campaigns_url` com
`https://<ref>.supabase.co/functions/v1/app/cron/contact-campaigns`. O token é o mesmo da fila
de emails (`email_queue_token`), porque é a mesma fronteira de confiança: quem pode disparar o
agendador. Sem os dois, a função não faz nada e di-lo no registo — que é o estado normal logo
após o deploy.

### O que o painel mostra

O separador **Campanhas** mostra o estado do agendador numa frase, e distingue três situações
que de fora se parecem:

| Estado | O que significa |
|--------|-----------------|
| `pg_cron` indisponível | o projecto não tem a extensão; as campanhas só saem com o botão |
| instalado mas não activo | o trabalho existe e está desligado |
| **agendado sem segredos** | o `pg_cron` corre de 15 em 15 minutos, a função devolve logo, e **nada parece errado** — as campanhas é que nunca saem |
| activo | sai sozinho, com o horário à vista |

O terceiro é o que justifica mostrar isto: foi exactamente assim que o agendador dos emails
reportou sucesso durante meia hora sem enviar nada.

Cada campanha activa cujo canal não entrega diz-no na própria linha, separando "o agendador não
envia esta campanha" de "sai só por um dos canais". E depois de "Enviar pendentes", a lista do
que foi saltado fica à vista, com o motivo — não passa num toast.

A regra dos canais existe em dois módulos: `app/web/src/lib/campaignChannels.js` (vai no bundle)
e `supabase/functions/app/campaigns.ts` (corre no Deno e é quem envia).
`campaignChannels.test.js` importa os dois e confirma que não divergem em nenhuma combinação —
é a convenção que o projecto já usa para o `orderFields`. Sem isso, o painel podia dizer
"entrega" e o agendador saltar a campanha.

Diagnóstico por SQL: `select public.contact_campaigns_scheduler_status();` responde se o
`pg_cron` está disponível, se o trabalho está agendado e se os segredos existem. Aceita a
service role, porque é a Edge Function que a chama — e quem chega por lá já passou pela
verificação de permissão. Falhas aparecem em
`cron.job_run_details` — **não** são engolidas, que foi o erro que deixou o agendador dos emails
a reportar sucesso durante meia hora sem enviar nada.

## Importar contactos

Duas origens, diferentes no mecanismo:

- **`POST /contacts/import-sources`** — do que a loja já tem: encomendas (marca `is_buyer`) e
  newsletter. Corre no servidor, sem nada a configurar. O nome sugere mais do que faz: **não
  traz nada da Google.**
- **Google Contacts** — `listAllGoogleContacts()` em `app/web/src/lib/googleAuth.js`, pela
  People API, 100 por página e paginada até ao fim; descarta quem não tem nome, ou não tem nem
  email nem telefone. Os contactos vão depois para `POST /contacts/sync-batch`, que faz upsert
  por `external_id`.

  Corre **no browser** e exige o administrador com sessão Google aberta, por isso não é uma
  sincronização automática: é uma importação a pedido.

## Por fazer

- A importação da Google é sempre completa. Podia ser incremental (`syncToken` da People API) e
  dizer com clareza o que criou e o que actualizou.
- O `ContactsManager.jsx` tem mais de mil linhas e está em três sítios. Separá-lo por aba, sem
  mudar comportamento.
- O painel lê os membros pelo `member_ids`; passar a ler `contact_group_members` e retirar o
  trigger quando já não houver leitores antigos.
