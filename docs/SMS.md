# SMS pela PRO2SMS e pela Twilio

SMS em Angola, para confirmar o telefone da conta e para avisar quando o WhatsApp não chega. O painel escolhe quem envia os **códigos** e quem envia os **avisos**, em Integrações → SMS.

Código: `supabase/functions/app/sms.ts` (módulo, com testes), `supabase/functions/app/index.ts` (secção «SMS»), migrações `20261108240000_sms_twilio.sql` e `20261108250000_sms_dois_servicos.sql`, `components/admin/SmsConfigForm.jsx` e `components/account/PhoneVerify.jsx`.

## Comparação

| | PRO2SMS | Twilio |
|---|---|---|
| Preço por SMS para Angola (2026-11-08) | 11 Kz | 0,3154 USD por parte, cerca de 285 Kz a 900 Kz por dólar, mais eventuais taxas das operadoras |
| Por código confirmado | sem custo extra | mais 0,05 USD (Verify): cerca de 0,37 USD |
| Códigos | gerados por nós, por cima do `/send` (a chave não tem a permissão `otp`) | Twilio Verify, com protecção contra fraude |
| Remetente | só aprovado na conta; vazio, o da chave, ou `INFO` | nome até 11 caracteres, sem registo prévio em Angola |

Preços: <https://www.twilio.com/en-us/sms/pricing/ao> e <https://www.twilio.com/en-us/verify/pricing>. Na Twilio, a SMS paga-se mesmo que o código não seja usado ou que a mensagem não seja entregue. O saldo da PRO2SMS vê-se no painel, com o preço actual.

**Por omissão:** códigos pela Twilio Verify, avisos pela PRO2SMS. **Se o serviço escolhido não estiver pronto ou falhar, a SMS não passa para o outro:** um salto escondido custaria 25 vezes mais. Fica no registo de envios, e o cartão diz o que falta.

## Pôr a funcionar

Só precisa dos passos do serviço que escolher.

**PRO2SMS**
1. Gerar uma chave nova em API & Integrações, com a permissão `send`, e carregar saldo.
2. Criar o segredo `PRO2SMS_API_KEY` no Supabase, em Edge Functions → Secrets. Não se cola em conversas nem em código.
3. Opcional: pedir um remetente próprio em <https://pro2sms.ao/area-do-cliente/?p2s_tab=sender_ids#sender-id-request> e escrevê-lo no cartão.

**Twilio**
1. Criar os segredos `TWILIO_ACCOUNT_SID` e `TWILIO_AUTH_TOKEN` no mesmo sítio.
2. Ligar Angola em Messaging → Settings → Geo Permissions. Uma conta nova só envia para o país de origem; sem isto, as SMS falham com o erro 21408.
3. Activar a conta. Uma conta de teste só envia para números verificados (erro 21608).

**No painel:** ligar o cartão em Integrações → SMS. Os botões de teste enviam um aviso por cada serviço; «Confirmar por SMS», no perfil, envia um código.

## Para gastar menos

- **O texto vai sem acentos nem emojis.** Um «ã» muda a codificação e cada parte passa de 160 para 70 caracteres.
- **Os avisos cabem numa parte**, com a ligação para o resto.
- **Há um teto diário**, 50 SMS por omissão, para toda a loja e nos dois serviços, com avisos e códigos. Passado o teto, nenhuma SMS sai até ao dia seguinte, e fica no registo de envios. Sem conseguir confirmar o teto na base de dados, não se envia.
- **Só os códigos vêm ligados por omissão.** Os avisos ligam-se de propósito.

## O que vai por SMS

| Opção | Quando | Ligada por omissão |
|---|---|---|
| Códigos | «Confirmar por SMS», no perfil | Sim |
| Passos da encomenda | Paga, expedida e a caminho, se o WhatsApp não foi | Não |
| Colportores | Ofertas de entrega e avisos, se o WhatsApp não foi | Não |
| Equipa | Avisos urgentes, se o WhatsApp não foi | Não |

«Se o WhatsApp não foi» quer dizer que o WhatsApp não está configurado ou que a Meta recusou. Texto livre fora da janela de 24 horas pode ser aceite pela Meta e não chegar, e nesse caso não sai SMS.

A 2026-11-08, o email e o WhatsApp estão desligados em produção: com os passos da encomenda ligados, sai SMS em todos.

## Confirmar o telefone

Na conta, «Confirmar por SMS» envia um código. O número confirmado fica em `profiles.phone_verified_at`.

- **O número e o serviço ficam presos à conta** em `phone_verifications`, e a verificação usa sempre esses, nunca o que venha do browser, mesmo que a escolha no painel mude entretanto. Permite 5 tentativas erradas.
- **Pela Twilio Verify**, o código é gerado e guardado pela Twilio, em português: nunca passa pela base de dados. Dura 10 minutos, e a Twilio tem o seu próprio limite de tentativas. O ecrã espera 6 dígitos, que é o normal num serviço Verify; se mudar o tamanho na Twilio, muda também em `PhoneVerify.jsx`.
- **Pela PRO2SMS**, o código é gerado na Edge Function e guardado só como HMAC, ligado à conta e ao número, com um segredo fora da base de dados. Dura 10 minutos.
- **O código nunca entra no registo de envios.**
- **Só telemóveis de Angola:** um formulário destes aberto a qualquer país é o alvo clássico da fraude com SMS internacionais pagas.
- **Limites:** 60 segundos entre pedidos; 5 por conta e 5 por número por dia; 20 por IP por dia, e 5 por minuto.
- **Mudar o telefone tira a confirmação**, por qualquer caminho. Quem usa o site não a consegue escrever.
- **Um número só fica confirmado numa conta:** quem prova que o tem tira-o da conta anterior.

Ainda nada depende desta confirmação: é a base para quem a quiser usar.

## O que não está feito

- **Saber se a SMS chegou.** O registo diz «Aceite pela PRO2SMS» ou «Aceite pela Twilio». Se a operadora recusar depois, não se fica a saber aqui; vê-se no serviço. Falta o `callback_url` da PRO2SMS e o `StatusCallback` da Twilio, com a validação da assinatura.
- **Passar para o outro serviço quando um falha.** Ficou de fora de propósito, por causa da diferença de preço.
- **Entrar na conta só com o telefone.** Muda a autenticação: decisão do dono.
- **Campanhas por SMS.** Precisam de regras de consentimento e de saída.
- **WhatsApp por estes serviços.** O WhatsApp continua pela Meta Cloud API. A API da PRO2SMS não tem WhatsApp; a Verify também envia códigos por WhatsApp (`Channel=whatsapp`), mas exige configurá-lo na Twilio.

## Testes

`supabase/functions/app/sms.test.ts`, `SmsConfigForm.test.jsx`, `PhoneVerify.test.jsx` e os cenários `scripts/pglite/sms.mjs` (instruções em `scripts/pglite/base.mjs`).
