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
`deploy-supabase.yml` param no primeiro passo, que confirma os segredos.

**Variáveis — criadas a 2026-11-03:**

| Nome | Valor |
|------|-------|
| `VITE_SUPABASE_URL` | `https://bggqkjjqbjhbjsckzopj.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | a chave *publishable* (pública por desenho: vai no bundle do frontend, logo é variável e não segredo) |
| `CLOUDFLARE_PAGES_PROJECT` | `livraria-editora-adventista` |
| `SUPABASE_PROJECT_REF` | `bggqkjjqbjhbjsckzopj` |

**Segredos — por criar.** Os valores não existem nesta máquina; vêm da conta de cada serviço:

| Nome | Onde se obtém |
|------|---------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens, com *Cloudflare Pages: Edit* |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare → Workers & Pages → Account ID, ou `wrangler whoami` |
| `SUPABASE_ACCESS_TOKEN` | Supabase → Account → Access Tokens |
| `SUPABASE_DB_PASSWORD` | Supabase → Project Settings → Database |

Criam-se sem expor o valor em sítio nenhum — o comando pede-o e não o mostra:

```bash
GH_TOKEN="$(gh auth token --user fernandotunas6-bot)" gh secret set CLOUDFLARE_API_TOKEN --repo fernandotunas6-bot/Livraria-Editora-Adventista
```

O `GH_TOKEN` do dono é necessário: segredos exigem admin, e a `ValentinoCanguele` só tem
escrita.

**Os dois do Cloudflare devem esperar pela mudança de conta** (secção 5): têm de ser da conta
`<conta pessoal do dono>`. Pôr os da `<conta da organização>` faz o deploy automático
publicar na conta errada.

Até os segredos existirem, o `deploy-cloudflare.yml` falha a cada push para o `main`, no passo
"Confirmar segredos e variáveis". É ruído esperado.

### 2. Actions — a migração destrancou-o

Na conta antiga o Actions estava bloqueado por facturação e **nenhum** workflow arrancava.
**Na conta nova corre** (confirmado a 2026-11-03: o `ci.yml` do PR #1 correu até ao fim, com o
`deno check` incluído).

> **Isto muda o comportamento do projecto.** Cada push para o `main` passa a publicar no
> Cloudflare Pages, e cada push que toque em `supabase/` passa a correr `supabase db push` e a
> publicar a Edge Function — sem ninguém pedir. Durante meses nada disto aconteceu e tudo foi
> publicado à mão. Há migrações por aplicar no PR #1: ao integrá-lo, serão aplicadas sozinhas.

### 3. Pull requests

Os PRs não se transferem. Os dois que estavam abertos no repositório antigo foram fechados a
2026-11-03, cada um com uma nota a explicar a migração, antes de o repositório ser arquivado
(um repositório arquivado fica só de leitura — depois não dá para fechar nada):

- **#2** — "Migração do backend: PocketBase → Supabase + deploy no Cloudflare Pages"
  (`supabase/migracao`). O conteúdo já estava no `main`, pelo #3.
- **#4** — "Autenticação verificada no arranque e sistema de emails transaccionais"
  (`claude/youthful-heisenberg-rq5gnw`). Fechado por migração, não por rejeição.
  **Reaberto aqui como [#1](https://github.com/fernandotunas6-bot/Livraria-Editora-Adventista/pull/1)**
  a 2026-11-03, sem conflitos.

O #1 e o #3 do repositório antigo estão integrados (merged) e o seu código está no `main`.

**O âmbito cresceu muito.** O #4 original descrevia-se como "quatro commits"; quando foi
reaberto o ramo tinha **55**, acumulados entre 2026-11-02 e 2026-11-03 — autenticação, emails,
fila e agendador, CSP, desempenho, acessibilidade, telemóvel, marca, atendimento e os 8 commits
da própria migração. Deixou de ser um PR de um assunto. A verificação da ponta do ramo
(`38df5ad`, em worktree limpo) deu lint limpo, 17 ficheiros e 250 testes a passar e build limpo;
o `deno check` não foi corrido porque o Deno não está nesta máquina.

### 4. Acessos e configuração do repositório

- Colaboradores e permissões. **Feito:** `ValentinoCanguele` tem acesso de escrita
  (2026-11-03). Num repositório de conta pessoal o GitHub só aceita `pull` e `push` para
  colaboradores — `triage`, `maintain` e `admin` são exclusivos de organizações, e o `admin`
  fica sempre reservado ao dono (`fernandotunas6-bot`). Com este acesso **já não é preciso
  manter a conta `fernandotunas6-bot` activa no `gh`**, o que evita o efeito colateral de
  trocar a conta activa para toda a máquina.
- Protecção de ramos / rulesets no `main`.
- Ramo por omissão: confirmar que é `main`.
- Descrição e tópicos do repositório.
- Webhooks e integrações (nenhuma activa, mas confirmar).
- **Visibilidade: privado.** Se algum dia passar a público, rever o histórico antes — ele
  guarda tudo o que já lá esteve.

### 5. Cloudflare — mudança de conta pendente

Hoje os dois projectos vivem na conta **`<conta da organização>`** e publicam por
Wrangler, que não depende do GitHub:

- `livraria-editora-adventista` — criado a 2026-11-03, ainda sem deploy nenhum.
- `livraria-adventista` — continua a servir produção em `livraria-adventista.pages.dev`.

**A decisão (2026-11-03) é mudar tudo para a conta `<conta pessoal do dono>`**, a mesma
que já tem o projecto `siga-plus`, e é lá que o domínio `livrariaadventista.ao` vai ficar. Isso
**não foi feito** porque o `wrangler` desta máquina está autenticado na conta `fata` e só
alcança essa; o `wrangler login` é um OAuth no browser e tem de ser corrido por uma pessoa:

```bash
npx wrangler@4 logout && npx wrangler@4 login
npx wrangler@4 whoami   # confirmar a conta e guardar o Account ID
```

Com a conta certa autenticada, recriar os projectos e publicar:

```bash
npx wrangler@4 pages project create livraria-editora-adventista --production-branch main
CLOUDFLARE_PAGES_PROJECT=livraria-editora-adventista npm run deploy:site
```

Se a conta tiver mais do que um Account ID, o Wrangler pede para escolher: exportar
`CLOUDFLARE_ACCOUNT_ID` para não publicar na conta errada.

**Publicar num destino novo exige o `SITE_URL`:**

```bash
SITE_URL=https://livrariaadventista.ao CLOUDFLARE_PAGES_PROJECT=livraria-editora-adventista npm run deploy:site
```

O `canonical`, as etiquetas `og:`/`twitter:`, o `sitemap.xml` e o `robots.txt` têm fixo o
endereço do projecto que serviu produção primeiro. O script reescreve-os no build quando o
`SITE_URL` difere desse endereço — sem isso, o site publicado no destino novo diz aos motores
de busca e às partilhas no WhatsApp que a página "a sério" é a antiga.

O projecto na conta `fata` fica como está por agora (está vazio, não custa nada), mas **dois
projectos com o mesmo nome em contas diferentes confundem-se com facilidade** — confirmar
sempre o `whoami` antes de publicar.

A variável `CLOUDFLARE_PAGES_PROJECT` do Actions (secção 1) tem de dizer
`livraria-editora-adventista`, e o `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` passam a ser
da conta nova.

O domínio `livrariaadventista.ao` **não está registado** — ver secção 7.

### 6. Supabase

O projecto `bggqkjjqbjhbjsckzopj` não conhece o repositório — só o `deploy-supabase.yml` o
toca, e esse depende dos segredos da secção 1.

Por fazer: **convidar `<conta pessoal do dono>` para a organização "Colpotor"**
(Organization settings → Team → Invite). Tem de ser no painel.

### 7. Domínio `livrariaadventista.ao`

**Não está registado.** Verificado a 2026-11-03 perguntando directamente aos servidores
autoritativos do registo `.ao`, que devolvem `NXDOMAIN`:

```bash
dig +norecurse @a.ns.ao. livrariaadventista.ao NS | grep status:
# ->>HEADER<<- ... status: NXDOMAIN      → não existe
# comparar com: dig +norecurse @a.ns.ao. dns.ao NS   → status: NOERROR
```

Isto é mais fiável do que olhar para a ausência de registos NS ou A, que também acontece num
domínio registado mas ainda sem delegação.

Enquanto devolver `NXDOMAIN` não há nada a fazer no Cloudflare: não se pode adicionar a zona
nem associar o domínio ao Pages. Os passos do registo, da delegação e do que muda a seguir no
Supabase Auth e no OAuth da Google estão em [LANCAMENTO.md](LANCAMENTO.md), secção 7.

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

Sobre a autenticação: o `~/.gitconfig` desta máquina tem `gh auth setup-git` para o github.com,
que usa sempre a **conta activa** do `gh`. Durante a migração foi preciso trocá-la para
`fernandotunas6-bot`, mas isso é **global** — afecta os comandos `gh` e os pushes de todos os
outros projectos da máquina. Depois de a `ValentinoCanguele` passar a colaboradora (secção 4),
a conta activa voltou a ser a `ValentinoCanguele` e o acesso continua a funcionar. É a
configuração a manter: só o dono do repositório precisa da conta `fernandotunas6-bot`, e essa
usa-se pontualmente com `GH_TOKEN="$(gh auth token --user fernandotunas6-bot)"` em vez de
trocar a conta activa.

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
