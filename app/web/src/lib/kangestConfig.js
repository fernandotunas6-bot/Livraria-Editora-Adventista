// Assistente da configuração da ligação ao KanGest (docs/KANGEST.md §2): monta o segredo KANGEST_LIGACOES com as
// mesmas regras com que a Edge Function o lê (supabase/functions/app/kangest.ts, lerLigacoes), o comando para o
// gravar e o SQL do agendador. Corre só no navegador: a chave e o segredo não saem dele.

const ID = /^[a-z0-9_-]{1,40}$/i;
const CHAVE = /^kg_[A-Za-z0-9]{48}$/;
const URL_API = /^https:\/\/[^\s]+\/api\/v1$/;
const URL_LOCAL = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\/api\/v1$/;

/** Modos de pagamento habituais do KanGest (podem existir outros: o «Testar ligação» mostra os dele). */
export const MODOS_KANGEST = [
  ['NU', 'Numerário'], ['MB', 'Multicaixa'], ['TB', 'Transferência'], ['CC', 'Cartão'], ['CH', 'Cheque'],
];

/** «api-huambo.livraria.ao» ou «https://api-huambo.livraria.ao/» → «https://api-huambo.livraria.ao/api/v1». */
export function normalizarUrl(url) {
  let u = String(url || '').trim().replace(/\/+$/, '');
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  if (!/\/api\/v1$/.test(u)) u = `${u.replace(/\/api$/, '')}/api/v1`;
  return u;
}

/** Modo do KanGest mais provável para um método de pagamento do site (o gestor confirma). */
export function modoSugerido(metodo) {
  const t = `${metodo?.code || ''} ${metodo?.category || ''} ${metodo?.name || ''} ${metodo?.type || ''}`.toLowerCase();
  if (/multicaixa|express|mcx|tpa|referencia|referência|ref\b/.test(t)) return 'MB';
  if (/cart[aã]o|card|visa|mastercard/.test(t)) return 'CC';
  if (/numer[aá]rio|dinheiro|cash|entrega|levantamento/.test(t)) return 'NU';
  return 'TB';
}

const numeros = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/[\s,;]+/))
  .map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0);

/**
 * Do formulário para o JSON do segredo. `formulario`: [{ id, url, chave, segredo, padrao, lojas: { storeId: armazém },
 * armazens_online, portes, generico }], `pagamentos`: { código do método: modo }. Devolve { json, erros }.
 */
export function montarLigacoes(formulario, pagamentos = {}) {
  const erros = [];
  const ids = new Set();
  const lojasVistas = new Map();
  const pag = Object.fromEntries(Object.entries(pagamentos || {}).map(([k, v]) => [k, String(v || '').trim().toUpperCase()]).filter(([k, v]) => k && v));
  const lista = (formulario || []).map((f, i) => {
    const nome = String(f.id || '').trim();
    const rot = nome || `ligação ${i + 1}`;
    if (!ID.test(nome)) erros.push(`${rot}: o identificador só pode ter letras, números, «-» e «_» (ex.: huambo).`);
    else if (ids.has(nome)) erros.push(`${rot}: há duas ligações com o mesmo identificador.`);
    ids.add(nome);
    const url = normalizarUrl(f.url);
    if (!URL_API.test(url) && !URL_LOCAL.test(url)) erros.push(`${rot}: o endereço tem de ser https://… (o túnel ou domínio da API do KanGest).`);
    const chave = String(f.chave || '').trim();
    if (!CHAVE.test(chave)) erros.push(`${rot}: a chave da API começa por kg_ e tem 48 letras e números depois (copie-a do KanGest).`);
    const segredo = String(f.segredo || '').trim();
    if (segredo && !/^whsec_\S{8,}$/.test(segredo)) erros.push(`${rot}: o segredo dos avisos começa por whsec_.`);
    const lojas = {};
    for (const [loja, arm] of Object.entries(f.lojas || {})) {
      const n = Number(arm);
      if (String(arm ?? '').trim() === '') continue;
      if (!Number.isInteger(n) || n <= 0) { erros.push(`${rot}: o armazém da loja tem de ser um número.`); continue; }
      if (lojasVistas.has(loja)) erros.push(`A mesma loja está em «${lojasVistas.get(loja)}» e em «${rot}»: cada loja vende num só KanGest.`);
      lojasVistas.set(loja, rot);
      lojas[loja] = n;
    }
    const l = { id: nome, url, chave };
    if (segredo) l.segredo = segredo;
    if (f.padrao) l.padrao = true;
    if (Object.keys(lojas).length) l.lojas = lojas;
    const online = numeros(f.armazens_online);
    if (online.length) l.armazens_online = online;
    if (String(f.portes || '').trim()) l.portes = String(f.portes).trim();
    if (String(f.generico || '').trim()) l.generico = String(f.generico).trim();
    if (Object.keys(pag).length) l.pagamentos = pag;
    return l;
  });
  if (!lista.length) erros.push('Acrescente pelo menos uma ligação.');
  if (lista.filter((l) => l.padrao).length > 1) erros.push('Só uma ligação pode ser a padrão (a das encomendas sem loja).');
  return { json: JSON.stringify(lista), erros };
}

/** Aspas simples para a shell (sh, bash, zsh). */
export const aspasShell = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const aspasSql = (s) => `'${String(s).replace(/'/g, "''")}'`;

/** Referência do projecto Supabase a partir do URL (https://<ref>.supabase.co). */
export const projectoSupabase = (url) => (String(url || '').match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i) || [])[1] || '';

export function comandoSegredo(nome, valor, projecto) {
  return `supabase secrets set${projecto ? ` --project-ref ${projecto}` : ''} ${nome}=${aspasShell(valor)}`;
}

/** Token aleatório (64 caracteres hex) para o agendador. */
export function tokenAleatorio() {
  const b = new Uint8Array(32);
  globalThis.crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** SQL do Vault para o agendador (cria ou actualiza): cola-se no SQL Editor do Supabase. */
export function sqlAgendador(urlApp, token) {
  const url = `${String(urlApp || '').replace(/\/$/, '')}/cron/kangest`;
  const um = (nome, valor) => `  perform vault.update_secret(id, ${aspasSql(valor)}) from vault.secrets where name = ${aspasSql(nome)};
  if not found then
    perform vault.create_secret(${aspasSql(valor)}, ${aspasSql(nome)});
  end if;`;
  return `-- Agendador do KanGest (de 5 em 5 minutos): onde chamar e com que token.
do $$
begin
${um('kangest_cron_url', url)}
${um('kangest_cron_token', token)}
end
$$;`;
}
