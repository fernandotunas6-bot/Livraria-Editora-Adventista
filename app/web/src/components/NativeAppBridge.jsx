import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import {
  aplicarBarraDeEstado, caminhoDaLigacao, estiloDaBarraDeEstado, numeroNoIcone, pluginApp, pluginPush,
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
 * Puxar para actualizar (MainViewController.swift): recarrega a página, a não ser que se perca
 * alguma coisa — alterações por gravar (lib/unsavedWork.js) ou uma janela aberta, onde se está a
 * escrever. Devolve o que fazer: 'recarregar', 'por-gravar' ou 'janela'.
 */
export function aoPuxarParaActualizar({ porGravar = haTrabalhoPorGravar(), doc = document } = {}) {
  if (porGravar) return 'por-gravar';
  if (doc.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) return 'janela';
  return 'recarregar';
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
 * - puxar para actualizar.
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

  useEffect(() => {
    const puxou = () => {
      const fazer = aoPuxarParaActualizar();
      if (fazer === 'recarregar') window.location.reload();
      else if (fazer === 'por-gravar') toast.info('Há alterações por gravar nesta página', { description: 'Grave-as antes de actualizar.' });
      // Com uma janela aberta, puxar é só deslizar dentro dela: não se faz nada.
    };
    window.addEventListener('livraria:puxar-para-actualizar', puxou);
    return () => window.removeEventListener('livraria:puxar-para-actualizar', puxou);
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

    const seguir = (url) => {
      const caminho = caminhoDaLigacao(url);
      if (caminho) navigateRef.current(caminho);
    };

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
