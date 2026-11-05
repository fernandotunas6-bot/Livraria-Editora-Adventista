/**
 * Gera os templates de email do Supabase Auth (confirmação, recuperação, convite…) com o
 * mesmo layout dos emails da loja, em JSON pronto para a Management API.
 *
 * Uso:
 *   node --experimental-strip-types scripts/email/auth-templates.ts > auth-templates.json
 *   curl -X PATCH -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
 *     https://api.supabase.com/v1/projects/bggqkjjqbjhbjsckzopj/config/auth -d @auth-templates.json
 *
 * Os `{{ .ConfirmationURL }}`, `{{ .Token }}`… são variáveis do Supabase, preenchidas no envio.
 */
import { p, panel, renderEmail } from "../../supabase/functions/app/emailLayout.ts";

const chrome = {
  siteName: "Livraria Adventista",
  contactEmail: "contacto@livrariaadventista.ao",
  siteUrl: "https://livrariaadventista.ao",
};
const note = "Se não foi você, pode ignorar este email com segurança.";
const code = (v: string) =>
  panel(`<div style="text-align:center;font-family:Georgia,serif;font-size:30px;letter-spacing:8px;color:#0f2346">${v}</div>`);

const t = {
  confirmation: {
    subject: "Confirme o seu email — Livraria Adventista",
    html: renderEmail({ ...chrome, preheader: "Falta só um passo para activar a sua conta.", eyebrow: "Bem-vindo", title: "Confirme o seu email",
      body: p("Obrigado por criar a sua conta. Confirme o endereço <strong>{{ .Email }}</strong> para começar.") + p("Também pode usar este código:") + code("{{ .Token }}"),
      button: { label: "Confirmar email", url: "{{ .ConfirmationURL }}" }, note }),
  },
  recovery: {
    subject: "Definir nova palavra-passe — Livraria Adventista",
    html: renderEmail({ ...chrome, preheader: "Link para definir uma nova palavra-passe.", eyebrow: "Conta", title: "Nova palavra-passe",
      body: p("Recebemos um pedido para definir uma nova palavra-passe para <strong>{{ .Email }}</strong>.") + p("Também pode usar este código:") + code("{{ .Token }}"),
      button: { label: "Definir palavra-passe", url: "{{ .ConfirmationURL }}" }, note: "O link é pessoal e expira em 1 hora. " + note }),
  },
  magic_link: {
    subject: "O seu link de entrada — Livraria Adventista",
    html: renderEmail({ ...chrome, preheader: "Entre na sua conta com um clique.", eyebrow: "Entrar", title: "O seu link de entrada",
      body: p("Use o botão abaixo para entrar na sua conta.") + p("Ou introduza este código:") + code("{{ .Token }}"),
      button: { label: "Entrar na conta", url: "{{ .ConfirmationURL }}" }, note: "O link expira em 1 hora. " + note }),
  },
  invite: {
    subject: "Foi convidado — Livraria Adventista",
    html: renderEmail({ ...chrome, preheader: "Aceite o convite e defina a sua palavra-passe.", eyebrow: "Convite", title: "A sua conta está à espera",
      body: p("Foi convidado para criar uma conta na Livraria Adventista. Aceite o convite para definir a sua palavra-passe."),
      button: { label: "Aceitar convite", url: "{{ .ConfirmationURL }}" }, note }),
  },
  email_change: {
    subject: "Confirme o novo email — Livraria Adventista",
    html: renderEmail({ ...chrome, preheader: "Confirme a alteração do email da sua conta.", eyebrow: "Conta", title: "Confirme o novo email",
      body: p("Pediu para mudar o email da conta de <strong>{{ .Email }}</strong> para <strong>{{ .NewEmail }}</strong>."),
      button: { label: "Confirmar alteração", url: "{{ .ConfirmationURL }}" }, note }),
  },
  reauthentication: {
    subject: "Código de verificação — Livraria Adventista",
    html: renderEmail({ ...chrome, preheader: "O seu código de verificação.", eyebrow: "Segurança", title: "Código de verificação",
      body: p("Use este código para confirmar que é você:") + code("{{ .Token }}"), note: "O código expira em breve. " + note }),
  },
};

const out: Record<string, string> = {};
for (const [k, v] of Object.entries(t)) {
  out[`mailer_subjects_${k}`] = v.subject;
  out[`mailer_templates_${k}_content`] = v.html;
}
console.log(JSON.stringify(out, null, 2));
