# Relatórios de vendas — cada loja e todas as livrarias

Dois ecrãs no grupo **Relatórios** do painel (`/admin`), com o mesmo desenho e as mesmas contas:

| Secção | Endereço | O que é |
|---|---|---|
| **Todas as livrarias** (`relatorios-lojas`) | `/admin?tab=relatorios-lojas` | O relatório conjunto: a rede inteira num só sítio — totais, ranking, cada loja, cada mês, meses por registar, vídeo e exportações. É aqui que se **lançam** as vendas de todas as lojas de uma vez. |
| **Vendas por loja** (`vendas-huambo`) | `/admin?tab=vendas-huambo` | O painel de uma loja: os 12 meses, a comparação com o ano anterior, a projecção, a apresentação e o vídeo dessa loja. |

Os dois leem os mesmos números (`public.vendas_anos`, um registo por loja e por ano, com os 12 meses).
Carregar numa loja no «Resumo de cada livraria» abre o painel dessa loja.

## 1. Quem vê e quem lança

| Permissão | Vê | Lança (grava) |
|---|---|---|
| **Ver relatórios** (`view_reports`) | os dois ecrãs (só de leitura), o caixa e os números do mês no Início | — |
| **Editar relatórios de vendas** (`edit_reports`) | os dois ecrãs | os meses, o mês em curso, as metas, o critério, as observações e a nota do relatório |
| Administrador | tudo | tudo, e é o único que **apaga** um ano inteiro |

«Editar relatórios de vendas» é a permissão de quem lança os números do mês (por exemplo, o cargo
Contabilidade, ou a pessoa da loja): dá os dois ecrãs de vendas e não abre o caixa nem as finanças.
Ninguém a recebeu na migração — o administrador dá-a em Utilizadores › Equipa ou em Cargos.

Quem protege os dados são as regras da base de dados (migração
`20261114100000_relatorios_de_todas_as_livrarias`): `private.can_read_sales_reports()` para ler
e `private.can_edit_reports()` para gravar. O painel só esconde os botões.

## 2. Como os números entram

### À mão
Em **Todas as livrarias › Lançar vendas**: uma grelha **lojas × meses** do ano escolhido (separadores
por ano; «Outro ano» abre um ano novo). Escreve-se em Kz (`2 171 368` ou `2.171.368,50`); vazio quer
dizer «ainda sem valor». O mês em curso escolhe-se por loja. Nada é gravado até carregar em
**Guardar**, e grava-se tudo num só pedido.

- **Colar do Excel**: uma linha por loja, pela ordem da grelha, 12 colunas separadas por tabulação.
- Uma loja que abriu a meio do ano: escreva **0** nos meses antes da abertura. Vazio fica como
  «por registar» e a loja aparece nos meses por registar.
- O painel de cada loja continua a gravar o ano inteiro dessa loja (meses, observações, meta,
  critério e fonte).

### A partir das vendas do sistema (automático)
**Conferir com as vendas do sistema › Carregar vendas do sistema** soma as encomendas do site por
loja e por mês, no servidor (`public.vendas_do_sistema(ano, so_pagas)`), e devolve **só totais** —
nenhum dado de clientes chega ao navegador. Regras (as mesmas do painel de cada loja):

- **Só o dinheiro recebido** (a de omissão): pago menos reembolsado, até ao total da encomenda,
  sem os portes, pelo mês do pagamento na hora de Luanda (UTC+1). **Todas, excepto canceladas**:
  o total sem portes, pelo mês da encomenda.
- Sem as encomendas canceladas (estado ou entrega).
- **Levantamento** conta para a loja onde se levanta (o nome, sem acentos nem maiúsculas).
- **Entrega ao domicílio** conta para a loja da província da entrega. Numa província com duas lojas
  conta só para uma — a primeira activa pela ordem do separador Lojas —, para a rede não a contar
  duas vezes.
- A entrega numa província sem loja aparece à parte («Sem loja»), para o total bater com as
  encomendas.

A tabela mostra o sistema ao lado do que está registado; a **vermelho** os meses em que não batem.
Com a grelha aberta no mesmo ano, **Preencher meses vazios** copia o sistema para os meses vazios e
**Substituir os meses com vendas** copia-o para todos os meses com encomendas; um mês sem
encomendas no sistema nunca apaga o que está gravado. Os valores vindos do sistema ficam a azul, e
debaixo de cada mês aparece o valor do sistema («sist. …»), a laranja quando não bate.

Antes desta função o painel de cada loja descarregava as encomendas todas do ano e só funcionava a
quem gere encomendas. Hoje usa a mesma função, e o cálculo antigo só serve de recurso enquanto a
migração não estiver aplicada.

### De onde vieram os números
Cada gravação diz a origem (`vendas_anos.origem`): **manual**, **sistema** (todos os meses mudados
vieram do sistema), **misto** ou **importação**.

## 3. Histórico

O servidor regista cada gravação em `public.vendas_alteracoes` (gatilho `vendas_anos_historico`):
quando, quem, a loja e o ano, os meses que mudaram (de → para), as outras mudanças (mês em curso,
meta, critério, fonte, observações) e a origem. Uma gravação que não muda nada não fica. Ninguém
escreve nem apaga no histórico pela API. O `actualizado` e o `actualizado_por` de cada ano passam a
vir do servidor (antes vinham do navegador, e o `actualizado_por` só se preenchia ao criar).

O histórico aparece em **Todas as livrarias › Histórico das gravações** (o do ano escolhido). O
painel de cada loja continua com o seu histórico próprio (o documento `<loja>/historico/registo`).

## 4. As contas da rede

`app/web/src/painel-vendas/consolidado.js` (`buildConsolidado`), testado em `consolidado.test.js`:

- **Cada loja** é calculada pelo mesmo modelo do painel de uma loja (`modelo.js`,
  `buildYearModel`): os mesmos meses fechados, média, projecção e crescimento, com o critério de
  projecção que cada loja escolheu.
- **O mês da rede** é a soma das lojas que o registaram. Só está **fechado** quando todas as lojas
  com vendas no ano o têm fechado; senão fica **parcial** (em curso) e a média da rede não o usa.
- **O crescimento da rede é o das lojas comparáveis**: em cada mês e no acumulado entram só as
  lojas com valor nos dois anos. Uma loja nova (sem o ano anterior) entra nas vendas, não no
  crescimento; e um mês que uma loja ainda não lançou não se compara com o mesmo mês completo do
  ano anterior. O total do ano anterior (a projecção compara com ele) é o da rede inteira.
- **A projecção da rede** é a soma das projecções das lojas; a estimativa de um mês por fechar é a
  soma do que cada loja tem ou estima para esse mês.
- **A meta da rede** é a soma das metas, só quando todas as lojas com vendas têm meta.
- **Meses por registar**: até ao último mês que alguma loja já registou, os meses que cada loja
  ainda não tem (e as lojas activas sem nada no ano).

Toda a aritmética do dinheiro é em cêntimos inteiros: os totais batem sempre com a soma das linhas.

## 5. Vídeos

`app/web/src/painel-vendas/video.js`. Desenhados num `<canvas>` 1280×720 e gravados com
`MediaRecorder` (MP4 no Chrome e no Edge, WebM no Firefox). A gravação é **em tempo real**: um vídeo
de 3 minutos demora 3 minutos — o separador tem de ficar aberto. Há um botão para cancelar.

Feitos para **analisar**: cada quadro anima pouco mais de um segundo e depois fica parado o tempo de
ler. Em baixo, o número do quadro e o tempo (`Quadro 6 de 19 · 0:52 de 2:59`), para parar e voltar
a um ponto.

| Ritmo | Loja (19 quadros) | Todas as livrarias (com 3 lojas) |
|---|---|---|
| **Lento** (para analisar) | 2 min 59 s | 3 min 51 s |
| **Normal** | 1 min 47 s | ~2 min 19 s |
| **Curto** (só o resumo) | 36 s | 41 s |

**Vídeo de uma loja**: capa · resumo do ano (6 indicadores) · vendas por mês · **um quadro por mês,
de Janeiro a Dezembro** · quadro geral · acumulado e projecção · meses do melhor ao pior · perspectiva.

Cada mês mostra: as vendas dos dois anos (barras), o crescimento e a diferença; as vendas do ano e
do ano anterior, a diferença, o crescimento, o acumulado dos dois anos até esse mês, o peso no ano,
a posição entre os meses fechados, a comparação com a média mensal, as encomendas no sistema (se
carregadas) e a observação; e os 12 meses em pequeno, com este em destaque. Num mês **por
preencher** aparecem a estimativa, o crescimento e o acumulado estimados (≈), e o critério.

**Vídeo de todas as livrarias**: capa · resumo da rede · ranking das livrarias · vendas por mês
(empilhadas por loja) · **um quadro por loja** · **um quadro por mês** (o que cada loja vendeu nesse
mês, com os números da rede e quantas lojas o registaram) · quadro das livrarias · acumulado ·
meses por registar · perspectiva da rede, com a nota do relatório.

O plano de cada vídeo (`planoVideo`, `planoVideoConjunto`) é uma função pura, testada em
`video.test.js`; `quadroDoVideo()` desenha um instante sem gravar (serve à imagem PNG e ao PDF do
relatório conjunto, e para conferir o desenho num navegador).

## 6. Exportações do relatório conjunto

| Formato | Conteúdo |
|---|---|
| **Excel (.xlsx)** | Resumo · Lojas × meses · Por livraria · Rede mês a mês · Por registar · Todos os anos |
| **PDF** | Resumo, cada livraria, meses por registar, vendas por mês e a matriz lojas × meses (A4 ao baixo) |
| **Imagem (.png)** | O quadro do resumo da rede |
| **CSV** | Todas as lojas, todos os anos, mês a mês |
| **JSON** | Tudo: a rede, cada mês loja a loja, cada loja e todos os anos |
| **Vídeo** | Lento, normal ou curto (§5) |

A **nota do relatório** (uma por ano, `painel_vendas_docs` `consolidado/notas/ano-AAAA`) aparece no
PDF, no Excel e no fim do vídeo.

## 7. Ficheiros

| Ficheiro | Papel |
|---|---|
| `app/web/src/painel-vendas/modelo.js` | As contas de um ano (puro). Antes vivia dentro de `painel.js`. |
| `app/web/src/painel-vendas/consolidado.js` | As contas da rede (puro). |
| `app/web/src/painel-vendas/video.js` | Os vídeos. |
| `app/web/src/painel-vendas/consolidado-ui.js`, `consolidado.html`, `consolidado.css` | O ecrã de Todas as livrarias. |
| `app/web/src/painel-vendas/adapter.js` | Supabase: `createConsolidadoApi`, `fetchSystemSalesAll`. |
| `app/web/src/components/admin/RelatoriosLojasTab.jsx` | O separador (Shadow DOM, como o `VendasHuamboTab`). |
| `supabase/migrations/20261114100000_relatorios_de_todas_as_livrarias.sql` | Permissão, regras, histórico, `vendas_do_sistema`. |

## 8. Testes

- `npm test`: `modelo.test.js` (as contas, com os números reais do Huambo), `consolidado.test.js`,
  `video.test.js`, `permissions.test.js` (as três listas de permissões), `adminSections.test.js`.
- Base de dados, com as migrações reais (47 cenários: quem lê, grava e apaga, o histórico, os
  valores inválidos, os documentos e as vendas do sistema):

  ```bash
  npm i --prefix /tmp/pglite @electric-sql/pglite@0.2.17
  PGLITE_MODULE=/tmp/pglite/node_modules/@electric-sql/pglite/dist/index.js node scripts/pglite/relatorios.mjs supabase/migrations
  ```
