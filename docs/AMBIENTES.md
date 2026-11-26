# Ambientes: desenvolvimento, staging e produção

KANGEST ONE, fase F (plano de 26/11). O objectivo: uma migração ou uma mudança na Edge Function passa primeiro por um
projecto Supabase de ensaio, e só depois chega à produção. A produção continua a receber só pelo merge no `main`.

| Ambiente | Base e Edge Function | Para quê |
|---|---|---|
| **Desenvolvimento** | PGlite (`scripts/pglite/*.mjs`), vitest e os testes Rust do KanGest, no computador e no CI | cada PR, antes de integrar |
| **Staging** | um projecto Supabase só de ensaio (o dono cria-o) | o workflow aplica lá as migrações e a Edge Function antes da produção; o posto de ensaio e os testes de aceitação correm contra ele |
| **Produção** | o projecto `bggqkjjqbjhbjsckzopj` | só pelo merge no `main` (`deploy-supabase.yml`) |

## Como funciona o staging no workflow

Em `.github/workflows/deploy-supabase.yml`, o trabalho `staging` corre antes do `deploy`:

1. **Sem o staging configurado,** passa à frente com um aviso, e a produção segue como até aqui.
2. **Com ele configurado:**
   - liga-se ao projecto de staging;
   - aplica as migrações (`supabase db push --include-all`);
   - publica a Edge Function `app`.
3. **Se algum passo falhar, a produção não é tocada.** O workflow recusa também um staging que aponte para o projecto
   de produção.

**Um staging pausado bloqueia a publicação.** O plano Free do Supabase pausa os projectos parados há uma semana. A
mensagem do erro diz o que fazer: restaurá-lo no painel do Supabase, ou apagar `STAGING_SUPABASE_URL` para publicar sem
ensaio.

## O que o dono tem de fazer (uma vez)

1. **Criar o projecto de staging** no Supabase, na mesma organização. O plano Free chega, e a região é a mesma da
   produção. Não se copiam dados da produção para lá.
2. **No GitHub,** em *Settings → Environments*, criar o ambiente **`staging`** com:

   | Nome | Tipo | Valor |
   |---|---|---|
   | `STAGING_SUPABASE_URL` | variável | `https://<ref>.supabase.co` do projecto de staging |
   | `STAGING_DB_PASSWORD` | segredo | a senha da base do staging (a que o Supabase pediu ao criar) |
   | `STAGING_SUPABASE_ACCESS_TOKEN` | segredo, opcional | só se o staging estiver noutra conta; senão vale o `SUPABASE_ACCESS_TOKEN` do repositório |
   | `STAGING_SUPABASE_ANON_KEY` | variável, opcional | a chave pública do staging, para os testes de aceitação |

3. **Os segredos da Edge Function no staging,** com chaves novas, nunca as da produção:
   - gerar as chaves da sincronização com `node scripts/kangest/chaves-sinc.mjs`;
   - pô-las no staging com `supabase secrets set --project-ref <ref do staging> KANGEST_SINC_CHAVES=… KANGEST_DADOS_CHAVE=…`.

   O email, o gateway de pagamentos, as SMS e a IA ficam por configurar no staging: sem eles, essas partes respondem
   «por configurar», como na produção antes de as ligar.

**Nenhuma destas credenciais vai para o código, para o site compilado nem para o instalador do KanGest.** Ficam só no
GitHub (ambiente `staging`) e nos segredos do projecto de staging.

## O posto de ensaio contra o staging

Com o staging publicado, cria-se lá um posto (no painel do staging, Configurações → KanGest → Postos) e corre-se:

```sh
node scripts/kangest/ensaio-posto.mjs https://<ref do staging>.supabase.co/functions/v1/app ABCD-EFGH
```

O ensaio emparelha, sincroniza sem documentos e confirma que o site recusa o mesmo pedido outra vez e uma assinatura
errada (docs/KANGEST-ENSAIO.md). No fim, revoga-se o posto de ensaio.

**Antes de integrar as fases A e B do KANGEST ONE,** o ensaio corre contra o staging. Para a B (o livro único de
stock), confere-se também a transição numa cópia lógica da produção, só de leitura.
