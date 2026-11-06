# Atendimento: assistente, equipa e pedidos de ajuda

Como funciona o chat do site, do lado do cliente e do lado da equipa. O modelo é o dos sistemas
de atendimento de referência (Intercom Fin, Zendesk): o assistente responde primeiro, e quando o
cliente precisa de uma pessoa **a mesma conversa** passa à equipa, com tudo o que já foi dito.

## Ciclo de uma conversa

| Estado | Quem responde | Na fila da equipa? |
|---|---|---|
| **Com o assistente** (`bot`) | o assistente | não (filtro "Com o assistente (agora)") |
| **Aberta** (`open`) | a equipa: o cliente está à espera | sim |
| **A aguardar cliente** (`pending`) | o cliente: a equipa respondeu | sim |
| **Resolvida** (`closed`) | ninguém; uma mensagem nova começa outra conversa | filtro "Resolvidas" |

- A conversa passa a **pedido de ajuda numerado** (#1001, #1002…) quando o cliente pede a equipa,
  quando alguém da equipa responde a uma conversa do assistente, ou quando o cliente usa o
  formulário "Nova conversa".
- Uma mensagem do cliente num pedido põe-no em **Aberta**; uma resposta da equipa põe-no em
  **A aguardar cliente**.
- Os pedidos **não fecham sozinhos**: fecha-os quem atende. Depois de resolvido, o cliente pode
  avaliar o atendimento (1 a 5 estrelas, uma vez).

## Quando o assistente oferece a equipa

Oferece sempre que:
- o cliente pede uma pessoa;
- mostra insatisfação (palavras fortes, maiúsculas, "!!!");
- repete a pergunta;
- o assistente não percebeu duas vezes seguidas;
- o cliente marca uma resposta como "não ajudou";
- o assunto precisa de uma pessoa: devoluções, reembolsos, cancelamentos e alterações,
  problemas de pagamento, faturas com NIF, livros esgotados.

O cliente confirma antes de passar (pode escolher a encomenda e acrescentar detalhes). Quem não
tem conta é convidado a entrar: a conversa fica guardada e passa para a conta. Também lhe é
mostrado o WhatsApp das Configurações.

## O que a equipa recebe

No painel → Atendimento, cada pedido traz:
- o número, a categoria (Encomenda, Pagamento, Entrega, Devolução, Livros, Conta, Outro) e a
  prioridade (alta quando há insatisfação, problema de pagamento ou livro danificado), que a
  equipa pode corrigir;
- o **resumo da passagem**: motivo, assunto, encomenda (estado e pagamento) e o que o cliente
  escreveu;
- a conversa inteira, incluindo as respostas do assistente;
- **notas internas** (separador "Nota interna"), que o cliente nunca vê.

Responder a uma conversa que ainda está com o assistente é assumi-la: fica atribuída a quem
respondeu e o assistente deixa de responder. Com responsável, só ele é avisado das mensagens
novas; sem responsável, é avisada a equipa de atendimento (ou, sem equipas configuradas, toda a
equipa com a permissão "gerir encomendas"). Prazos de resposta, equipas e escaladas estão em
[EQUIPAS-E-ALERTAS.md](EQUIPAS-E-ALERTAS.md).

## O que o assistente sabe (e não sabe)

- **Loja:** as perguntas frequentes e a política de envios e devoluções (texto em
  `supabase/functions/app/chatKnowledge.ts`, igual ao do site; um teste falha se divergirem),
  os portes e o envio grátis das Configurações, os métodos de pagamento activos e as lojas
  activas.
- **Cliente com sessão:** as suas últimas 5 encomendas (estado, pagamento, rastreio, previsão).
- **Visitante:** uma encomenda só com o número **e** o email da compra, com o mesmo limite de
  tentativas do rastreio.
- **Livros:** pesquisa no catálogo por título, autor ou tema.
- Não cancela, não altera, não reembolsa nem confirma pagamentos: explica e oferece a equipa.

Com uma chave de IA (Gemini ou DeepSeek) nas Configurações, as respostas são escritas pela IA
com a mesma informação, e a resposta é filtrada antes de chegar ao cliente: nada de ligações
externas, só livros do catálogo e as regras de passagem à equipa aplicam-se sempre. Sem chave
(ou se a IA falhar ou demorar mais de 15 s), responde o motor próprio do assistente
(`chatEngine.ts`).

## Dados guardados

- As conversas ficam em `support_threads` / `support_messages` (canal `assistant`).
- Visitantes: um código aleatório guardado no browser; na base de dados só fica o hash.
- Todos os dias às 03:41 (UTC): as conversas só com o assistente paradas há 7 dias são fechadas,
  e as de visitantes sem pedido com mais de 90 dias são apagadas.
- Com IA activa, a pergunta, o nome próprio e as encomendas do cliente seguem para o fornecedor
  de IA escolhido. A política de privacidade deve dizê-lo.

## Ficheiros

- Migração: `supabase/migrations/20261106090000_assistente_conversas_e_pedidos.sql`
- Servidor: rotas `/chat`, `/chat/session`, `/chat/escalate`, `/chat/new` e `/chat/feedback`
  em `supabase/functions/app/index.ts`; motor em `chatEngine.ts`; conhecimento em
  `chatKnowledge.ts`
- Site: `LivrariaAssistant.jsx`, `assistant/HandoffCard.jsx`, `assistant/SupportRating.jsx`,
  `SupportCenter.jsx`, `lib/assistantApi.js`, `lib/supportApi.js`
