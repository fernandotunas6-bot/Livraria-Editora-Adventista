/**
 * Layout dos emails da loja: azul-noite, dourado e marfim, com a cena 3D no topo.
 *
 * Feito para clientes de email: tabelas, estilos inline, largura de 600px, sem CSS 3D
 * (a profundidade vem da imagem renderizada em `scripts/email/hero.html`). Sem dependências
 * do Deno, para o `scripts/email/auth-templates.ts` gerar com ele os templates do Supabase Auth.
 */

const EMAIL_ASSETS = "https://bggqkjjqbjhbjsckzopj.supabase.co/storage/v1/object/public/media/email";
export const EMAIL_HERO_URL = `${EMAIL_ASSETS}/hero-luz.png`;
/** Logótipo branco da loja (logo-compact-light.svg em PNG, 402×88; mostrado a 201×44). */
export const EMAIL_LOGO_URL = `${EMAIL_ASSETS}/logo-light.png`;

/** Cores da loja (cabeçalho escuro, azul-petróleo dos botões) com dourado e marfim nos detalhes. */
export const C = {
  navy: "#141e33",
  navyDeep: "#0b1426",
  teal: "#0a748f",
  tealLight: "#22b8d8",
  gold: "#b8892f",
  goldLight: "#e3c27a",
  ivory: "#f6f1e6",
  paper: "#fffdf8",
  line: "#e9dcbf",
  text: "#33405a",
  muted: "#7a8296",
};

const SERIF = "'Fraunces','Cormorant Garamond',Georgia,'Times New Roman',serif";
const SANS = "'Inter','Helvetica Neue',Helvetica,Arial,sans-serif";

export const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export type EmailButton = { label: string; url: string };

export type EmailOptions = {
  /** Texto curto que aparece na lista da caixa de entrada, a seguir ao assunto. */
  preheader?: string;
  /** Linha pequena em dourado por cima do título. */
  eyebrow?: string;
  title: string;
  /** HTML do corpo, já escapado por quem chama. */
  body: string;
  button?: EmailButton;
  /** HTML pequeno por baixo do botão. */
  note?: string;
  siteName?: string;
  contactEmail?: string;
  contactPhone?: string;
  siteUrl?: string;
};

/** Parágrafo no estilo do corpo. */
export const p = (html: string) =>
  `<p style="margin:0 0 16px;font-family:${SANS};font-size:16px;line-height:1.7;color:${C.text}">${html}</p>`;

/** Botão que funciona no Outlook (VML) e no resto (tabela + link). `url` tem de vir já escapado ou ser um template do Supabase. */
export function button({ label, url }: EmailButton) {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:8px auto 4px">
  <tr><td align="center" style="border-radius:999px;background:${C.teal};background-image:linear-gradient(180deg,#0e86a5,${C.teal});box-shadow:0 10px 24px rgba(10,116,143,.32),inset 0 1px 0 rgba(255,255,255,.22)">
    <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${url}" style="height:50px;v-text-anchor:middle;width:280px" arcsize="50%" stroke="f" fillcolor="${C.teal}"><center style="color:#ffffff;font-family:Georgia,serif;font-size:16px">${esc(label)}</center></v:roundrect><![endif]-->
    <!--[if !mso]><!--><a href="${url}" target="_blank" style="display:inline-block;padding:15px 38px;font-family:${SANS};font-size:15px;font-weight:600;letter-spacing:.4px;color:#ffffff;text-decoration:none;border-radius:999px">${esc(label)}&nbsp;&nbsp;&rarr;</a><!--<![endif]-->
  </td></tr>
</table>`;
}

/** Filete dourado curto por baixo do título. */
export const divider = () =>
  `<div style="width:56px;height:2px;background:${C.gold};background-image:linear-gradient(90deg,${C.gold},${C.goldLight});border-radius:2px;margin:0 0 24px;font-size:0;line-height:0">&nbsp;</div>`;

/** Caixa marfim com bordo dourado, para totais, códigos e dados destacados. */
export const panel = (html: string) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 22px">
  <tr><td style="background:${C.ivory};border:1px solid ${C.line};border-radius:14px;padding:18px 22px;box-shadow:inset 0 1px 0 #fff">${html}</td></tr>
</table>`;

export function renderEmail(o: EmailOptions) {
  const site = o.siteName || "Livraria Adventista";
  const contact = [o.contactEmail, o.contactPhone].filter(Boolean).map(esc).join("&nbsp;&nbsp;&middot;&nbsp;&nbsp;");
  const siteLink = o.siteUrl
    ? `<a href="${esc(o.siteUrl)}" style="color:${C.tealLight};text-decoration:none">${esc(o.siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</a>`
    : "";
  return `<!doctype html>
<html lang="pt" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(o.title)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>
  body{margin:0;padding:0;background:${C.ivory}}
  a{color:${C.teal}}
  @media (max-width:620px){
    .wrap{width:100%!important}
    .px{padding-left:24px!important;padding-right:24px!important}
    .h1{font-size:26px!important}
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.ivory}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(o.preheader || "")}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.ivory};background-image:radial-gradient(ellipse at 50% 0%,#fffaf0 0%,${C.ivory} 60%)">
<tr><td align="center" style="padding:32px 12px 40px">

  <table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px">
    <tr><td style="border-radius:22px;background:${C.paper};border:1px solid ${C.line};box-shadow:0 2px 0 ${C.line},0 30px 60px -20px rgba(15,35,70,.35),0 12px 24px -12px rgba(15,35,70,.18);overflow:hidden">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="background:${C.navy};border-radius:22px 22px 0 0;padding:22px 32px;border-bottom:1px solid rgba(255,255,255,.08)">
          <img src="${EMAIL_LOGO_URL}" width="201" height="44" alt="${esc(site)}" style="display:block;width:201px;height:44px;border:0;color:#ffffff;font-family:${SANS};font-size:16px;font-weight:600">
        </td></tr>
        <tr><td style="background:${C.navyDeep};line-height:0;font-size:0">
          <img src="${EMAIL_HERO_URL}" width="600" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0">
        </td></tr>
        <tr><td style="height:3px;background:linear-gradient(90deg,${C.navy},${C.gold},${C.goldLight},${C.gold},${C.navy});font-size:0;line-height:0">&nbsp;</td></tr>
        <tr><td class="px" style="padding:40px 48px 12px">
          ${o.eyebrow ? `<div style="font-family:'JetBrains Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${C.teal};margin:0 0 10px">${esc(o.eyebrow)}</div>` : ""}
          <h1 class="h1" style="margin:0 0 20px;font-family:${SERIF};font-weight:600;font-size:31px;line-height:1.2;color:${C.navy}">${esc(o.title)}</h1>
          ${divider()}
          ${o.body}
        </td></tr>
        ${o.button ? `<tr><td class="px" align="center" style="padding:8px 48px 8px">${button(o.button)}</td></tr>` : ""}
        ${o.note ? `<tr><td class="px" align="center" style="padding:14px 48px 0;font-family:${SANS};font-size:13px;line-height:1.6;color:${C.muted}">${o.note}</td></tr>` : ""}
        <tr><td style="padding:36px 0 0;font-size:0;line-height:0">&nbsp;</td></tr>
        <tr><td style="background:${C.navy};background-image:linear-gradient(180deg,${C.navy},${C.navyDeep});border-radius:0 0 22px 22px;padding:28px 40px 30px" align="center">
          <img src="${EMAIL_LOGO_URL}" width="160" height="35" alt="${esc(site)}" style="display:block;margin:0 auto;width:160px;height:35px;border:0;color:#ffffff;font-family:${SANS}">
          <div style="width:40px;height:1px;background:${C.gold};margin:10px auto 12px;font-size:0;line-height:0">&nbsp;</div>
          ${contact ? `<div style="font-family:${SANS};font-size:13px;line-height:1.7;color:#c9d2e4">${contact}</div>` : ""}
          ${siteLink ? `<div style="font-family:${SANS};font-size:13px;line-height:1.7;margin-top:4px">${siteLink}</div>` : ""}
        </td></tr>
      </table>
    </td></tr>

    <tr><td align="center" style="padding:20px 24px 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.muted}">
      Recebeu este email porque tem uma conta ou uma encomenda na ${esc(site)}.
    </td></tr>
  </table>

</td></tr>
</table>
</body>
</html>`;
}
