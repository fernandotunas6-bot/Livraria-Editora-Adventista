// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * O instalador do KanGest Livraria publicado no site (kangest-livraria.yml → Release → deploy-cloudflare.yml):
 * o manifesto das actualizações, em /kangest/actualizacoes/, diz a versão, o ficheiro, o SHA-256, a assinatura e se
 * leva a certificação da AGT. É o mesmo ficheiro que o programa lê para se actualizar (atualizacao.rs).
 */
export const PASTA_INSTALADOR = '/kangest/actualizacoes';
export const MANIFESTO_INSTALADOR = `${PASTA_INSTALADOR}/kangest-atualizacao.json`;

const SHA256 = /^[0-9a-f]{64}$/;
// O nome que o «publicar» dá ao instalador: sem espaços nem barras, para ir tal e qual no endereço.
const FICHEIRO = /^[A-Za-z0-9._-]+\.exe$/;

/** O instalador do Windows descrito no manifesto, ou `null` se o manifesto não o tiver (ou não for um manifesto). */
export function instaladorDoManifesto(m) {
  const p = m?.pacotes?.['windows-x86_64'];
  if (!p || typeof m.versao !== 'string' || !m.versao.trim()) return null;
  const sha256 = String(p.sha256 || '').trim().toLowerCase();
  const ficheiro = String(p.ficheiro || '');
  if (!FICHEIRO.test(ficheiro) || !SHA256.test(sha256)) return null;
  return {
    versao: m.versao.trim(),
    data: typeof m.data === 'string' ? m.data : null,
    notas: typeof m.notas === 'string' ? m.notas : '',
    ficheiro,
    endereco: `${PASTA_INSTALADOR}/${ficheiro}`,
    sha256,
    tamanho: Number.isFinite(p.tamanho) && p.tamanho > 0 ? p.tamanho : null,
    assinado: typeof p.assinatura === 'string' && p.assinatura.trim().length > 0,
    // só um «true» explícito: um manifesto sem o campo não se dá por certificado
    certificado: m.certificado_agt === true,
  };
}

/** «7,5 MB». */
export function tamanhoLegivel(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('pt-PT', { maximumFractionDigits: 1 })} MB`;
}

/**
 * Lê o manifesto publicado. Sem instalador publicado, o site responde com a página dele (HTML), e isso dá `null`,
 * tal como um manifesto inválido.
 */
export async function lerInstalador(fetchFn = fetch) {
  const r = await fetchFn(MANIFESTO_INSTALADOR, { cache: 'no-store' });
  if (!r.ok || !String(r.headers.get('content-type') || '').includes('json')) return null;
  return instaladorDoManifesto(await r.json().catch(() => null));
}
