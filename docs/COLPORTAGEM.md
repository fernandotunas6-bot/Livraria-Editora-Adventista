# Colportagem e registo da Igreja

Guia para quem gere o painel. Em **Painel → Igreja → Registo da Igreja**.

## 1. Registo da Igreja

A colportagem assenta nesta estrutura. Cada colportor pertence a uma igreja, cada igreja a um distrito e cada distrito a um campo e a uma província.

```
Campo (União / Associação / Missão)
  └─ Distrito pastoral ── província e município (sede)
       ├─ Pastor titular (um de cada vez) e associados
       └─ Igrejas ── município
```

- **Províncias e municípios** são os do RGPH-2024, as mesmas tabelas das moradas de entrega.
  - O município de uma igreja ou de um distrito tem de pertencer à província escolhida; a base de dados recusa o contrário.
- **Distritos com o mesmo nome** podem existir em províncias diferentes: há "Distrito Centro" no Huambo e no Cuito.
- **Pastores:**
  - Cada pastor tem cargo, campo, província, telefone e "local de serviço". O local de serviço serve para quem não está num distrito, como o ISPAB, a Livraria ou a Missão.
  - O distrito de cada pastor atribui-se em **Distritos → ⇄ (transferir)**. A atribuição anterior fica no histórico (botão do relógio na lista de pastores), com as datas.
  - As **notas de avaliação** que vinham no `pastores.json` **não são importadas**.
- **Fundir:** quando o mesmo distrito ou o mesmo pastor aparece duas vezes, use ⑂ no que fica. As igrejas, as atribuições e os delegados passam para esse, e o outro é apagado. Uma fusão não se desfaz.
- **Desactivar em vez de apagar:** um distrito com igrejas não se pode apagar. Desactivado, sai das listas, mas o histórico mantém-se.
- **Excel:** cada lista exporta o que está filtrado.

### Importar os ficheiros

1. Abra o separador **Importar** e escolha o `churches.json` e/ou o `pastores.json`.
2. Confirme o **campo por omissão** (por exemplo, "Missão Centro"). É usado pelos distritos e pastores que não indicam outro.
3. Reveja a pré-visualização. Os **avisos** dizem o que precisa de confirmação:
   - pastores distritais com "Huambo" no lugar do distrito: ficam sem distrito, e atribui-se depois;
   - telefones repetidos;
   - números em sequência (924700000…), que parecem preenchidos à mão.
4. Reveja os **"Parecidos"**: nomes que talvez sejam o mesmo distrito ou a mesma pessoa, como "Calenga" e "Calenga e Lepi", ou "Feka" e "Feca". Não se juntam sozinhos. Depois de importar, use **Fundir**, ou corrija o delegado na igreja.
5. Carregue em **Importar**. O que já existe não é duplicado, por isso pode importar-se outra vez sem perigo.

Os dois ficheiros têm telefones e avaliações e **não vão para o repositório** (estão no `.gitignore`).

### Quem pode

| Permissão (Utilizadores → gestor) | Pode |
|---|---|
| **Registo da Igreja** | Ver e alterar campos, distritos, igrejas e pastores; importar |
| **Colportagem** | Ver o registo, sem alterar (precisa das igrejas para os colportores) |
| Administrador | Tudo |

Os clientes e os visitantes não vêem nada disto. Os telefones dos pastores só aparecem a quem tem uma destas permissões.

## 2. Colportores

Em **Painel → Igreja → Colportagem**.

### O link de candidatura

`livrariaadventista.com/colportor/candidatura` (também `/ser-colportor`).

- É **diferente do registo de clientes**: quem o abre candidata-se a colportor e **não precisa de conta**.
- O separador **Links** tem o link geral e um link por igreja (`?igreja=001`), que abre o formulário com a igreja já escolhida. Serve para os pastores partilharem por WhatsApp.
- O formulário pede:
  - nome e telefone (WhatsApp); o email é opcional;
  - província → município → igreja;
  - o pastor ou ancião que recomenda (a lista mostra os do distrito da igreja);
  - como quer trabalhar (Aspirante, Estudante ou Tempo parcial) e as horas por semana;
  - a escola, se for estudante;
  - a motivação;
  - o consentimento para o tratamento dos dados.
- Um telefone só pode ter uma candidatura ou ficha em aberto.
- Em **Definições** pode fechar as candidaturas e pôr uma nota no topo do formulário.

### Da candidatura ao colportor

1. **Candidaturas:** abra a ficha.
   - Confirme a recomendação com o pastor e marque "Recomendação confirmada".
   - Use **Pôr em análise**, **Aprovar** ou **Recusar** (recusar pede o motivo).
2. **Aprovar** dá o **código de colportor `CPT-0001`**, `CPT-0002`… O código nasce só na aprovação, por isso as candidaturas recusadas não gastam números, e **nunca muda**. Na aprovação, o colportor fica com a categoria que pediu.
3. **Convite:** na ficha, **Gerar convite** → **Enviar por WhatsApp**.
   - O colportor abre o link, entra (por exemplo com o Google) e a conta fica ligada ao código.
   - O convite é de uso único e vale 14 dias (configurável). Gerar outro invalida o anterior.
4. **Área do colportor** (`/colportor`): o código, a categoria, a igreja e as percentagens em vigor para ele, e o histórico.

Os estados possíveis são candidatura, em análise, activo, suspenso, inactivo e recusado. Suspender e desactivar pedem o motivo. Tudo fica no **histórico** da ficha: quem, quando e porquê.

Um colportor **não** ganha acesso ao painel: é um cliente com uma ficha de colportor ligada.

### Categorias

As categorias seguem a Working Policy da Igreja (FP 70):

| Categoria | Quando |
|---|---|
| Aspirante | Novo, com cartão de identificação |
| Estudante | Plano de bolsa: trabalha nas férias para pagar os estudos |
| Tempo parcial | Não cumpre as horas de tempo inteiro |
| Licenciado | Cumpriu os requisitos do campo |
| Credenciado | 12 meses ou mais e os requisitos do campo |

A categoria muda-se na ficha, com motivo. O separador **Reclassificação** sugere as mudanças a partir das horas dos relatórios validados, com os requisitos em **Definições** (ver a secção 3). A decisão é sempre da equipa.

### Percentagens

Em **Percentagens**:

- **Matriz categoria × modo de venda.** Os modos são consignação, compra com desconto e venda no site.
  - Clique numa célula para definir a percentagem e a data a partir da qual vale.
  - A negrito está o que tem regra própria; o resto herda da linha "Todas as categorias" ou da percentagem base.
- **Por tipo de produto:** por exemplo, as Bíblias com outra percentagem.
- **Percentagem própria de um colportor** (na ficha dele): ganha sempre às regras. Pode ser só para um modo ou um tipo de produto.
- **Ordem de decisão:** percentagem própria → regra mais específica (categoria pesa mais do que tipo de produto, e este mais do que modo de venda) → percentagem base.
- **Mudar não reescreve o passado.** A regra antiga fica até à véspera da nova data, e cada venda guarda a percentagem com que foi feita.
- **Simular:** escolha um colportor, um produto, um modo e uma data. "Confirmar na base de dados" pergunta à base de dados, que é quem decide de facto.

Enquanto não houver percentagens, todos ficam com 0% e o painel avisa.

## 3. Livros, relatórios e contas

### Guias (separador "Guias e stock")

Há três tipos de guia, cada uma numerada (`GUI-000001`) e imprimível, com espaço para as duas assinaturas:

| Guia | O que faz | Na conta do colportor |
|---|---|---|
| **Entrega à consignação** | Os livros saem do stock da loja e ficam a cargo do colportor | + preço de capa |
| **Devolução** | O colportor devolve livros que tinha à consignação; voltam ao stock da loja | − preço de capa |
| **Compra com desconto** | O colportor compra os livros com o desconto da sua percentagem e fica com eles | + preço com desconto |

- O preço é sempre o **preço de capa** do catálogo, sem as promoções do site, porque é a esse preço que o colportor vende.
- Produtos com tamanhos ou variantes (t-shirts, uniformes) não entram em guias.
- **Limite em consignação:** se o saldo do colportor passar o limite (na ficha dele, ou o das Definições), a entrega é recusada. Com 0 não há limite.
- Cada movimento fica também no histórico de stock da loja, com o número da guia.

### Relatório semanal

O colportor envia-o na sua área (`/colportor`), pelo telemóvel. A equipa pode lançá-lo por quem não tem telemóvel ("Lançar por um colportor"). O relatório tem:

- horas, casas ou famílias visitadas, orações, literatura oferecida, inscrições em estudos bíblicos, interessados e baptismos (as perguntas do relatório de Evangelismo pela Literatura);
- **vendas à consignação**: só dos livros que tem em mão, e nunca mais do que tem;
- **vendas de livros que comprou**: contam para as estatísticas, mas não mexem em dinheiro, porque já os pagou;
- **interessados** (nome, telefone, bairro), para a equipa encaminhar ao pastor do distrito;
- notas e experiências da semana.

O fluxo é: rascunho → **enviado** → a equipa **valida** ou **devolve** com o que corrigir.

- Só a validação mexe em valores: as vendas à consignação saem do stock em mão e a comissão entra na conta.
- A percentagem usada é a que vigorava no **último dia da semana** do relatório.
- O separador mostra quem não enviou relatório nas duas últimas semanas fechadas.

### Contas (separador "Contas")

Cada colportor tem uma conta corrente:

- **saldo positivo** = deve à Livraria (livros à consignação, ou vendidos e por pagar);
- **saldo negativo** = a Livraria deve-lhe (por exemplo, comissões de vendas no site).

Exemplo: leva 10 livros de 1 000 Kz (+10 000), vende 6 a 30% (−1 800 de comissão), paga 4 200 (−4 200) e devolve 4 (−4 000). O saldo fica em 0.

- **Registar pagamento:** recebido do colportor, ou pago ao colportor, com o método (numerário, Multicaixa Express, transferência) e a referência.
- **Correcção à mão:** só com explicação, e fica no extracto.
- **Extracto** para imprimir, com o saldo depois de cada movimento e os livros em mão. O colportor vê o mesmo extracto na sua área.

### Reclassificação

A Working Policy reclassifica os colportores no início de cada ano. O separador sugere, para cada colportor activo:

- Estudante mantém-se;
- média abaixo das horas de tempo inteiro (com pelo menos 4 relatórios) → **Tempo parcial**;
- meses e horas de Credenciado → **Credenciado**; de Licenciado → **Licenciado**.

Os requisitos estão em **Definições**. Cada sugestão aplica-se uma a uma, com o motivo no histórico.

## 4. Vendas no site e resumo

### Vendas no site com o código do colportor

- Cada colportor tem um **link de vendas** na sua área: `livrariaadventista.com/?c=CPT-0007`. Pode copiá-lo ou partilhá-lo por WhatsApp.
- Quem abre o link fica com o código guardado no browser durante 30 dias. No checkout aparece o campo **"Código do colportor (opcional)"** já preenchido. O cliente também o pode escrever à mão.
- A base de dados confirma o código. Um código errado, de um colportor que não está activo, ou do próprio colportor a comprar com a sua conta, é ignorado: **nunca impede a compra**, só não dá comissão. Para comprar para si, o colportor usa a guia de compra com desconto.
- **A comissão entra na conta do colportor quando a encomenda está paga e entregue.** Calcula-se com a percentagem do modo "Venda no site", por tipo de produto, em vigor no dia da encomenda, sobre o valor dos produtos (sem portes).
- Se depois a encomenda for cancelada ou reembolsada, a comissão é anulada com uma correcção no extracto.
- O colportor vê as suas encomendas do site (número, data, valor, estado e comissão paga, prevista ou anulada), **sem os dados do cliente**.
- **Encomenda sem o código:** em Contas → colportor → "Encomenda do site sem o código", com o número da encomenda. Precisa da permissão "Encomendas", e só funciona enquanto a comissão não tiver entrado.

### Resumo

O separador **Resumo** tem:

- os números do momento: colportores activos, candidaturas e relatórios por decidir, livros à consignação e quanto há a receber;
- uma tabela **por colportor, igreja, distrito, província ou campo**, para este ano, os últimos 3 meses, este mês ou desde o início: horas, visitas, estudos bíblicos, baptismos, vendas e comissões;
- exportação para Excel.

O painel abre no Resumo, ou nas Candidaturas quando há alguma por decidir.

### Avisos e atalhos

- **Avisos à equipa:** uma candidatura nova e cada relatório enviado geram um aviso no sino do painel para os administradores e para os gestores com a permissão "Colportagem". Saem também por email, WhatsApp ou push, conforme a equipa de cada pessoa em "Equipas e alertas". Abrir o aviso leva ao separador Colportagem.
- **Rodapé do site:** "Ser colportor", na coluna "Comprar", leva à candidatura.
- **Perfil:** quem é colportor vê o atalho "Área do colportor" no seu perfil.

## 5. Entregas por colportor

Decisões do dono (2026-11-08). Migrações `20261108100000_entregas_por_colportor.sql` e `20261108170000_entregas_refinamento.sql` (mínimo por entrega, entrega dada por outra pessoa, o gatilho que compara valores, o quadro da equipa e os sinais em tempo real) , `20261108200000_entregas_casos_limite.sql` (reembolso e colportor que deixa de estar activo) e `20261108220000_entregas_loja_e_robustez.sql` (a loja de levantamento e o pagamento protegido).

**Que encomendas vão a um colportor.** Só as entregas ao domicílio (normal ou expressa) **já pagas**: por transferência confirmada, pelo gateway ou ao balcão, ou porque o total baixou e o que já foi pago chega. As de pagamento na entrega ficam com a loja, porque o colportor não recebe dinheiro dos clientes. Os levantamentos na loja nunca vão a colportores.

**Quem recebe a oferta.** O colportor activo mais próximo do cliente, com conta ligada e com «Recebe entregas» ligado:
1. muito perto por GPS (até `delivery_near_km`, 15 km por omissão), quando o cliente partilhou a localização no checkout e o colportor registou a dele;
2. depois, o do mesmo município de entrega;
3. depois, perto por GPS (até `delivery_max_km`, 50 km);
4. por fim, o da mesma província.

**Quem não tem os livros nem loja ao alcance não recebe a oferta**: não a podia cumprir, e o cliente perdia o prazo de cada oferta. Por exemplo, em Luanda ainda não há loja, por isso só recebe quem tiver todos os livros à consignação; sem ninguém, a encomenda vai logo para a equipa. Sem lojas registadas não há esta regra.

Em cada nível, primeiro quem tem todos os livros à consignação, depois o mais perto, o menos ocupado e quem recebeu uma oferta há mais tempo. A mesma encomenda nunca é oferecida duas vezes ao mesmo colportor, nem ao próprio cliente.

**Prazo.** O colportor tem 2 horas (`delivery_offer_minutes`), contadas em horário de funcionamento (Equipas e alertas → horário), para aceitar ou recusar. Por exemplo, uma oferta feita às 17h50 de sexta acaba às 9h50 de sábado. Recusa, ou o prazo esgotado (o agendador `entregas-colportores` corre de 5 em 5 minutos), passa a oferta ao seguinte. Sem mais ninguém, a encomenda fica com a equipa (`orders.delivery_route = 'loja'`) e a equipa de entregas é avisada.

**Os avisos ao colportor** chegam ao sino da área do colportor, por WhatsApp para o telefone dele e por push. O texto diz onde é a entrega, a distância, quanto ganha, se tem os livros consigo e o prazo. O WhatsApp só deixa mandar texto livre a quem escreveu à Livraria nas últimas 24 horas. Por isso, quando há um template aprovado em Aplicações → WhatsApp («Template dos avisos à equipa e aos colportores», com 2 campos: título e texto), os avisos vão por esse modelo, como os da equipa.

**Depois de aceitar:**
- O colportor passa a ver o nome, o telefone, a morada, o contacto próximo, a nota e a localização do cliente. Antes de aceitar vê só a zona e os livros.
- **Livros do stock dele** (tem todos à consignação): sai logo. Quando marca «Entregue», o sistema faz sozinho uma guia de devolução (GUI-). Os livros saem do stock dele e voltam ao da loja, que já os tinha descontado ao encomendar, e deixam de lhe ser cobrados na conta corrente.
- **Livros da loja** (não tem todos): a oferta já diz em que loja se levantam, e o colportor vê a morada, o horário, o contacto e o mapa. A equipa dessa loja recebe «Preparar para o colportor», prepara o pacote e marca **«Entregue ao colportor»** na encomenda. A encomenda fica «expedida» e só então ele pode sair. A loja é a da província dele; depois, a mais perto por GPS (até `delivery_max_km`); depois, a da província do cliente. Fica decidida na oferta, mesmo que ele mude de localização.
- O colportor marca «Saiu para entrega» e «Entregue», com o nome e a assinatura de quem recebe («Assine como está no Bilhete») e, se quiser, o número do Bilhete. O cliente é avisado de cada passo, como quando a equipa os marca.
- **Quanto ganha:** os portes da encomenda, nunca menos do que o **mínimo por entrega** (`delivery_min_fee`, em Definições; 0 por omissão). Entra na conta corrente dele como «Portes de entrega» (a Livraria deve-lho). Com envio grátis e o mínimo a 0, a entrega não lhe rende nada: a diferença entre os portes e o mínimo paga-a a Livraria.
- **Se outra pessoa marcar «Entregue»** (o cliente a confirmar a recepção, ou a equipa no painel) com a entrega ainda com o colportor:
  - se ele já tinha os livros (do stock dele, ou levantados na loja), conta como entrega dele, com a guia e o que ganha, e é avisado;
  - se ainda não os tinha, a entrega dele fecha como «libertada», sem ganho, e é avisado para falar com a equipa se a fez.
  - Se a guia não se puder fazer (por exemplo, já não tem os livros à consignação), fica também «libertada», e a equipa resolve à mão.
- «Não posso entregar» (antes de levantar os livros na loja) devolve a entrega, que passa ao seguinte. A equipa pode **«Retirar ao colportor»** a qualquer momento, com o motivo, e passa a ser ela a entregar. Cancelar a encomenda cancela a entrega e avisa o colportor.

**Se a equipa expedir a encomenda com uma oferta à espera**, a oferta fecha, o colportor é avisado e a encomenda fica com a equipa. Assim não há duas entregas.

**Uma falha a oferecer nunca trava o pagamento**, que pode vir do webhook do gateway: o pagamento fica registado e o agendador volta a tentar de 5 em 5 minutos. Uma encomenda com problema também não pára as outras.

**Nos alertas de encomendas paradas**, uma encomenda com um colportor diz «com um colportor: ver Colportagem → Entregas».

**Se a encomenda deixar de estar paga** (reembolso) com a entrega em curso, a entrega fecha como «Cancelada», sem portes, e o colportor e a equipa são avisados. Se ele já tinha os livros da loja, ou a encomenda já saiu, o aviso à equipa é urgente e a encomenda fica com ela. Se voltar a ficar paga antes de sair, vai ao colportor seguinte. Uma entrega já feita não muda.

**Se o colportor deixar de estar activo** (suspenso, inactivo ou sem conta), as entregas dele fecham como «Devolvida» e deixa de ver os dados do cliente. Uma oferta, ou uma entrega que ainda não saiu, passa logo ao colportor seguinte. A que já saiu ou tem os livros da loja com ele fica com a equipa, com aviso urgente para os recuperar.

**Onde se vê:**
- área do colportor → Entregas: «Aceito fazer entregas», a localização («Registar a minha localização», só dentro de Angola), as ofertas com o tempo que falta, as entregas aceites e os últimos 30 dias, com o motivo de cada uma que fechou;
- painel → Colportagem → **Entregas** (`?tab=colportagem&vista=entregas`): o quadro da equipa. Os avisos «Preparar para o colportor» e «Entrega pela equipa» abrem-no. A vista mostra um número com as que há por preparar. O quadro, o painel da encomenda e a área do colportor actualizam-se sozinhos (sinal `entregas`, nos canais `painel` e `conta:<id>`) e, sem tempo real, de minuto a minuto.
  - Em curso, por esta ordem: primeiro as que é preciso preparar na loja (com «Entregue ao colportor» ali mesmo), depois as ofertas à espera, com o prazo, depois as que estão com o colportor.
  - As encomendas que ficaram com a equipa, com o motivo.
  - Por colportor, no período escolhido (7, 30, 90 ou 365 dias): oferecidas, entregues, recusadas, sem resposta, devolvidas, em curso e quanto ganhou. Exporta para Excel.
  - Não mostra dados do cliente além da zona: para o resto, abre-se a encomenda.
- painel → cada encomenda ao domicílio: a quem foi oferecida, quem aceitou e as acções;
- painel → Colportagem → Definições: ligar e desligar, o prazo, as distâncias e o mínimo por entrega;
- ficha de cada colportor: «Recebe entregas» e a data da localização.

**Técnico:**
- tabela `colporteur_deliveries` (uma oferta activa por encomenda; RLS: a equipa e o próprio);
- `orders.delivery_route` e `orders.delivery_colporteur_id`;
- `private.delivery_candidates`, `private.offer_next_delivery` e os gatilhos `orders_entrega_colportor`, `orders_entrega_sem_pagamento`, `orders_entrega_equipa_expediu` e `colporteurs_entregas_fecham`; `private.delivery_pickup_store` e `colporteur_deliveries.pickup_store_id` (a loja);
- `private.colporteur_delivery_complete` (a guia, os portes e o fecho, usada pelo colportor e pelo gatilho; o passo do colportor liga `app.colporteur_step` para o gatilho não fechar a entrega duas vezes);
- funções `colporteur_delivery_respond`, `colporteur_delivery_step`, `colporteur_delivery_handover` e `colporteur_delivery_take_back` (só service role) e `colporteur_my_deliveries`, `order_colporteur_deliveries`, `colporteur_deliveries_board` (o quadro; «Gerir encomendas» ou «Gerir colportores»), `colporteur_set_location` e `colporteur_set_accepts_deliveries`;
- rotas `/colportores/entregas/responder`, `/colportores/entregas/passo`, `/admin/colportores/entregas/entregue-ao-colportor` e `/admin/colportores/entregas/retirar`;
- avisos do tipo `colportagem` (`dispatchColporteurNotifications`);
- testes: 103 cenários em PGlite, em `scripts/pglite/entregas.mjs`; ecrãs em `ColporteurDeliveries.screen.test.jsx` e `DeliveriesPanel.test.jsx`.

## Técnico

- Migração `supabase/migrations/20261107100000_registo_igreja.sql`:
  - tabelas `church_fields`, `church_districts`, `churches`, `pastors` e `pastor_assignments`, com RLS;
  - funções `church_assign_pastor`, `church_end_assignment`, `church_merge_districts`, `church_merge_pastors` e `church_registry_import`;
  - permissões `manage_church_registry` e `manage_colporteurs` em `users_admin_update`.
- A importação é preparada no browser (`app/web/src/lib/churchImport.js`, com testes) e gravada numa só transacção pela função da base de dados.
- Os testes SQL correram em PGlite: RLS por permissão, geografia coerente, transferência, fusões e importação idempotente.
- Migração `20261107101000_colportores.sql`:
  - tabelas `colporteurs`, `colporteur_events`, `colporteur_invites` (só o hash do token), `colporteur_commission_rules`, `colporteur_commission_overrides` e `colporteur_settings`;
  - código `CPT-` (4 dígitos) no mesmo contador dos outros códigos, e `normalize_person_code` aceita `cpt7`.
  - Estado, categoria, código e conta só mudam pelas funções `colporteur_set_status`, `colporteur_set_category`, `colporteur_claim_invite` e `colporteur_unlink_account`. Um trigger recusa o resto.
- A candidatura entra por `POST /colportores/candidatura` na Edge Function: limite de 3 por minuto por IP, campo isco e validação de novo em `colporteur_apply` (só service role). A lista pública de igrejas (`church_directory`) não tem contactos.
- A percentagem decide-se em `private.colporteur_pct`, com uma cópia em `app/web/src/lib/colporteurCommission.js` para o painel. Os casos de `colporteurCommission.cases.json` correm contra as duas, no vitest e no PGlite.
- Migração `20261107102000_colportagem_movimentos.sql`:
  - tabelas `colporteur_documents` (guias), `colporteur_reports`, `colporteur_stock_moves` (stock em mão) e `colporteur_ledger` (conta corrente);
  - funções `colporteur_issue_document`, `colporteur_report_save`/`_validate`/`_return`, `colporteur_record_payment`, `colporteur_ledger_adjust` e `colporteur_overview`;
  - as tabelas só se lêem pela API (a equipa tudo, o colportor o seu); escreve-se só pelas funções;
  - motivos novos em `stock_movements`: `consignacao`, `devolucao_consignacao` e `compra_colportor`.
- `formata_codigo` deixou de cortar números maiores do que a largura (o funcionário 1000 ficaria `FUN-100`).
- Migração `20261107103000_colportagem_vendas_site.sql`:
  - `orders.colporteur_code` e `orders.colporteur_id`; o trigger `orders_colportor_codigo` confirma o código e nunca aceita o id vindo de fora;
  - o trigger `orders_colportor_comissao` mete a comissão (paga e entregue) ou a anulação (cancelada ou reembolsada) na conta corrente, uma vez por encomenda;
  - `colporteur_overview` passa a trazer as vendas no site.
- O checkout (`POST /checkout`) aceita `colporteurCode`. Sem a migração, o `place_order` ignora a coluna, e por isso a Edge Function pode ser publicada antes.
- Migração `20261107110000_colportagem_avisos.sql`: tipos `colporteur_application` e `colporteur_report` em `staff_notifications`, avisados por triggers em `colporteurs` (inserção) e `colporteur_reports` (passagem a enviado).
