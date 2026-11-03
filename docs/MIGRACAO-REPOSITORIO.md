# Migração do repositório

A 2026-11-03 o projecto passou de **`ValentinoCanguele/livraria_Cunhinga`** (público) para
**[`fernandotunas6-bot/Livraria-Editora-Adventista`](https://github.com/fernandotunas6-bot/Livraria-Editora-Adventista)** (privado).

Um push leva commits, ramos e etiquetas. **Não leva mais nada.** Este documento lista o que
ficou atrás e o que tem de ser refeito à mão.

## O que migrou

Todo o histórico, desde o primeiro commit, mais sete ramos e a etiqueta `v0.2.0`:

| Ramo | Commit | Nota |
|------|--------|------|
| `main` | `f4d9885` | igual ao `main` antigo; a migração do Supabase já integrada (2026-11-02) |
| `claude/youthful-heisenberg-rq5gnw` | `da8546b` | o ramo de trabalho, 49 commits à frente do `main` |
| `supabase/migracao` | `4c52064` | já integrado no `main` |
| `deploy/atendimento-20261103` | `dda616d` | — |
| `a5/refino` | `7c26aa1` | — |
| `cursor/fix-sw-dev-blank-screen` | `dd33668` | sem backend |
| `cursor/fix-pocketbase-payment-hooks` | `553a5b9` | era PocketBase |

Não migraram o `main` **local** antigo (era PocketBase, 114 commits atrás) nem o
`publicar-tmp`, que é um worktree temporário do script de publicação.

Em cima do `main` foi feito um commit só para o README da página de entrada não apontar para o
repositório antigo (`e8c55c7`). A revisão completa da documentação está no ramo de trabalho e
chega ao `main` com o PR desse ramo.

Os workflows em `.github/workflows/` migraram como ficheiros — não a configuração de que
precisam (secção 1).

## O que NÃO migrou — por fazer no repositório novo

### 1. Segredos e variáveis do Actions

Settings → Secrets and variables → Actions. Sem isto, `deploy-cloudflare.yml` e
`deploy-supabase.yml` param logo no passo que confirma os segredos.

| Tipo | Nome | Valor |
|------|------|-------|
| Variável | `VITE_SUPABASE_URL` | `https://bggqkjjqbjhbjsckzopj.supabase.co` |
| Variável | `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave *publishable* (Supabase → API Keys) |
| Variável | `CLOUDFLARE_PAGES_PROJECT` | `livraria-adventista` |
| Variável | `SUPABASE_PROJECT_REF` | `bggqkjjqbjhbjsckzopj` |
| Secret | `CLOUDFLARE_API_TOKEN` | Token com *Cloudflare Pages: Edit* |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | ID da conta Cloudflare |
| Secret | `SUPABASE_ACCESS_TOKEN` | Token pessoal do Supabase |
| Secret | `SUPABASE_DB_PASSWORD` | Palavra-passe da base de dados |

Os valores estão na conta de cada serviço, não neste repositório. Detalhe em
[LANCAMENTO.md](LANCAMENTO.md), secção 2.

### 2. Actions: verificar se a conta nova corre workflows

Na conta antiga o Actions estava bloqueado por um problema de facturação. Fazer um push e ver
se o workflow arranca. Se não arrancar, é da conta nova — ver [HANDOFF.md](HANDOFF.md),
"Bloqueios". Enquanto isso, o gate real é `npm run deploy:site`, que corre lint, testes e
build antes de publicar.

### 3. Pull requests

Os PRs não se transferem. Os dois que estavam abertos no repositório antigo foram fechados a
2026-11-03, cada um com uma nota a explicar a migração, antes de o repositório ser arquivado
(um repositório arquivado fica só de leitura — depois não dá para fechar nada):

- **#2** — "Migração do backend: PocketBase → Supabase + deploy no Cloudflare Pages"
  (`supabase/migracao`). O conteúdo já estava no `main`, pelo #3.
- **#4** — "Autenticação verificada no arranque e sistema de emails transaccionais"
  (`claude/youthful-heisenberg-rq5gnw`). **Fechado por migração, não por rejeição — o trabalho
  continua válido.** O ramo migrou com o código: **falta reabrir este PR no repositório novo**,
  contra o `main`.

O #1 e o #3 estão integrados (merged) e o seu código está no `main`.

### 4. Acessos e configuração do repositório

- Colaboradores e permissões.
- Protecção de ramos / rulesets no `main`.
- Ramo por omissão: confirmar que é `main`.
- Descrição e tópicos do repositório.
- Webhooks e integrações (nenhuma activa, mas confirmar).
- **Visibilidade: privado.** Se algum dia passar a público, rever o histórico antes — ele
  guarda tudo o que já lá esteve.

### 5. Cloudflare Pages

Ambos os projectos vivem na conta `canguelev@fata.adventist.org` e publicam por Wrangler, que
não depende do GitHub. Se alguma vez se ligar o Pages directamente ao Git, é o repositório
novo que tem de ser autorizado.

- `livraria-editora-adventista` — criado a 2026-11-03 para receber o domínio
  `livrariaadventista.ao`. Ainda sem deploy nenhum.
- `livraria-adventista` — continua a servir produção até o domínio estar activo.

A variável `CLOUDFLARE_PAGES_PROJECT` do Actions (secção 1) tem de dizer
`livraria-editora-adventista`, senão o deploy automático publica no projecto antigo.

O domínio `livrariaadventista.ao` **não está registado** e não se compra no Cloudflare —
passos em [LANCAMENTO.md](LANCAMENTO.md), secção 7.

### 6. Supabase

Nada a mudar: o projecto `bggqkjjqbjhbjsckzopj` não conhece o repositório. Só o
`deploy-supabase.yml` o toca, e esse depende dos segredos da secção 1.

## Cópias de trabalho locais

Nesta máquina a troca já está feita (2026-11-03, com nenhum deploy a correr): **`origin` é o
único remoto** e aponta para `fernandotunas6-bot/Livraria-Editora-Adventista`. O remoto do
repositório antigo foi removido depois de se confirmar que nenhum dos seus cinco ramos tinha
commits fora do repositório novo:

```bash
for r in $(git for-each-ref --format='%(refname:short)' refs/remotes/antigo); do
  echo "$r: $(git rev-list --count "$r" --not --remotes=origin)"
done
```

O `git remote rename` reescreve o upstream dos ramos, que passaram todos para `antigo/…` e
tiveram de ser repontados para `origin/…` um a um. **Isto é fácil de não notar:** o
`deploy-site.sh` lê o upstream do ramo e compara-o com `origin/<ramo>`, por isso um upstream em
`antigo/` faz o script recusar publicar em produção com uma mensagem que não aponta para a
causa. Depois de qualquer `remote rename`, confirmar:

```bash
git for-each-ref --format='%(refname:short) -> %(upstream:short)' refs/heads
```

A conta activa do `gh` nesta máquina passou para `fernandotunas6-bot` (`gh auth switch`), que é
o que faz o `git` autenticar-se no repositório novo — o `gh auth setup-git` está configurado no
`~/.gitconfig` e usa sempre a conta activa. **Isto é global:** comandos `gh` e pushes para
repositórios de outras contas, noutros projectos desta máquina, passam a usar esta conta.
Trocar com `gh auth switch -u <conta>`.

Noutra máquina, ou num clone novo:

```bash
git remote set-url origin https://github.com/fernandotunas6-bot/Livraria-Editora-Adventista.git
git fetch origin
```

Dois avisos:

- **Autenticação.** O repositório é privado e da conta `fernandotunas6-bot`. Com outra conta
  activa, o GitHub responde **`Repository not found`** em vez de falar de permissões — parece
  um repositório inexistente, é falta de acesso. Resolve-se com
  `gh auth switch -u fernandotunas6-bot && gh auth setup-git`.
- **O `main` local.** Em cópias antigas ainda aponta para a era PocketBase, 114 commits atrás
  do `origin/main`. Usar sempre `origin/main` como referência, e nunca publicar a partir de um
  `main` local sem o actualizar.

### Se o push se desligar a meio

Nesta máquina o primeiro push morreu com `send-pack: unexpected disconnect while reading
sideband packet`. É o HTTP/2 do git no macOS, não o repositório. Com HTTP/1.1 passa:

```bash
git -c http.version=HTTP/1.1 push origin <ramo>
```

Se acontecer com frequência, fixar: `git config --global http.version HTTP/1.1`.

## O repositório antigo

`ValentinoCanguele/livraria_Cunhinga` foi **arquivado** a 2026-11-03: continua público e
legível, com o histórico até à migração, mas só de leitura. A descrição diz para onde foi o
desenvolvimento, porque num repositório arquivado já não se mudam as configurações — se for
preciso alterar algo lá, tem de se desarquivar primeiro (Settings → Unarchive).

Não foi apagado de propósito: é o único sítio onde ficam as discussões dos PRs #1 a #4 e o
registo de quem fez o quê antes da migração.
