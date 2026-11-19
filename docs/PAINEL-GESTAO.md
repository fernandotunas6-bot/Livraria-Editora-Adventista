# Painel de Gestão — `gestao.livrariaadventista.ao`

> **Estado: construído** (migração `20261119140000_painel_gestao`, `src/pages/PainelGestaoPage.jsx`,
> `src/components/gestao/`). As decisões do dono estão em §11; a configuração do domínio em §13.

Um ecrã único para a direcção acompanhar **todas as vendas de todas as livrarias, ao vivo**: o que se está a vender
agora, quanto se vendeu hoje e no mês, a **meta do mês** e quanto falta. No fim do mês o mês **fecha** (fica
registado com o resultado) e o painel recomeça com a meta do mês novo — como os ecrãs da bolsa, mas para as vendas.

Serve a Livraria Adventista. Está desenhado para servir outros clientes do KanGest mais tarde (§10).

## 1. Quem usa e onde

| Quem | Vê | Pode |
|---|---|---|
| Direcção (administrador, `view_reports`) | Todas as lojas, todos os canais | — |
| Quem lança relatórios (`edit_reports`) | Igual | Definir as metas do mês |
| Gerente de uma loja (permissão **Painel da sua loja**, `view_store_dashboard`) | Só a loja da sua ficha de funcionário | — |

- **Computador** (ecrã inteiro), **televisão na sede** (modo TV, §6.8) e **telemóvel** (uma coluna).
- Entra-se com a conta do site, como no painel (`/admin`), com a verificação em dois passos da equipa.
- `gestao.livrariaadventista.ao` é um domínio personalizado do mesmo projecto do Cloudflare Pages: o site, ao abrir
  nesse endereço, mostra só o Painel de Gestão (o resto do site não aparece aí). Mesmas contas, mesmas permissões, um
  só deploy. Também abre em `/gestao` e no painel (Relatórios → Painel de Gestão).

## 2. De onde vêm os números

| Fonte | O quê | Como chega |
|---|---|---|
| **KanGest** (balcão das lojas) | Cada venda (FR, FT, ND) e cada nota de crédito, no momento | Aviso `documento.emitido` / `documento.anulado` → tabela nova `vendas_ao_vivo` |
| **Site** (loja online) | Cada encomenda paga | Gatilho quando `payment_status` passa a `paid` → `vendas_ao_vivo` (canal `online`) |
| Histórico | Meses anteriores ao painel | `kangest_vendas`, `vendas_anos` (os números do PowerPoint) e os fechos (§5) |

**`vendas_ao_vivo`** — uma linha por documento:

| Coluna | Exemplo |
|---|---|
| `origem`, `documento` | `kangest:central:1532` / `site:<order id>` (único: o mesmo aviso duas vezes não conta duas vezes) |
| `quando` | `2026-11-19 10:42:07+01` |
| `store_id` | A loja (pelo armazém do KanGest, ou a loja da encomenda) |
| `canal` | `balcao` · `online` |
| `tipo`, `numero` | `FR`, `FR P12026/1532` |
| `total` | Kz com IVA; **negativo** nas notas de crédito |
| `itens` | `[{ referencia, titulo, quantidade, total }]` (para os mais vendidos e a fita) |
| `anulado` | Venda anulada: deixa de contar, fica na fita riscada |

Quando entra uma linha, a base manda o sinal **«vendas»** pelo tempo real que o painel já usa (tópico `painel`); o
ecrã pede os números de novo. Sem tempo real, actualiza de 30 em 30 segundos.

## 3. As contas (definições)

Todas na hora de Angola (UTC+1). Valores **com IVA**, em Kz.

| Número | Definição |
|---|---|
| **Vendas** | FR + FT + ND − NC, sem anulados. Online: encomendas pagas, pelo dia do pagamento, sem portes |
| **Hoje** | 00:00–23:59 de hoje |
| **Mês** | Do dia 1 até agora |
| **Meta do mês** | A da loja; a da empresa é a soma das lojas (ou uma própria, se definida) |
| **% da meta** | Vendas do mês ÷ meta |
| **Falta** | Meta − vendas do mês (0 se já passou) |
| **Ritmo necessário** | Falta ÷ dias que faltam (com hoje) |
| **Projecção** | Vendas do mês + média por dia dos dias já passados × dias que faltam |
| **Ritmo ideal** (linha da meta no gráfico) | Meta × dias passados ÷ dias do mês |
| **Ticket médio** | Vendas ÷ n.º de vendas (sem as notas de crédito no divisor) |
| **Variação de hoje** | Hoje até agora vs. o mesmo dia da semana passada até à mesma hora (▲ verde / ▼ vermelho) |

## 4. Metas

- Tabela `metas` (`store_id` — vazio = empresa —, `ano`, `mes`, `valor`, `definida_por`, `definida_em`).
- Define-se no próprio painel (botão **Metas**, `edit_reports`): uma grelha lojas × meses, como o «Lançar vendas».
- **Proposta automática** para o mês seguinte: as vendas do mesmo mês do ano passado × (1 + crescimento do ano), ou
  a previsão anual ÷ 12 (`vendas_anos.meta_anual`). Aceita-se com um clique ou muda-se.
- Mês sem meta: o painel mostra **«Defina a meta de Dezembro»** em vez da barra (nunca uma meta inventada em silêncio).

## 5. Fecho do mês

- No dia 1 às 00:05 (pg_cron), `fechar_mes()` grava em **`fechos`** uma linha por loja e uma da empresa: vendido,
  meta, % atingida, n.º de vendas, ticket médio, melhor dia, artigo mais vendido, online vs. balcão.
- O fecho é **definitivo** (não se edita). Uma venda do mês anterior anulada depois fica registada à parte como
  correcção do mês fechado.
- O painel recomeça do zero com a meta do mês novo. Durante o primeiro dia mostra uma faixa com o resultado do mês
  que fechou («Novembro fechado: 31,2 M Kz · 104 % da meta ✓»).
- O histórico dos fechos alimenta o gráfico dos 12 meses (§6.7).

## 6. O ecrã

Desktop / TV (16:9), escuro por omissão em modo TV e claro no computador (segue o tema):

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ [logo] Painel de Gestão   Lojas: [Todas ▾]  Canal: [Tudo|Balcão|Online]   ● AO VIVO  10:42:07 [TV] │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ ◀ 10:42 HUAMBO ▲ 11 400 · O Desejado ×2 │ 10:41 ONLINE ▲ 7 200 · Caminho a Cristo │ 10:39 LUB… ◀ │  ← fita
├───────────────┬───────────────┬────────────────────────┬───────────────┬──────────────────────┤
│ HOJE          │ MÊS           │ META DE NOVEMBRO       │ PROJECÇÃO     │ VENDAS HOJE          │
│ 1 245 300 Kz  │ 24 810 000 Kz │ ███████████░░░  79 %   │ 32 900 000 Kz │ 87 · ticket 14 314   │
│ ▲ 12 % vs qui │ 19 de 30 dias │ falta 6,5 M · 590 k/dia│ ▲ 105 % meta  │ 214 itens            │
├───────────────┴───────────────┴────────────────────────┼───────────────┴──────────────────────┤
│ MÊS EM CURSO  (acumulado vs. ritmo da meta)            │ LOJAS                               │
│   ▁▂▃▄▅▆▇ acumulado ─── ritmo ideal ‥‥ meta            │ Huambo    ████████░░ 84 %  12,1 M   │
│   ▌▌▌▌▌▌▌ barras: vendas de cada dia                   │ Lubango   ██████░░░░ 71 %   7,3 M   │
│                                                        │ Catumbela █████░░░░░ 62 %   4,1 M   │
├────────────────────────────────────────────────────────┤ Online    ████████░░ 88 %   1,3 M   │
│ HOJE, HORA A HORA (vs. média deste dia da semana)       ├─────────────────────────────────────┤
│   área: hoje   linha tracejada: média                  │ CANAL      ◔ balcão 91 % · online 9 %│
├──────────────────────────────┬─────────────────────────┴─────────────────────────────────────┤
│ MAIS VENDIDOS  [Hoje|Mês]     │ ÚLTIMAS VENDAS (ao vivo)                                     │
│ 1 [capa] O Desejado   48 · 273k│ 10:42  Huambo   FR P1 2026/1532   11 400  O Desejado ×2      │
│ 2 [capa] Caminho a C. 31 · 111k│ 10:41  Online   LIV-1088           7 200  Caminho a Cristo   │
│ …                             │ 10:39  Lubango  NC P2 2026/12     −3 500  devolução  (vermelho)│
├──────────────────────────────┴───────────────────────────────────────────────────────────────┤
│ ÚLTIMOS 12 MESES: barras do vendido, traço da meta, ✓ atingida / ✗ não atingida (dos fechos)    │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 6.1 Barra de cima
Logótipo, título, **filtro de lojas** (Todas / cada loja; o gerente de loja só vê a dele), **canal** (Tudo, Balcão,
Online), indicador **● AO VIVO** (verde a pulsar; cinzento «a actualizar de 30 em 30 s» sem tempo real; vermelho «sem
ligação» com a hora do último dado), relógio e botão **TV**. Os filtros ficam no endereço (`?loja=…&canal=…`), para
guardar um favorito por loja.

### 6.2 Fita (ticker)
Corre da direita para a esquerda com as últimas 30 vendas: hora, loja, ▲ valor, o artigo principal ×quantidade. Uma
venda nova entra com um brilho verde; nota de crédito em vermelho ▼; anulada riscada. Pára ao passar o rato. No
telemóvel passa a lista vertical.

### 6.3 Cartões
Cinco cartões com números grandes (algarismos tabulares, animação de contador — o odómetro do painel de vendas) e uma
linha de contexto por baixo. A barra da meta muda de cor: < 70 % do ritmo ideal âmbar, ≥ 100 % verde, acima da meta
verde com ✓. Ao passar a meta: confetes uma vez e aviso push à direcção (opcional, §11).

### 6.4 Mês em curso
Gráfico de **barras diárias** (vendas de cada dia) com a **linha do acumulado** por cima, a **recta do ritmo ideal**
até à meta e a **linha horizontal da meta**. O dia de hoje cresce ao vivo. Ao passar o rato: o dia, vendido, n.º de
vendas, acumulado e a diferença para o ritmo ideal.

### 6.5 Hoje, hora a hora
Área com as vendas de cada hora de hoje e a **média do mesmo dia da semana** nas últimas 8 semanas (tracejado), para
ver se o dia vai acima ou abaixo do normal — o «gráfico intradiário» da bolsa.

### 6.6 Lojas
Uma linha por loja (e o **Online** como loja): barra da % da meta, vendido no mês, hoje, e uma **sparkline** dos 30
dias. Ordenadas pela % da meta (ranking). Carregar numa loja filtra o painel todo por ela.

### 6.7 Mais vendidos, últimas vendas, histórico
- **Mais vendidos** (hoje / mês): top 10 com capa (do catálogo do site pela referência), quantidade, total e a posição
  de ontem (▲▼).
- **Últimas vendas**: a lista ao vivo, com o número do documento.
- **Últimos 12 meses**: barras do vendido com o traço da meta e ✓/✗ de cada fecho; carregar num mês abre o relatório
  desse mês (o painel de vendas que já existe).

### 6.8 Modo TV (com o ecrã dividido)
Ecrã inteiro, tema escuro, letra maior, sem menus (`?tv=1`, ou o botão **Modo TV**):

- **Ecrã dividido**: a **publicidade** de um lado e o **painel** do outro, ao mesmo tempo — 60/40, 50/50, 40/60, 30/70
  ou só o painel; a publicidade à esquerda ou à direita. Cada televisão guarda a sua escolha (⚙ no canto).
- **Publicidade** (botão **Publicidade da TV**, quem tem «Configurações» ou «Editar relatórios de vendas»): vídeos dos
  ficheiros do site (Supabase), imagens e vídeos do YouTube (`youtube-nocookie`), por ordem e em ciclo. Os vídeos
  passam até ao fim; as imagens e o YouTube pelo tempo de cada um. Sem som por omissão (🔈 no canto para o ligar).
- **Roda** entre a empresa e cada loja (30 s por omissão; pode-se desligar ou mudar).
- Fica aberto o dia todo: o ecrã não se apaga (Wake Lock), reconecta-se sozinho e recarrega à meia-noite e cinco.

### 6.9 Telemóvel
Uma coluna: cartões (deslizar), meta, lojas, últimas vendas; gráficos em largura total.

### 6.10 Rodapé de noticiário
Uma faixa a passar no fundo (na página e, a toda a largura, no modo TV), como nos noticiários: «Última hora» em
vermelho, o logótipo, as notícias com etiquetas coloridas (verde a subir, vermelho a descer, âmbar avisos) e a hora.
As notícias saem dos números (hoje contra a semana passada, a meta e o que falta por dia, a projecção, a loja que
lidera, cada loja hoje, o mais vendido, a última venda); as **mensagens da direcção** vêm primeiro — em
**Publicidade e rodapé → Mensagens do rodapé** (`painel_rodape`), com um «até ao dia» opcional, e chegam às TVs logo.

### 6.11 YouTube na publicidade
Cola-se o endereço (youtube.com/watch, youtu.be ou shorts). O vídeo passa **até ao fim** e depois vem o seguinte: o
leitor do YouTube avisa o painel quando termina (`enablejsapi`). Um vídeo bloqueado pelo dono (sem incorporação) ou
que não arranca em 20 s passa à frente. O único da lista repete. Os segundos só contam para as imagens.

## 7. Aspecto

- A faixa de cima em azul-marinho com o **logótipo branco** e os arcos do logótipo em ciano; os cartões sobrepõem-se
  a ela. A meta num **anel**, o ranking das lojas com medalhas, o pódio dos mais vendidos com as capas, confetes
  quando a meta é atingida. As cores da marca vivem em `src/components/gestao/marca.js` (para outro cliente, troca-se
  só esse ficheiro).
- Cores da marca (logótipo) nos títulos; **verde** sobe / **vermelho** desce / **âmbar** atrás do ritmo — sempre com
  ▲▼ ou texto além da cor.
- Números `tabular-nums`, Kz com espaço de milhares («24 810 000 Kz»; nos cartões, «24,8 M Kz» com o valor inteiro ao
  passar o rato).
- Gráficos com o Recharts (já usado nos relatórios do painel), com as mesmas cores.

## 8. Desempenho e fiabilidade

- Os números saem de funções SQL agregadas (`painel_resumo(loja, canal)`, `painel_mes(…)`, `painel_hoje_por_hora(…)`,
  `painel_mais_vendidos(…)`), protegidas por `can_read_sales_reports()` e pela loja do gerente.
- Uma venda nova = um sinal = um pedido pequeno; nada de ler todas as vendas no browser.
- Se uma loja estiver sem Internet, as vendas dela chegam quando voltar (o KanGest repete os avisos): o cartão da
  loja mostra «último dado às 09:15».

## 9. Segurança

- RLS em `vendas_ao_vivo`, `metas` e `fechos`; escrever só pela Edge Function e pelas funções.
- O painel não mostra clientes nem NIF: só lojas, artigos e valores.
- Mesmo login e dois passos da equipa.

## 10. Outros clientes, mais tarde

O que é da Livraria fica na configuração (logótipo, lojas, domínio); o resto é genérico: o contrato de dados são os
avisos do KanGest (`documento.emitido`, já com a loja), e as tabelas não dependem do catálogo de livros (o catálogo só
dá as capas). Para outro cliente do KanGest, o mesmo painel pode correr noutro projecto (ou como «Painel da empresa»
no próprio serviço do KanGest), com o domínio `gestao.<cliente>`.

## 11. Decisões do dono (2026-11-19)

1. **Metas**: uma por loja; a da empresa é a soma (ou uma própria, se for escrita).
2. **Online**: conta como uma loja à parte, com meta própria (`alvo = 'online'`).
3. **Gerentes de loja**: cada um vê só a sua (`view_store_dashboard` + a loja da ficha de funcionário).
4. **Avisos** (email, WhatsApp ou push, pelo envio de sempre à equipa): quando uma loja (ou a empresa) **passa a meta**
   — no momento, uma vez por mês — e quando **fica atrasada** — do dia 7 em diante, se a projecção ficar abaixo de
   95 % da meta, no máximo uma vez por semana. Recebem a direcção (`view_reports`) e o gerente dessa loja.
5. **TV na sede**: sim, com o ecrã dividido entre a publicidade e o painel.

## 12. Fases

| Fase | O quê |
|---|---|
| 1 | Dados: `vendas_ao_vivo` (avisos do KanGest e encomendas pagas), `metas`, `fechos`, `fechar_mes()`, funções do painel, sinal «vendas» |
| 2 | O ecrã: barra, cartões, mês em curso, lojas, últimas vendas, filtros; domínio `gestao.` |
| 3 | Fita, hora a hora, mais vendidos com capas, histórico dos 12 meses, modo TV, telemóvel |
| 4 | Metas no painel com proposta automática, faixa do mês fechado, avisos push |

Todas as fases estão feitas. Testes: `scripts/pglite/painel-gestao.mjs` (vendas pelo pagamento real, quem vê o quê,
metas, avisos, fecho do mês, publicidade), `src/lib/painelGestao.test.js` (formatos, cores da meta, filtros, TV) e
`kangest.test.ts` (as vendas do balcão a partir dos avisos do KanGest).

## 13. Pôr o domínio a funcionar (uma vez)

1. **Cloudflare → Workers & Pages →** projecto do site **→ Custom domains → Set up a custom domain**:
   `gestao.livrariaadventista.ao`. Com a zona na Cloudflare, o registo DNS (CNAME) fica criado sozinho.
2. **Supabase → Authentication → URL Configuration**: já vai em `supabase/auth/config.json`
   (`https://gestao.livrariaadventista.ao/**`), aplicado pelo deploy; confirmar que aparece na lista.
3. **No KanGest** (cada servidor), no aviso do site (docs/KANGEST.md §2), juntar os eventos `documento.emitido` e
   `documento.anulado`: são eles que trazem as vendas do balcão ao vivo.
4. Dar a cada gerente de loja a permissão **Painel da sua loja** e ligar a conta à ficha de funcionário dele (com a
   loja). A direcção já vê tudo com «Ver relatórios».
5. Na televisão da sede: abrir `https://gestao.livrariaadventista.ao/?tv=1`, entrar, escolher a divisão (⚙) e pôr em
   ecrã inteiro. Na Android TV ou num mini-PC, o browser em modo quiosque abre directamente aí.
