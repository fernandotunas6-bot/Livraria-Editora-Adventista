import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import {
  aplicarBarraDeEstado, caminhoDaLigacao, eAppAndroid, estiloDaBarraDeEstado, numeroNoIcone, pluginAparelho, pluginApp, pluginPush,
} from '@/lib/nativeApp';
import { sincronizarPushNativo } from '@/lib/pushNotifications';
import { haTrabalhoPorGravar } from '@/lib/unsavedWork';

/** Para onde vai o toque numa notificação: a página do site que ela traz (`url`). */
export function caminhoDaNotificacao(url) {
  const s = String(url || '');
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  return caminhoDaLigacao(s);
}

/**
 * Uma janela aberta: as do Radix (`data-state="open"`) e as feitas à mão — o carrinho, os filtros
 * no telemóvel, o assistente, o formulário de livro do painel —, que só existem no ecrã enquanto
 * estão abertas e não têm `data-state`. Uma do Radix a fechar (`data-state="closed"`, durante a
 * animação de saída) já não conta. É a mesma ideia do useAuthDialog.jsx.
 */
const JANELA_ABERTA = [
  '[role="dialog"]:not([data-state="closed"])',
  '[role="alertdialog"]:not([data-state="closed"])',
  '[aria-modal="true"]:not([data-state="closed"])',
].join(', ');

/**
 * Puxar para baixo aqui é actualizar, ou é só deslizar? Só deslizar com uma janela aberta (o
 * carrinho, um formulário) ou dentro de uma lista com scroll próprio que já desceu: aí puxar sobe
 * a lista. `alvo`: onde o dedo tocou. O topo da própria página vê-o o telemóvel.
 */
export function podePuxarAqui(alvo, { doc = document, win = window } = {}) {
  if (doc.querySelector(JANELA_ABERTA)) return false;
  for (let el = alvo; el && el !== doc.body && el !== doc.documentElement; el = el.parentElement) {
    if (el.scrollTop > 0) {
      const { overflowY } = win.getComputedStyle(el);
      if (overflowY === 'auto' || overflowY === 'scroll') return false;
    }
  }
  return true;
}

/**
 * Puxar para actualizar (MainViewController.swift no iPhone, MainActivity.java no Android):
 * recarrega a página, a não ser que se perca alguma coisa — alterações por gravar
 * (lib/unsavedWork.js) — ou que o gesto fosse só deslizar (podePuxarAqui). Devolve o que fazer:
 * 'recarregar', 'por-gravar' ou 'janela' (não fazer nada).
 */
export function aoPuxarParaActualizar({ porGravar = haTrabalhoPorGravar(), doc = document, win = window, alvo = null } = {}) {
  if (!podePuxarAqui(alvo, { doc, win })) return 'janela';
  if (porGravar) return 'por-gravar';
  return 'recarregar';
}

/**
 * Segue as ligações que abrem o app, uma vez cada. Com o app fechado, a ligação que o abre chega
 * duas vezes — pelo `appUrlOpen` (o plugin guarda-o até haver quem o ouça) e pelo `getLaunchUrl` —
 * e navegar duas vezes deixava a página repetida no histórico: «voltar» parecia não fazer nada.
 */
export function seguidorDeLigacoes(navegar, { agora = Date.now, janelaMs = 3000 } = {}) {
  let ultima = { caminho: '', quando: -Infinity };
  return (url) => {
    const caminho = caminhoDaLigacao(url);
    if (!caminho) return false;
    const t = agora();
    if (caminho === ultima.caminho && t - ultima.quando < janelaMs) return false;
    ultima = { caminho, quando: t };
    navegar(caminho);
    return true;
  };
}

/** A ligação que abriu o app já foi seguida nesta sessão (ao recarregar não se volta a ela). */
const LANCAMENTO_SEGUIDO = 'livraria:app-ligacao-inicial';

/**
 * O que liga o site ao app iOS (lib/nativeApp.js). Só é carregado dentro do app (App.jsx):
 *
 * - ligações que abrem o app (um link de rastreio no email, uma publicação no WhatsApp): o
 *   iPhone entrega-as ao app, e aqui vão para a página certa, sem recarregar o site;
 * - a barra de estado (hora, bateria) com a cor certa para cada página;
 * - notificações: tocar numa abre a página dela; ao abrir o app e a cada entrada ou saída de
 *   conta, o aparelho volta a dizer ao servidor de quem é (lib/pushNotifications.js);
 * - o número no ícone do app: os avisos por ler da conta;
 * - puxar para actualizar (e, no Android, dizer ao app quando o gesto é só deslizar).
 */
export default function NativeAppBridge() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const { user, ready } = useAuth();
  const { settings } = useSiteSettings();
  const pushLigado = !!settings?.push_enabled;
  const { unread } = useNotifications({ limit: 20 });

  // O número no ícone segue os avisos por ler (sem conta, nenhum).
  useEffect(() => {
    if (!ready) return;
    numeroNoIcone(user?.id ? unread : 0);
  }, [ready, user?.id, unread]);

  // Onde o dedo tocou por último: o puxar para actualizar não recarrega quando o gesto era subir
  // uma lista com scroll próprio.
  const ultimoToque = useRef(null);
  useEffect(() => {
    const puxou = () => {
      const fazer = aoPuxarParaActualizar({ alvo: ultimoToque.current });
      if (fazer === 'recarregar') window.location.reload();
      else if (fazer === 'por-gravar') toast.info('Há alterações por gravar nesta página', { description: 'Grave-as antes de actualizar.' });
      // Com uma janela aberta, puxar é só deslizar dentro dela: não se faz nada.
    };
    const tocou = (e) => { ultimoToque.current = e.target; };
    document.addEventListener('touchstart', tocou, { capture: true, passive: true });
    window.addEventListener('livraria:puxar-para-actualizar', puxou);
    return () => {
      document.removeEventListener('touchstart', tocou, { capture: true });
      window.removeEventListener('livraria:puxar-para-actualizar', puxou);
    };
  }, []);

  // Android: o gesto de puxar é do app (MainActivity.java), que decide antes de o dedo andar. O
  // site diz-lhe se pode — ao tocar, ao deslizar e quando uma janela abre ou fecha — para não
  // roubar o deslizar de uma janela ou de uma lista. No iPhone o próprio WKWebView já o sabe.
  useEffect(() => {
    if (!eAppAndroid()) return undefined;
    let ultimo = null;
    let agendado = 0;
    const dizer = () => {
      agendado = 0;
      const pode = podePuxarAqui(ultimoToque.current);
      if (pode === ultimo) return;
      ultimo = pode;
      pluginAparelho().then((a) => a?.podePuxar({ sim: pode })).catch(() => {
        // Versão do app sem o puxar para actualizar: nada a dizer.
      });
    };
    const agendar = () => { if (!agendado) agendado = requestAnimationFrame(dizer); };
    // Ao tocar diz-se logo, sem esperar: o app decide quando o dedo começa a andar.
    const tocou = (e) => { ultimoToque.current = e.target; dizer(); };
    document.addEventListener('touchstart', tocou, { capture: true, passive: true });
    document.addEventListener('scroll', agendar, { capture: true, passive: true });
    const janelas = new MutationObserver(agendar);
    janelas.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state'] });
    dizer();
    return () => {
      document.removeEventListener('touchstart', tocou, { capture: true });
      document.removeEventListener('scroll', agendar, { capture: true });
      janelas.disconnect();
      if (agendado) cancelAnimationFrame(agendado);
    };
  }, []);

  // O aparelho fica associado a quem tem sessão agora (ou a ninguém, depois de sair).
  useEffect(() => {
    if (!ready || !pushLigado) return;
    sincronizarPushNativo();
  }, [ready, pushLigado, user?.id]);

  // Tocar numa notificação abre a página dela (também com o app fechado: o plugin guarda o
  // toque até haver quem o ouça).
  useEffect(() => {
    let vivo = true;
    let ouvinte = null;
    (async () => {
      const push = await pluginPush();
      if (!push || !vivo) return;
      const h = await push.addListener('pushNotificationActionPerformed', ({ notification }) => {
        const caminho = caminhoDaNotificacao(notification?.data?.url);
        if (caminho) navigateRef.current(caminho);
      });
      if (!vivo) { h.remove(); return; }
      ouvinte = h;
    })().catch(() => {
      // Plugin em falta numa versão antiga do app: o site funciona sem isto.
    });
    return () => {
      vivo = false;
      ouvinte?.remove();
    };
  }, []);

  // A barra de estado segue a página e o tema (o painel tem barra branca; a loja, azul).
  useEffect(() => {
    const html = document.documentElement;
    const aplicar = () => aplicarBarraDeEstado(estiloDaBarraDeEstado(pathname, html.classList.contains('dark')));
    aplicar();
    const observador = new MutationObserver(aplicar);
    observador.observe(html, { attributes: true, attributeFilter: ['class'] });
    return () => observador.disconnect();
  }, [pathname]);

  useEffect(() => {
    let vivo = true;
    let ouvinte = null;

    const seguir = seguidorDeLigacoes((caminho) => navigateRef.current(caminho));

    (async () => {
      const App = await pluginApp();
      if (!App || !vivo) return;
      const h = await App.addListener('appUrlOpen', ({ url }) => seguir(url));
      if (!vivo) { h.remove(); return; }
      ouvinte = h;
      // App fechado: a ligação que o abriu não chega pelo `appUrlOpen`, pede-se aqui.
      const inicial = await App.getLaunchUrl().catch(() => null);
      if (!vivo || !inicial?.url) return;
      let jaSeguida = false;
      try {
        jaSeguida = sessionStorage.getItem(LANCAMENTO_SEGUIDO) === inicial.url;
        sessionStorage.setItem(LANCAMENTO_SEGUIDO, inicial.url);
      } catch {
        // Sem armazenamento: segue-se a ligação na mesma.
      }
      if (!jaSeguida) seguir(inicial.url);
    })().catch(() => {
      // Plugin em falta numa versão antiga do app: o site funciona sem isto.
    });

    return () => {
      vivo = false;
      ouvinte?.remove();
    };
  }, []);

  return null;
}
