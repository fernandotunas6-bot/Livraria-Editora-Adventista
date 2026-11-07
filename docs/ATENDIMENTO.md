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
- **notas internas** (separador "Nota interna"), que o cliente nunca vê;
- **respostas rápidas**: textos guardados pela equipa, com `{nome}`, `{pedido}` e `{encomenda}`
  preenchidos automaticamente (há quatro para começar: pagamento confirmado, a tratar, pedir
  comprovativo, devolução aceite).

Quando a equipa responde, o cliente recebe a resposta **por email** (com o texto e um botão para
continuar no site) e por push, além do aviso na conta; o botão do chat mostra um **ponto com o
número de respostas por ler**, que desaparece quando abre a conversa.

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

- Migração: `supabase/migrations/20261107010000_assistente_conversas_e_pedidos.sql`
- Servidor: rotas `/chat`, `/chat/session`, `/chat/escalate`, `/chat/new` e `/chat/feedback`
  em `supabase/functions/app/index.ts`; motor em `chatEngine.ts`; conhecimento em
  `chatKnowledge.ts`
- Site: `LivrariaAssistant.jsx`, `assistant/HandoffCard.jsx`, `assistant/SupportRating.jsx`,
  `SupportCenter.jsx`, `lib/assistantApi.js`, `lib/supportApi.js`

## Fecho automático, indicadores e sugestões

- **Fecho automático:** um pedido em que a equipa respondeu e o cliente não volta a escrever
  recebe um aviso ("fechamos a dd/mm") e fecha dois dias depois, com convite a avaliar. Os dias
  configuram-se em Equipas e alertas (7 por omissão; "Nunca" desliga). Uma mensagem nova do
  cliente ou da equipa cancela o aviso.
- **Indicadores** (Atendimento, no topo): pedidos abertos e em atraso, primeira resposta e
  resolução (medianas e % dentro do prazo), satisfação, conversas com o assistente e quantas
  passaram à equipa, tempo até assumir encomendas e escaladas. O mesmo resumo segue por email
  à segunda-feira às 07:35 (Luanda) para os responsáveis das equipas e os administradores.
- **Sugerir resposta** (com uma chave de IA nas Configurações): rascunho escrito com a conversa,
  as encomendas do cliente e as regras da loja. É só um rascunho: lê-se, corrige-se e envia-se.
  As notas internas entram no contexto mas a IA está instruída a não as revelar.

## O chat por dentro (visual)

- **Início:** saudação com o nome de quem tem sessão e quatro atalhos (a minha encomenda, envios
  e prazos, formas de pagamento, falar com a equipa); desaparece quando a conversa começa.
- **Mensagens em blocos:** separador do dia ("Hoje", "Ontem"), avatar no início de cada bloco do
  mesmo autor (o logótipo para o assistente, a inicial para quem da equipa responde) e a hora
  no fim do bloco.
- **Cartão da encomenda:** quando o assistente fala de uma encomenda, mostra os passos (recebida,
  paga, em preparação, expedida/em trânsito, entregue — ou pronta e levantada, nos
  levantamentos), o pagamento, o rastreio (com botão para copiar), a previsão e os livros.
- **Caixa de escrita:** cresce até cinco linhas; Enter envia e Shift+Enter muda de linha; mostra
  os caracteres restantes perto do limite (800).
- **"Nova mensagem":** se o cliente estiver a ler mais acima quando chega uma resposta, a
  conversa não salta; aparece um botão para descer. As respostas são anunciadas aos leitores de
  ecrã.
