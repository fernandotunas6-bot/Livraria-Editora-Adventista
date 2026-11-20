// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * O Estúdio de vídeo dos relatórios, ao jeito do Adobe Premiere: abre-se com «Vídeo lento /
 * normal / curto» do menu Exportar, nos dois relatórios (o painel de uma loja e todas as
 * livrarias).
 *
 *  · Monitor: a pré-visualização do vídeo, com som, a partir de qualquer ponto.
 *  · Linha de tempo com quatro pistas: V1 Quadros, A1 Narração (o guião de cada quadro),
 *    A2 Efeitos (cada som no seu segundo: dinheiro, portas, subidas, quedas…) e A3 Música.
 *  · Mesa de som: o volume da música, dos efeitos e da voz; as legendas; o fundo; o ritmo.
 *  · Narração: a voz de quem apresenta, gravada ao microfone enquanto o vídeo corre (como a
 *    gravação de voz-off do Premiere), com o guião em teleponto e a música a baixar quando se fala.
 *  · Gravar: o vídeo com a faixa de áudio, no formato que o navegador sabe gravar (MP4 ou WebM).
 *
 * Os números, os desenhos e o som vêm de video.js, guiao-video.js, deixas-video.js e som-video.js;
 * aqui fica só o ecrã. Nada sai do navegador: o microfone só é pedido quando se liga a narração.
 *
 * abrirEstudio(root, { tipo, dados, ritmo, fundo, titulo, guardar }) → { fechar }
 *  · `dados` = o que video.js precisa (exportData() do painel, ou o consolidado com os extras);
 *  · guardar({ blob, ext, ritmo, duracao }) grava o ficheiro (o downloads do relatório).
 */
import { FUNDOS, RITMOS, fmtDuracao, gravarVideo, prepararVideo } from './video.js';
import { FAMILIAS, SONS } from './deixas-video.js';
import { criarMistura, prepararSom, somDisponivel } from './som-video.js';

const CHAVE = 'relatorios:estudio';
const PADRAO = { musica: 0.55, efeitos: 0.85, voz: 1, musicaOn: true, efeitosOn: true, legendas: true, ouvir: false };
const lerCfg = () => { try { return { ...PADRAO, ...JSON.parse(localStorage.getItem(CHAVE) || '{}'), narracao: false }; } catch (e) { return { ...PADRAO, narracao: false }; } };
const gravarCfg = (c) => { try { const { narracao, ...resto } = c; localStorage.setItem(CHAVE, JSON.stringify(resto)); } catch (e) { /* sem armazenamento */ } };
const relogio = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** A cor de cada tipo de quadro na pista V1. */
const COR_QUADRO = {
  capa: '#22A6A9', fecho: '#22A6A9', resumo: '#5B8DEF', mensal: '#5B8DEF', quadro: '#5B8DEF', acum: '#5B8DEF',
  ranking: '#7C83F2', lojas: '#7C83F2', mes: '#E0679A', mesRede: '#E0679A', destaque: '#F2B705', maisVendidos: '#F2B705', pendentes: '#E86060',
};
/** A cor de cada família de sons na pista A2. */
export const COR_FAMILIA = {
  dinheiro: '#F2B705', porta: '#22A6A9', subida: '#3DBA82', queda: '#E86060', destaque: '#E0679A', transicao: '#9AA8BC', outro: '#7C83F2',
};

export function abrirEstudio(root, opts) {
  const doc = root.ownerDocument || document;
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const cfg = lerCfg();
  let ritmo = RITMOS[opts.ritmo] ? opts.ritmo : 'lento';
  let fundo = FUNDOS[opts.fundo] ? opts.fundo : 'capas';
  let V = null;
  let pos = 0;
  let raf = 0;
  let toca = null;
  let gravando = false;
  let abortar = null;
  let fechado = false;
  let micStream = null;
  let versao = 0;

  // ---------- Áudio ----------
  const temSom = somDisponivel();
  let actx = null;
  let mistura = null;
  let colunas = null;
  let somPronto = Promise.resolve(null);
  if (temSom) {
    const AC = window.AudioContext || window.webkitAudioContext;
    actx = new AC({ latencyHint: 'playback' });
    colunas = actx.createGain();
    colunas.connect(actx.destination);
    somPronto = prepararSom(actx.sampleRate).then((som) => {
      if (fechado) return null;
      mistura = criarMistura(actx, som, volumesAgora());
      mistura.monitor.connect(colunas);
      return mistura;
    }).catch(() => null);
  }
  function volumesAgora() {
    return { musica: cfg.musicaOn ? cfg.musica : 0, efeitos: cfg.efeitosOn ? cfg.efeitos : 0, voz: cfg.voz };
  }

  // ---------- Ecrã ----------
  const caixa = el('div', 'estudio');
  caixa.setAttribute('role', 'dialog');
  caixa.setAttribute('aria-modal', 'true');
  caixa.setAttribute('aria-label', 'Estúdio de vídeo');
  const topo = el('header', 'es-topo');
  const tit = el('div', 'es-tit');
  tit.append(el('b', null, 'Estúdio de vídeo'), el('span', null, opts.titulo || ''));
  const bFechar = el('button', 'es-x', '✕'); bFechar.type = 'button'; bFechar.setAttribute('aria-label', 'Fechar o estúdio');
  topo.append(tit, bFechar);

  const corpo = el('div', 'es-corpo');
  const monitor = el('section', 'es-monitor');
  monitor.setAttribute('aria-label', 'Monitor');
  const ecra = el('div', 'es-tela');
  const tela = el('canvas'); tela.width = 1280; tela.height = 720;
  tela.setAttribute('aria-label', 'Pré-visualização do vídeo');
  const tctx = tela.getContext('2d');
  const teleponto = el('div', 'es-teleponto'); teleponto.hidden = true;
  const tpAgora = el('p', 'agora'); const tpDepois = el('p', 'depois');
  teleponto.append(tpAgora, tpDepois);
  const contagem = el('div', 'es-contagem'); contagem.hidden = true;
  const espera = el('div', 'es-espera', 'A preparar o vídeo e o som…');
  ecra.append(tela, teleponto, contagem, espera);
  const transporte = el('div', 'es-transporte');
  const bInicio = el('button', 'es-b', '⏮'); bInicio.type = 'button'; bInicio.setAttribute('aria-label', 'Voltar ao início');
  const bPlay = el('button', 'es-b es-play', '▶'); bPlay.type = 'button'; bPlay.setAttribute('aria-label', 'Reproduzir');
  const tempo = el('span', 'es-tempo', '0:00 / 0:00');
  const cenaNome = el('span', 'es-cena', '');
  const vu = el('div', 'es-vu'); vu.setAttribute('aria-hidden', 'true'); const vuB = el('span'); vu.appendChild(vuB);
  transporte.append(bInicio, bPlay, tempo, cenaNome, vu);
  monitor.append(ecra, transporte);

  // Mesa de som e opções.
  const mesa = el('aside', 'es-mesa');
  mesa.setAttribute('aria-label', 'Som e opções');
  mesa.appendChild(el('h3', null, 'Som'));
  const faixa = (rotulo, chaveOn, chaveVol, cor) => {
    const l = el('div', 'es-faixa');
    l.style.setProperty('--cor', cor);
    const chk = el('input'); chk.type = 'checkbox'; chk.checked = !!cfg[chaveOn]; chk.id = 'es-' + chaveOn;
    const lab = el('label', null, rotulo); lab.htmlFor = chk.id;
    const vol = el('input'); vol.type = 'range'; vol.min = '0'; vol.max = '1'; vol.step = '0.05'; vol.value = String(cfg[chaveVol]);
    vol.setAttribute('aria-label', 'Volume: ' + rotulo);
    l.append(chk, lab, vol);
    chk.addEventListener('change', () => { cfg[chaveOn] = chk.checked; gravarCfg(cfg); if (mistura) mistura.volumes(volumesAgora()); });
    vol.addEventListener('input', () => { cfg[chaveVol] = Number(vol.value); gravarCfg(cfg); if (mistura) mistura.volumes(volumesAgora()); });
    return { l, chk, vol };
  };
  const fMus = faixa('Música', 'musicaOn', 'musica', '#22A6A9');
  const fEf = faixa('Efeitos', 'efeitosOn', 'efeitos', '#F2B705');
  mesa.append(fMus.l, fEf.l);
  const narr = el('div', 'es-faixa es-narr');
  narr.style.setProperty('--cor', '#E0679A');
  const chkNarr = el('input'); chkNarr.type = 'checkbox'; chkNarr.id = 'es-narracao';
  const labNarr = el('label', null, 'Narração com a minha voz'); labNarr.htmlFor = chkNarr.id;
  const volVoz = el('input'); volVoz.type = 'range'; volVoz.min = '0'; volVoz.max = '1.5'; volVoz.step = '0.05'; volVoz.value = String(cfg.voz);
  volVoz.setAttribute('aria-label', 'Volume da voz');
  const micVu = el('div', 'es-vu es-mic'); micVu.setAttribute('aria-hidden', 'true'); const micB = el('span'); micVu.appendChild(micB);
  narr.append(chkNarr, labNarr, volVoz, micVu);
  const dicaNarr = el('p', 'es-dica', 'Grave enquanto o vídeo corre: o guião de cada quadro aparece no monitor. Use auscultadores.');
  mesa.append(narr, dicaNarr);
  const opcao = (rotulo, input) => { const l = el('label', 'es-op'); l.append(input, document.createTextNode(' ' + rotulo)); return l; };
  const chkLeg = el('input'); chkLeg.type = 'checkbox'; chkLeg.checked = !!cfg.legendas;
  const chkOuvir = el('input'); chkOuvir.type = 'checkbox'; chkOuvir.checked = !!cfg.ouvir;
  mesa.append(opcao('Legendas no vídeo (o guião)', chkLeg), opcao('Ouvir o som durante a gravação', chkOuvir));
  const selRitmo = el('select');
  Object.values(RITMOS).forEach((r) => { const o = el('option', null, r.nome); o.value = r.id; o.selected = r.id === ritmo; selRitmo.appendChild(o); });
  const selFundo = el('select');
  Object.entries(FUNDOS).forEach(([k, v]) => { const o = el('option', null, v); o.value = k; o.selected = k === fundo; selFundo.appendChild(o); });
  const linhaSel = (rotulo, sel) => { const l = el('label', 'es-sel'); l.append(el('span', null, rotulo), sel); return l; };
  mesa.append(linhaSel('Ritmo', selRitmo), linhaSel('Fundo', selFundo));
  if (!temSom) mesa.appendChild(el('p', 'es-dica es-aviso', 'Este navegador não gera som: o vídeo sai sem áudio.'));
  corpo.append(monitor, mesa);

  // Linha de tempo.
  const linha = el('section', 'es-linha');
  linha.setAttribute('aria-label', 'Linha de tempo');
  const regua = el('div', 'es-regua');
  const pistas = el('div', 'es-pistas');
  const pista = (nome) => { const p = el('div', 'es-pista'); const n = el('span', 'es-nome', nome); const faixaP = el('div', 'es-lane'); p.append(n, faixaP); pistas.appendChild(p); return faixaP; };
  const laneV = pista('V1 Quadros');
  const laneN = pista('A1 Narração');
  const laneE = pista('A2 Efeitos');
  const laneM = pista('A3 Música');
  const cabeca = el('div', 'es-cabeca');
  pistas.appendChild(cabeca);
  const legenda = el('div', 'es-familias');
  Object.entries(FAMILIAS).forEach(([k, nome]) => { const s = el('span'); const d = el('i'); d.style.background = COR_FAMILIA[k]; s.append(d, nome); legenda.appendChild(s); });
  linha.append(regua, pistas, legenda);

  const base = el('footer', 'es-base');
  const estado = el('p', 'es-estado'); estado.setAttribute('role', 'status');
  const bCancelar = el('button', 'es-b es-cancelar', 'Cancelar a gravação'); bCancelar.type = 'button'; bCancelar.hidden = true;
  const bGravar = el('button', 'es-gravar', '● Gravar o vídeo'); bGravar.type = 'button'; bGravar.disabled = true;
  base.append(estado, bCancelar, bGravar);

  caixa.append(topo, corpo, linha, base);
  root.appendChild(caixa);
  const overflowAntes = doc.documentElement.style.overflow;
  doc.documentElement.style.overflow = 'hidden';
  bPlay.focus();

  const dizer = (t, c) => { estado.textContent = t || ''; estado.className = 'es-estado' + (c ? ' ' + c : ''); };

  // ---------- Desenhar ----------
  function desenharEm(sec) {
    if (!V) return null;
    const at = V.desenhar(tctx, Math.max(0, Math.min(sec, V.total)));
    tempo.textContent = `${relogio(sec)} / ${relogio(V.total)}`;
    cenaNome.textContent = `${at.i + 1}/${V.plano.length} · ${at.cena.nome}`;
    cabeca.style.left = `calc(var(--rot) + (100% - var(--rot)) * ${Math.min(1, sec / V.total)})`;
    if (cfg.narracao) {
      teleponto.hidden = false;
      tpAgora.textContent = V.guiao[at.i] || '';
      tpDepois.textContent = V.guiao[at.i + 1] ? 'A seguir: ' + V.guiao[at.i + 1] : '';
    } else teleponto.hidden = true;
    return at;
  }
  function medir() {
    if (!mistura) return;
    const n = mistura.medir();
    vuB.style.width = Math.min(100, n.geral * 260) + '%';
    micB.style.width = Math.min(100, n.voz * 300) + '%';
  }

  function linhaDeTempo() {
    const total = V.total;
    const pc = (t) => (t / total) * 100 + '%';
    // Régua: uma marca a cada 10 s (30 s nos vídeos longos).
    const passo = total > 240 ? 30 : total > 90 ? 15 : 10;
    regua.replaceChildren();
    for (let t = 0; t <= total; t += passo) { const m = el('span', null, relogio(t)); m.style.left = `calc(var(--rot) + (100% - var(--rot)) * ${t / total})`; regua.appendChild(m); }
    laneV.replaceChildren(); laneN.replaceChildren(); laneE.replaceChildren(); laneM.replaceChildren();
    let acc = 0;
    V.plano.forEach((c, i) => {
      const b = el('div', 'es-bloco', c.nome);
      b.style.left = pc(acc); b.style.width = pc(c.dur);
      b.style.setProperty('--cor', (c.l && c.l.cor) || COR_QUADRO[c.k] || '#5B8DEF');
      b.title = `${i + 1}. ${c.nome} · ${relogio(acc)}–${relogio(acc + c.dur)}`;
      laneV.appendChild(b);
      const txt = V.guiao[i];
      if (txt) {
        const n = el('div', 'es-bloco es-fala', txt);
        n.style.left = pc(acc); n.style.width = pc(c.dur);
        n.title = txt;
        laneN.appendChild(n);
      }
      acc += c.dur;
    });
    V.pista.forEach((d) => {
      const s = SONS[d.som] || { familia: 'outro', nome: d.som };
      const m = el('i', 'es-som');
      m.style.left = pc(d.t);
      m.style.setProperty('--cor', COR_FAMILIA[s.familia] || '#9AA8BC');
      m.style.setProperty('--h', String(Math.max(0.35, Math.min(1, d.ganho * 1.6))));
      m.title = `${s.nome} · ${relogio(d.t)}`;
      laneE.appendChild(m);
    });
    const mus = el('div', 'es-bloco es-musica', 'Música de fundo · Ré maior, 88 bpm · entra, baixa com a voz e fecha com o acorde final');
    mus.style.left = '0'; mus.style.width = '100%';
    laneM.appendChild(mus);
  }

  async function montarVideo() {
    const minha = ++versao;
    parar();
    espera.hidden = false;
    espera.textContent = 'A preparar o vídeo e o som…';
    bGravar.disabled = true;
    try {
      const novo = await prepararVideo(opts.tipo, { ...opts.dados, fundo }, { ritmo, legendas: cfg.legendas, esticar: cfg.legendas || cfg.narracao });
      await somPronto;
      if (fechado || minha !== versao) return;
      V = novo;
      pos = Math.min(pos, V.total);
      espera.hidden = true;
      linhaDeTempo();
      desenharEm(pos);
      bGravar.disabled = false;
      const nSons = V.pista.length;
      dizer(`${RITMOS[ritmo].nome}: ${fmtDuracao(V.total)}, ${V.plano.length} quadros, ${nSons} efeitos de som${cfg.legendas ? ', com legendas' : ''}${mistura ? '' : temSom ? ' (o som ainda não está pronto)' : ''}.`);
    } catch (e) {
      if (minha !== versao) return;
      espera.textContent = (e && e.message) || 'Não foi possível preparar o vídeo.';
      dizer(espera.textContent, 'err');
    }
  }

  // ---------- Reproduzir ----------
  function agoraToca() { return toca.desde + (actx ? actx.currentTime - toca.quando : (performance.now() - toca.t0) / 1000); }
  function ciclo() {
    if (!toca || !V) return;
    const sec = Math.max(toca.desde, agoraToca());
    pos = Math.min(sec, V.total);
    desenharEm(pos);
    medir();
    if (sec >= V.total) { parar(); pos = V.total; return; }
    raf = requestAnimationFrame(ciclo);
  }
  function tocar() {
    if (!V || gravando) return;
    if (pos >= V.total - 0.05) pos = 0;
    if (actx && actx.state === 'suspended') actx.resume();
    const quando = actx ? actx.currentTime + 0.08 : 0;
    const sessao = mistura ? mistura.tocar({ pista: V.pista, total: V.total, desde: pos, quando }) : null;
    toca = { sessao, quando, desde: pos, t0: performance.now() };
    bPlay.textContent = '⏸'; bPlay.setAttribute('aria-label', 'Pausa');
    ciclo();
  }
  function parar() {
    if (toca && toca.sessao) toca.sessao.parar();
    toca = null;
    cancelAnimationFrame(raf);
    bPlay.textContent = '▶'; bPlay.setAttribute('aria-label', 'Reproduzir');
  }
  function irPara(sec) {
    const estavaATocar = !!toca;
    parar();
    pos = Math.max(0, Math.min(V ? V.total : 0, sec));
    desenharEm(pos);
    if (estavaATocar) tocar();
  }

  // ---------- Gravar ----------
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  async function contar() {
    contagem.hidden = false;
    for (const n of [3, 2, 1]) {
      if (fechado || (abortar && abortar.signal.aborted)) break;
      contagem.textContent = String(n);
      await esperar(900);
    }
    contagem.hidden = true;
  }
  async function gravar() {
    if (!V || gravando) return;
    parar();
    gravando = true;
    caixa.classList.add('a-gravar');
    abortar = new AbortController();
    bGravar.disabled = true; bCancelar.hidden = false;
    [fMus.chk, fEf.chk, chkNarr, chkLeg, chkOuvir, selRitmo, selFundo, bPlay, bInicio].forEach((x) => { x.disabled = true; });
    try {
      if (actx && actx.state === 'suspended') await actx.resume();
      const comVoz = cfg.narracao && mistura && mistura.temMicrofone();
      if (comVoz) { dizer('Prepare-se: a gravação começa a seguir à contagem.'); await contar(); }
      if (abortar.signal.aborted) throw Object.assign(new Error('Gravação do vídeo cancelada.'), { name: 'AbortError' });
      if (colunas) colunas.gain.value = cfg.ouvir ? 1 : 0;
      if (mistura) mistura.gravarVoz(comVoz);
      const r = await gravarVideo(V, {
        canvas: tela,
        mistura,
        signal: abortar.signal,
        onProgress: (t, total, cena, i) => {
          dizer(`A gravar${comVoz ? ' com a sua voz' : ''}: ${relogio(t)} de ${relogio(total)} · ${cena ? cena.nome : ''}. Mantenha este separador aberto.`);
          cabeca.style.left = `calc(var(--rot) + (100% - var(--rot)) * ${Math.min(1, t / total)})`;
          tempo.textContent = `${relogio(t)} / ${relogio(total)}`;
          if (cfg.narracao) { tpAgora.textContent = V.guiao[i] || ''; tpDepois.textContent = V.guiao[i + 1] ? 'A seguir: ' + V.guiao[i + 1] : ''; }
          medir();
        },
      });
      dizer('A guardar o vídeo…');
      await opts.guardar({ ...r, ritmo });
      dizer(`Vídeo pronto (${r.ext.toUpperCase()}, ${fmtDuracao(r.duracao)}${r.comSom ? ', com som' + (comVoz ? ' e a sua narração' : '') : ', sem som'}).`, 'ok');
    } catch (e) {
      dizer((e && e.message) || 'Não foi possível gravar o vídeo.', e && e.name === 'AbortError' ? '' : 'err');
    } finally {
      gravando = false;
      caixa.classList.remove('a-gravar');
      if (mistura) mistura.gravarVoz(false);
      if (colunas) colunas.gain.value = 1;
      contagem.hidden = true;
      bGravar.disabled = !V; bCancelar.hidden = true;
      [fMus.chk, fEf.chk, chkNarr, chkLeg, chkOuvir, selRitmo, selFundo, bPlay, bInicio].forEach((x) => { x.disabled = false; });
      if (!temSom) chkNarr.disabled = true;
      pos = 0;
      if (V && !fechado) desenharEm(0);
    }
  }

  // ---------- Narração ----------
  async function ligarNarracao(on) {
    if (on) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { chkNarr.checked = false; dizer('Este navegador não deixa usar o microfone.', 'err'); return; }
      try {
        await somPronto;
        if (!mistura) throw new Error('O som ainda não está pronto.');
        micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        if (fechado) { micStream.getTracks().forEach((t) => t.stop()); return; }
        mistura.ligarMicrofone(micStream);
        cfg.narracao = true;
        narr.classList.add('on');
        // O medidor do microfone mexe já, antes de reproduzir: dá para experimentar a voz.
        const medirParado = () => { if (!cfg.narracao || fechado) return; if (!toca && !gravando) medir(); requestAnimationFrame(medirParado); };
        requestAnimationFrame(medirParado);
        dizer('Microfone ligado. Os quadros esticam ao tempo de ler o guião; experimente com ▶ antes de gravar.');
      } catch (e) {
        chkNarr.checked = false;
        cfg.narracao = false;
        dizer(e && e.name === 'NotAllowedError' ? 'O microfone não foi autorizado. Pode autorizá-lo nas definições do site.' : ((e && e.message) || 'Não foi possível ligar o microfone.'), 'err');
        return;
      }
    } else {
      cfg.narracao = false;
      narr.classList.remove('on');
      if (mistura) mistura.desligarMicrofone();
      if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }
      micB.style.width = '0';
    }
    await montarVideo();
  }

  // ---------- Eventos ----------
  bPlay.addEventListener('click', () => (toca ? parar() : tocar()));
  bInicio.addEventListener('click', () => irPara(0));
  bGravar.addEventListener('click', gravar);
  bCancelar.addEventListener('click', () => { if (abortar) abortar.abort(); });
  chkNarr.disabled = !temSom;
  chkNarr.addEventListener('change', () => ligarNarracao(chkNarr.checked));
  volVoz.addEventListener('input', () => { cfg.voz = Number(volVoz.value); gravarCfg(cfg); if (mistura) mistura.volumes(volumesAgora()); });
  chkLeg.addEventListener('change', () => { cfg.legendas = chkLeg.checked; gravarCfg(cfg); montarVideo(); });
  chkOuvir.addEventListener('change', () => { cfg.ouvir = chkOuvir.checked; gravarCfg(cfg); });
  selRitmo.addEventListener('change', () => { ritmo = selRitmo.value; pos = 0; montarVideo(); });
  selFundo.addEventListener('change', () => {
    fundo = selFundo.value;
    try { localStorage.setItem('relatorios:video:fundo', fundo); } catch (e) { /* idem */ }
    if (opts.aoMudarFundo) opts.aoMudarFundo(fundo);
    montarVideo();
  });
  pistas.addEventListener('click', (e) => {
    if (!V || gravando) return;
    const r = pistas.getBoundingClientRect();
    const rot = parseFloat(getComputedStyle(pistas).getPropertyValue('--rot')) || 96;
    const x = (e.clientX - r.left - rot) / (r.width - rot);
    if (x >= 0 && x <= 1) irPara(x * V.total);
  });
  const tecla = (e) => {
    if (fechado) return;
    const alvo = e.composedPath()[0];
    const emCampo = alvo && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(alvo.tagName);
    if (e.key === 'Escape' && !gravando) { e.preventDefault(); fechar(); }
    else if (e.key === ' ' && !emCampo && !gravando) { e.preventDefault(); if (toca) parar(); else tocar(); }
    else if (e.key === 'Home' && !emCampo && !gravando) irPara(0);
  };
  doc.addEventListener('keydown', tecla);
  bFechar.addEventListener('click', () => { if (gravando && abortar) abortar.abort(); fechar(); });

  function fechar() {
    if (fechado) return;
    fechado = true;
    parar();
    if (abortar) abortar.abort();
    doc.removeEventListener('keydown', tecla);
    if (micStream) micStream.getTracks().forEach((t) => t.stop());
    if (mistura) mistura.fechar();
    if (actx) actx.close().catch(() => {});
    caixa.remove();
    doc.documentElement.style.overflow = overflowAntes;
    if (opts.aoFechar) opts.aoFechar();
  }

  montarVideo();
  return { fechar, get video() { return V; } };
}
