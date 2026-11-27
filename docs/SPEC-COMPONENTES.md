# Spec: elementos pequenos do painel

Estado em 2026-11-06. Descreve os elementos pequenos que se repetem no painel (`/admin`, módulo Utilizadores, Atendimento). Quando um elemento mudar, muda aqui e no código, no mesmo commit.

Os elementos vivem em `app/web/src/components/admin/users/userFormat.jsx` (partilhados). Não se criam variantes locais: se um ecrã precisar de outra aparência, acrescenta-se um parâmetro ao elemento existente.

## 1. Código (`CodeChip`)

Identifica uma pessoa ou um produto pelo código. Uso: lista de Utilizadores, ficha do utilizador, lista e cabeçalho do Atendimento (só equipa).

| Propriedade | Valor |
|---|---|
| Forma | `inline-flex`, `rounded-md`, borda de 1px |
| Tipografia | `font-mono text-[11px] leading-4 tabular-nums`, sem quebra (`whitespace-nowrap`) |
| Espaço | `px-1.5 py-px` |
| Cliente (`CLI-`) | verde: `bg-emerald-500/10`, `text-emerald-700` (escuro: `text-emerald-300`), borda `emerald-500/30` |
| Funcionário (`FUN-`) | azul: `bg-sky-500/10`, `text-sky-700` (escuro: `text-sky-300`), borda `sky-500/30` |
| Sem código | não renderiza (devolve `null`) |
| Texto de ajuda | `title` diz "Código de cliente" ou "Código de funcionário" |

Regras:
- Agrupa-se com `flex flex-wrap gap-1`, nunca com texto separado por "·".
- O código mostra-se tal como está na base de dados (`CLI-000001`), em maiúsculas.

## 2. Etiqueta (`Pill`)

Estado, papel ou tipo numa linha.

| Propriedade | Valor |
|---|---|
| Forma | `rounded-full`, `px-2 py-0.5` |
| Tipografia | `text-[11px] font-semibold whitespace-nowrap` |
| Cor | sempre via `className`, a partir de `ROLE_BADGE` ou `accountState` (nunca cores soltas) |

Estados em uso: papel (admin roxo, gestor azul, cliente cinzento, sem conta âmbar), conta (activa verde, por confirmar laranja, suspensa vermelha).

## 3. Campo de ficha (`Info`)

Par rótulo/valor na ficha. Rótulo em `text-xs text-muted-foreground`; valor em `text-sm`, com `break-words`. Ícone de `h-4 w-4` na cor `text-muted-foreground`.

Ordem na ficha: Email, Telefone, Código de cliente, Código de funcionário, Conta criada, Último acesso.

## 4. Dados por confirmar

Caixa de aviso quando `personDataWarnings(person)` devolve textos (`app/web/src/lib/personDataChecks.js`).

| Propriedade | Valor |
|---|---|
| Caixa | `rounded-lg border border-amber-500/30 bg-amber-500/5 p-3` |
| Título | `text-xs font-semibold uppercase tracking-wide text-amber-700`, ícone `AlertTriangle` |
| Textos | `text-sm text-amber-800`, um por linha |

Só avisa; nunca bloqueia nem altera dados. Os textos são fixos e curtos, em frases completas: "Falta o telefone.", "Telefone incompleto: confirmar o número."

## 5. Cores e modo escuro

- Usar sempre pares claro/escuro (`text-sky-700 dark:text-sky-300`).
- Os fundos são transparências da cor (`/10`, `/5`), nunca cor sólida, para funcionar com o tema de vidro (`ui_glass_enabled`).
- Não usar cor para ser o único sinal: o texto do elemento diz sempre o que é.

## 6. Textos

- Português de Angola/Portugal: "guardar", "eliminar", "telemóvel", "activo".
- Rótulos curtos (2 a 4 palavras). Sem pontos finais nos rótulos; com ponto final nas frases de aviso.

## 7. Cores do tema

| Classe | Variável | Para quê |
|---|---|---|
| `primary` | `--primary` | Texto, preços, botões. No tema claro é a variante legível da cor da marca (`--brand-ink`). |
| `marca` | `--marca` → `--brand-primary-hsl` | Só decoração: fundos claros (`bg-marca/5`, `/10`), bordas, anéis de foco. **Nunca texto**: sobre branco não chega ao contraste da WCAG. |

As duas vêm de Configurações → cor principal (`applyShopTheme` em `app/web/src/lib/shopTheme.js`). Não se escreve `#0ea5c9` (nem outra cor da marca) à mão: deixava o painel sem efeito nesses sítios. Cores escolhidas pelos utilizadores (grupos de contactos) e as dos gráficos ficam como valores.

## 7a. Estados partilhados com o KanGest (KANGEST ONE, fase G)

As cores de estado, os raios, o movimento e a escala de texto vêm de um ficheiro que o site e o KanGest partilham:
[`packages/marca/tokens.css`](../packages/marca/tokens.css), lido pelo Tailwind 4 dos dois lados. As cores da marca
não estão lá: o site mantém o petróleo e o ouro, e o KanGest o verde-azulado.

| Estado | Texto ou ícone | Fundo suave | Quando |
|---|---|---|---|
| Certo | `text-estado-ok` | `bg-estado-ok-fundo` | bate certo, ligado, tudo enviado |
| Aviso | `text-estado-aviso` | `bg-estado-aviso-fundo` | precisa de atenção, mas nada parou |
| Erro | `text-estado-erro` | `bg-estado-erro-fundo` | parou, foi recusado, ou é um risco de segurança (o ADMIN de recurso) |
| Informação | `text-estado-info` | `bg-estado-info-fundo` | uma nota neutra |

| Propriedade | Classes |
|---|---|
| Raios | `rounded-campo` (campos), `rounded-cartao` (cartões), `rounded-pilula` (etiquetas e pontos de estado) |
| Movimento | `ease-kg`. As durações (`--duracao-kg`, `--duracao-kg-rapida`) vão a zero com `prefers-reduced-motion` |
| Texto | `text-legenda`, `text-corpo`, `text-titulo-cartao` |

Regras:
- **Um estado novo usa estas classes,** não verdes, âmbares ou vermelhos soltos (`emerald-*`, `amber-*`, `red-*`).
  - Já as usam: os postos do KanGest, as sessões, o livro de stock e a saúde do ecossistema, no painel do site; e os
    cartões do ecossistema no painel inicial do KanGest.
- **O modo escuro já vem nos tokens:** `.dark` no site, `[data-tema="escuro"]` no KanGest. Não se acrescenta `dark:` a
  estas classes.
- **Cada par texto e fundo passa o contraste AA** (4,5:1), também sobre as superfícies dos dois lados, em claro e em
  escuro. Prova-o `packages/marca/contraste.test.mjs`. Mudar uma cor obriga a passar esse teste.
- **Os elementos antigos** (o `CodeChip`, a `Pill`) passam para os estados quando forem tocados, no mesmo commit que
  muda esta secção.

## 7b. A forma dos controlos (a revisão do estilo de 27/11, escolhas do dono)

O dono escolheu as cinco propostas da revisão do estilo do site, a 27/11. Valem para o site público e são a mesma
linguagem do KanGest.

| O quê | Regra | Onde |
|---|---|---|
| **Acções** (botões e ligações que fazem alguma coisa) | Os cantos dos campos: `rounded-md`, como o `Button` e o `Input`. Nunca em pílula. | o `Button` por omissão; o cabeçalho, a faixa do Início, a pesquisa, «Entrar» e «Criar conta», o «Carregar mais» |
| **Filtros** | Em pílula, sempre com o mesmo componente: `FilterChip` (`components/ui/filter-chip.jsx`), que diz o estado no `aria-pressed`. | os géneros da Loja, as províncias das Lojas |
| **Etiquetas** (contagens, descontos, sugestões, selos) | Em pílula. | as que já existem |
| **Rótulos pequenos** (os grupos dos filtros, dos menus e das listas) | O utilitário `rotulo`: a letra do texto, a 13 px, em meio-negrito, sem maiúsculas nem espaçamento. A letra dos títulos fica só nos títulos. | os filtros da Loja, o menu grande, o menu da conta, as Lojas e a sua galeria, o rodapé, as Coleções, os documentos legais |
| **Botão do chat** | 44 px no telemóvel (o mínimo para o dedo) e 40 px no computador. Recolhe-se enquanto a página desce e volta quando pára ou sobe (`useRecolherAoDescer`). | `LivrariaAssistant` |
| **Faixa com livros** | Na Loja, os livros ficam à direita, longe do texto (`PageBannerSlider` com `livrosADireita`). No computador, a imagem ocupa a parte da direita e desvanece para a cor da faixa; o véu é mais escuro do lado do texto (`veuDoLadoDoTexto`). | a Loja |

A comunidade tem a sua própria linguagem editorial (as cores `editorial-*` e os botões em pílula) e ficou fora desta
revisão.

## 8. Ficha de produto

Ordem, de cima para baixo, no telemóvel e no computador:

1. Título, gancho, subtítulo, códigos (`LIV-…`, ISBN), editora e idioma.
2. Preço.
3. Variantes e quantidade. O nome segue o tipo (`variantNames` em `lib/productTypes.js`): **Tamanho** no vestuário, uniformes e Desbravadores, **Edição** nos livros, bíblias e revistas, **Opção** no resto. Abre na primeira com stock; uma esgotada aparece riscada e, escolhida, diz "Este tamanho esgotou. Escolha outro.".
4. **Comprar Agora** e **Adicionar ao Carrinho**, logo a seguir ao preço. No computador ficam no primeiro ecrã.
5. Amostra (só com páginas reais, ver abaixo), WhatsApp, stock.
6. Resumo da descrição (até 280 caracteres) com "Ler a descrição completa", que leva ao separador Detalhes. O texto completo só aparece uma vez, em Detalhes.
7. Benefícios e público.

A capa mostra-se **inteira**: `aspect-[3/4]` com `object-contain`, em todos os tamanhos. Num livro a capa é o produto; `object-cover` cortava-a.

"Comprar Agora" abre o carrinho sem aviso por cima (o aviso tapava "Continuar para Checkout"). "Adicionar ao Carrinho", nos cartões e na pré-visualização rápida, fica na página e mostra o aviso com "Ver": quem junta vários livros não é interrompido.

**Produtos com variantes** (`needsVariantChoice`) não se compram no cartão, na vista rápida nem nos destaques, que só conhecem a variante base: o botão diz "Escolher" (no cartão) ou "Escolher o tamanho" / "Escolher a edição" e leva à ficha. O `addToCart` recusa a variante base desses produtos, o carrinho tira-a ao revalidar e o `place_order` também a recusa.

**Stock de uma variante:** o menor entre o dela e o do produto (`variantStock` em `api/EcommerceApi.js`), porque o `place_order` verifica os dois.

**Amostra de leitura:** só com `preview_enabled` e páginas carregadas no painel (`hasReadingSample`), e abre sempre o leitor das páginas reais (`SampleReaderModal`). Não há amostra gerada: a antiga inventava um prefácio e um capítulo iguais para todos os produtos.

### Botões flutuantes

O botão do chat recolhe-se enquanto a página desce (§7b). O assistente (chat) e o "Voltar ao topo" não aparecem em todas as páginas. A regra está em `lib/floatingButtons.js` (`isFloatingHidden`), e a escolha é do painel: Configurações → Assistente IA → **Botões flutuantes**, com uma caixa por página para cada botão (marcado = aparece). Por omissão ficam fora da ficha do produto, da encomenda feita e do rastreio, e de entrar e recuperar a palavra-passe, onde tapavam os botões de compra, os avisos de stock e o formulário de pagamento. O regresso ao topo ao mudar de página acontece sempre; só o botão é que se esconde.

### Comunidade

**Páginas e ficheiros:**
- `/comunidade` (`pages/CommunityPage.jsx`): topo editorial, clube do livro do mês, temas à esquerda, feed ao centro e coluna lateral. No telemóvel é uma coluna, com os temas em chips que deslizam.
- `/comunidade/p/:id` (`CommunityPostPage.jsx`): a publicação com todas as respostas.
- `/comunidade/leitor/:key` (`ReaderProfilePage.jsx`): o perfil público do leitor.
- O separador **Discussão** da ficha usa o mesmo `CommunityFeed`, já filtrado pelo livro.
- Componentes em `components/community/`. Lógica em `hooks/useCommunity.jsx` (feed) e `hooks/useCommunityThread.jsx` (uma publicação). Funções puras em `lib/communityStyle.js`.

**Visual:**
- Paleta editorial dos emails, com os tokens `editorial-*` do Tailwind: `papel`, `tela`, `filete`, `ouro`, `ouro-texto`, `tinta`, `tinta-suave`, `marinho`, `petroleo`.
- Títulos em Source Serif 4 e filete dourado (`GoldRule`).
- Contraste verificado: o dourado só aparece em texto como `ouro-texto`.

**Filtros:** ficam no endereço (`?tema=&tipo=&ordem=&q=&livro=`), por isso um filtro partilha-se com o link. As ordenações são Recentes (as fixadas primeiro), Em alta e Sem resposta.

**Cartão (`PostCard`):**
- monograma com cor por leitor, e nome que leva ao perfil;
- selo "Equipa da Livraria" e fita "Fixada pela equipa";
- chips de tipo e tema, e "Respondida" nas perguntas com resposta oficial;
- "Ler mais" depois de 6 linhas;
- citação em destaque e cartão do livro com capa;
- barra de acções: gostar, responder e partilhar (WhatsApp ou copiar). O menu ⋯ tem denunciar e apagar; a equipa tem também fixar, resposta oficial e ocultar.
- No feed mostra a resposta oficial e as últimas; na página da publicação mostra todas, com o editor aberto.

**Editor (`PostComposer`):** fechado, é uma barra com o monograma. O botão "Escrever" do topo procura-o pelo marcador `data-composer-open`. Aberto, tem o tipo (cartões), o tema, o livro (pesquisa com capas), a citação com página (obrigatória numa Citação) e até 5 links.

**Links de utilizadores:**
- só http(s) (`lib/communityLinks.js`), sempre com `rel="nofollow ugc noopener noreferrer"` e `target="_blank"`;
- nunca `dangerouslySetInnerHTML`;
- a base de dados recusa sites adultos, maliciosos e encurtadores.

**Autor:** nome do perfil e monograma; nunca email nem foto. O endereço do perfil usa o `reader_key`, não o id da conta.

**Avisos:** o sino (`components/NotificationBell.jsx`) junta os da comunidade e os do atendimento e recarrega a cada minuto enquanto a página está à vista. O perfil tem o separador **Notificações**, com o interruptor dos da comunidade. O push sai pela Edge Function.

**Moderação:** "Denunciar" com motivo; à 3.ª denúncia a publicação fica oculta. O painel → Clientes → Comunidade tem os separadores Denúncias, Publicações, Temas, Clube do livro e Sites bloqueados.

**Partilha:** a Pages Function `functions/comunidade/p/[id].js` escreve o título, o texto e a capa nas etiquetas `og:`.

Sem as migrações aplicadas, o site mostra "A comunidade abre em breve".

## 9. Carrinho e checkout

- **Passos com nome**: "1. Carrinho", "2. Dados e pagamento".
- **Avisos fora do resumo recolhível.** No telemóvel o resumo vem fechado; tudo o que o cliente precisa de saber para avançar (manutenção, conta) fica sempre à vista.
- **Não exige conta**, nem para entrega. O cliente acompanha a encomenda pelo número e email (Rastrear encomenda).
- **Campos**: cada campo tem rótulo ligado (`htmlFor`/`id`, ou `aria-label`) e `autocomplete` (`name`, `email`, `tel`, `street-address`). No seletor de morada os ids vêm de `useId()`.
- **Pagamentos**: só os que servem para o envio escolhido (`payment_methods.shipping_methods`; "Pagar no Balcão" só no levantamento). Quando se paga diz-se em português: "paga na entrega", "paga no levantamento", "paga depois de encomendar".
- **Pagar depois** (transferência, Multicaixa): sem referência obrigatória no checkout. Depois de confirmar, a página de sucesso e o rastreio mostram a caixa "Como pagar" (`PayLaterBox`): total, número da encomenda como descritivo, dados para copiar e o campo da referência.
- **Dados de pagamento** (IBAN, número) na fonte normal com algarismos de largura fixa, não monoespaçada: nesta o "O" de AO06 e o zero eram iguais. Botão "Copiar".
- **Assinatura opcional.** Quem recebe assina na entrega.
- **Resumo antes do botão** só com o que o cliente escreveu; nunca "— ·" nem uma cidade por omissão.

## 10. Verificação

- Teste unitário de regras: `app/web/src/lib/personDataChecks.test.js`.
- O contraste AA dos estados partilhados: `packages/marca/contraste.test.mjs` (corre com o vitest do `app/web`).
- Antes de fechar uma alteração de elemento: `npm run lint` em `app/web`, `npx vitest run`, e uma olhada na ficha e na lista com tema claro e escuro, e em telemóvel (16px de margem, sem scroll horizontal).
