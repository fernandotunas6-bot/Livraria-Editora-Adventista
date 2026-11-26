# O centro de ajuda do KanGest

O botão **«Ajuda»** no canto do ecrã, o **sino** na barra de cima e a tecla **F1** abrem o mesmo painel. Tem o aspecto do
assistente do site da livraria: o cabeçalho na cor da marca e os separadores. Código: `src/components/Ajuda.tsx` (o
ecrã) e `src-tauri/src/services/ajuda.rs` com `src-tauri/src/sinc/avisos.rs` (os dados).

## Avisos

O que precisa de atenção, cada um com **«Resolver»**, que leva ao ecrã onde se resolve. Cada pessoa só vê os avisos do
que pode resolver (as permissões dela). O número dos por ler aparece no sino e no botão.

| Aviso | Quem o vê (permissão) | Leva a |
|---|---|---|
| A cópia externa não foi gravada | Cópia de segurança | Configurações → Sistema |
| Sem cópia de segurança recente (mais de 2 dias) ou nenhuma | Cópia de segurança | Configurações → Sistema |
| Disco quase cheio (não cabe a próxima cópia) | Cópia de segurança | Sobre o KanGest |
| A verificação da base encontrou problemas | Configurações | Sobre o KanGest |
| Facturação electrónica com rejeitados | Facturação electrónica | Facturação electrónica |
| A ligação ao site tem um erro / documentos por enviar | API | Ligação ao site |
| Há uma versão nova | Actualizações | Sobre o KanGest |
| O caixa está aberto de outro dia | Fecho de caixa | Caixa e fechos |
| Encomendas por confirmar / levantamentos por fazer | Loja online | Loja online, já filtrada |
| Avisos da equipa do site (encomendas novas, mensagens de clientes) | a conta do site da pessoa | a encomenda na Loja online; a mensagem no atendimento do painel |

- **Os avisos do KanGest** têm um id que muda com o estado (`fe-rejeitados:3`). Um aviso marcado como lido volta a
  aparecer se o estado mudar, por exemplo com mais um rejeitado. Os lidos ficam por pessoa (`ajuda.lidos.<id>` na
  configuração, os 200 mais recentes).
- **Os avisos da equipa do site** vêm com a conta do site da pessoa (o RLS do site só lhe dá os dela), num pedido à
  parte (`ajuda.avisosSite`), para o painel não esperar pelo site. Marcá-los como lidos aqui é o mesmo que no sino do
  painel. Sem a conta do site, o rodapé diz porquê e leva à Loja online para entrar.

## Assistente

Responde **neste computador**, com os dados da loja. Nada sai para fora.

- **Uma encomenda do site pelo número** («ENC-6W05J5GH6» ou só «6W05J5GH6»): o **mesmo cartão** do assistente do site,
  com o número, as etapas (Recebida → Paga → Em preparação → Pronta a levantar ou Expedida → Levantada ou Entregue), o
  pagamento, os livros e o total, e mais o cliente, que a equipa vê. As etapas seguem as regras do site
  (`orderStage`). «Abrir na Loja online» abre-a lá.
- **«Encomendas em aberto»:** quantas há por confirmar, em curso e por levantar, e as três mais recentes.
- **Os dados da loja** (vendas, lucro, stock, quem deve…): o assistente de perguntas do KanGest (`services/assistente.rs`,
  o mesmo do Ctrl+K), com a permissão de relatórios.
- **As sugestões mudam com o ecrã:** no stock, «O que vai esgotar?»; nos clientes, «Quem me deve mais?»; e assim por
  diante.

O assistente público do site (`/chat`) não é chamado daqui: é o dos clientes, e cada pergunta abria uma conversa de
cliente na caixa de atendimento da equipa.

## Atalhos

Os do ecrã onde se está (na Loja online, as encomendas por confirmar; nos documentos, uma factura nova…) e os de sempre:
a cópia de segurança, a verificação da base, a Loja online, o manual e o painel do site.

## As escolhas de cada pessoa

Na engrenagem do painel (ficam neste computador, por pessoa):

- **mostrar o botão «Ajuda»** no canto (o sino e o F1 abrem-na sempre);
- **também no POS e no ecrã da TV**: por omissão não aparece lá, para não tapar os botões da venda;
- **do lado esquerdo**;
- **que avisos aparecem:** do KanGest, da loja online e da equipa do site.

A Loja online aceita `?filtro=` (`por_confirmar`, `levantamentos`, `em_curso`, …) e `?encomenda=<id>` no endereço: é assim
que os avisos e o assistente a abrem no sítio certo.
