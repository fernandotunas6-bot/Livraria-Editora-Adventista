# SMS pela Twilio

SMS em Angola, para confirmar o telefone da conta e para avisar quando o WhatsApp não chega.

Código: `supabase/functions/app/sms.ts` (módulo, com testes), `supabase/functions/app/index.ts` (secção «SMS»), migração `20261108240000_sms_twilio.sql`, `components/admin/TwilioConfigForm.jsx` e `components/account/PhoneVerify.jsx`.

## Pôr a funcionar

1. **Criar os segredos** no Supabase, em Edge Functions → Secrets: `TWILIO_ACCOUNT_SID` e `TWILIO_AUTH_TOKEN`. Não vão para a base de dados nem para o browser, e não se colam em conversas nem em código.
2. **Ligar Angola** na Twilio, em Messaging → Settings → Geo Permissions. Uma conta nova só envia para o país de origem; sem isto, as SMS falham com o erro 21408.
3. **Activar a conta** na Twilio. Uma conta de teste só envia para números verificados (erro 21608).
4. **Ligar a integração** no painel, em Integrações → Twilio, e enviar uma SMS de teste. O cartão mostra o saldo e avisa se a conta é de teste.

## Preço

A 2026-11-08, a Twilio cobra **0,3154 USD por parte** para Angola, mais 0,001 USD por mensagem falhada, e diz que podem aplicar-se taxas das operadoras. Ver <https://www.twilio.com/en-us/sms/pricing/ao>.

Por isso:
- **O texto vai sem acentos nem emojis.** Um «ã» muda a codificação e cada parte passa de 160 para 70 caracteres.
- **Os avisos cabem numa parte**, com a ligação para o resto.
- **Há um teto diário**, 50 SMS por omissão (cerca de 16 USD), para toda a loja. Passado o teto, nenhuma SMS sai até ao dia seguinte, e fica no registo de envios. Sem conseguir confirmar o teto na base de dados, não se envia.
- **Só os códigos vêm ligados por omissão.** Os avisos ligam-se de propósito.

## Remetente

Angola aceita um nome como remetente, sem registo prévio: até 11 letras e números. Vazio, vai `LivrariaAdv`. Também serve um número da Twilio ou um serviço de mensagens (`MG…`). Não há SMS de duas vias para Angola: ninguém pode responder a estas mensagens.

## O que vai por SMS

| Opção | Quando | Ligada por omissão |
|---|---|---|
| Códigos | «Confirmar por SMS», no perfil | Sim |
| Passos da encomenda | Paga, expedida e a caminho, se o WhatsApp não foi | Não |
| Colportores | Ofertas de entrega e avisos, se o WhatsApp não foi | Não |
| Equipa | Avisos urgentes, se o WhatsApp não foi | Não |

«Se o WhatsApp não foi» quer dizer que o WhatsApp não está configurado ou que a Meta recusou. Texto livre fora da janela de 24 horas pode ser aceite pela Meta e não chegar, e nesse caso não sai SMS.

## Confirmar o telefone

Na conta, «Confirmar por SMS» envia um código de 6 dígitos. O número confirmado fica em `profiles.phone_verified_at`.

- **O código** só se guarda como HMAC ligado à conta e ao número, com um segredo fora da base de dados, e não entra no registo de envios. Dura 10 minutos, com 5 tentativas.
- **Só telemóveis de Angola:** um formulário destes aberto a qualquer país é o alvo clássico da fraude com SMS internacionais pagas.
- **Limites:** 60 segundos entre pedidos; 5 por conta e 5 por número por dia; 20 por IP por dia, e 5 por minuto.
- **Mudar o telefone tira a confirmação**, por qualquer caminho. Quem usa o site não a consegue escrever.
- **Um número só fica confirmado numa conta:** quem prova que o tem tira-o da conta anterior.

Ainda nada depende desta confirmação: é a base para quem a quiser usar.

## O que não está feito

- **Saber se a SMS chegou.** O registo diz «Aceite pela Twilio». Se a operadora recusar depois, não se fica a saber aqui; vê-se na Twilio. Falta o `StatusCallback`, com a validação da assinatura.
- **Entrar na conta só com o telefone.** Muda a autenticação: decisão do dono.
- **Campanhas por SMS.** Precisam de regras de consentimento e de saída, e com este preço custam caro.
- **WhatsApp pela Twilio.** O WhatsApp continua pela Meta Cloud API. A Twilio também o suporta, mas exige registar o remetente e os modelos.

## Testes

`supabase/functions/app/sms.test.ts`, `TwilioConfigForm.test.jsx`, `PhoneVerify.test.jsx` e os cenários `scripts/pglite/sms.mjs` (instruções em `scripts/pglite/base.mjs`).
