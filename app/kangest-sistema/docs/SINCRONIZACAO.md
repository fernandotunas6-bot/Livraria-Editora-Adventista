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
| O envio | `src/sinc/mod.rs` | De 30 em 30 segundos, no servidor da loja (num posto em rede, a base está no servidor), até 100 documentos num lote. Cada um leva o `hash` assinado, o `hash_anterior` (o do anterior da mesma série) e as linhas |
| A cifra | `src/sinc/cifra.rs` | O pedido vai assinado com a chave Ed25519 deste posto e selado para o site (X25519 + HKDF-SHA256 + AES-256-GCM); a resposta vem selada para este pedido. Os vectores de teste são os mesmos da Edge Function |
| A ligação | `sinc_ligacao` | O endereço, o posto, a semente cifrada e a chave pública do centro. Nunca sai para o ecrã |

**Quando algo falha:**
- **Sem resposta** (sem Internet, o site em baixo): tenta-se na volta seguinte, sem contar tentativas. O ecrã diz «Sem
  ligação ao site».
- **O site recusou o pedido inteiro** (posto revogado, relógio deste computador com mais de 5 minutos de diferença):
  tenta-se ao fim de 1, 2, 4… minutos, até 6 horas.
- **O site recusou um documento**: só esse fica com erro e com as tentativas espaçadas, e o ecrã mostra-o. Depois de
  corrigir, use **Repetir os com erro**.
- **Repetir é seguro**: o site não grava a mesma factura duas vezes.

**Desligar** apaga a chave deste posto, e as facturas que ainda não seguiram ficam por enviar. No painel do site,
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
  - sem Internet nada se perde e não se contam tentativas;
  - a chave nunca sai para o ecrã;
  - desligar.

O envio a um site a sério só se prova com o site configurado (os segredos e o posto) e este KanGest instalado.
