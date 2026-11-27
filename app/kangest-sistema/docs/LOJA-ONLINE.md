# Loja online no KanGest

**Livraria → Loja online.** A fase 6 do estudo, primeira parte ([docs/ECOSSISTEMA.md](../../../docs/ECOSSISTEMA.md), na
raiz da livraria).

O ecrã mostra as encomendas desta loja e o catálogo do site, da cópia local que chega com cada sincronização
([SINCRONIZACAO.md](SINCRONIZACAO.md)). **Funciona sem Internet**: mostra a última cópia e diz de quando é.

## O que mostra

- **Encomendas da loja**, com contadores que filtram: pendentes, levantamentos por fazer, em curso, concluídas e
  canceladas. Pesquisa-se pelo número, pelo cliente ou pelo telefone.
  - Cada encomenda abre com os artigos, o pagamento, o levantamento ou a morada da entrega, o cliente, as notas e os
    totais.
- **Produtos do site**, também os ocultos. Ao lado do stock que o site mostra fica **o stock desta loja**, do mesmo
  artigo pela referência do KanGest.
  - Os filtros: à venda, ocultos, sem stock no site, sem referência, e os que **não existem cá** (a referência do
    site não bate com nenhum artigo deste KanGest).

## Alterar, com a conta do site de cada pessoa

Para alterar encomendas no próprio KanGest, cada pessoa carrega em **Entrar** e usa a **sua** conta do site: o email,
a senha e o código da aplicação de autenticação, se a conta tiver MFA. Depois, no detalhe de cada encomenda, aparecem
as alterações possíveis no estado em que ela está:

| Botão | No site | Caminho |
|---|---|---|
| Confirmar | estado «confirmada» | PostgREST, com a RLS |
| A preparar | entrega «a preparar» | `POST /delivery-event` |
| Pronta para levantar | entrega `shipped` numa encomenda de levantamento (o cliente vê «Pronta para levantar») | `POST /delivery-event` |
| Enviada | entrega `shipped` | `POST /delivery-event` |
| Entregue ou Levantada pelo cliente | entrega «entregue» | `POST /delivery-event` |
| Cancelar | cancelada (o stock volta) | `POST /delivery-event` |

Com dinheiro por receber, «Entregue» pergunta quanto se recebeu e como, ou porque se entrega sem receber. Fica como no
painel:
- com «Confirmar pagamentos», o pagamento fica confirmado;
- sem ela, fica por confirmar na caixa;
- sem pagamento, o motivo vai para o registo de segurança e avisa os administradores.

**Tudo vai em nome da pessoa**, com as permissões dela no site e os mesmos avisos ao cliente; o site não distingue do
painel. A senha não fica guardada.

**A sessão:**
- **vive só em memória** (KANGEST ONE, fase A; migração 0069): nenhum token do site vai para o disco. Ao fechar o
  programa, também à força, a sessão morre, e ao abrir outra vez é preciso entrar de novo;
- é só daquele utilizador do KanGest;
- renova-se sozinha;
- acaba ao fim de **12 horas** (um turno), ao sair ou ao desligar a ligação.

**Sem Internet**, a alteração fica em `loja_comandos`, em nome de quem a fez, e segue na volta seguinte da
sincronização com ligação. A barra da Loja online mostra «N à espera de Internet», com a lista e «Repetir as que
falharam». Se a sessão da pessoa já tiver acabado quando a ligação voltar, a alteração fica com erro até ela entrar
outra vez.

Os produtos (publicar, preços, capas) continuam a mudar-se no painel do site: «Abrir no painel do site», no navegador do
KanGest.

Contas que só entram com o Google não têm senha: para entrar no KanGest, a pessoa define uma senha na conta do site.

## Os produtos e as colecções

No separador *Produtos* faz-se tudo como no painel: criar, duplicar, editar, publicar ou ocultar e eliminar produtos,
e criar e editar as colecções (`src/sinc/produtos.rs`, métodos `loja.produto.*` e `loja.coleccao.*`).

- **Com a sessão do site da pessoa,** como nas encomendas: as regras do painel valem, e só passa com «Gerir Catálogo»
  no site. No KanGest, pede-se a permissão `artigos.editar`.
- **Precisa de Internet:** sem ela, os produtos não mudam, e não há fila como nas encomendas.
- **Um produto ligado a um artigo do KanGest** (a referência é a de um artigo daqui) tem bloqueados o preço, a
  promoção, o stock e a própria ligação. Vêm do KanGest, pela sincronização do catálogo. O ecrã desliga esses campos,
  e o servidor tira-os do que envia, se chegarem.
- **Um produto novo entra oculto,** até se publicar (no site, o padrão é visível). Se se liga a um artigo daqui, não
  leva preço nem stock: o artigo volta à fila do catálogo, e o preço e o stock seguem na sincronização seguinte.
- **A cópia de um produto** fica oculta, sem a ligação ao KanGest e sem stock, para não contar duas vezes.
- **Eliminar** pede confirmação. Tudo fica na auditoria do KanGest (`LOJA_PRODUTO`, `LOJA_PRODUTO_ELIMINADO`,
  `LOJA_COLECCAO`).
- **As imagens:** a capa é o endereço de uma imagem. Carregar ficheiros continua a fazer-se no painel do site.

### Na ficha do artigo (KANGEST ONE, fase D)

Na ficha de um artigo com referência, num KanGest ligado ao site, o cartão **«No site da livraria»** mostra o produto
ligado pela referência: o título, o preço e se está à vista ou oculto (`loja.produto.doArtigo`).

**«Publicar no site» e «Ocultar no site»** (`loja.produto.publicarArtigo`) vão com a conta do site da pessoa: precisam de
«Gerir Catálogo» lá e de `artigos.editar` cá, e ficam na auditoria.
- **Nunca se publica a 0 Kz.** O preço vem do posto que manda no catálogo (`catalogo.rs`). Enquanto não chega ao site, a
  publicação é recusada e diz-se porquê. Ocultar pode-se sempre.
- **Um artigo que ainda não está no site** é criado, oculto, pelo posto que manda no catálogo na volta seguinte. A ficha
  diz isso.
- **Sem referência,** a ficha pede uma: é por ela que o site liga o produto ao artigo.

Teste: `o_artigo_no_site_pela_ficha` (`services/tests.rs`, com o site falso).

### As capas dos livros do site (KANGEST ONE, integração total; 27/11)

Cada artigo sem fotografia cuja referência tem um produto do site com capa recebe essa capa como fotografia
(`sinc/capas.rs`, `components/CapasDoSite.tsx`, migração 0073).

**De onde vêm:** a cópia da Loja online já traz a capa de cada produto. As que só estão no Storage do site
(`cover_image`) chegam com o endereço público, que a Edge Function completa nas novidades. A migração 0073 faz os
produtos virem outra vez uma vez, para estas chegarem.

**Como se trazem:**
- **O programa descarrega a capa só de origens conhecidas:** o Supabase e o site da livraria, e o Google Drive, sempre
  por HTTPS. Confere que é mesmo uma imagem, pelos primeiros bytes, com 8 MB no máximo.
- **O endereço nunca vem do ecrã:** é sempre o do produto com a referência do artigo.
- **O ecrã reduz a imagem como a qualquer fotografia** (miniatura e imagem) e guarda-a.
- **Uma fotografia escolhida à mão nunca é substituída.**
- **O que falha fica em `capas_tentadas`** e só se tenta outra vez quando a capa mudar no site.

**Automático com opção manual:** corre sozinho em segundo plano, para quem tem `artigos.editar`. Na Loja online há o
cartão «As capas dos livros do site», com «Trazer agora» e o interruptor «Trazer sozinho», que vale só para este
computador.

Teste: `as_capas_do_site_nos_artigos`. Testes unitários: `o_endereco_da_capa`, `so_de_origens_conhecidas` e
`o_tipo_pela_assinatura`.

### As fotografias dos artigos para o site (o sentido contrário; 27/11)

A fotografia de um artigo segue para o produto do site com a mesma referência quando esse produto não tem capa
(`sinc/capas.rs`, `para_o_site`; migração 0074).

**Como segue:**
- **Uma por volta da sincronização,** no campo `fotos` do pedido, só se o pedido inteiro ficar abaixo de 700 kB antes
  de cifrar. O limite do site é 1 MB, e a cifra acrescenta um terço. Uma fotografia maior do que 600 000 caracteres não
  segue.
- **Só vão as fotografias de artigos activos, com referência,** cujo produto do site (na cópia da Loja online) ainda não
  tem capa.
- **O que o site respondeu fica em `capas_enviadas`,** com a versão da fotografia (`artigo_fotos.alterado_em`):
  - `posta`, `tem_capa` e `sem_produto` não voltam a seguir, a não ser que a fotografia mude;
  - `recusada` tenta outra vez um dia depois;
  - `erro` (ou um site sem resposta para ela) tenta outra vez cada vez mais tarde.

**No site** (`capasDoKanGest` na Edge Function), a fotografia:
- só é aceite do KanGest que manda no catálogo;
- tem de ser JPEG, PNG ou WebP, conferido pelos primeiros bytes, com 750 kB no máximo;
- vai para o Storage como as do painel (`media/stock_books/<id>/kangest-<resumo>.<ext>`);
- passa a `cover_image` do produto só se ainda estiver vazio. Nunca se substitui uma capa.

A alteração fica no registo de segurança, e a capa volta ao KanGest nas novidades. Não há volta em círculo: a capa do
site só vem para artigos sem fotografia.

**Automático, com a opção manual:** está ligado por omissão. Na Loja online, o cartão «As fotografias dos artigos para
o site» mostra quantas já são capas, quantas esperam e o motivo das recusas. O interruptor «Enviar sozinho» desliga-o
neste computador (`config` `sinc.fotos_para_o_site`).

Testes: `as_fotos_dos_artigos_para_o_site` (Rust) e `limparFotosKanGest` (`kangestSinc.test.ts`).

### Os dados dos livros do site nas fichas dos artigos (27/11)

As novidades do site trazem, de cada livro, o autor, a editora, o idioma, o ano e as páginas, além do ISBN que já
traziam. Um artigo activo com a mesma referência completa a ficha com eles (`sinc/fichas.rs`; migração 0075):
- **os dados do livro** (os mesmos campos da ficha de uma livraria): só os que faltam. O ano e as páginas só quando o
  site tem mais do que 0;
- **o código de barras:** o ISBN do site, em ISBN-13, se o artigo não tiver nenhum, se o ISBN for válido e se nenhum
  outro artigo já o usar. Não volta ao site, que é de onde veio.

**Nunca se substitui o que está na ficha.** O que veio fica em `fichas_do_site`, campo a campo:
- um campo que já veio uma vez não volta;
- se alguém o apagar à mão, fica apagado.

Cada vez que se completam fichas, fica uma linha na auditoria (`FICHA_DO_SITE`).

**Automático, com a opção manual:** corre depois de cada volta da sincronização que traga produtos. Na Loja online, o
cartão «Os dados dos livros do site» mostra quantos artigos podem receber alguma coisa, com dois comandos:
- «Completar agora», para completar na hora;
- «Completar sozinho», que o desliga neste computador (`config` `sinc.dados_dos_livros`).

Na primeira volta depois de actualizar, o KanGest volta a pedir o catálogo do site, para conhecer estes dados dos
produtos que já tinha.

Testes: `os_dados_dos_livros_do_site_nas_fichas` e `fichas::testes` (Rust), e `kangest-central.mjs` (PGlite).

### Os dados das fichas para os produtos do site (o sentido contrário; 27/11)

O que a ficha de um artigo tem e o produto do site com a mesma referência não tem segue na volta da sincronização
(`sinc/fichas.rs`, `livros_para_o_site`; migração 0076):
- **o que vai:** o autor, a editora, o idioma, o ano e as páginas da ficha, e o ISBN, que é o código de barras quando
  este for um ISBN válido;
- **como se sabe o que falta no site:** pela cópia da Loja online, que traz estes dados desde a 20261127100000;
- **até 50 livros por volta,** no campo `livros` do pedido. Se forem 50, a volta seguinte vem logo a seguir.

**O que o site respondeu fica em `livros_enviados`,** com a versão (o que foi, em texto):
- `feito` e `sem_produto` não voltam a seguir, a não ser que a ficha mude;
- `recusado` tenta outra vez um dia depois;
- `erro` (ou um site sem resposta para eles) tenta outra vez cada vez mais tarde.

**No site** (`limparLivrosKanGest` e `public.kangest_dados_dos_livros`):
- só se aceitam do KanGest que manda no catálogo;
- os textos ficam numa linha e com o tamanho das colunas. O ano e as páginas só entram como números inteiros razoáveis,
  e o ISBN só se for um ISBN-13 válido;
- **só se preenche o que está vazio** (o ano e as páginas a 0 contam como vazios). O ISBN só entra se nenhum outro
  produto o tiver. A editora que o site põe nos rascunhos («Livraria e Editora Adventista») não se substitui.

O produto muda de data de alteração e volta ao KanGest nas novidades. Não há volta em círculo: cada sentido só mexe no
que o outro lado não tem.

**Automático, com a opção manual:** está ligado por omissão. O cartão «Os dados dos livros do site» mostra quantos
foram, quantos esperam e o motivo das recusas. O interruptor «Enviar para o site» desliga-o neste computador (`config`
`sinc.dados_para_o_site`).

Testes: `os_dados_das_fichas_para_o_site` e `fichas::testes` (Rust), `limparLivrosKanGest` (`kangestSinc.test.ts`) e
`kangest-central.mjs` (PGlite).

## Tempo real

O servidor da loja fica ligado ao Realtime do site e ouve o tópico secreto deste posto (`src/sinc/tempo_real.rs`;
docs/KANGEST-SINCRONIZACAO.md §9 na raiz da livraria). Quando muda uma encomenda da loja, o site manda o sinal
«novidades», **sem dados**, e o KanGest vai logo buscá-las pelo canal assinado e cifrado. A encomenda aparece em
segundos, em vez de até 2 minutos, e o ecrã actualiza-se sozinho.

**Uma encomenda nova dá um aviso** no computador da loja («Encomenda nova na loja online · LIV-1234 · Ana Silva»). Com
mais de três de uma vez, o aviso é um só, com o número. A primeira cópia não avisa, porque traz todas as encomendas de
uma vez.

Se a ligação ao Realtime cair, volta a tentar (5 s, 10 s… até 5 minutos). Entretanto a pergunta de 2 em 2 minutos
continua, por isso nada se perde. O tópico vem do site no emparelhamento e muda a cada emparelhamento.

## Quem vê

Quem tem a API e Integrações (`sistema.api`), os relatórios (`relatorios.ver`) ou quem factura ao balcão
(`vendas.fatura_recibo`). As encomendas têm o nome e o telefone dos clientes. A cópia fica na base cifrada (SQLCipher)
e **apaga-se ao desligar** a ligação, ou ao ligar a outro posto.

## Como chega

Em cada pedido da sincronização, o KanGest manda os seus cursores. Os documentos da fila saem logo (de 30 em 30
segundos); sem nada para enviar, as novidades pedem-se de 2 em 2 minutos, porque cada pedido conta na quota da Edge
Function. «Sincronizar agora», no ecrã da ligação, pede-as já. O site responde com o que
mudou desde então (`public.kangest_novidades`, docs/KANGEST-SINCRONIZACAO.md §7 na raiz da livraria):
- até 200 encomendas e 200 produtos por pedido;
- mais pedidos seguidos na mesma volta, enquanto houver.

Cada encomenda ou produto alterado no site volta a vir e substitui o que havia (`loja_encomendas`, `loja_produtos`,
`sinc_cursores`; migração 0054).

## Testes

`services/tests.rs` (`loja_online_conta_do_site`):
- sem sessão do site não se altera nada;
- a sessão fica só em memória: a base não tem tabela de sessões, e nem a cópia decifrada da base tem os tokens;
- sem Internet, as alterações ficam na fila em nome de quem as fez, com o pagamento;
- só as alterações conhecidas e ids que podem ir num endereço;
- a volta sem Internet não as perde;
- o turno de 12 horas, sair, e desligar apaga tudo.

`sinc/pessoa.rs` testa as acções e os estados da entrega, os ids, o turno, o nível do token e as mensagens.

`services/tests.rs` (`loja_online_copia_local`):
- as novidades entram e uma alteração actualiza, sem duplicar;
- os contadores, os filtros e a pesquisa;
- um filtro desconhecido não chega ao SQL;
- o detalhe e o stock desta loja pela referência;
- os cursores;
- desligar apaga a cópia.

`sinc/loja.rs` testa os filtros fixos e a leitura do JSON.

## Clientes e pagamentos

Dois separadores novos na Loja online, ao lado das Encomendas e dos Produtos:

- **Clientes** (`loja.clientes`): quem encomendou nesta loja pelo site. Sai da cópia local das encomendas, por isso
  funciona sem Internet e só mostra os desta loja. A mesma pessoa junta-se pelo nome e o telefone. Para cada cliente
  mostra quantas encomendas fez, quantas estão em aberto, o total (sem as canceladas) e a última. Clicar num cliente
  mostra as encomendas dele.
- **Pagamentos** (`loja.pagamentos`, `src-tauri/src/sinc/pagamentos.rs`): o mesmo relatório do painel do site
  («Pagamentos e caixa», `public.payments_report`), pedido com a conta do site da pessoa. Por isso só o vê quem lá pode
  ler os pagamentos. Por período (este mês, o mês passado, os últimos 30 dias) mostra:
  - o recebido líquido, com os reembolsos (as devoluções em dinheiro);
  - o que está por confirmar e o que há por receber;
  - o entregue sem pagamento;
  - o recebido por método, e a lista dos pagamentos por confirmar, cada um a abrir a encomenda no KanGest.

  **Só se lê:** confirmar um pagamento e reembolsar fazem-se no painel (o botão leva lá). Um pagamento só fica
  confirmado pelo gateway ou por quem tem «Confirmar pagamentos».

## Igrejas

As igrejas, os grupos e as companhias do registo da Igreja do site chegam nas novidades dos postos, como as encomendas
e o catálogo (`loja_igrejas`, migração 0067; no site, `kangest_novidades`, migração `20261126160000`). Seguem o número
(CN), o nome, o tipo, o distrito, o campo, a província, o município, a morada, o delegado e se está activa. Os
pastores, os telefones e as notas ficam no site.

Em **Livraria → Loja online → Igrejas** pesquisa-se pelo nome, pelo CN, pelo distrito ou pelo município, e filtra-se por
activas, sem cliente ou todas. **«Criar cliente»** (com a permissão «Clientes») grava o cliente com o nome, a morada e,
nas observações, o registo (CN, distrito, campo e delegado), e fica ligado à igreja para a loja lhe facturar. Uma
actualização que chegue depois do site não desfaz a ligação.
