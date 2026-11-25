# Ligação ao site (KanGest Livraria → base central)

**Livraria → Ligação ao site.** A fase 4 do estudo ([docs/ECOSSISTEMA.md](../../../docs/ECOSSISTEMA.md), na raiz da
livraria). Do lado do site, o protocolo, as tabelas e o painel estão em
[docs/KANGEST-SINCRONIZACAO.md](../../../docs/KANGEST-SINCRONIZACAO.md).

- **As facturas continuam a ser emitidas e assinadas aqui**, como sempre, também sem Internet (AGT).
- Cada documento emitido, anulado ou facturado segue para a base central da livraria. Fica lá como uma cópia que não
  se altera, com a cadeia de assinaturas conferida.
- **Sem Internet, a loja vende como sempre**: a fila espera, e nada se perde nem se atrasa ao balcão.

## Ligar (uma vez)

1. No painel do site, em **Sistema → Ligação ao KanGest → Postos do KanGest Livraria**, crie o posto desta loja. O
   painel mostra o endereço da ligação e um código de 8 letras, que serve uma vez durante 10 minutos.
2. Aqui, em **Livraria → Ligação ao site**, escreva o endereço e o código e carregue em **Ligar à livraria**. É preciso
   a permissão da API e Integrações (`sistema.api`).
3. O KanGest gera a sua chave Ed25519 e só a pública vai para o site. A semente fica cifrada com a chave mestra, no
   cofre do sistema (`segredos.rs`).
4. Tudo o que este KanGest já emitiu entra na fila. Os documentos importados do KIGEST ficam de fora, como nos avisos,
   e o site ignora o que já tiver.

## Como funciona

| Peça | Onde | O quê |
|---|---|---|
| A fila | `sinc_saida` (migração 0053) | Um gatilho põe cada documento emitido, anulado ou facturado na fila, **na mesma transacção** que o grava, só enquanto houver ligação. Sobrevive a um fecho inesperado e a dias sem Internet |
| O envio | `src/sinc/mod.rs` | Com documentos na fila, de 30 em 30 segundos; sem nada para enviar, só as novidades, de 2 em 2 minutos. Sempre no servidor da loja (num posto em rede, a base está no servidor), até 100 documentos num lote. Cada um leva o `hash` assinado, o `hash_anterior` (o do anterior da mesma série) e as linhas |
| A cifra | `src/sinc/cifra.rs` | O pedido vai assinado com a chave Ed25519 deste posto e selado para o site (X25519 + HKDF-SHA256 + AES-256-GCM); a resposta vem selada para este pedido. Os vectores de teste são os mesmos da Edge Function |
| A ligação | `sinc_ligacao` | O endereço, o posto, a semente cifrada e a chave pública do centro. Nunca sai para o ecrã |
| O catálogo | `sinc_catalogo` (migração 0057), `src/sinc/catalogo.rs` | O stock de cada armazém e o preço de cada artigo, para o site. Ver abaixo |
| Os relatórios do site | `item_do_documento`, migração 0062 | Cada documento leva também o canal (`balcao`, ou `api` se foi a loja online), o operador, o vencimento, o valor pendente e o documento de origem. Quando o pendente muda (um recibo), o documento volta à fila, uma vez só enquanto espera, e o site actualiza as dívidas. No site, os documentos do balcão entram sozinhos no Painel de Gestão e nos relatórios das lojas (docs/KANGEST.md §5.2) |

## Catálogo: o stock e os preços para o site

O que a ligação antiga fazia com os avisos da API passa a ir pela ligação, no mesmo lote dos documentos.

- **O que mudou.** Os gatilhos marcam o artigo em `sinc_catalogo`, na mesma transacção, quando muda:
  - o stock (qualquer escrita na tabela `stock`: vendas, entradas, inventário, importações);
  - o reservado (uma linha nova numa NE, ou uma NE facturada ou anulada);
  - o artigo, no que o site usa: o nome, o preço, a taxa, o tipo, activo e o código de barras. O custo médio, que muda
    a cada compra, fica de fora.

  É um conjunto, não uma fila: dez vendas do mesmo livro dão uma linha.
- **O que segue.** O **estado de agora**, montado como nos avisos da API (`webhooks::dados_evento`): a existência, o
  reservado e o disponível de cada armazém, e o preço com IVA. O site grava o estado e não soma nada, por isso repetir
  é seguro.
- **Feito.** A linha só sai se não mudou enquanto o lote ia a caminho. Se mudou, segue na volta seguinte com o estado
  novo.
- **Ao emparelhar**, segue o catálogo activo todo, uma vez.
- **O que o site faz com isto** decide-se no painel, em cada posto:
  - «Conta para o stock à venda no site»: desligado, o posto só dá o «temos / não temos» da loja dele;
  - «Manda no catálogo»: os preços e os produtos novos (ocultos, à espera de fotografia) vêm deste KanGest. Só um
    posto o pode ter.

  Os dois vêm desligados (docs/KANGEST-SINCRONIZACAO.md §10 na raiz da livraria).
- No ecrã **Livraria → Ligação ao site**, «Stock e preços por enviar» mostra quantos artigos faltam. «Repetir os com
  erro» também trata destes.

## Encomendas online: a NE, a FR, a NC e as anulações

Com «Emitir os documentos das encomendas online» ligado no painel do site (só um posto por loja), a resposta da
sincronização traz **tarefas**: a NE de cada encomenda da loja, a FR quando o pagamento é confirmado no site, a NC
dos reembolsos e a anulação das canceladas (docs/KANGEST-SINCRONIZACAO.md §11 na raiz da livraria).

- **Quem emite:** a própria API deste KanGest, por dentro (`api::chamar_interno`), com a chave interna «Loja online
  (ligação ao site)». São as mesmas validações, as mesmas permissões e a mesma `Idempotency-Key` de um pedido pela rede.
  A chave não tem token: o prefixo não é o de uma chave verdadeira e o hash é o de um segredo que ninguém tem. Vê-se,
  e desactiva-se, em API e Integrações.
- **Em nome de quem:** em **Livraria → Ligação ao site → Encomendas online** escolhe-se o utilizador e o posto (a série e
  o armazém). O utilizador tem de ter as permissões dos documentos:
  - nota de encomenda (`vendas.proforma`), factura/recibo e nota de crédito;
  - anular documentos;
  - clientes, e vender com o preço do site.

  O KanGest recusa um que não as tenha.
- **Só o que a ligação faz:** `POST /documentos` com uma NE, uma FR ou uma NC, e `POST /documentos/{id}/anular`
  (`encomendas::conferir`). Outra coisa é recusada aqui, sem chegar à API.
- **O resultado** fica em `sinc_tarefas` (migração 0058) e segue no pedido seguinte. Uma tarefa já feita não se emite
  outra vez; se o site a mandar de novo, segue o mesmo resultado. Uma que falhou tenta-se outra vez.
- **Sem quem emita** (ou depois de «Deixar de emitir»), as tarefas voltam ao site com esse erro. Depois de configurar,
  use «Repetir» no painel do site.
- **Desligar** desactiva a chave interna e apaga os resultados por enviar.
- Um pagamento nunca se confirma aqui: a FR só chega depois de o site dizer que está pago.

**Quando algo falha:**
- **Sem resposta** (sem Internet, o site em baixo): tenta-se na volta seguinte, sem contar tentativas. O ecrã diz «Sem
  ligação ao site».
- **O site recusou o pedido inteiro** (posto revogado, relógio deste computador com mais de 5 minutos de diferença):
  tenta-se ao fim de 1, 2, 4… minutos, até 6 horas.
- **O site recusou um documento**: só esse fica com erro e com as tentativas espaçadas, e o ecrã mostra-o. Depois de
  corrigir, use **Repetir os com erro**.
- **Repetir é seguro**: o site não grava a mesma factura duas vezes.

**Na barra de cima**, quem gere a ligação vê o estado: um ponto verde («Livraria») ou âmbar («Sem ligação»), com os
documentos por enviar; carregar leva a este ecrã.

**Desligar** apaga a chave deste posto e a fila. Ao ligar outra vez, ao mesmo posto ou a outro, tudo o que este
KanGest emitiu volta a seguir: o mesmo posto não grava nada em dobro, e outro posto fica com tudo. No painel do site,
revogue também o posto. Para mudar de computador ou rodar a chave, peça outro código no painel e ligue de novo.

## Testes

- `src/sinc/cifra.rs`: os vectores partilhados com a Edge Function:
  - as chaves da sessão (HKDF) e o pedido cifrado;
  - a resposta que a Edge Function selou;
  - a chave pública e a assinatura Ed25519, iguais às da WebCrypto;
  - o envelope e o nonce.
- `src/sinc/mod.rs`: as tentativas espaçadas, o endereço do painel, a mensagem do site e a vez de correr.
- `services/tests.rs` (`sincronizacao_com_a_livraria`):
  - nada entra na fila sem ligação;
  - o gatilho na mesma transacção;
  - os documentos antigos entram uma vez só;
  - o lote com o `hash_anterior`;
  - a anulação;
  - o canal, o operador e o pendente no lote, e o pendente que muda a voltar à fila uma vez só;
  - sem Internet nada se perde e não se contam tentativas;
  - a chave nunca sai para o ecrã;
  - desligar.

O envio a um site a sério só se prova com o site configurado (os segredos e o posto) e este KanGest instalado.
