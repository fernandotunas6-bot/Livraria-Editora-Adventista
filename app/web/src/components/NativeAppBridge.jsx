import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  aplicarBarraDeEstado, caminhoDaLigacao, estiloDaBarraDeEstado, pluginApp,
} from '@/lib/nativeApp';

/** A ligação que abriu o app já foi seguida nesta sessão (ao recarregar não se volta a ela). */
const LANCAMENTO_SEGUIDO = 'livraria:app-ligacao-inicial';

/**
 * O que liga o site ao app iOS (lib/nativeApp.js). Só é carregado dentro do app (App.jsx):
 *
 * - ligações que abrem o app (um link de rastreio no email, uma publicação no WhatsApp): o
 *   iPhone entrega-as ao app, e aqui vão para a página certa, sem recarregar o site;
 * - a barra de estado (hora, bateria) com a cor certa para cada página.
 */
export default function NativeAppBridge() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

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
    })();

    return () => {
      vivo = false;
      ouvinte?.remove();
    };
  }, []);

  return null;
}
