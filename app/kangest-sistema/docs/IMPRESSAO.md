# A impressão dos documentos

Como o KanGest Livraria imprime as facturas e os outros documentos. Há três caminhos:
- **A4 e A5** pelo diálogo de impressão do sistema;
- **o talão de 80 ou 58 mm** pelo diálogo do sistema;
- **o talão térmico em ESC/POS**, directo à impressora, que corta o papel e abre a gaveta (`services/impressao.rs`).

A regra é a de sempre no KanGest Livraria: **tudo automático por omissão, e sempre com a opção manual ao lado**. O que a lei
exige não se desliga à mão.

## Vias

**Automático:**
- **A primeira impressão** de um documento é o **«Original»**. Com mais vias, seguem-se o «Duplicado», o «Triplicado»
  e o «Quadruplicado». O Original é do cliente; o Duplicado fica na loja.
- **Uma reimpressão** sai sozinha como **«2.ª via em conformidade com o original»**, como a AGT exige.
  - Isto vale para qualquer impressão depois da primeira: outra vez no diálogo, no talão térmico ou na impressão
    automática do POS.
  - O programa sabe-o pelo registo das impressões (`documento_impressoes`, migração 0059). Antes, a 2.ª via era uma
    caixa que alguém tinha de se lembrar de marcar.
- **A via vai no canto superior direito** em todos os formatos: no A4 e no A5 (como já ia) e, agora, também no talão
  (pelo sistema e em ESC/POS).
- **Cada impressão fica registada**: as vias, se foi 2.ª via, o formato, quem imprimiu, o posto e quando. O diálogo
  mostra «Impresso N× · a última por … em …».

**Manual (no diálogo de impressão):**
- **O número de vias.** Vem sozinho do tipo de documento ou do posto (no POS), e muda-se ali.
- **«Para o cliente».** Imprime só a via do cliente: o Original, ou a 2.ª via se o documento já foi impresso.
- **«2.ª via».** Num documento que nunca foi impresso, pode marcar-se à mão. Num já impresso, fica marcada e bloqueada,
  porque é o que a lei pede.
- **O formato.** A4/A5 (o do tipo de documento) ou talão (80 ou 58 mm, conforme o posto). No POS, o talão vem sozinho.

## Quem emitiu e quando

Todos os documentos dizem quem os emitiu e quando:
- **No A4 e no A5**, por baixo da via: «Emitido em 25/11/2026 10:30 por Ana». O nome segue a opção «Mostrar o
  operador» do tipo de documento (ligada por omissão).
- **No talão**: «Emitido por Ana em 25/11/2026 10:30», no lugar do antigo «Operador:».
- **Numa 2.ª via**, também quem a imprimiu e quando: «2.ª via impressa por Rui em 26/11/2026 09:15».

## Proforma e factura

O programa sabe pela classe do tipo de documento:
- **A proforma, o orçamento e a nota de encomenda** dizem «Este documento não serve de factura» e mostram a validade.
  A proforma mostra também as contas bancárias.
- **A factura e a factura/recibo** levam a assinatura da AGT (os 4 caracteres do hash) e o QR da Facturação
  Electrónica, quando a há.

## Testes

`services/tests.rs` (o teste da impressão térmica):
- a primeira impressão com o Original e o Duplicado e quem emitiu;
- a reimpressão da mesma venda sai sozinha como 2.ª via, com quem a imprimiu;
- o registo das impressões (o diálogo também regista).
