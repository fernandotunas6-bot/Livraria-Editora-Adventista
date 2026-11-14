# App de colportores (Flutter)

A app «Colportor · Livraria Adventista» faz no telemóvel o que a área `/colportor` do site faz,
e o que o site não consegue: partilhar a localização com o ecrã apagado, receber as ofertas de
entrega como notificação com a app fechada, e preencher o relatório sem rede. Usa a mesma API
(Supabase e a Edge Function `app`): as regras continuam no servidor.

Decisões do dono (2026-11-14): Android primeiro; notificações pelo Firebase; tudo o que o site faz
e os extras da app; Play Store e o APK no site.

Código em `app/colportor/` (por etapas; ver o plano em HANDOFF.md).

## Servidor (etapa 1)

- **Tokens dos aparelhos:** tabela `public.app_push_tokens` (migração `20261115090000_app_push_tokens`):
  conta, token Firebase, plataforma, app e versão. Não se lê nem se escreve pela API; só pela Edge
  Function. Um token é de um aparelho só: se outra conta entrar no mesmo telemóvel, passa para ela.
- **Rotas** (com sessão):
  - `POST /push/app-token` `{ token, platform, app, appVersion }`: a app chama-a depois de entrar e
    sempre que o Firebase lhe der um token novo;
  - `POST /push/app-token/remover` `{ token }`: ao sair da conta.
- **Envio:** `sendUserPush` manda agora para os navegadores (Web Push, como antes) **e** para as
  apps (`sendAppPush`, `fcm.ts`, API HTTP v1 do Firebase). Tudo o que já avisava por push — as
  ofertas de entrega e os outros avisos aos colportores, as encomendas dos clientes — chega à app
  sem mudar mais nada. Um aparelho que já não existe sai da lista.
- **Ligar:** o envio para as apps só acontece com o segredo `FCM_SERVICE_ACCOUNT` na Edge Function
  (o JSON da conta de serviço do projecto Firebase: Consola Firebase → Definições do projecto →
  Contas de serviço → Gerar nova chave privada). Sem ele, nada muda.

  ```bash
  supabase secrets set FCM_SERVICE_ACCOUNT="$(cat conta-de-servico.json)" --project-ref bggqkjjqbjhbjsckzopj
  ```

  É independente do «push» das Configurações, que é o dos navegadores (chaves VAPID).
- **Entrar com a Google e recuperar a palavra-passe** na app voltam a ela pelo endereço
  `ao.livrariaadventista.colportor://login-callback`, já na lista do `supabase/auth/config.json`.
  Para o Supabase o conhecer, correr `bash scripts/configurar-auth.sh` (mostra a diferença e pede
  confirmação).

## Testes

- `supabase/functions/app/fcm.test.ts`: o JWT da conta de serviço (assinatura verificada), o token
  de acesso guardado, a mensagem, e quando um token se apaga.
- `scripts/pglite/app-push.mjs`: a tabela fechada à API, o token que muda de conta, as regras e o
  apagar em cascata.
