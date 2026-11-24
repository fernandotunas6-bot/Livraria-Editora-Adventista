# KanGest Livraria e o site — como vai funcionar (estudo)

Estudo de 24/11/2026, pedido pelo dono antes de se mexer na base de dados. Responde a quatro perguntas: como vai
funcionar, como se liga ao site, que ligações há e como fica tudo cifrado. Diz também o que já existe, o que falta e
por que ordem se faz.

**Feito até agora:** só a edição separada (§2). Tudo o resto é desenho, a fazer por fases (§11).

## 1. Em resumo

- O **KanGest Livraria** é uma edição do KanGest só da livraria, separada do oficial desde a 1.4.4.
- O **Supabase da livraria** passa a ser a base central: lá ficam os artigos, o stock de todas as lojas, as
  encomendas, as facturas (uma cópia que não se altera), a caixa e os relatórios.
- Cada loja continua a ter a sua base local cifrada. **Sem Internet, a loja vende, factura e gere tudo**, e o que
  muda fica numa fila. Quando a Internet volta, a fila sai, e cada coisa chega ao centro uma vez só.
- **As facturas continuam a ser assinadas na loja.** A AGT exige que seja o programa certificado a assinar, no
  momento da emissão. O centro guarda a cópia, verifica a cadeia de assinaturas e nunca a altera.
- Cada ligação tem a sua identidade e a sua cifra (§6 e §7). Nenhuma chave de administração vai para o desktop.

## 2. O que existe hoje

| Peça | O que é | Onde |
|---|---|---|
| Site | Loja online, painel de administração e Painel de Gestão. React, Edge Function `app`, RLS com permissões por área | `app/web`, `supabase/` |
| Ligação actual | O site fala com o KanGest pela **API do KanGest**, por um túnel da Cloudflare até à loja. A fila `kangest_fila` emite NE, FR e NC com `Idempotency-Key`. Os avisos HMAC (`/webhooks/kangest`) trazem o stock, os preços e as vendas. Há um agendador de 5 em 5 minutos | [KANGEST.md](KANGEST.md) |
| KanGest oficial 1.4.4 | Facturação AGT, POS, stock, tesouraria e RH. Tauri 2 + Rust + SQLite por loja, funciona sem Internet. Vendido a várias empresas | `fernandotunas6-bot/KanGest` |
| **KanGest Livraria** | A edição só da livraria, a partir da 1.4.4. Tem identificador, pasta de dados, cofre e actualizações próprios, e o CI `kangest-livraria.yml` | `app/kangest-sistema/` ([KANGEST.md](KANGEST.md#a-edição-da-livraria-o-código-neste-repositório)) |

O que o KanGest já protege (`app/kangest-sistema/docs/SEGURANCA.md`):

| O quê | Como |
|---|---|
| A base | SQLCipher (AES-256, autenticação por página) |
| Os segredos na base | AES-256-GCM, com a chave mestra no cofre do sistema (DPAPI no Windows, Porta-chaves no macOS) |
| A rede entre os postos | AES-256-GCM, contra repetições |
| As senhas | Argon2 |
| As licenças e o executável | Assinatura Ed25519 |
| Os avisos | HMAC-SHA256 |

A biblioteca `ring` 0.17, que o KanGest já usa, tem Ed25519, X25519, AES-256-GCM, HKDF e SHA-256. **A ligação nova
não precisa de bibliotecas de cifra novas.**

## 3. O que o pedido pede e o que já existe

| Pedido | Já existe | Falta |
|---|---|---|
| Base central única | O site no Supabase; cada KanGest com a sua base | A base central da edição (§11, fase 3) |
| Centro de integrações | No KanGest: Integrações (chaves, avisos com histórico, pedidos). No site: «Ligação ao KanGest» (fila, erros, Repetir, Testar, assistente) | «Ligação à Livraria» com adaptadores (`trait Ligacao`) |
| Outbox transaccional | Na loja, `api_eventos` e `api_entregas`, enchidas por gatilhos (migração 0021). No site, `kangest_fila` com reserva | Ligar o outbox local ao centro |
| Idempotência e novas tentativas | `Idempotency-Key`, espera 1, 2, 4… min | Estender às linhas da sincronização |
| Tempo real | Avisos do KanGest e Realtime no Painel de Gestão | Realtime do centro para a loja |
| Offline | O KanGest é offline por desenho | Ler a gestão da loja online sem Internet (espelho local) |
| Navegador integrado | Não existe | Fase 5 |
| Gerir a loja online a partir do desktop | Não existe; o painel do site faz tudo | Fase 6 |
| Cloudflare Queues e Workers | `pg_cron` e filas em Postgres já fazem este trabalho | **Não entram.** Seria outro backend para a mesma coisa |
| React + TypeScript no site | O site é React em JavaScript | Não se reescreve |

## 4. Como vai funcionar

```
 LOJA (funciona sem Internet)                       SUPABASE DA LIVRARIA                    SITE
 KanGest Livraria                                    (base central)                          livrariaadventista.ao
 ┌─────────────────────────────┐   HTTPS (TLS 1.3)  ┌───────────────────────────────┐       ┌──────────────┐
 │ SQLite cifrado (SQLCipher)  │   lote selado e    │ Edge Function /kangest/sinc   │       │ checkout,    │
 │ venda → factura AGT         │   assinado         │  verifica: conta do posto,    │       │ painel admin │
 │  └─ fila local (mesma       │   (Ed25519)        │  assinatura, hora, nonce      │       └──────┬───────┘
 │     transacção) ────────────┼───────────────────►│  → kangest_receber() (1 tx)   │              │
 │ ◄── puxar as novidades ─────┼────────────────────│ orders, stock_books, cópias   │◄─────────────┘
 │ ◄── Realtime (WSS + RLS) ───┼────────────────────│ que não se alteram, RLS       │
 │                             │                    └───────────────────────────────┘
 │ Navegador: separadores sem  │   HTTPS
 │ acesso ao programa ─────────┼──────────────────────────────────────────────────────────► painel do site
 └─────────────────────────────┘                                                            (login + MFA)
```

**Uma venda ao balcão, sem Internet**
1. O KanGest emite e assina a FR, como hoje.
2. Na mesma transacção da base local, a FR entra na fila de saída. Se o computador se desligar a meio, ficam as duas
   ou nenhuma.
3. Quando a Internet volta, o trabalhador da fila junta as linhas, assina o lote com a chave do posto, sela-o para o
   centro e envia.
4. O centro verifica, grava numa transacção e responde. Um lote repetido, por exemplo se a resposta se perdeu, é
   reconhecido pela chave de idempotência e não grava nada outra vez.
5. O stock do site e o Painel de Gestão mudam na hora.

**Uma encomenda no site**
1. O checkout grava a encomenda, como hoje.
2. O Realtime avisa o KanGest da loja da encomenda. Sem Internet na loja, o aviso chega quando ela voltar, porque o
   KanGest também puxa pelo cursor.
3. O KanGest emite a NE, que reserva o stock. Quando o pagamento for confirmado **no centro**, emite a FR. As duas
   voltam ao centro pela fila.
4. Enquanto isto não estiver provado, a NE, a FR e a NC continuam a sair pelo caminho actual (a API do KanGest e o
   túnel). O caminho novo entra atrás de um interruptor. Quando o substituir, **a loja deixa de ter uma porta aberta
   para a Internet**: só faz pedidos para fora.

**Um produto alterado**
- No KanGest (referência, preço, IVA, stock): sai pela fila e o site recebe-o.
- No site (título, descrição, capa, publicação): o KanGest recebe-o ao puxar ou pelo Realtime.
- Cada campo tem um só dono (§5), por isso os dois lados não escrevem no mesmo campo.

## 5. Quem manda em cada dado

| Dado | Quem manda | No centro | Na loja |
|---|---|---|---|
| Referência, preço, IVA, stock por armazém | KanGest (balcão), por decisão do dono de 12/11 | `stock_books`, `kangest_stock` | artigos, stock |
| Título, descrição, capa, publicação, colecções | Site | `stock_books` | cópia |
| Facturas, recibos, NC e NE assinados | O KanGest que os assina | Cópia que não se altera | documentos |
| Encomendas e pagamentos online | Site; a confirmação é só no centro | `orders`, pagamentos | cópia |
| Movimentos de stock, caixa, tesouraria, despesas | KanGest | Cópia | tabelas actuais |
| Clientes | Cada lado os seus, ligados por NIF, email ou telefone | Cópia cifrada por coluna | entidades |
| Utilizadores | Pessoas: Supabase Auth (com MFA). Balcão: utilizadores e PIN locais | `profiles`, permissões | utilizadores |

As tabelas do site mantêm os nomes que têm. As cópias da loja ficam em tabelas `kangest_*`. Uma alteração de preço
nunca toca numa factura emitida: a factura é uma cópia fechada do momento.

## 6. As ligações

| Ligação | Quem é quem | Transporte e cifra | Contra quê |
|---|---|---|---|
| **Emparelhar um posto** | No painel (`manage_settings`) cria-se um código de uso único, válido 10 minutos e guardado só como resumo SHA-256. O posto gera o seu par **Ed25519** e só a chave pública sobe | HTTPS | Código roubado: prazo curto, uso único, limite de pedidos |
| **Posto → centro** (vendas, stock, caixa) | A conta do posto no Supabase Auth, mais a **assinatura Ed25519** de cada lote (posto, nonce, hora, SHA-256 do corpo) | TLS 1.3 e, por cima, o corpo **selado** (X25519 + HKDF-SHA256 + AES-256-GCM, à maneira do HPKE) com a chave pública do centro | Intercepção em proxies e registos; repetição (nonce e ±5 min); um JWT roubado não chega para escrever |
| **Centro → posto** (encomendas, conteúdo, pagamentos) | O mesmo posto. A RLS só lhe mostra a loja dele | HTTPS ao puxar e WSS no Realtime | Ver dados de outras lojas |
| **Pessoa → gestão da loja online** | A conta da pessoa no site, com **MFA obrigatório**. O refresh token fica no cofre (AES-256-GCM) | HTTPS para o PostgREST (com RLS) e para as rotas `/admin/...` | Um posto sem pessoa não muda o site |
| **Navegador → Internet** | Nenhuma identidade do KanGest | HTTPS; separadores **sem acesso ao programa** e perfil isolado | Um site a chegar aos ficheiros, às chaves ou à API local |
| **Site → KanGest** (a actual) | Chave `kg_…` e avisos HMAC | Túnel da Cloudflare | Fica até o caminho novo estar provado |

**Revogar e rodar.** No painel, «Postos do KanGest». Revogar corta a conta e a chave no mesmo instante, e o lote
seguinte é recusado. Rodar gera um par novo. Tudo fica na auditoria.

## 7. A cifra, camada a camada

- **Na loja**:
  - a base vai com SQLCipher (já existe), e a fila de saída vive nela, por isso também vai cifrada;
  - a chave Ed25519 do posto e os tokens ficam em AES-256-GCM, com a chave mestra no cofre do sistema, como os
    outros segredos.
- **Em viagem**:
  - TLS 1.3;
  - por cima, o corpo selado para o centro e assinado pelo posto;
  - a chave privada X25519 do centro é um segredo da Edge Function e roda-se com um identificador (`kid`): durante
    a troca, o centro aceita a chave antiga e a nova.
- **No centro**:
  - o disco do Supabase vai cifrado (AES-256);
  - o NIF, o telefone e o email da cópia de clientes são **cifrados por coluna** na Edge Function, com AES-256-GCM e
    a chave nos segredos dela, antes de chegarem à base;
  - para ligar clientes sem os decifrar há um **índice cego** (HMAC-SHA256 do valor normalizado).
- **Integridade das facturas**:
  - ao receber, o centro confere a **cadeia da AGT de cada série**: a mensagem
    `data;data_hora;numero_doc;total;hash_anterior` (`agt.rs`) e o `hash_anterior` igual ao `hash` do documento
    anterior;
  - um elo partido ou um número em falta dá alerta;
  - as cópias recusam UPDATE e DELETE; a única mudança permitida é marcar um documento como anulado, pelo evento
    da anulação.
- **Onde há texto em claro** (o limite honesto):
  - dentro da Edge Function, enquanto processa;
  - nas colunas de que a RLS e os relatórios precisam (totais, datas, referências);
  - no ecrã de quem tem permissão.

## 8. 100% offline e 100% online

| | Sem Internet | Com Internet |
|---|---|---|
| Vender, facturar (AGT), caixa, stock, compras, RH | Tudo | Tudo, e chega ao centro em segundos |
| Ver encomendas, produtos e clientes do site | A última cópia recebida | Ao vivo |
| Mudar um produto do site (conteúdo) | Fica na fila; sai quando a Internet voltar | Na hora |
| Confirmar um pagamento online | **Não**: só no centro, pelo gateway ou por «Confirmar pagamentos» | Sim, com a permissão |
| Navegar na Internet | Não | Sim |
| Indicador | «Sem ligação · N por enviar» | «Ligado · em dia» |

## 9. Riscos

| Risco | O que se faz |
|---|---|
| **Facturas sem valor para a AGT** se a edição for compilada sem a chave e o certificado do produtor. O oficial 1.4.4 também ainda não os tem | O dono cria os segredos `KANGEST_AGT_*` neste repositório; até lá, o instalador da edição é só para ensaio |
| Os minutos de Windows num repositório privado contam a dobrar | O instalador só sai à mão |
| O multi-webview do Tauri 2 (separadores numa janela) ainda está atrás da feature `unstable` | Se falhar no WebView2, uma janela por separador |
| O Realtime a partir do Rust precisa de um cliente WebSocket novo | Puxar pelo cursor de 30 em 30 segundos funciona sem ele; o Realtime só encurta a espera |
| A verificação RSA-SHA1 da cadeia AGT no Deno | A confirmar no primeiro PR da fase 3. Se o WebCrypto do Deno a recusar, o centro confere a continuidade do `hash_anterior` e a assinatura fica para o SAF-T |
| Dois sítios a mudar o mesmo produto | Cada campo tem um só dono (§5); um choque fica em `sinc_conflitos` para alguém decidir |
| Dados pessoais de clientes num sítio novo (Lei n.º 22/11 da Protecção de Dados Pessoais) | Cifra por coluna, RLS apertada e só os campos precisos |
| Desligar a ligação actual cedo demais | Só depois de o caminho novo ter corrido em paralelo numa loja |
| O disco do computador de desenvolvimento tem 2,7 GB livres | O CI compila o Rust; cá só correm os testes do site |

## 10. O que não muda

- O KanGest oficial e os outros clientes dele: não tocam no Supabase da livraria.
- As facturas são sempre assinadas na loja.
- O `service_role` nunca sai do servidor.
- Merge no `main` = produção. O dono integra cada PR.

## 11. Ordem — um PR cada

| Fase | O quê | Onde |
|---|---|---|
| 0 | Edição separada (identidade, cofre, actualizações, CI) — **feito** | #101 |
| 1 | Este estudo | #101 |
| 2 | Artigo novo no KanGest → produto **oculto** no site, à espera de fotografia (nunca publica sozinho) — **em PR (#102)** | site |
| 5 | Navegador: janela «Internet», separadores sem acesso ao programa, histórico, favoritos, transferências — **em PR (#103)** ([NAVEGADOR.md](../app/kangest-sistema/docs/NAVEGADOR.md)) | edição |
| 3 | Base central: postos e emparelhamento, cópias que não se alteram, `kangest_receber()`, verificação da cadeia AGT, cifra por coluna, «Postos do KanGest» — **em PR (#104)** ([KANGEST-SINCRONIZACAO.md](KANGEST-SINCRONIZACAO.md)) | site (migrações) |
| 4 | Motor de sincronização: fila local, selo e assinatura e o ecrã «Ligação ao site» — **em PR (#105)** ([SINCRONIZACAO.md](../app/kangest-sistema/docs/SINCRONIZACAO.md)). Ficam para depois o tempo real, os conflitos (só com a fase 6, quando o KanGest escrever no site) e o indicador fora do ecrã | edição |
| 6 | Gestão da loja online no KanGest — **primeira parte em PR (#106 no site, e este no KanGest)**: as encomendas da loja e o catálogo numa cópia local que se lê sem Internet, e as alterações no painel do site, aberto no navegador do KanGest ([LOJA-ONLINE.md](../app/kangest-sistema/docs/LOJA-ONLINE.md)). Fica para depois escrever a partir de ecrãs nativos (pede uma decisão sobre como as pessoas entram no KanGest com a conta do site) | edição |

A fase 5 vem antes das fases 3 e 4 porque não depende delas.

## 12. Por decidir (pelo dono)

1. Criar neste repositório os segredos da AGT e da Facturação Electrónica (`KANGEST_AGT_*`, `KANGEST_FE_*`).
2. A licença na edição: manter o servidor de licenças do KanGest ou dispensá-la.
3. Onde ficam os instaladores da edição (`livrariaadventista.ao/kangest/actualizacoes`): ficheiros no site ou no
   bucket `apps` do Supabase, e a chave minisign própria da edição (`KANGEST_LIVRARIA_CHAVE_ACTUALIZACOES`).
4. Quando desligar o túnel e a API de entrada nas lojas.
