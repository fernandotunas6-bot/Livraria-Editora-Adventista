/**
 * A biblioteca de imagens dos vídeos e os mais vendidos lançados à mão (secção «Imagens dos
 * vídeos» do painel, ImagensVideosTab.jsx). Migração imagens_e_mais_vendidos_dos_videos.
 *
 * Quem protege os dados é o RLS: estas funções só falam com o Supabase e dão erros em português.
 */
import { supabase } from '@/lib/supabaseClient';
import { uploadPublicImage } from '@/lib/mediaUpload';
import { imageFileError } from '@/lib/imageTypes';

export const TEMAS_IMAGENS = {
  natureza: 'Natureza',
  livros: 'Livros',
  lojas: 'Lojas',
  pessoas: 'Pessoas',
  outro: 'Outro',
};

const erro = (e, quê) => {
  const m = String(e?.message || '');
  if (/row-level security|permission denied|42501/i.test(m) || e?.code === '42501') return new Error(`Sem permissão para ${quê}.`);
  if (/does not exist|Could not find|PGRST205|42P01/i.test(m)) return new Error('A biblioteca fica disponível depois de aplicada a migração «imagens_e_mais_vendidos_dos_videos».');
  return new Error(m || `Não foi possível ${quê} agora.`);
};

// ---------- Biblioteca ----------
export async function listarImagens() {
  const { data, error } = await supabase.from('biblioteca_imagens')
    .select('id, url, caminho, titulo, tema, creditos, activa, posicao, largura, altura, criado')
    .order('tema').order('posicao').order('criado', { ascending: false });
  if (error) throw erro(error, 'ver a biblioteca');
  return data || [];
}

/** Medidas de uma imagem (para escolher as que enchem bem um vídeo 16:9). */
async function medidas(file) {
  try {
    const bmp = await createImageBitmap(file);
    const r = { largura: bmp.width, altura: bmp.height };
    bmp.close?.();
    return r;
  } catch {
    return { largura: null, altura: null };
  }
}

/** Envia uma fotografia para media/biblioteca/ e junta-a à biblioteca. */
export async function enviarImagem(file, { tema = 'natureza', titulo = '', creditos = '' } = {}) {
  const invalido = imageFileError(file, 8);
  if (invalido) throw new Error(invalido);
  const { largura, altura } = await medidas(file);
  const url = await uploadPublicImage('biblioteca', file);
  const caminho = decodeURIComponent(url.split('/storage/v1/object/public/media/')[1] || '') || null;
  const nome = titulo || String(file.name || '').replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim();
  const { data, error } = await supabase.from('biblioteca_imagens')
    .insert({ url, caminho, titulo: nome.slice(0, 120), tema, creditos, largura, altura })
    .select().single();
  if (error) {
    if (caminho) await supabase.storage.from('media').remove([caminho]).catch(() => {});
    throw erro(error, 'juntar imagens');
  }
  return data;
}

/** Junta imagens que já estão no site (/images/…) — sem enviar nada. */
export async function juntarDoSite(lista) {
  if (!lista.length) return [];
  const { data, error } = await supabase.from('biblioteca_imagens')
    .insert(lista.map((x) => ({ url: x.url, titulo: String(x.titulo || '').slice(0, 120), tema: x.tema, creditos: x.creditos || 'Livraria Adventista', largura: x.largura || null, altura: x.altura || null })))
    .select();
  if (error) throw erro(error, 'juntar imagens');
  return data || [];
}

export async function actualizarImagem(id, campos) {
  const { error } = await supabase.from('biblioteca_imagens').update(campos).eq('id', id);
  if (error) throw erro(error, 'alterar a imagem');
}

/** Tira da biblioteca; se foi enviada para cá, apaga também o ficheiro. */
export async function apagarImagem(img) {
  const { error } = await supabase.from('biblioteca_imagens').delete().eq('id', img.id);
  if (error) throw erro(error, 'apagar a imagem');
  if (img.caminho) await supabase.storage.from('media').remove([img.caminho]).catch(() => {});
}

/**
 * As imagens do próprio site que podem ir para a biblioteca: as composições feitas com as capas
 * do catálogo (galeria do site) e as fotografias das lojas.
 */
export async function imagensDoSite() {
  const lista = [];
  try {
    const r = await fetch('/images/site/opcoes/galeria.json', { cache: 'no-cache' });
    if (r.ok) {
      (await r.json()).forEach((g) => {
        if (!g || !g.url || !/^\/images\//.test(g.url)) return;
        if (g.largura && g.altura && g.largura / g.altura < 1.2) return; // só as largas enchem bem o vídeo
        lista.push({ url: g.url, mini: g.mini || g.url, titulo: g.rotulo || 'Imagem do site', tema: 'livros', largura: g.largura, altura: g.altura });
      });
    }
  } catch { /* sem a galeria, ficam as lojas */ }
  const { data } = await supabase.from('physical_stores').select('name, gallery').order('sort_order');
  (data || []).forEach((s) => (Array.isArray(s.gallery) ? s.gallery : []).forEach((f, i) => {
    if (f && /^\/images\//.test(f.url || '')) lista.push({ url: f.url, mini: f.url.replace('/images/lojas/', '/images/lojas/480/'), titulo: `${s.name}${f.caption ? ' · ' + f.caption : ' · fotografia ' + (i + 1)}`, tema: 'lojas' });
  }));
  return lista;
}

// ---------- Mais vendidos à mão ----------
export async function listarMaisVendidos(lojaId, ano) {
  const { data, error } = await supabase.from('vendas_produtos')
    .select('id, loja_id, ano, mes, book_id, titulo, unidades, valor, nota, actualizado')
    .eq('loja_id', lojaId).eq('ano', ano)
    .order('mes', { nullsFirst: true }).order('unidades', { ascending: false });
  if (error) throw erro(error, 'ver os mais vendidos');
  return data || [];
}

export async function gravarMaisVendido(linha) {
  const campos = {
    loja_id: linha.loja_id, ano: Number(linha.ano), mes: linha.mes ? Number(linha.mes) : null,
    book_id: linha.book_id || null, titulo: String(linha.titulo || '').trim(),
    unidades: Number(linha.unidades) || 0, valor: linha.valor === '' || linha.valor == null ? null : Number(linha.valor),
    nota: String(linha.nota || '').trim(),
  };
  const q = linha.id
    ? supabase.from('vendas_produtos').update(campos).eq('id', linha.id)
    : supabase.from('vendas_produtos').insert(campos);
  const { error } = await q;
  if (error) throw erro(error, 'gravar os mais vendidos');
}

export async function apagarMaisVendido(id) {
  const { error } = await supabase.from('vendas_produtos').delete().eq('id', id);
  if (error) throw erro(error, 'apagar');
}

/** Produtos do catálogo para escolher (pelo título ou pelo código). */
export async function procurarProdutos(texto) {
  const t = String(texto || '').trim().replace(/[%_,()]/g, ' ');
  if (t.length < 2) return [];
  const { data } = await supabase.from('stock_books')
    .select('id, title, book_code, cover')
    .or(`title.ilike.%${t}%,book_code.ilike.%${t}%`)
    .order('title').limit(12);
  return data || [];
}

/** O que o site vendeu (para conferir e copiar), de uma loja num ano e mês (ou no ano). */
export async function maisVendidosDoSistema(lojaId, ano, mes) {
  const { data, error } = await supabase.rpc('produtos_mais_vendidos', { p_ano: Number(ano), p_so_pagas: true });
  if (error) return null;
  const m = new Map();
  (data || []).filter((r) => r.loja_id === lojaId && (!mes || Number(r.mes) === Number(mes))).forEach((r) => {
    const k = r.book_id || 'tt:' + String(r.titulo).toLowerCase();
    const a = m.get(k) || { book_id: r.book_id, titulo: r.titulo, unidades: 0, valor: 0 };
    a.unidades += Number(r.unidades) || 0;
    a.valor = Math.round((a.valor + (Number(r.valor) || 0)) * 100) / 100;
    m.set(k, a);
  });
  return [...m.values()].sort((a, b) => b.unidades - a.unidades || b.valor - a.valor).slice(0, 10);
}
