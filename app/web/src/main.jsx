// Primeiro de tudo: o www e o endereço do Pages vão para o domínio principal (lib/canonicalHost.js).
import { REDIRECTING_TO_CANONICAL } from '@/lib/canonicalHost';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
// Os tipos de letra da loja, servidos daqui (antes vinham da Google; ver index.html). Os eixos
// são os que o pedido à Google usava: Fraunces com tamanho óptico e peso, Inter com peso.
import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/inter/wght.css';
import '@/index.css';
import { initFeatureFlags } from '@/lib/featureFlags';
import { installStaleChunkReload } from '@/lib/staleChunkReload';
import { prefetchProduct } from '@/api/EcommerceApi';

// Antes de montar: os interruptores viram atributos no `<html>`, e o CSS já encontra o
// estado certo na primeira pintura. Feito depois, os elementos apareciam um instante com
// os efeitos ligados antes de os perderem.
initFeatureFlags();

// Depois de uma publicação, quem tinha o site aberto pede ficheiros que já não existem:
// recarrega uma vez para a versão nova, em vez de cair em "Algo correu mal".
installStaleChunkReload();

// Ficha de um livro aberta directamente: os dados do livro começam a vir já, em paralelo com o
// código da página (que é carregado a pedido). Antes, só eram pedidos depois de ele chegar.
const fichaAberta = /^\/product\/([^/?#]+)/.exec(window.location.pathname);
if (fichaAberta && !REDIRECTING_TO_CANONICAL) prefetchProduct(decodeURIComponent(fichaAberta[1]));

if (!REDIRECTING_TO_CANONICAL) {
	ReactDOM.createRoot(document.getElementById('root')).render(
		<App />
	);
}