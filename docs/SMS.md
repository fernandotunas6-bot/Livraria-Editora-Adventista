# SMS pela PRO2SMS

SMS em Angola, para confirmar o telefone da conta e para avisar quando o WhatsApp não chega.

Código: `supabase/functions/app/sms.ts` (módulo, com testes), `supabase/functions/app/index.ts` (secção «SMS»), migrações `20261108240000_sms_twilio.sql` e `20261108250000_sms_so_pro2sms.sql`, `components/admin/Pro2SmsConfigForm.jsx` e `components/account/PhoneVerify.jsx`.

A Twilio chegou a ser integrada (#54) e saiu a 2026-11-08, por decisão do dono. A migração `20261108240000` tem esse nome por isso; o que ela criou continua a servir.

## Pôr a funcionar

1. **Gerar uma chave** em API & Integrações, na PRO2SMS, com a permissão `send`.
2. **Criar o segredo** `PRO2SMS_API_KEY` no Supabase, em Edge Functions → Secrets. Não vai para a base de dados nem para o browser, e não se cola em conversas nem em código.
3. **Carregar saldo** na PRO2SMS. Sem saldo, nenhuma SMS sai.
4. **Ligar a integração** no painel, em Integrações → PRO2SMS, e enviar uma SMS de teste. O cartão mostra o saldo e o preço.
5. **Opcional:** pedir um remetente próprio em <https://pro2sms.ao/area-do-cliente/?p2s_tab=sender_ids#sender-id-request> e escrevê-lo no cartão. Sem ele, vai o da chave, ou `INFO`. Um remetente por aprovar faz as SMS falharem.

## Preço

11 Kz por SMS nacional a 2026-11-08 (a API devolve-o em `/balance`, e o cartão mostra o actual).

- **O texto vai sem acentos nem emojis.** Um «ã» muda a codificação e cada parte passa de 160 para 70 caracteres.
- **Há um teto diário**, 200 SMS por omissão (cerca de 2 200 Kz), para toda a loja, com avisos e códigos. Passado o teto, nenhuma SMS sai até ao dia seguinte, e fica no registo de envios. Sem conseguir confirmar o teto na base de dados, não se envia.
- **Só os códigos vêm ligados por omissão.** Os avisos ligam-se de propósito.

## O que vai por SMS

| Opção | Quando | Partes | Ligada por omissão |
|---|---|---|---|
| Códigos | «Confirmar por SMS», no perfil | 1 | Sim |
| Passos da encomenda | Paga, expedida e a caminho, se o WhatsApp não foi | 1 | Não |
| Colportores | Ofertas de entrega e avisos, se o WhatsApp não foi | até 2 | Não |
| Equipa | Avisos urgentes, se o WhatsApp não foi | até 2 | Não |

«Se o WhatsApp não foi» quer dizer que o WhatsApp não está configurado ou que a Meta recusou. Texto livre fora da janela de 24 horas pode ser aceite pela Meta e não chegar, e nesse caso não sai SMS.

A 2026-11-08, o email e o WhatsApp estão desligados em produção: com os passos da encomenda ligados, sai SMS em todos.

## Confirmar o telefone

Na conta, «Confirmar por SMS» envia um código de 6 dígitos. O número confirmado fica em `profiles.phone_verified_at`.

- **O código é gerado por nós**, por cima do `/send`, porque a chave não tem a permissão `otp`. Guarda-se só como HMAC, ligado à conta e ao número, com um segredo fora da base de dados, e não entra no registo de envios. Dura 10 minutos, com 5 tentativas.
- **O número fica preso à conta** em `phone_verifications`, e a verificação usa sempre esse, nunca um que venha do browser.
- **Só telemóveis de Angola:** um formulário destes aberto a qualquer país é o alvo clássico da fraude com SMS internacionais pagas.
- **Limites:** 60 segundos entre pedidos; 5 por conta e 5 por número por dia; 20 por IP por dia, e 5 por minuto.
- **Mudar o telefone tira a confirmação**, por qualquer caminho. Quem usa o site não a consegue escrever.
- **Um número só fica confirmado numa conta:** quem prova que o tem tira-o da conta anterior.

Ainda nada depende desta confirmação: é a base para quem a quiser usar.

## O que não está feito

- **Saber se a SMS chegou.** O registo diz «Aceite pela PRO2SMS». Se a operadora recusar depois, não se fica a saber aqui; vê-se na PRO2SMS. Falta o `callback_url`.
- **Entrar na conta só com o telefone.** Muda a autenticação: decisão do dono.
- **Campanhas por SMS.** Precisam de regras de consentimento e de saída (a API tem `/bulk` e `/optout`).
- **Códigos e avisos por WhatsApp.** A API da PRO2SMS não tem WhatsApp. O WhatsApp continua pela Meta Cloud API.

## Testes

`supabase/functions/app/sms.test.ts`, `Pro2SmsConfigForm.test.jsx`, `PhoneVerify.test.jsx` e os cenários `scripts/pglite/sms.mjs` (instruções em `scripts/pglite/base.mjs`).
