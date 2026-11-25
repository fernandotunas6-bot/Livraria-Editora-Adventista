# O fecho de caixa

Como o KanGest Livraria fecha o caixa e o guarda (`services/caixa.rs`, `services/caixa_fechos.rs`, migração 0061).

A regra é a de sempre: **tudo automático por omissão, e sempre com a opção manual ao lado**.

## O que o fecho (o Z) mostra

- **O número do fecho:** o Z de cada posto, seguido.
- **As datas:** da abertura e do fecho.
- **O posto, o armazém e quem abriu e fechou.**
- **Os recebimentos por forma de pagamento**, o fundo de maneio, as entradas e saídas, o numerário esperado e o
  contado, com a diferença. Mostra também a contagem das notas e moedas e a conferência das outras formas (o TPA, as
  transferências).
- **Os artigos vendidos, pelo nome.** As notas de crédito abatem: uma devolução tira a quantidade e o valor.
- **Os documentos da sessão**, um a um: o número, a hora, o cliente e o total. No talão de 80 mm e no A4 saem por
  omissão. No de 58 mm escolhe-se, porque o talão fica comprido.
- **As vendas online**, numa secção à parte (ver abaixo).

## O arquivo

**Automático:**
- **O Z fica arquivado** na mesma transacção que fecha o caixa (`caixa_fechos`). Fica o relatório completo, tal como
  estava nesse momento, com um selo SHA-256.
- **O arquivo não se altera nem se apaga:** os gatilhos da 0061 recusam. Ver ou reimprimir um fecho lê o arquivo, por
  isso um documento anulado depois já não muda um Z antigo. Se o selo deixar de conferir, o ecrã avisa.
- **Os fechos de antes desta versão**, e os que vêm do KIGEST, arquivam-se ao abrir a base, com os valores desse dia,
  e ficam marcados como «reconstruídos».
- **Cada fecho grava-se sozinho num ficheiro**, em *Documentos/KanGest Livraria/Fechos de caixa*, com o nome «Fecho
  Z-12 Caixa 1 2026-11-25.html». É uma página A4 pronta a imprimir ou a guardar em PDF.

**Manual, em *Caixa → Fechos anteriores*:**
- os filtros por data, posto e número;
- «Abrir a pasta dos fechos»;
- em cada fecho, «Guardar outra vez» e «Imprimir».

## A auditoria

Ficam na auditoria selada, com a ficha e o número:
- a abertura do caixa;
- cada vale (entrada ou saída de dinheiro);
- o fecho, com o contado, a diferença e o selo do arquivo;
- cada venda online que o fecho incluiu;
- cada impressão do fecho.

**A reimpressão de um fecho sai sozinha como «2.ª via em conformidade com o original»**, como os documentos.

## As vendas online no fecho

**O que entra:**
- os documentos que a loja online emitiu (pela API, sem caixa);
- as encomendas pagas no site para esta loja que ainda não têm FR;
- só as de entre a abertura e o fecho.

**Como entram:**
- **À parte, e nunca no numerário da gaveta:** esse dinheiro não passou por ela. As pagas na entrega vêm marcadas.
- **Cada venda online fecha uma só vez** (`caixa_fecho_online`). Numa loja com vários postos, fica com o primeiro Z
  que a inclui. Uma encomenda que já entrou num Z também não volta a entrar pela FR que vier depois.

**Automático:** a opção do posto «Incluir as vendas online no fecho de caixa» vem ligada (*Configurações → Postos*).

**Manual:** no diálogo de fecho, quem fecha desmarca só para esse fecho.

## A cópia no site

**Automático:** com o posto ligado ao site, cada fecho arquivado entra numa fila (`sinc_fechos`, migração 0063). Segue
no mesmo pedido que os documentos e o catálogo (`src/sinc/fechos.rs`).
- **Sem dados pessoais:** os nomes dos clientes, da lista dos documentos e das vendas online, saem do resumo que vai
  para o site.
- **Leva o selo do arquivo,** e também o do resumo que seguiu.
- **Ao ligar o posto,** os fechos de antes também seguem, uma vez só. Os que vieram do KIGEST não seguem.
- **No site, ficam no painel:** *Sistema → Ligação ao KanGest → Fechos de caixa dos postos*. São uma cópia que não se
  altera (`public.kangest_fechos`), e as encomendas que cada Z fechou ficam marcadas (`kangest_fecho_encomendas`).
- **Quem os vê:** quem vê os relatórios, os de todas as lojas; o gerente da loja, só os da loja dele.

## Testes

`services/tests.rs`:
- `fecho_arquivado_com_vendas_online_a_parte`:
  - o selo e o arquivo, que não se altera;
  - a anulação depois do fecho;
  - a devolução a abater;
  - o ficheiro na pasta;
  - a 2.ª via e a auditoria;
  - as vendas online fora da gaveta, cada uma fechada uma vez;
  - a opção desligada só num fecho;
  - o filtro do histórico.
- `fechos_antigos_arquivados_ao_abrir_reconstruidos`.

`services/caixa_fechos.rs`: o nome do ficheiro, o selo, a hora das encomendas do site e o documento (com os nomes
escapados).
