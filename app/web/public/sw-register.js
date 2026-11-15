/**
 * Registo do service worker.
 *
 * Em ficheiro e não dentro do HTML para a política de segurança de conteúdo poder proibir
 * scripts embutidos por completo. Com o script no HTML, a única alternativa era autorizar
 * `unsafe-inline` — que abre a porta a qualquer script injectado — ou fixar o hash deste
 * bloco, que parte em silêncio na primeira vez que alguém lhe mexer num espaço.
 */
if ('serviceWorker' in navigator) {
	const isLocalDev = ['localhost', '127.0.0.1'].includes(location.hostname);
	if (isLocalDev) {
		// Em desenvolvimento, limpar SW/cache antigo que causa tela branca com Vite
		navigator.serviceWorker.getRegistrations().then((regs) => {
			regs.forEach((r) => r.unregister());
		});
		caches.keys().then((keys) => {
			keys.forEach((k) => caches.delete(k));
		});
	} else {
		window.addEventListener('load', () => {
			navigator.serviceWorker.register('/sw.js').then((reg) => {
				// A app instalada fica dias aberta em segundo plano: o navegador só procura um sw.js
				// novo ao abrir uma página. Procura também ao voltar à app (no máximo de 10 em 10
				// minutos) e de hora a hora com ela aberta. A versão da app em si é a do
				// /version.json (lib/appVersion.js), que se instala sozinha num momento seguro.
				let ultima = Date.now();
				const procurar = () => {
					if (Date.now() - ultima < 10 * 60 * 1000) return;
					ultima = Date.now();
					reg.update().catch(() => {});
				};
				document.addEventListener('visibilitychange', () => {
					if (document.visibilityState === 'visible') procurar();
				});
				setInterval(procurar, 60 * 60 * 1000);
			}).catch(() => {});
		});
	}
}
