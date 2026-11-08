# Níveis dos leitores e a Comunidade de Leitores

Decisões do dono, 2026-11-08. Migração `20261108131000_niveis_dos_leitores`; cenários em
`scripts/pglite/cargos-e-niveis.mjs`.

## Os níveis

| Nível | Como se chega | O que dá |
|---|---|---|
| **Conta nova** | ao criar conta | ler, gostar, responder, conversar com a loja |
| **Leitor** | pagar o primeiro livro — ou participar sem comprar (abaixo) | entrar na **Comunidade de Leitores**: criar publicações e o clube do livro; distintivo «Leitor» |
| **Leitor assíduo** | 5 livros pagos | distintivo |
| **Leitor de honra** | 15 livros pagos | distintivo |

- Conta como livro o que o site trata como tal (`isBook` em `lib/productTypes.js`): livro,
  Bíblia/hinário e lição/revista, pela quantidade, em encomendas **pagas** e não canceladas.
  Itens antigos sem tipo contam como livro.
- São distintivos e reconhecimento: **não mexem em preços**.
- Uma vez Leitor, não se volta a «Conta nova»: um reembolso pode baixar o distintivo (de assíduo
  para Leitor), nunca tirar a entrada na comunidade.
- O que já estava publicado antes desta regra mantém-se.
- A equipa (administradores e gestores) publica sempre.

## Entrar sem comprar

Quem participa sem comprar também entra: por omissão, **conta com 30 dias e 5 dias diferentes a
usar o site** com a conta. O site conta um dia por conta e por dia (`components/ReaderActivity.jsx`
→ `public.reader_touch()`), só a data, em `reader_activity_days`; os dias apagam-se quando a conta
passa a Leitor. A regra liga-se e desliga-se, e os números mudam-se, em **Painel › Comunidade ›
Níveis dos leitores** (quem tem «Gerir Catálogo»), que mostra também quantos há em cada nível.

## Onde aparece

- **Perfil**: «O seu nível de leitor», com os livros, desde quando é membro e o que falta para o
  seguinte; para a conta nova, os dois caminhos de entrada.
- **Comunidade**: a conta nova vê «Publicar é para a Comunidade de Leitores» no lugar da caixa de
  publicar; ao lado do nome de cada autor, o distintivo (`community_reader_levels`, pela chave
  pública do leitor, nunca pelo id).
- **Perfil público do leitor** (`/comunidade/leitor/…`): o distintivo ao lado dos selos.
- **Menu da conta** (avatar no cabeçalho): o distintivo por baixo do nome.
- **Painel, ficha do cliente**: o distintivo e os livros pagos, para a equipa saber com quem fala.
- **Sino**: ao subir de nível chega um aviso («Bem-vindo à Comunidade de Leitores», «Subiu de
  nível: Leitor assíduo»).
- **Política de privacidade**: secção da comunidade, «Níveis de leitor».

## Na base de dados

- `profiles.reader_level`, `reader_books`, `reader_since`, `reader_via` (`compra` ou
  `participacao`). Só mudam por `private.reader_recompute` (gatilho nas encomendas, quando o
  pagamento, o estado, os itens ou o cliente mudam) e `public.reader_touch`; uma escrita directa
  pela API é ignorada (`profiles_reader_guard`).
- O gatilho das encomendas não tem lista de colunas de propósito: o estado do pagamento muda dentro
  do gatilho dos pagamentos registados, e um gatilho `of payment_status` só correria com a coluna no
  `SET`.
- Publicar: `community_posts_reader_gate` recusa novas publicações (não as respostas) a contas novas.
- `public.reader_status()`, `public.reader_touch()`, `public.community_reader_levels(text[])`,
  `public.reader_levels_summary()` (equipa); regras em `public.reader_settings` (uma linha).
- Quem já tinha comprado entrou na migração, sem aviso.
