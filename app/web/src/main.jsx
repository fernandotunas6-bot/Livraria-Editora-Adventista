// Primeiro de tudo: o www e o endereço do Pages vão para o domínio principal (lib/canonicalHost.js).
import { REDIRECTING_TO_CANONICAL } from '@/lib/canonicalHost';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
// Os tipos de letra da loja, servidos daqui (antes vinham da Google; ver index.html): a Source
// Serif 4 nos títulos e a Inter no texto, as duas só com o eixo do peso. O tamanho óptico da
// Source Serif 4 mais do que duplicava o ficheiro (122 KB contra 51 KB no alfabeto latino) por uma
// diferença que mal se vê. O itálico verdadeiro serve as citações e o browser só o descarrega
// quando há texto em itálico na página.
import '@fontsource-variable/source-serif-4/wght.css';
import '@fontsource-variable/source-serif-4/wght-italic.css';
import '@fontsource-variable/inter/wght.css';
import '@/index.css';
import { initFeatureFlags } from '@/lib/featureFlags';
import { installStaleChunkReload } from '@/lib/staleChunkReload';
import { prefetchProduct } from '@/api/EcommerceApi';
import { installTelemetry } from '@/lib/telemetry';

// Antes de montar: os interruptores viram atributos no `<html>`, e o CSS já encontra o
// estado certo na primeira pintura. Feito depois, os elementos apareciam um instante com
// os efeitos ligados antes de os perderem.
initFeatureFlags();

// Depois de uma publicação, quem tinha o site aberto pede ficheiros que já não existem:
// recarrega uma vez para a versão nova, em vez de cair em "Algo correu mal".
installStaleChunkReload();

// Os erros de JavaScript e a velocidade medida em quem visita, para o painel (Sistema → Saúde do
// site). Os erros desde já; as Core Web Vitals depois do load. Ver lib/telemetry.js.
installTelemetry();

// Ficha de um livro aberta directamente: os dados do livro começam a vir já, em paralelo com o
// código da página (que é carregado a pedido). Antes, só eram pedidos depois de ele chegar.
const fichaAberta = /^\/product\/([^/?#]+)/.exec(window.location.pathname);
if (fichaAberta && !REDIRECTING_TO_CANONICAL) prefetchProduct(decodeURIComponent(fichaAberta[1]));

if (!REDIRECTING_TO_CANONICAL) {
	ReactDOM.createRoot(document.getElementById('root')).render(
		<App />
	);
}