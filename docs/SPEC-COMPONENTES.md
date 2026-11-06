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

## 7. Verificação

- Teste unitário de regras: `app/web/src/lib/personDataChecks.test.js`.
- Antes de fechar uma alteração de elemento: `npm run lint` em `app/web`, `npx vitest run`, e uma olhada na ficha e na lista com tema claro e escuro, e em telemóvel (16px de margem, sem scroll horizontal).
