-- O registo de envios (`notification_logs`) passa a aceitar todos os contextos que a Edge
-- Function grava.
--
-- A regra `notification_logs_context_check` é de 2026-11-02 e nunca acompanhou os emails que
-- vieram depois: avisos e relatórios da equipa (`staff_alert`, `staff_summary`,
-- `staff_report`), respostas e avisos do atendimento (`support_reply`, `support_notice`) e o
-- agradecimento depois da entrega (`thanks`). Cada envio destes era recusado pela base
-- (23514, 12 vezes nas 24 h até 2026-11-07 06:29) e a função só escrevia
-- "notification_logs: …" nos registos dela.
--
-- O pior não é o registo em falta: a protecção contra emails repetidos (`alreadySent`) procura
-- precisamente uma linha 'sent' neste registo. Sem a linha, cada nova tentativa voltava a
-- enviar — hoje não se nota porque o SMTP não está configurado (tudo sai como 'skipped'),
-- mas no dia em que for, o agradecimento e as respostas do atendimento podiam chegar ao
-- cliente repetidos.
--
-- O teste `supabase/functions/app/notificationContexts.test.ts` compara os contextos usados
-- no código com os desta regra, para isto não voltar a acontecer.

alter table public.notification_logs drop constraint if exists notification_logs_context_check;
alter table public.notification_logs add constraint notification_logs_context_check
  check (context = any (array[
    'order', 'order_status', 'payment', 'receipt', 'account', 'welcome', 'test', 'contact', 'campaign',
    'staff_alert', 'staff_summary', 'staff_report', 'support_reply', 'support_notice', 'thanks'
  ]));
