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

/**
 * Os sistemas para que há instalador (as chaves do manifesto, as mesmas que o programa usa para se actualizar,
 * atualizacao.rs `plataforma()`), com a extensão que o ficheiro tem de ter. O nome que o «publicar» dá ao instalador
 * não tem espaços nem barras, para ir tal e qual no endereço.
 */
export const SISTEMAS = [
  { chave: 'windows-x86_64', rotulo: 'Windows', detalhe: 'Windows 10 ou 11, 64 bits', ficheiro: /^[A-Za-z0-9._-]+\.exe$/ },
  { chave: 'macos-aarch64', rotulo: 'Mac com Apple Silicon', detalhe: 'M1, M2, M3, M4… (macOS 10.15 ou mais recente)', ficheiro: /^[A-Za-z0-9._-]+\.dmg$/ },
  { chave: 'macos-x86_64', rotulo: 'Mac com Intel', detalhe: 'Processador Intel (macOS 10.15 Catalina ou mais recente)', ficheiro: /^[A-Za-z0-9._-]+\.dmg$/ },
];

/**
 * O instalador de um sistema descrito no manifesto (por omissão, o do Windows), ou `null` se o manifesto não o tiver
 * (ou não for um manifesto).
 */
export function instaladorDoManifesto(m, chave = 'windows-x86_64') {
  const sistema = SISTEMAS.find((x) => x.chave === chave);
  const p = m?.pacotes?.[chave];
  if (!sistema || !p || typeof m.versao !== 'string' || !m.versao.trim()) return null;
  const sha256 = String(p.sha256 || '').trim().toLowerCase();
  const ficheiro = String(p.ficheiro || '');
  if (!sistema.ficheiro.test(ficheiro) || !SHA256.test(sha256)) return null;
  return {
    sistema: chave,
    rotulo: sistema.rotulo,
    detalhe: sistema.detalhe,
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

/** Todos os instaladores publicados (Windows e Mac), pela ordem de `SISTEMAS`; uma lista vazia sem nenhum. */
export function instaladoresDoManifesto(m) {
  return SISTEMAS.map((s) => instaladorDoManifesto(m, s.chave)).filter(Boolean);
}

/** Lê o manifesto publicado e devolve todos os instaladores; `null` sem manifesto (ou sem nenhum instalador). */
export async function lerInstaladores(fetchFn = fetch) {
  const r = await fetchFn(MANIFESTO_INSTALADOR, { cache: 'no-store' });
  if (!r.ok || !String(r.headers.get('content-type') || '').includes('json')) return null;
  const lista = instaladoresDoManifesto(await r.json().catch(() => null));
  return lista.length ? lista : null;
}

/** O sistema deste aparelho, para destacar o instalador certo (o Apple Silicon não se distingue do Intel no browser). */
export function sistemaDoAparelho(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent) {
  if (/Windows/i.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'mac';
  return '';
}
