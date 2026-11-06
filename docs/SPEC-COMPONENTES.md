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
- Antes de fechar uma alteração de elemento: `npm run lint` em `app/web`, `npx vitest run`, e uma olhada na ficha e na lista com tema claro e escuro, e em telemóvel (16px de margem, sem scroll horizontal).
