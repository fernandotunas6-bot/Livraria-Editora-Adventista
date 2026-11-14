# Relatórios de vendas — cada loja e todas as livrarias

Dois ecrãs no grupo **Relatórios** do painel (`/admin`), com o mesmo desenho e as mesmas contas:

| Secção | Endereço | O que é |
|---|---|---|
| **Todas as livrarias** (`relatorios-lojas`) | `/admin?tab=relatorios-lojas` | O relatório conjunto: a rede inteira num só sítio — totais, ranking, cada loja, cada mês, meses por registar, vídeo e exportações. É aqui que se **lançam** as vendas de todas as lojas de uma vez. |
| **Vendas por loja** (`vendas-huambo`) | `/admin?tab=vendas-huambo` | O painel de uma loja: os 12 meses, a comparação com o ano anterior, a projecção, a apresentação e o vídeo dessa loja. |
| **Imagens dos vídeos** (`imagens-videos`) | `/admin?tab=imagens-videos` | A biblioteca de imagens que os vídeos usam de fundo e os mais vendidos de cada loja lançados à mão (§6). |

Os dois leem os mesmos números (`public.vendas_anos`, um registo por loja e por ano, com os 12 meses).
Carregar numa loja no «Resumo de cada livraria» abre o painel dessa loja.

## 1. Quem vê e quem lança

| Permissão | Vê | Lança (grava) |
|---|---|---|
| **Ver relatórios** (`view_reports`) | os três ecrãs (só de leitura), o caixa e os números do mês no Início | — |
| **Editar relatórios de vendas** (`edit_reports`) | os três ecrãs | os meses, o mês em curso, as metas, o critério, as observações, a nota do relatório, os mais vendidos e a biblioteca de imagens |
| **Gerir catálogo** (`manage_catalog`) | a biblioteca de imagens | a biblioteca de imagens |
| Administrador | tudo | tudo, e é o único que **apaga** um ano inteiro |

«Editar relatórios de vendas» é a permissão de quem lança os números do mês (por exemplo, o cargo
Contabilidade, ou a pessoa da loja): dá os dois ecrãs de vendas e não abre o caixa nem as finanças.
Ninguém a recebeu na migração — o administrador dá-a em Utilizadores › Equipa ou em Cargos.

Quem protege os dados são as regras da base de dados (migração
`20261114120000_relatorios_de_todas_as_livrarias`): `private.can_read_sales_reports()` para ler
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
- **Cada encomenda conta para a loja gravada nela** (`orders.store_id`, migração
  `20261114180000_lojas_donas_dos_dados`; ver [LOJAS.md](LOJAS.md)): a do levantamento, ou, numa
  entrega ao domicílio, a loja que serve a província da entrega — o Namibe e o Cunene são da loja do
  Lubango, o Cuanza Sul da de Catumbela. Mudar o nome de uma loja já não lhe tira as vendas.
- Uma encomenda sem loja (só digital, ou de uma província que nenhuma loja serve) aparece à parte
  («Sem loja»), para o total bater com as encomendas.
- Antes desta migração contava-se pelo nome da loja do levantamento e, nas entregas, pela loja da
  mesma província (uma entrega no Namibe não era de nenhuma).

> **O sistema só conhece o site.** As vendas ao balcão passam pelo KiGest e não entram aqui: em
> 2026, até Novembro, o site tinha 6 encomendas (395 710 Kz, só uma paga, de 21 665 Kz) e as lojas
> registaram 47,6 M Kz. Enquanto for assim, o registado de cada loja é maior do que o sistema e os
> meses aparecem a vermelho — não é um erro. Os dois ecrãs dizem-no junto ao botão.

A tabela mostra o sistema ao lado do que está registado; a **vermelho** os meses em que não batem.
Com a grelha aberta no mesmo ano, **Preencher meses vazios** copia o sistema para os meses vazios e
**Substituir os meses com vendas** copia-o para todos os meses com encomendas; um mês sem
encomendas no sistema nunca apaga o que está gravado. Quando a substituição troca um mês **que já
tinha valor**, o botão primeiro lista o que vai mudar (`Huambo Out: 4 908 704,00 → 21 665,00`) e
passa a «Confirmar: substituir N meses registados»; só a segunda carga aplica (nos dois ecrãs). Os valores vindos do sistema ficam a azul, e
debaixo de cada mês aparece o valor do sistema («sist. …»), a laranja quando não bate.

Antes desta função o painel de cada loja descarregava as encomendas todas do ano e só funcionava a
quem gere encomendas. Hoje usa a mesma função, e o cálculo antigo só serve de recurso enquanto a
migração não estiver aplicada.

### De onde vieram os números
Cada gravação diz a origem (`vendas_anos.origem`), pelos meses que muda: **sistema** (das vendas do
sistema), **importação** (do ficheiro «Painel de Vendas» da loja; no histórico, «importação de
ficheiro»), **manual**, ou **misto** quando há mais do que uma (`origemDasAlteracoes`, em
`plausibilidade.js`). A origem é a que o ecrã declara; o servidor não a
confere com as encomendas.

As linhas que entraram por migração (o Relatório Síntese, o PowerPoint e os Excel das lojas, em
`20261101143448_painel_vendas` e `20261114100000_vendas_das_lojas_ate_outubro`) ficaram «manual»,
porque a coluna ainda não existia; a migração `20261114210000_relatorios_gravacao_protegida` passou
a «importação» as que ainda têm essa fonte, nenhum autor e algum mês com valor.

### Duas pessoas a gravar a mesma loja
Os dois ecrãs gravam por `public.vendas_anos_gravar(ano, linhas)` (migração
`20261114210000_relatorios_gravacao_protegida`). Cada linha leva o `actualizado` que o ecrã leu ao
abrir; se alguém gravou essa loja e esse ano entretanto, **nada é gravado** e o ecrã diz «Os números
de … mudaram depois de os abrir … Recarregue» (erro 40001). Antes, a segunda gravação repunha por
cima, sem aviso, os meses que a primeira tinha mudado. Várias lojas num pedido gravam todas ou
nenhuma. A função corre com as regras da tabela (quem grava continua a ser
`private.can_edit_reports()`), e só muda os campos que a linha traz.

### Valores a confirmar
Um mês que vale **4 vezes ou mais** o mesmo mês do ano anterior, ou **um quarto ou menos** — ou,
sem ano anterior, 4 vezes acima ou abaixo da mediana dos outros meses do ano — é invulgar
(`avisosDePlausibilidade`, em `plausibilidade.js`). Não é um erro: pode estar certo. Mas um ano
anterior registado com outro âmbito, ou um zero a mais, mudam o crescimento e a projecção.

- **Ao gravar** (os dois ecrãs), os meses mudados que forem invulgares aparecem no estado
  («Set: +1 441% face a Set de 2025»), e só a segunda carga em Guardar grava.
- **No relatório de todas as livrarias**, o cartão «Valores a confirmar» lista os meses invulgares
  de cada loja no ano escolhido. Com os números de Novembro de 2026: seis meses do Huambo (2026
  face a 2025) e Julho do Lubango.

## 3. Histórico

O servidor regista cada gravação em `public.vendas_alteracoes` (gatilho `vendas_anos_historico`):
quando, quem, a loja e o ano, os meses que mudaram (de → para), as outras mudanças (mês em curso,
meta, critério, fonte, observações) e a origem. Uma gravação que não muda nada não fica. Ninguém
escreve nem apaga no histórico pela API. O `actualizado` e o `actualizado_por` de cada ano passam a
vir do servidor (antes vinham do navegador, e o `actualizado_por` só se preenchia ao criar).

O histórico aparece em **Todas as livrarias › Histórico das gravações** (o do ano escolhido) e, no
**painel de cada loja**, no editor (as gravações dessa loja). O documento `<loja>/historico/registo`,
que o painel de cada loja escrevia a partir do navegador, podia ser reescrito por quem grava: deixou
de ser escrito e de ser mostrado (fica só como recurso enquanto a migração do histórico não estiver
aplicada).

Nota: os números que hoje estão no painel entraram por migração, antes de haver histórico no
servidor; o histórico deles é o das próprias migrações, no repositório.

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

Com dados de produtos, os quadros dos mais vendidos (§6) juntam 21 s no lento (o mais vendido do
ano, 10 s, e os cinco mais vendidos, 11 s), 12,6 s no normal e 5 s no curto (só o mais vendido).

**Vídeo de uma loja**: capa · resumo do ano (6 indicadores) · vendas por mês · **um quadro por mês,
de Janeiro a Dezembro** · quadro geral · acumulado e projecção · meses do melhor ao pior · **o mais
vendido do ano** · **os mais vendidos** · perspectiva.

Cada mês mostra: as vendas dos dois anos (barras), o crescimento e a diferença; as vendas do ano e
do ano anterior, a diferença, o crescimento, o acumulado dos dois anos até esse mês, o peso no ano,
a posição entre os meses fechados, a comparação com a média mensal, as encomendas no sistema (se
carregadas), **o mais vendido do mês** (com a capa) e a observação; e os 12 meses em pequeno, com
este em destaque. Num mês **por preencher** aparecem a estimativa, o crescimento e o acumulado
estimados (≈), e o critério.

**Vídeo de todas as livrarias**: capa · resumo da rede · ranking das livrarias · vendas por mês
(empilhadas por loja) · **um quadro por loja** · **um quadro por mês** (o que cada loja vendeu nesse
mês, com os números da rede, quantas lojas o registaram e o mais vendido na rede) · quadro das
livrarias · acumulado · **o mais vendido da rede** · **os mais vendidos** · meses por registar ·
perspectiva da rede, com a nota do relatório. Cada loja mostra o seu mais vendido ao lado do nome.

### As imagens nos vídeos

`app/web/src/painel-vendas/imagens-video.js`. A capa, os dois quadros dos mais vendidos e o fecho
têm imagem por fundo; os quadros de números ficam escuros (com duas manchas de luz a mexer devagar
e, com «Capas animadas», as capas a passar muito ténues), para se lerem.

**Montagem (estilo Premiere).** Entre dois quadros não há corte seco: o quadro que sai aproxima-se e
esbate-se com rasto de zoom, o que entra chega de mais perto até ao lugar, e um clarão de luz quente
atravessa o ecrã (0,8 s; `estadoDaTransicao` em `video.js`, testada). Por cima de tudo, uma luz que
respira num canto e um grão de filme muito leve. O logótipo é a versão branca em PNG transparente,
discreta e sem pastilha.

O **fundo** escolhe-se no menu Exportar (fica lembrado no aparelho):

| Fundo | O que é |
|---|---|
| **Capas animadas** (o de omissão) | Um mural de capas a flutuar em três planos, como nos vídeos gerados por IA: ao fundo pequenas e desfocadas, à frente grandes e nítidas, cada plano à sua velocidade (paralaxe); as capas sobem, descem e viram um pouco, a câmara aproxima-se e desliza, há raios e partículas de luz e a cor dos relatórios. Com um livro ou texto à frente, o fundo desfoca-se (profundidade de campo). Usa as capas dos mais vendidos e, a completar, capas do catálogo (`capas-de-fundo.js`); cada capa vai numa moldura 2:3, inteira. |
| **Paisagens animadas** | Desenhadas pelo próprio vídeo, com movimento: amanhecer nas montanhas (o sol a subir), floresta (raios de luz e pirilampos), campo (nuvens, erva a ondular e flores) e lago ao entardecer (a paisagem reflectida na água a ondular). Camadas com paralaxe, névoa a passar. Não dependem da rede nem de licenças, e saem sempre iguais. |
| **Fotografias da biblioteca** | As imagens activas da biblioteca (§6), primeiro as de natureza, com zoom e deslocamento lentos. Atrás dos livros ficam desfocadas, para os livros se destacarem. Sem fotografias activas, vale a paisagem. |
| **Simples (escuro)** | Sem imagem; os livros aparecem na mesma. |

**O livro em 3D** nunca estica a capa: cada uma vai numa moldura 2:3, inteira, sobre uma cópia
desfocada dela (`capaEnquadrada`); antes, uma capa larga ou quadrada era esticada. As fotografias
estreitas da biblioteca vão inteiras, ao centro, sobre uma cópia desfocada, em vez de cortadas. É
desenhado a partir da capa do catálogo (as capas já tratadas com IA de
`docs/catalogo/capas-refinadas.json`): a capa em perspectiva, a lombada da cor da capa, o corte
das folhas, a sombra no chão e um reflexo de luz que atravessa a capa; flutua devagar. Um produto
sem capa (ou fora do catálogo) leva uma capa tipográfica com o título.

As capas do catálogo estão em `https://livrariaadventista.com/images/capas/…` e o painel corre em
`livrariaadventista.ao`: o vídeo não pode desenhar uma imagem de outra origem sem CORS, por isso
as do próprio site carregam-se pelo caminho (`/images/capas/…`, mesma origem). As fotografias
enviadas ficam no Storage, que manda CORS. Uma imagem que não carregue não estraga o vídeo: fica a
capa tipográfica, ou a paisagem.

Medido no Chromium: cada imagem do vídeo desenha-se em menos de 25 ms (o limite são 33 ms, para 30
por segundo); o fundo «Capas animadas» leva cerca de 19 ms sem aceleração gráfica. Um vídeo curto com paisagens e livros gravou 1217 imagens em 40,9 s.

O plano de cada vídeo (`planoVideo`, `planoVideoConjunto`) é uma função pura, testada em
`video.test.js`; `quadroDoVideo()` desenha um instante sem gravar (serve à imagem PNG e ao PDF do
relatório conjunto, e para conferir o desenho num navegador).

### O Estúdio de vídeo: som, narração e legendas

Os botões **Vídeo lento / normal / curto** do menu Exportar abrem o **Estúdio de vídeo**
(`estudio-video.js`), nos dois relatórios. É feito à maneira do Adobe Premiere, sem inteligência
artificial e sem nada sair do navegador:

| Parte | O que faz |
|---|---|
| **Monitor** | A pré-visualização do vídeo, com som, a partir de qualquer ponto (▶, ⏮, espaço, clicar na linha de tempo). |
| **Linha de tempo** | Quatro pistas: **V1 Quadros** (um bloco por quadro, com a cor do tipo ou da loja), **A1 Narração** (o guião de cada quadro), **A2 Efeitos** (cada som no seu segundo, com a cor da família) e **A3 Música**. A cabeça de leitura vermelha mostra onde se está. |
| **Mesa de som** | Ligar e o volume da **música**, dos **efeitos** e da **voz**; legendas; ouvir durante a gravação; ritmo e fundo. Fica lembrado no aparelho (`relatorios:estudio`). |
| **Narração com a minha voz** | Liga o microfone (só aí o navegador pede autorização). O guião aparece no monitor, como teleponto, com a frase seguinte; antes de gravar há uma contagem de 3 segundos. A voz entra no ficheiro; a música baixa sozinha enquanto se fala (*ducking*); a voz não volta às colunas, para não haver eco. Com auscultadores ouve-se tudo. |
| **Gravar o vídeo** | Grava com a faixa de áudio (MP4 com AAC no Chrome e no Edge; WebM com Opus no Firefox). O relógio do vídeo é o do áudio: a imagem e o som não se desencontram. |

O microfone só funciona porque o `Permissions-Policy` do site (`app/web/public/_headers`) o deixa ao
próprio site (`microphone=(self)`); antes estava fechado (`microphone=()`) e a narração seria recusada
pelo navegador em produção. Nenhuma outra origem o pode pedir, e o site só o pede no Estúdio.

**Os efeitos seguem o que cada quadro desenha** (`deixas-video.js`, puro e testado):

| Momento do vídeo | Som |
|---|---|
| Transição entre quadros (o clarão e o zoom) | Um sopro que atravessa o ecrã da esquerda para a direita |
| A capa | A **porta da loja a abrir**, com a campainha, e o impacto do título |
| Cada livraria, no vídeo de todas as livrarias | A **porta dessa loja** a abrir |
| Os números a contar (resumo, cada loja) | O **contador** (tiques que abrandam com a contagem) e, no fim, a **caixa registadora** |
| As barras e o acumulado a crescer | Uma **subida** |
| Crescimento positivo | Um toque a subir e **moedas** |
| Crescimento negativo | Uma **descida** |
| O melhor mês, a projecção | A caixa e um **brilho** |
| Um mês por preencher, meses por registar | Um aviso suave |
| As linhas do quadro geral, o ranking | Tiques, um por linha, e moedas no fim |
| Os mais vendidos | Uma página a virar e um toque por livro |
| O fecho | A **porta a fechar** e o acorde final da música |

**O som é gerado no navegador** (`som-video.js`, Web Audio API): cada efeito é sintetizado uma vez
(porta com rangido e campainha, caixa com mola, gaveta e sino, moedas com parciais metálicos,
subidas e descidas filtradas, sinos…) e a música é um ciclo de quatro acordes em Ré maior a 88 bpm
(pad, baixo, arpejo com eco e uma batida discreta), que se repete sem emenda. Não há ficheiros de
áudio, nem licenças, nem serviços de fora, e o mesmo vídeo soa sempre igual. A mesa tem compressor e
limitador no fim; medido na página de teste `e2e/painel/som.html`, os efeitos ficam 3 a 15 dB acima da
música e o pico abaixo de 0 dBFS.

**O guião e as legendas** (`guiao-video.js`, puro e testado): uma ou duas frases por quadro, tiradas
dos números («Março: 4,96 milhões de Kz, contra 744 mil Kz em 2025 — +566,6%.»), completas no vídeo
lento e breves no normal e no curto. Com legendas ou narração, cada quadro estica ao tempo de ler a
frase em voz alta (14 caracteres por segundo); as legendas passam em pedaços de uma linha, por cima
do rodapé, sem tapar os números.

## 6. Imagens e mais vendidos — a secção «Imagens dos vídeos»

`/admin?tab=imagens-videos`, no grupo Relatórios (`ImagensVideosTab.jsx`), com duas vistas.

### Biblioteca de imagens (`vista=imagens`)
- As quatro **paisagens desenhadas**, para ver (passe o rato para as ver mexer). Não se enviam.
- **Enviar fotografias** (PNG, JPG, WebP ou GIF até 8 MB, várias de uma vez), com o tema
  (natureza, livros, lojas, pessoas, outro) e os créditos (quem tirou, a licença). Ficam no bucket
  `media`, pasta `biblioteca/`.
- **Juntar imagens do site**: as composições já feitas com as capas do catálogo (a galeria do site,
  tema Livros) e as fotografias das lojas (tema Lojas). Já estão no site — junta-se o caminho, não
  se envia nada.
- Cada imagem: título, tema, créditos, **usar nos vídeos** (activa) e tirar da biblioteca (a
  enviada é apagada também do Storage). As estreitas levam um aviso: no vídeo (16:9) ficam cortadas.

Este ambiente não tinha acesso aos bancos de imagens (Unsplash, Pexels, Wikimedia), por isso a
biblioteca não vem com fotografias descarregadas: as paisagens são desenhadas e as fotografias
juntam-se aqui (as da equipa, ou as que já estão no site).

### Mais vendidos (`vista=mais-vendidos`)
De onde vêm os mais vendidos dos vídeos (`destaques.js`, testado em `destaques.test.js`):
- **Do site, automático**: `public.produtos_mais_vendidos(ano, so_pagas)` soma as encomendas por
  loja, mês e produto — as mesmas encomendas, lojas e meses das vendas do sistema
  (`private.vendas_encomendas`), só totais, sem dados de clientes. O valor é o preço de venda vezes a
  quantidade (um reembolso parcial não se reparte pelos produtos). Sem `book_id` (encomendas antigas,
  WhatsApp), junta pelo título.
- **À mão** (`public.vendas_produtos`): as vendas do balcão, que o site não vê (o KiGest das
  lojas). Escolhe-se a loja, o ano e o período (um mês ou o ano todo), procura-se o produto no
  catálogo (traz a capa) ou escreve-se o título, e as unidades (e, se quiser, o valor e uma nota).
  Ao lado, o que o site vendeu nesse período, para conferir — **Copiar os 5** passa-os para aqui.
- **A regra**: para uma loja e um mês, se há lançamentos à mão para esse mês, valem esses; senão, o
  site. Para o ano, se há lançamentos para o ano todo, valem esses; senão, a soma dos 12 meses. A
  rede soma as lojas (e as encomendas do site sem loja).

O quadro **O mais vendido do ano** mostra o livro grande, as unidades, o valor, o mês em que mais
vendeu, quantos meses foi o primeiro, a sua parte nas unidades dos mais vendidos e de onde vêm os
números. **Os mais vendidos** mostra os cinco primeiros lado a lado.

## 7. Exportações do relatório conjunto

| Formato | Conteúdo |
|---|---|
| **Excel (.xlsx)** | Resumo · Lojas × meses · Por livraria · Rede mês a mês · Por registar · Todos os anos |
| **PDF** | Resumo, cada livraria, meses por registar, vendas por mês e a matriz lojas × meses (A4 ao baixo) |
| **Imagem (.png)** | O quadro do resumo da rede |
| **CSV** | Todas as lojas, todos os anos, mês a mês |
| **JSON** | Tudo: a rede, cada mês loja a loja, cada loja e todos os anos |
| **Vídeo** | Lento, normal ou curto, com o fundo escolhido (§5) |

A **nota do relatório** (uma por ano, `painel_vendas_docs` `consolidado/notas/ano-AAAA`) aparece no
PDF, no Excel e no fim do vídeo.

## 8. O painel: topo, mês em destaque, filtros e PowerPoint

**Topo.** Maior, com o título em Source Serif 4 e os controlos por baixo dele. À direita, uma parede de
capas em movimento lento: as dos mais vendidos do ano (da loja ou da rede) e, a completar, capas do
catálogo do próprio site (`public/images/capas`, sem temas sensíveis). Cada capa vai numa moldura
2:3, inteira, sobre uma cópia desfocada dela. O logótipo é a versão branca em PNG transparente,
discreta. Por baixo dos KPI, o cartão **Os mais vendidos** com as capas, as unidades e o valor.

**Mês em destaque, modo apresentação e vídeo: o período até ao mês**, como no PowerPoint das lojas
(«Período em apresentação até …»), por `periodoAte` em `modelo.js`:

| Componente | Conta |
|---|---|
| Venda periódica de cada ano | soma dos meses com valor de Janeiro até ao mês |
| Média mensal de cada ano | venda periódica ÷ meses com valor (Fevereiro de 2025 no Huambo: 204 087,5 Kz) |
| Crescimento e diferença periódicos | só os meses com valor nos dois anos (com tudo preenchido, igual ao PowerPoint) |
| Diferença e crescimento mensais | o próprio mês, ano − comparação |

Os testes usam os valores dos diapositivos de Janeiro, Fevereiro e Outubro do Huambo.

**O diapositivo de cada mês** (modo apresentação do painel de uma loja): em cima, o período até ao
mês (venda periódica de cada ano e crescimento periódico); à esquerda, as barras do mês e o
crescimento mensal; à direita, o **Detalhe do mês** em cartões, como o «Período em apresentação
até» do painel: média mensal de cada ano (a cinzento e a rosa), diferença mensal e diferença
periódica (a verde ou a vermelho), e o estado do mês. Os valores contam até ao número ao mesmo
tempo que as barras. A «Sequência de apresentação» (1.º 2025, 2.º 2026, 3.º Crescimento) saiu do
diapositivo (pedido do dono, 14/11); continua no Mês em destaque do painel, onde acompanha a
animação. Nos cartões do painel, a letra do valor acompanha a largura do cartão
(`container-type`), para «10 857 624,65 Kz» caber inteiro em vez de acabar em «…».

**Imagens no modo apresentação** (`diapositivos` em `painel.js`; `fotosDaLoja` e os controlos em
`apresentacao.js`, os mesmos nos dois relatórios):

| Diapositivo | Imagem |
|---|---|
| Capa | A parede de capas do topo, à direita: os mais vendidos da loja no ano e, a completar, o catálogo |
| **A loja** (a seguir à capa) | Até 3 fotografias da galeria da loja (separador **Lojas**), com as legendas; só aparece se a loja tiver fotografias |
| **Os mais vendidos** (a seguir ao resumo) | Os 6 primeiros do ano, com capa, unidades e valor; sem capa, uma capa com o título. Só aparece se houver mais vendidos |
| Perspectiva (o fecho) | A primeira fotografia da loja, esbatida por trás dos números |

As fotografias só entram com endereço do próprio site ou `https`. Sem fotografias nem mais vendidos, a
sequência é a de sempre. Os mais vendidos chegam depois de o painel abrir: se a apresentação já
estiver aberta, o diapositivo junta-se à lista sem mudar o que está à vista.

**Todas as livrarias** também tem modo apresentação (`diapositivosConjunto` em `consolidado.js`),
com a galeria de cada loja:

| Diapositivo | O que mostra |
|---|---|
| Capa | «Todas as livrarias», a parede de capas dos mais vendidos da rede |
| **As livrarias** | Um cartão por loja com a primeira fotografia, a cor da loja, as vendas, a quota e o crescimento |
| Resumo da rede | Vendas, média, melhor mês, projecção, ano anterior, a livraria líder e os 12 meses |
| Ranking (com mais de uma loja) | As lojas pela posição, com a fotografia num círculo e a barra na cor da loja |
| **Uma por livraria** (pela posição) | A fotografia à esquerda com a legenda; à direita as vendas, o crescimento, a quota, a média, o melhor mês, a projecção, os meses por registar e os 12 meses |
| Os mais vendidos da rede | Se os houver |
| Quadro das livrarias | Comparável, vendas, crescimento, quota e projecção, com o total da rede |
| Perspectiva da rede | As fotografias das lojas esbatidas por trás da previsão e do valor actual |

Uma loja sem fotografias (hoje o Bié) aparece com a sua cor e o nome da terra; para a ver com
fotografia, juntam-se fotografias à galeria em **Admin → Lojas**. Com o filtro de lojas, só entram as
escolhidas.

**Filtros avançados** (barra «Filtros», por baixo do topo; `filtros.js` e `filtros-ui.js`):

- **Período:** ano inteiro, 1.º a 4.º trimestre, 1.º e 2.º semestre, até ao último mês registado,
  ou de um mês a outro.
- **Só meses fechados:** sai o mês em curso (e os por preencher).
- **Lojas** (só em Todas as livrarias): as que entram; cada loja mantém a sua cor.

Os KPI, o texto do topo, o mês em destaque, o ganho mensal, os quadros, o Excel (linha «Filtro») e
os meses do vídeo e do modo apresentação contam só o filtro. Os meses de fora ficam esbatidos e o
**acumulado continua o do ano inteiro**, com a projecção do ano. No filtro, a projecção é a do
período (o que está fechado mais a estimativa dos meses por fechar do período) e a meta é a parte do
período, proporcional aos meses. No conjunto, o crescimento continua a ser o das lojas comparáveis e
a quota e a posição de cada loja contam só o período. O recorte não mexe nas contas do modelo: com o
ano inteiro dá exactamente os mesmos totais (testado). A escolha fica guardada no aparelho, por ecrã.

**Importar o Painel de Vendas da loja** (Todas as livrarias › Lançar vendas › «A partir do Painel de
Vendas da loja»). O ficheiro .pptx abre-se no browser, sem bibliotecas (`pptx.js`). Os ecrãs dos
relatórios não usam a palavra «PowerPoint» (pedido do dono, 14/11): dizem «ficheiro» ou «Painel de
Vendas da loja», e um teste e2e confirma-o.

- Lê o «Quadro geral» e os diapositivos de cada mês, e encontra a loja pelo nome.
- Preenche a grelha do ano aberto. Antes de gravar, revê-se e carrega-se em Guardar; a gravação fica
  no histórico.
- Regras: um mês em branco no PowerPoint não apaga o que está no painel, e um valor igual ao kwanza
  guarda os cêntimos.
- **Avisos:**
  - quando o quadro geral e o diapositivo do mês não batem (no PowerPoint de Outubro, Julho de 2025
    diz 211 650 Kz no quadro e 221 650 Kz no diapositivo);
  - quando o TOTAL do quadro não é a soma dos meses;
  - quando um mês só vem no diapositivo, que é o que acontece quando o diapositivo de Novembro chega
    antes do quadro geral.

Para pôr os valores numa migração, o mesmo leitor em Node:

```bash
node scripts/relatorios/pptx-para-sql.mjs "Loja Huambo - Painel-Vendas 2026S.pptx" --nome vendas_ate_novembro --escrever
```

**Fontes.** O sistema todo usa Inter no texto e Source Serif 4 nos títulos: `src/lib/fontes.js` e os
tokens `--font-sans`/`--font-serif` de `index.css`. A Source Serif 4 substituiu a Fraunces em
Novembro de 2026: é uma serifa mais sóbria, de pouco contraste, que não chama a atenção. O painel usa as @font-face da página (sem o
Google Fonts), o canvas espera que as fontes carreguem e as janelas de impressão recebem-nas. Um
teste (`fontes.test.js`) falha se um ficheiro voltar a usar outra família, a Fraunces incluída.

## 9. Ficheiros

| Ficheiro | Papel |
|---|---|
| `app/web/src/painel-vendas/modelo.js` | As contas de um ano (puro). Antes vivia dentro de `painel.js`. |
| `app/web/src/painel-vendas/consolidado.js` | As contas da rede (puro). |
| `app/web/src/painel-vendas/plausibilidade.js` | Os valores a confirmar e a origem de cada gravação (puro). |
| `app/web/src/painel-vendas/video.js` | Os vídeos: o desenho, a preparação (`prepararVideo`) e a gravação com som (`gravarVideo`). |
| `app/web/src/painel-vendas/estudio-video.js` | O Estúdio de vídeo: monitor, linha de tempo, mesa de som, narração e gravação. |
| `app/web/src/painel-vendas/som-video.js` | O som: os efeitos e a música sintetizados, a mesa de mistura, o microfone. |
| `app/web/src/painel-vendas/deixas-video.js` | Que som toca em que segundo de cada vídeo, e as notas da música (puro). |
| `app/web/src/painel-vendas/guiao-video.js` | O guião, as legendas e o plano esticado ao tempo de leitura (puro). |
| `app/web/src/painel-vendas/apresentacao.js` | Os controlos do modo apresentação, iguais nos dois relatórios, e as fotografias das lojas. |
| `app/web/src/painel-vendas/imagens-video.js` | As paisagens desenhadas, as fotografias com movimento e o livro em 3D. |
| `app/web/src/painel-vendas/destaques.js` | Os mais vendidos: o site e o lançado à mão, por loja, mês e ano, e a rede (puro). |
| `app/web/src/painel-vendas/biblioteca.js` | Supabase: a biblioteca de imagens e os mais vendidos à mão. |
| `app/web/src/components/admin/ImagensVideosTab.jsx` | A secção Imagens dos vídeos. |
| `app/web/src/painel-vendas/consolidado-ui.js`, `consolidado.html`, `consolidado.css` | O ecrã de Todas as livrarias. |
| `app/web/src/painel-vendas/adapter.js` | Supabase: `createConsolidadoApi`, `fetchSystemSalesAll`. |
| `app/web/src/components/admin/RelatoriosLojasTab.jsx` | O separador (Shadow DOM, como o `VendasHuamboTab`). |
| `supabase/migrations/20261114120000_relatorios_de_todas_as_livrarias.sql` | Permissão, regras, histórico, `vendas_do_sistema`. |
| `app/web/src/painel-vendas/capas-de-fundo.js` | As capas do topo, do cartão dos mais vendidos e do fundo «Capas animadas». |
| `app/web/src/painel-vendas/filtros.js`, `filtros-ui.js` | Os filtros avançados (o recorte é puro e testado; a barra no ecrã). |
| `app/web/src/painel-vendas/pptx.js` | O leitor do PowerPoint «Painel de Vendas» das lojas. |
| `scripts/relatorios/pptx-para-sql.mjs` | A migração a partir do PowerPoint, com o mesmo leitor. |
| `app/web/src/painel-vendas/logo-livraria-adventista-claro.png` | O logótipo branco, PNG transparente (topo, capa do modo apresentação e vídeos). |
| `app/web/src/lib/fontes.js` | As duas fontes do sistema, para o canvas e as impressões. |
| `supabase/migrations/20261114140000_imagens_e_mais_vendidos_dos_videos.sql` | `biblioteca_imagens`, `vendas_produtos`, `produtos_mais_vendidos`, `capas_dos_produtos` e a pasta `biblioteca/` no Storage. |
| `supabase/migrations/20261114210000_relatorios_gravacao_protegida.sql` | `vendas_anos_gravar` (gravação com bloqueio optimista) e a origem das linhas importadas. |

## 10. Testes

- `npm test`: `modelo.test.js` (as contas, com os números reais do Huambo, e o período até ao mês
  com os valores do PowerPoint), `consolidado.test.js`, `filtros.test.js`, `pptx.test.js` (o
  PowerPoint real do repositório), `capas-de-fundo.test.js`, `video.test.js` (com as transições),
  `guiao-video.test.js` (o guião, os números ditos, as legendas), `deixas-video.test.js` (que som
  toca em que quadro: portas, caixa, subidas, quedas; a música),
  `destaques.test.js`, `fontes.test.js`, `scripts/relatorios/pptx-para-sql.test.mjs`, `ImagensVideosTab.test.jsx`, `permissions.test.js` (as três
  listas de permissões), `adminSections.test.js`.
- `plausibilidade.test.js` (os valores a confirmar, com os números reais das três lojas, e a
  origem de cada gravação) e `adapter.test.js` (o que a gravação manda ao servidor e os códigos de
  erro: conflito, permissão, o resto).
- No navegador, sobre o **build de produção** (`app/web/e2e/painel-vendas.spec.js`, páginas de
  teste em `app/web/e2e/painel/`): o painel de uma loja desenha os gráficos e o quadro (com e sem
  «reduzir movimento»), pede confirmação dos valores invulgares e da substituição pelo sistema, e
  manda o `actualizado` que leu; o relatório de todas as livrarias mostra os valores a confirmar e
  diz porquê quando uma gravação é recusada. Em Novembro de 2026 o painel de cada loja esteve
  partido em produção (o tree-shaking tirou o `.transition()` do d3) com todos os testes unitários
  verdes: é isto que o apanha.
- O Estúdio de vídeo (`app/web/e2e/estudio-video.spec.js`): abre com as quatro pistas e os efeitos
  no sítio, pré-visualiza e salta na linha de tempo; a banda sonora misturada à parte (página
  `som.html`) tem cada efeito acima da música e sem saturar; e uma gravação a sério do vídeo curto de
  todas as livrarias com narração (um microfone falso do Chromium) dá um ficheiro com faixa de áudio.
- Base de dados, com as migrações reais (95 cenários: quem lê, grava e apaga, o histórico, os
  valores inválidos, os documentos, as vendas do sistema, os mais vendidos por produto, os lançados
  à mão, a biblioteca de imagens, a pasta do Storage e a gravação protegida — duas pessoas no mesmo
  ano, várias lojas num pedido, a origem das linhas importadas):

  ```bash
  npm i --prefix /tmp/pglite @electric-sql/pglite@0.2.17
  PGLITE_MODULE=/tmp/pglite/node_modules/@electric-sql/pglite/dist/index.js node scripts/pglite/relatorios.mjs supabase/migrations
  ```
