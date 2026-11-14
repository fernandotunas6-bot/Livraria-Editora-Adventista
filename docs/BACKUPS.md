# Backups e restauro da base de dados

O projecto Supabase está no **plano Free** (confirmado a 2026-11-04): não há backups que se
possam descarregar nem recuperação pontual (PITR), e um projecto Free pode ser pausado depois de
uma semana sem actividade. O backup é feito pelo GitHub Actions, em dois sítios:

- **semanal**, `.github/workflows/backup-base-dados.yml`;
- **antes de cada publicação com migrações**, no `.github/workflows/deploy-supabase.yml` (desde
  2026-11-14): se o `supabase db push --dry-run` diz que há migrações por aplicar, tira-se o mesmo
  dump cifrado, guardado como artefacto `backup-antes-do-deploy-<data>` dessa execução (30 dias), e
  só depois se aplicam. Se o backup falhar, produção não é tocada. Antes disto, uma migração de
  dados com erro (há várias que mexem em encomendas e vendas) podia custar até uma semana de dados:
  no dia 14/11 houve seis publicações da base de dados e o último backup era de 8/11.

## O que existe

| | |
|---|---|
| Frequência | Semanal, domingo às 03:30 UTC, e à mão em Actions → *Backup — base de dados* → *Run workflow* |
| Conteúdo | `roles.sql`, `schema.sql`, `data.sql` (dump do `supabase db dump`) e `SHA256SUMS` |
| Protecção | `tar.gz` cifrado com AES-256 (GPG, frase em `BACKUP_PASSPHRASE`); nada fica em claro |
| Retenção | 90 dias, como artefacto do repositório privado |
| **RPO** | até 7 dias de dados perdidos no pior caso; uma migração com erro já não, porque há backup imediatamente antes |
| **RTO** | ~1 hora: criar projecto novo, restaurar, apontar o site e a função |

Com as vendas a crescer, um RPO de 7 dias deixa de chegar. A alternativa sem custo é correr o
workflow todos os dias (mudar o `cron`); a com custo é o plano Pro (backups diários
geridos, e PITR como extra).

## Segredos necessários (uma vez)

Em *Settings → Secrets and variables → Actions* do repositório: `SUPABASE_ACCESS_TOKEN`,
`SUPABASE_DB_PASSWORD` (os mesmos do deploy) e **`BACKUP_PASSPHRASE`**, uma frase longa gerada
para isto. **Guarde a frase fora do GitHub** (gestor de palavras-passe): sem ela, os backups
não se abrem; e quem a tiver, com acesso ao repositório, lê os dados dos clientes.

```sh
GH_TOKEN="$(gh auth token --user fernandotunas6-bot)" gh secret set BACKUP_PASSPHRASE \
  --repo fernandotunas6-bot/Livraria-Editora-Adventista
```

## Restaurar (e testar o restauro)

Sempre num **projecto Supabase novo**, nunca no de produção. Um teste de restauro por trimestre
diz se o backup serve; um backup nunca restaurado é uma suposição.

```sh
gh run download <id-da-execução> --repo fernandotunas6-bot/Livraria-Editora-Adventista
sha256sum -c backup-*.tar.gz.gpg.sha256
gpg -d backup-*.tar.gz.gpg | tar -xz
cd backup-*/ && sha256sum -c SHA256SUMS

# URL de ligação do projecto NOVO (Project Settings → Database → Connection string)
psql "$URL_PROJECTO_NOVO" -f roles.sql
psql "$URL_PROJECTO_NOVO" -f schema.sql
psql "$URL_PROJECTO_NOVO" -c "SET session_replication_role = replica" -f data.sql
```

Depois de restaurar, conferir: número de livros, encomendas e utilizadores contra a produção;
entrar com uma conta de teste; abrir o painel. Registar a data e o resultado aqui em baixo.

## Testes de restauro

| Data | Backup | Resultado |
|---|---|---|
| — | — | **Ainda nenhum.** O primeiro backup semanal correu a 2026-11-08 (com sucesso); falta restaurá-lo num projecto à parte para saber se serve. |
