# Produção da Editora, funcionários e saídas de dinheiro

Pedido do dono (2026-11-08): "produção, processos, catálogos, produtos, clientes, funcionários,
pagamento". Escolhas dele: um **módulo de produção** da Editora; nos funcionários, a **ficha**, os
**responsáveis por etapa** e os **salários**; nos pagamentos, os **pagamentos a fornecedores e à
gráfica** e **melhorar os pagamentos dos clientes**.

Base de dados: migrações `20261108190000_funcionarios`, `20261108191000_producao` e
`20261108192000_saidas` (e `20261108193000_sinais_afinados`, ver "Tempo real"). Painel: grupos
**Editora** (Produção) e **Pessoal** (Funcionários), e **Relatórios → Entradas e saídas**.

## Permissões

Três chaves novas, que um administrador dá em Utilizadores → Equipa, a uma pessoa ou a um cargo
(os administradores têm-nas todas). Os oito cargos de partida não as têm: quem já tem um cargo não
ganha acesso às finanças sem um administrador o dar.

| Permissão | Abre | O que pode |
|---|---|---|
| **Produção da Editora** (`manage_production`) | Editora → Produção | ordens, etapas, responsáveis, prazos, custos, fornecedores; concluir (a tiragem entra no stock) e cancelar |
| **Funcionários** (`manage_staff`) | Pessoal → Funcionários (Fichas) | criar, mudar e apagar fichas. **Não vê salários** |
| **Finanças (saídas)** (`manage_finance`) | Produção (só ler, e Contas e pagamentos), Funcionários (Fichas a ler e Salários), Relatórios → Entradas e saídas | pagar fornecedores e anular pagamentos; salário, IBAN e NIF de cada um; gerar, acertar, pagar e anular salários; o relatório de entradas e saídas |

Separar quem regista a produção de quem paga é de propósito: a mesma pessoa não cria um custo e
paga-o. As mesmas chaves estão em `lib/permissions.js` (painel), em
`supabase/functions/app/permissions.ts` e em `private.permission_keys` (a base de dados, redefinida
na migração `funcionarios`): a Edge Function e `private.clean_permissions` deitam fora, ao gravar
uma pessoa ou um cargo, as chaves que não conhecem. Um teste confirma que as três listas são
iguais (`lib/permissions.test.js`), e o RLS de cada tabela usa-as.

## Produção (Editora → Produção)

Cada título que se produz (título novo, nova edição ou reimpressão) tem uma **ordem de produção**
com o código `PRD-`.

- **Etapas:** a ordem nova recebe as do seu tipo (`production_default_stages`):
  - reimpressão: ficheiros conferidos → prova da gráfica aprovada → impressão → acabamento →
    recepção na loja;
  - título novo ou nova edição: original recebido → revisão → paginação → capa → prova aprovada →
    impressão → acabamento → recepção na loja.

  Cada etapa tem **responsável** (uma ficha de funcionário), **prazo** e estado: por fazer, em
  curso, feita ou "não se aplica". Acrescentam-se, tiram-se, mudam de nome e de ordem.
  Começar uma etapa põe a ordem "em curso".
- **Etapas e prazos:** tudo o que falta fazer nas ordens abertas, com as atrasadas primeiro, por
  responsável ("As minhas", pela ficha ligada à conta). "Começar" e "Feita" ali mesmo.
- **Custos:** o que se gasta em cada ordem (impressão, papel, capa…), com o fornecedor. O custo por
  exemplar é o total a dividir pela tiragem, ou pelo que entrou no stock depois de concluída.
- **Concluir:** só com as etapas todas feitas (ou "não se aplica") e a ordem ligada a um produto do
  catálogo. A quantidade recebida entra no stock **uma só vez** (`production_complete`). No
  histórico do stock fica o motivo "Produção", com o código da ordem e quem concluiu.
- **Ordem fechada** (concluída ou cancelada): só as notas mudam. Cancelar pede o motivo. Só se
  apaga uma ordem ainda planeada.
- **Fornecedores** (`FOR-`): gráfica, papel, design, revisão, tradução, transporte. Cada um tem
  contacto, NIF e IBAN. Mudar um IBAN avisa os administradores. Um fornecedor com ordens, custos ou
  pagamentos não se apaga: desactiva-se.
- **Contas e pagamentos:** o que se deve a cada fornecedor (custos − pagamentos). Só as finanças
  registam um pagamento ("Pagar" sugere o que se deve). **Um pagamento não se corrige nem se
  apaga: anula-se, com o motivo**, e regista-se outro. Tudo fica no registo de segurança.

## Funcionários (Pessoal → Funcionários)

- **Fichas:** toda a gente que trabalha, **com ou sem conta no painel** (vendedores das lojas,
  estafetas, gráfica). Cada ficha tem nome, cargo, departamento, loja, contactos, admissão, saída
  e estado (activo, de férias, de baixa, saiu).
  - O código `FUN-` sai do mesmo contador das contas. **Cada pessoa fica com um só código:** a ficha
    ligada a uma conta da equipa usa o código da conta, e uma conta promovida a equipa mais tarde
    usa o da ficha.
  - Quem sai fica com o estado "saiu" e a data de saída; apagar a ficha é para enganos.
- **Salário e pagamento** (no fim da ficha, só finanças): salário base, subsídios fixos, IBAN e
  NIF. Ficam numa tabela à parte (`staff_pay_profiles`), que só as finanças lêem: quem gere as
  fichas não vê salários. Mudar o salário ou o IBAN avisa os administradores.
- **Salários** (só finanças): um mês de cada vez.
  - **Gerar o mês** cria uma linha por pessoa com salário base (activos, de férias, de baixa, e
    quem saiu durante o mês).
  - Subsídios e descontos acertam-se na linha. **O sistema não calcula INSS nem IRT:** os
    descontos escrevem-se à mão.
  - **Pagar**, um ou todos os por pagar, pede a data, a forma e a referência. Pago ou anulado, não
    muda mais; uma linha anulada deixa gerar outra. Cada pagamento e cada anulação ficam no registo
    de segurança.

## Entradas e saídas (Relatórios)

`cash_flow_report(de, até)`, só finanças:

- **Entradas:** os pagamentos dos clientes confirmados, menos os reembolsos. É a mesma conta de
  Pagamentos e caixa.
- **Saídas:** fornecedores e salários pagos.
- **Saldo**, um gráfico por dia (ou por mês, em mais de 62 dias), com a vista em tabela, e o que
  se pagou a cada fornecedor.
- **Por pagar hoje:** a fornecedores e os salários por pagar.
- Os dias contam pela hora de Luanda.

O gráfico usa as posições 1 e 2 da paleta categórica de referência (azul e laranja, nunca o verde
e o vermelho, que são de estado), validadas nas superfícies do painel, clara e escura.

## Pagamentos dos clientes: o que falta configurar

No topo de **Vendas → Métodos de pagamento**, a lista "Para os clientes pagarem sem dúvidas"
(`lib/paymentSetup.js`) diz o que falta e leva ao sítio onde se resolve. O estado em produção a
2026-11-08 era este, e **é o dono que decide os valores**:

| O que falta | Onde |
|---|---|
| Nome legal e NIF da empresa (saem no recibo) | Configurações → Contacto |
| Telefone e WhatsApp da loja (vazios) | Configurações → Contacto |
| Prazo para cancelar encomendas por pagar (0 = nunca; o stock fica reservado) | Configurações → Regras da loja |
| Método activo sem IBAN, número, link nem QR (hoje nenhum: o Multicaixa está desligado) | a lista dos métodos, logo abaixo |
| Gateway por ligar (o Multicaixa Express é confirmado à mão) | o cartão "Gateway de pagamentos" e `docs/PAGAMENTOS.md` |

## Tempo real

Os ecrãs novos usam os sinais em tempo real do site (migração `20261108132000_sinais_em_tempo_real`,
`lib/realtimeSignals.js` e `hooks/useSignal.js`). Quando uma instrução muda uma destas tabelas, a
base de dados manda **um** sinal no canal privado `painel` (o que a equipa ouve), sem dados — só o
nome da área. O ecrã volta a pedir os dados pelo caminho de sempre, com o RLS de sempre: um sinal
«financas» que chegue a quem não tem as finanças não lhe mostra nada.

| Sinal | Tabelas | Quem volta a ler |
|---|---|---|
| `producao` | fornecedores, ordens, etapas, custos e pagamentos a fornecedores | Produção (todas as vistas) |
| `funcionarios` | fichas | Produção (os responsáveis) e Funcionários |
| `financas` | pagamentos a fornecedores, salários, dados de pagamento e pagamentos dos clientes (as entradas) | Funcionários (finanças), Salários e Entradas e saídas |

Também `catalogo` (o stock que a produção põe ao concluir) faz a Produção voltar a ler. A leitura
em silêncio não apaga o que se está a escrever: as partes iguais ficam com o mesmo objecto
(`lib/keepUnchanged.js`) e cada salário só se volta a montar quando muda. Sem o canal ligado (rede
fraca, serviço em baixo), os ecrãs voltam a ler de minuto a minuto; com ele, de 5 em 5 minutos. A
barra do topo diz **Em tempo real** com o canal ligado, e o ícone de actualizar roda enquanto
actualiza.

- **Um sinal por instrução** (`private.painel_realtime_signal`, gatilhos `for each statement`):
  uma ordem nova com as suas etapas são dois sinais, não um por etapa.
- **Visitas aos livros** (`20261108193000_sinais_afinados`): o sinal `catalogo` saía em cada
  actualização de `stock_books`, também na contagem das visitas (`increment_book_views`) — cada
  visita a um livro fazia todos os painéis abertos voltar a pedir o catálogo. Agora só há sinal
  quando muda alguma coisa além das visitas e da data de alteração.

## No Início e na navegação

Quem gere a produção ou as finanças vê no Início, em **Precisa de atenção**, o que piora se
ninguém fizer nada: as etapas atrasadas (a mais atrasada, com o responsável; urgente com mais de
7 dias), as ordens com o prazo passado e as que têm as etapas todas feitas à espera de concluir;
e, para as finanças, os salários de meses fechados por pagar (e os do mês, a partir do dia 25) e o
que se deve aos fornecedores. "Ver" abre a vista certa. O número das etapas atrasadas aparece ao
lado da Produção e o dos salários atrasados ao lado dos Funcionários. Tudo em
`lib/editoraAttention.js` (testado com datas fixas) e `hooks/useEditoraAttention.js`, com os
sinais em tempo real. A tabela completa está em PAINEL_ADMIN.md, §4.1.

## Testes

- `scripts/pglite/producao.mjs`: 96 cenários, sem Docker (instruções em `scripts/pglite/base.mjs`).
  Cobrem as permissões e o RLS de cada papel, os códigos (um só FUN- por pessoa), as etapas por
  omissão, concluir uma só vez com a entrada no stock e o motivo "producao", ordens fechadas,
  pagamentos que só se anulam, salários gerados, pagos e anulados, os avisos de segurança (IBAN e
  salário), o relatório de entradas e saídas, os sinais do tempo real (com um `realtime.send`
  mínimo: um por instrução, e nenhum por uma visita a um livro) e as chaves das permissões
  (`users_admin_update` guarda as novas). Sem a migração `sinais_afinados`, dois falham.
- **vitest:**
  - `lib/production.test.js` (prazos, progresso, custo por exemplar, contas dos fornecedores,
    meses, totais dos salários);
  - `lib/paymentSetup.test.js` (a lista, com o estado de produção);
  - `lib/permissions.test.js` (as chaves iguais no painel, na Edge Function e na última
    `private.permission_keys`);
  - `lib/keepUnchanged.test.js` (a leitura em silêncio guarda as partes iguais);
  - a navegação, as permissões por área e o «Em tempo real» da barra do topo.
- **Verificado no browser** (Chromium, site em desenvolvimento ligado a um Supabase local completo):
  1. fornecedor criado, com o telefone e o IBAN normalizados;
  2. ficha com salário;
  3. ordem criada a partir do produto, com as 5 etapas;
  4. responsável e custo;
  5. "concluir" com etapas por fazer, que diz quais faltam;
  6. etapas feitas e concluída, com 296 exemplares no stock e o movimento "producao";
  7. pagamento ao fornecedor (o que falta: 450 000 − 300 000);
  8. salários gerados, com descontos, e pagos (líquido 165 200);
  9. entradas e saídas;
  10. a lista dos pagamentos;
  11. tempo real, com o serviço de tempo real do Supabase local: a barra diz «Em tempo real», um
      fornecedor criado noutra sessão aparece sozinho (menos de 1 s), uma visita a um livro não
      faz o painel pedir o catálogo e mudar um preço faz.

## Por decidir (dono)

- **Impostos dos salários:** o sistema não calcula INSS (3 % e 8 %) nem IRT. Escrevem-se nos
  descontos. Calcular sozinho exige a tabela do IRT em vigor e a confirmação de um contabilista.
- **Responsáveis sem acesso à produção:** quem não tem a permissão da produção não marca as suas
  etapas como feitas. Hoje marca-as quem gere a produção. Abrir isso a cada responsável é um
  passo seguinte.
- **Alertas de prazo:** as etapas atrasadas aparecem nos números do painel e em "Etapas e prazos".
  Ainda não há aviso por email nem push.
