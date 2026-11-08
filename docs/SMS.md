# SMS pela Twilio

SMS em Angola: os códigos para confirmar o telefone da conta vão pela **Twilio Verify**, e os avisos, quando o WhatsApp não chega, pela **API de mensagens**.

Código: `supabase/functions/app/sms.ts` (módulo, com testes), `supabase/functions/app/index.ts` (secção «SMS»), migração `20261108240000_sms_twilio.sql`, `components/admin/TwilioConfigForm.jsx` e `components/account/PhoneVerify.jsx`.

## Pôr a funcionar

1. **Criar os segredos** no Supabase, em Edge Functions → Secrets: `TWILIO_ACCOUNT_SID` e `TWILIO_AUTH_TOKEN`. Não vão para a base de dados nem para o browser, e não se colam em conversas nem em código.
2. **Ligar Angola** na Twilio, em Messaging → Settings → Geo Permissions. Uma conta nova só envia para o país de origem; sem isto, as SMS falham com o erro 21408.
3. **Activar a conta** na Twilio. Uma conta de teste só envia para números verificados (erro 21608).
4. **Ligar a integração** no painel, em Integrações → Twilio. O serviço Verify (`VA…`) já vem preenchido. O cartão mostra o saldo e avisa se a conta é de teste.
5. **Experimentar:** o botão de teste do cartão envia um aviso; «Confirmar por SMS», no perfil, envia um código.

## Preço

A 2026-11-08, a Twilio cobra **0,3154 USD por parte** para Angola, mais 0,001 USD por mensagem falhada, e diz que podem aplicar-se taxas das operadoras. Ver <https://www.twilio.com/en-us/sms/pricing/ao>.

Cada **código confirmado** custa mais 0,05 USD do Verify: cerca de 0,37 USD. Um código que não chega a ser confirmado não paga os 0,05 USD, mas paga a SMS, mesmo que não seja entregue. Ver <https://www.twilio.com/en-us/verify/pricing>.

Por isso:
- **O texto vai sem acentos nem emojis.** Um «ã» muda a codificação e cada parte passa de 160 para 70 caracteres.
- **Os avisos cabem numa parte**, com a ligação para o resto.
- **Há um teto diário**, 50 SMS por omissão (cerca de 16 USD), para toda a loja, com avisos e códigos. Passado o teto, nenhuma SMS sai até ao dia seguinte, e fica no registo de envios. Sem conseguir confirmar o teto na base de dados, não se envia.
- **Só os códigos vêm ligados por omissão.** Os avisos ligam-se de propósito.

## Remetente

Só para os avisos: nos códigos, quem decide é o serviço Verify, na Twilio. Angola aceita um nome como remetente, sem registo prévio: até 11 letras e números. Vazio, vai `LivrariaAdv`. Também serve um número da Twilio ou um serviço de mensagens (`MG…`). Não há SMS de duas vias para Angola: ninguém pode responder a estas mensagens.

## O que vai por SMS

| Opção | Quando | Ligada por omissão |
|---|---|---|
| Códigos | «Confirmar por SMS», no perfil | Sim |
| Passos da encomenda | Paga, expedida e a caminho, se o WhatsApp não foi | Não |
| Colportores | Ofertas de entrega e avisos, se o WhatsApp não foi | Não |
| Equipa | Avisos urgentes, se o WhatsApp não foi | Não |

«Se o WhatsApp não foi» quer dizer que o WhatsApp não está configurado ou que a Meta recusou. Texto livre fora da janela de 24 horas pode ser aceite pela Meta e não chegar, e nesse caso não sai SMS.

## Confirmar o telefone

Na conta, «Confirmar por SMS» pede um código à Twilio Verify, em português. O número confirmado fica em `profiles.phone_verified_at`.

- **O código** é gerado e guardado pela Twilio: nunca passa pela base de dados nem pelo registo de envios. Dura 10 minutos. O ecrã espera 6 dígitos, que é o normal num serviço Verify; se mudar o tamanho na Twilio, muda também em `PhoneVerify.jsx`.
- **O número fica preso à conta** em `phone_verifications`, e a verificação usa sempre esse, nunca um que venha do browser. Permite 5 tentativas erradas; a Twilio tem o seu próprio limite.
- **Só telemóveis de Angola:** um formulário destes aberto a qualquer país é o alvo clássico da fraude com SMS internacionais pagas.
- **Limites:** 60 segundos entre pedidos; 5 por conta e 5 por número por dia; 20 por IP por dia, e 5 por minuto.
- **Mudar o telefone tira a confirmação**, por qualquer caminho. Quem usa o site não a consegue escrever.
- **Um número só fica confirmado numa conta:** quem prova que o tem tira-o da conta anterior.

Ainda nada depende desta confirmação: é a base para quem a quiser usar.

## O que não está feito

- **Saber se a SMS chegou.** O registo diz «Aceite pela Twilio». Se a operadora recusar depois, não se fica a saber aqui; vê-se na Twilio. Falta o `StatusCallback`, com a validação da assinatura.
- **Entrar na conta só com o telefone.** Muda a autenticação: decisão do dono.
- **Campanhas por SMS.** Precisam de regras de consentimento e de saída, e com este preço custam caro.
- **WhatsApp pela Twilio.** O WhatsApp continua pela Meta Cloud API. O Verify também envia códigos por WhatsApp (`Channel=whatsapp`), mas exige configurá-lo na Twilio.

## Testes

`supabase/functions/app/sms.test.ts`, `TwilioConfigForm.test.jsx`, `PhoneVerify.test.jsx` e os cenários `scripts/pglite/sms.mjs` (instruções em `scripts/pglite/base.mjs`).
