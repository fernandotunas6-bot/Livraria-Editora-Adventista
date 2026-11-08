// Primeiro de tudo: o www e o endereço do Pages vão para o domínio principal (lib/canonicalHost.js).
import { REDIRECTING_TO_CANONICAL } from '@/lib/canonicalHost';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import '@/index.css';
import { initFeatureFlags } from '@/lib/featureFlags';
import { installStaleChunkReload } from '@/lib/staleChunkReload';

// Antes de montar: os interruptores viram atributos no `<html>`, e o CSS já encontra o
// estado certo na primeira pintura. Feito depois, os elementos apareciam um instante com
// os efeitos ligados antes de os perderem.
initFeatureFlags();

// Depois de uma publicação, quem tinha o site aberto pede ficheiros que já não existem:
// recarrega uma vez para a versão nova, em vez de cair em "Algo correu mal".
installStaleChunkReload();

if (!REDIRECTING_TO_CANONICAL) {
	ReactDOM.createRoot(document.getElementById('root')).render(
		<App />
	);
}