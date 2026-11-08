# Livros digitais

Estado em 2026-11-08. Pedido do dono: "cada livro digital só pode ser descarregado se for pago;
painel de abrir ligado ao pagamento; tudo bem organizado, como os outros sistemas fazem".

## A regra

Um livro digital (um material **pago** em Catálogo → Materiais (PDF)) abre a quem o comprou **só
quando a encomenda está paga**:

- **paga** = os pagamentos confirmados cobrem o total. Um pagamento só fica confirmado pelo gateway
  (webhook) ou por quem tem «Confirmar pagamentos» ([PAGAMENTOS.md](PAGAMENTOS.md));
- **fecha** com o reembolso total, o cancelamento da encomenda ou um bloqueio da loja;
- **não abre** com a encomenda por pagar, com o pagamento indicado pelo cliente e ainda por
  confirmar, com o pagamento só em parte, nem com a encomenda "entregue" ou com a recepção
  confirmada pelo cliente — antes desta mudança, estas duas últimas abriam o livro sem pagamento.

"Abrir" não é um botão da equipa: é confirmar o pagamento. Assim não há forma de dar um livro pago
sem o pagamento ficar registado. A regra está numa só função da base de dados
(`private.can_download`, migração `20261108160000_livros_digitais`), que o site, a lista pública e o
Storage usam.

## Como se vende um livro digital, passo a passo

1. **Produto:** no produto, em Versões, crie a edição "Edição digital" (formato "PDF") com o preço da
   edição digital e ligue **«Edição digital»** — fica sem stock e sem envio. O livro impresso continua
   a ser outra edição. Um produto que é só PDF (uma revista, uma lição), sem edições: ligue
   **«Produto digital (PDF)»** no separador principal.
2. **Ficheiro:** em Catálogo → Materiais (PDF) → Materiais, carregue o PDF, escolha "Para quem
   comprou", o produto e a variante "Edição digital", e publique. Sem o PDF publicado, a loja não
   deixa comprar a edição digital ("ainda não está disponível").
3. **Compra:** o cliente escolhe a edição digital — uma por conta, sem quantidade — e compra **com a
   conta** (é lá que o livro fica). Só com edições digitais, o checkout **não pede entrega, morada
   nem loja**, não há portes e o telefone é opcional; os métodos de pagamento são os que se pagam
   antes (transferência, Multicaixa Express) ou pelo gateway. Quem já o tem pago vê "Já é seu" na
   ficha, com o caminho para a biblioteca.
4. **Pagamento:** o cliente paga (transferência com referência, ou o gateway quando houver). Quem tem
   «Confirmar pagamentos» confirma-o em Encomendas — ou o gateway confirma sozinho.
5. **Abre:** no momento da confirmação, o livro abre e a encomenda fica **concluída** ("Na
   biblioteca"): não há nada para preparar nem entregar. O cliente recebe na conta o aviso "Livro
   digital disponível", e o email, o WhatsApp e o push de "Pagamento confirmado" dizem que já está na
   biblioteca, com o botão "Abrir a biblioteca".
6. **Ler:** em Perfil → **Biblioteca**, o cliente abre o livro no navegador ou descarrega-o. No
   Android só aparece "Descarregar" (o Chrome do Android não mostra PDFs: descarrega e abre com a
   aplicação do telemóvel).

## A encomenda só digital (migração `20261108210000_edicoes_digitais`)

- **Envio "Edição digital (sem envio)"**: o carrinho passa a ele sozinho quando só tem edições
  digitais. Sem portes, sem morada, sem loja, sem assinatura; o email é obrigatório (recibo e aviso do
  pagamento), o telefone não.
- **Passos:** registada → pagamento → **na biblioteca**. Quando fica paga, fica entregue sozinha; se o
  pagamento for anulado, volta a esperar por ele (e o livro fecha). Preparar, enviar ou entregar à
  mão é recusado; a equipa só a pode cancelar. Reembolsada, continua concluída, mas fecha.
- **Sem stock:** a edição digital não se verifica nem se desconta do stock (conta nas vendas), e um
  livro esgotado em papel continua à venda com ela. Cancelar não devolve ao stock o que não saiu dele.
  Um produto só digital não fica "Esgotado" no painel.
- **Com impressos à mistura:** o envio é o dos impressos, e os portes (e os portes grátis) contam só
  os impressos. O PDF abre quando a encomenda inteira estiver paga.
- **Pagamentos:** em Pagamentos → "Disponível para" há "Edição digital (sem envio)". Sem nada marcado,
  a edição digital aceita os métodos pagos antes ou pelo gateway; "Pagamento na entrega" não serve
  (não há entrega). Para aceitar, por exemplo, "Pagar no balcão" num livro digital, marque lá
  "Edição digital".
- **Avisos:** a equipa dos pagamentos recebe "Nova encomenda digital" (há um pagamento a confirmar,
  nada a preparar); a vigilância não pede para a assumir nem para a preparar, nem tem prazo de
  entrega. O cliente não recebe os avisos de entrega, nem o "Recebi tudo bem".

## O que o cliente vê (Perfil → Biblioteca)

| Estado | O que diz | Botão |
|---|---|---|
| Disponível | quantas vezes abriu e quando | Abrir · Descarregar |
| Pagamento por confirmar | "abre assim que a loja o confirmar" | — |
| Por pagar | "abre quando o pagamento da encomenda for confirmado" | Ver a encomenda e pagar |
| Pago em parte | "falta pagar X da encomenda Y" | Ver a encomenda e pagar |
| Reembolsado | "o acesso fechou com o reembolso" | Falar connosco |
| Bloqueado | "bloqueado pela loja" | Falar connosco |

`/profile?tab=pdfs` (as ligações antigas) abre a Biblioteca. Os materiais gratuitos continuam em
`/materiais`, para qualquer visitante.

## O que a equipa vê (Catálogo → Materiais (PDF) → Acessos e pagamentos)

Quem comprou cada livro digital, com o cliente (nome, email, código `CLI-`), a encomenda, o
pagamento e o estado do acesso; filtros com os números de cada estado e procura. Os pagamentos por
confirmar vêm primeiro: é o que a equipa tem de fazer, e o botão "Confirmar o pagamento" abre a
encomenda em Encomendas. "Pago, sem conta" é uma compra paga de alguém que ainda não tem conta com o
email da encomenda: abre-o quando entrar com esse email.

**Bloquear:** com o acesso aberto, "Bloquear" pede o motivo (por exemplo, partilha do ficheiro); o
cliente deixa de o abrir mesmo com a encomenda paga. "Desbloquear" devolve o acesso. As duas acções
ficam no registo de segurança, com quem as fez. Vêem e bloqueiam quem gere o catálogo ou as
encomendas.

Cada abertura e cada download de um livro pago ficam registados (`download_events`): é daí que vêm o
"Aberto 2 vezes" e a data da última vez.

## Como fazem as outras lojas, e o que se adoptou

| Prática (WooCommerce, Shopify Digital Downloads, Gumroad, Kobo, Leanpub) | Aqui |
|---|---|
| O acesso abre quando o pagamento é confirmado, e fecha com o reembolso | ✅ |
| Biblioteca do cliente com cada compra e o seu estado | ✅ Perfil → Biblioteca |
| Email depois do pagamento com o caminho para o livro | ✅ no "Pagamento confirmado" |
| A equipa vê os acessos por encomenda e pode retirá-los | ✅ Acessos e pagamentos, com bloqueio |
| Registo de cada download | ✅ |
| Links temporários (não se partilha um endereço que dure) | ✅ 2 minutos, só com sessão |
| Edições digitais sem envio no checkout, concluídas ao pagar | ✅ envio "Edição digital", sem portes nem morada; "Na biblioteca" ao pagar |
| Uma cópia por conta, e "já é seu" | ✅ quantidade 1; quem já a tem paga não a compra outra vez |
| Limite de downloads por compra | ⏳ por decidir: o registo já mostra quem abre de mais, e o bloqueio resolve o abuso |
| Marca d'água com o nome do comprador em cada página | ⏳ por decidir: dissuade a partilha, mas pede gerar um PDF por cliente |
| Download sem conta, por um link no email | ✗ de propósito: os livros ficam na conta, que é o que permite fechar o acesso |

## Testes

- `scripts/pglite/edicoes.mjs`: 50 cenários da venda sem envio (sem stock, uma por conta, conta e PDF
  obrigatórios, já comprada, entregue ao pagar e de volta com o pagamento anulado, sem passos de
  envio, cancelamento sem devolver stock, portes só dos impressos, avisos, "Esgotado" no painel).
- `scripts/pglite/digitais.mjs`: 59 cenários com as migrações reais (só abre pago; entregue ou
  confirmado pelo cliente sem pagar não abre; indicado, em parte, reembolsado, cancelado; a edição
  impressa não abre o PDF da digital; email confirmado; bloqueio, desbloqueio e registo de
  segurança; o painel e as permissões; a biblioteca; o aviso na conta).
- vitest: `lib/digitalLibrary.test.js`, `components/downloads/DigitalLibrary.test.jsx`,
  `components/admin/DigitalAccessPanel.test.jsx` e, na Edge Function, `digitalBooks.test.ts` e o
  email em `emails.test.ts`.
