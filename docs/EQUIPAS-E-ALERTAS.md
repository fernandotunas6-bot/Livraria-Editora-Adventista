# Equipas, alertas e prazos

Como a loja garante que cada encomenda e cada pedido de ajuda tem alguém responsável, e o que
acontece quando ninguém responde. Complementa [ATENDIMENTO.md](ATENDIMENTO.md) e
[ENCOMENDAS.md](ENCOMENDAS.md).

## Configurar (painel → Vendas → Equipas e alertas)

Só quem tem a permissão **gerir utilizadores** altera; quem gere encomendas vê.

1. **Equipas.** Cada equipa tem funções, membros e, opcionalmente, uma loja física:

   | Função | Recebe |
   |---|---|
   | Receber encomendas novas | cada encomenda nova (tem de a **assumir**) |
   | Pagamentos | pagamentos por confirmar há mais de 48 h |
   | Preparação | pagas e paradas, ou em preparação há demasiado tempo |
   | Levantamentos na loja | prontas e não levantadas há 7 dias |
   | Entregas | em trânsito ou a sair para entrega há demasiado tempo; **prazo prometido ultrapassado** |
   | Atendimento | pedidos de ajuda (chat e formulário) e problemas dos clientes |
   | Urgências | o que é crítico ou que ninguém assumiu a tempo |

   Uma encomenda com **levantamento numa loja** vai para a equipa dessa loja. As restantes
   (entregas, lojas sem equipa própria) vão para as equipas **centrais** (sem loja).
2. **Responsáveis (★).** Recebem as escaladas da sua equipa, juntamente com a equipa de urgências.
3. **Tempo para assumir** (minutos de horário, por equipa; 30 por omissão).
4. **Canais:** painel (sempre), push, email e WhatsApp. Para o WhatsApp, cada membro precisa do
   telefone no perfil.
5. **Horário de funcionamento** (hora de Luanda; por omissão, segunda a sábado das 08h às 18h).
   O chat do site mostra-o aos clientes: "A equipa está disponível" ou "Volta amanhã às 08h".
6. **Testar**, em cada equipa: envia um aviso de teste a todos os membros e diz por que canais chegou.

A tabela **Quem recebe o quê** mostra, com a configuração actual, quem é avisado de cada assunto
em cada loja e a quem sobe uma escalada. Sem equipas, tudo continua como antes: os avisos vão
para quem gere encomendas e as escaladas para os administradores.

## O que acontece quando chega uma encomenda

1. A base de dados avisa no painel a equipa que recebe encomendas (a da loja, nos levantamentos).
2. A Edge Function envia logo push, WhatsApp e email a essas pessoas, conforme a equipa.
3. Quem tem o painel aberto vê uma **barra no topo com som** (depois de carregar em "Activar
   som e notificações" uma vez por aparelho) e o botão **Assumir**.
4. Quem assume fica registado; o aviso desaparece para os outros. Mudar o pagamento ou o estado
   da encomenda também conta como assumir.
5. Se ninguém assumir dentro do tempo da equipa (só conta o horário de funcionamento), a
   encomenda passa a **crítica** e sobe aos responsáveis e às urgências, por todos os canais,
   mesmo fora de horas.

## Alertas da vigilância (de 10 em 10 minutos)

- Encomendas paradas num passo (regras em `orderWatch.ts`); o dobro do limite é crítico.
- **Entrega fora do prazo prometido**: a data prevista indicada pela equipa ou, sem ela, a
  política de envios — Luanda 7 dias úteis, outras províncias 14, expressa 48 h —, a contar da
  confirmação do pagamento ou do primeiro passo de preparação. Crítica 2 dias depois do prazo.
- Problemas reportados pelos clientes (vão para o Atendimento).

Cada alerta vai para a equipa da função. No Acompanhamento, **Estou a tratar** regista quem pegou
no alerta e pára a escalada. Um alerta crítico que ninguém assumiu dentro do tempo da equipa sobe
uma vez aos responsáveis e às urgências.

## Pedidos de ajuda: prazos (SLA)

| Prioridade | Primeira resposta | Resolução |
|---|---|---|
| Urgente | 1 h | 8 h |
| Alta | 4 h | 24 h |
| Normal | 24 h | 72 h |
| Baixa | 48 h | 7 dias |

Os prazos contam desde que a conversa passou a pedido (ou desde a reabertura). A primeira
resposta em atraso avisa o responsável do pedido, ou a equipa de atendimento se não houver; a
resolução em atraso sobe aos responsáveis e às urgências. No Atendimento, os pedidos em atraso
aparecem com **Fora do prazo**. Mudar a prioridade recalcula os prazos.

## Segurança

- Equipas e horário: só quem gere utilizadores altera (regras de acesso na base de dados); só
  administradores e gestores podem ser membros.
- Quem recebe cada aviso é decidido na base de dados (`ops_recipients`), que o site não pode
  chamar. Só contam pessoas que ainda são da equipa e podem ver encomendas.
- Assumir encomendas e alertas: só quem gere encomendas. A linha do tempo que o cliente vê no
  rastreio diz "Recebida pela equipa", sem o nome de quem assumiu.
- Pedidos de ajuda: registo de cada mudança de estado, responsável, prioridade, categoria e
  equipa (`support_ticket_events`, só a equipa lê). No máximo 5 pedidos em aberto por cliente.
- O agendador dos avisos (de 2 em 2 minutos) só chama a Edge Function quando há algo para enviar
  agora: com a loja fechada, só se houver um aviso crítico ou uma resposta a um cliente.
- As rotas do agendador (`/cron/order-watch`, `/cron/staff-dispatch`) exigem o token da fila;
  cada canal tem chave de idempotência (não repete mensagens).

## Limites a conhecer

- **Email:** sem SMTP configurado, os emails não saem (ver
  [AUTENTICACAO_E_EMAILS.md](AUTENTICACAO_E_EMAILS.md)).
- **WhatsApp:** a Meta só entrega texto livre até 24 h depois da última mensagem da pessoa. Para
  os avisos chegarem sempre, aprove um template «Utility» com duas variáveis (título e detalhe)
  e escreva o nome em Integrações → WhatsApp → "Template dos avisos à equipa".
- **Push:** precisa de "push" activo nas Configurações (chaves VAPID) e de cada pessoa aceitar
  as notificações no seu aparelho.
- O canal que funciona sempre é o **painel com som**: o computador ou tablet da loja deve ficar
  com o painel aberto no horário de funcionamento.

## Ficheiros

- Migração: `supabase/migrations/20261107020000_equipas_alertas_e_prazos.sql`
- Regras puras: `supabase/functions/app/opsRouting.ts` (horário, prazos, canais) e `orderWatch.ts`
- Envio e vigilância: `runOrderWatch` e `dispatchStaffNotifications` em `supabase/functions/app/index.ts`;
  rotas `/admin/ops/routing` e `/admin/ops/test`
- Painel: `admin/OpsTeamsPanel.jsx`, `admin/StaffAlertBar.jsx`, `admin/OrderWatchPanel.jsx`, `lib/opsApi.js`
