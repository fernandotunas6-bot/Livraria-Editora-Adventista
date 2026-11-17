const CACHE_NAME = 'livraria-v7';
const PRECACHE = ['/', '/shop', '/manifest.webmanifest', '/icons/icon-192.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('push', (event) => {
  let data = { title: 'Livraria Adventista', body: 'Tem uma nova actualização.', url: '/' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (err) {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.svg',
      badge: '/icons/icon-192.svg',
      data: { url: data.url || '/' },
      // Uma etiqueta por destino: com a mesma para todas, cada aviso apagava o anterior (duas
      // respostas seguidas a publicações diferentes deixavam só uma no telemóvel). O mesmo
      // destino continua a juntar-se num só aviso.
      tag: data.tag || `livraria:${data.url || '/'}`,
      renotify: true,
    })
  );
});

// Tocar no aviso abre o sítio dele (a publicação, a encomenda…). Com o site já aberto, essa
// janela vem para a frente E vai para lá — antes só vinha para a frente, e quem tocava numa
// resposta da comunidade ficava na página onde estava.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin);
  // Só endereços do próprio site.
  const url = target.origin === self.location.origin ? target.href : self.location.origin + '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (list) => {
      const same = list.find((client) => client.url === url);
      if (same && 'focus' in same) return same.focus();
      const client = list.find((c) => 'focus' in c);
      if (client) {
        const focused = await client.focus();
        if ('navigate' in focused) return focused.navigate(url).catch(() => self.clients.openWindow?.(url));
        return focused;
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return null;
    })
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api')) return;
  // A versão publicada vai sempre à rede: servida da cache, a app nunca saberia que há uma nova.
  if (url.pathname === '/version.json') return;
  // A app Android para descarregar (~5 MB, muda a cada versão): nunca na cache do site.
  if (url.pathname.startsWith('/downloads/')) return;
  // API do Supabase (login, dados, Edge Functions, tempo real): sempre pela rede, nunca da cache,
  // para não mostrar dados antigos nem misturar sessões. As imagens do Storage continuam em cache.
  if (/\/(auth|rest|functions|realtime)\/v1\//.test(url.pathname)) return;
  if (url.pathname.startsWith('/src/') || url.pathname.startsWith('/@') || url.pathname.includes('/node_modules/')) return;

  // Exclude Firebase Auth and Firestore API requests to prevent cache collisions and auth issues
  if (
    url.origin.includes('firestore.googleapis.com') ||
    url.origin.includes('identitytoolkit.googleapis.com') ||
    url.pathname.includes('/__/auth')
  ) {
    return;
  }

  // Pedidos para fora do site (tipos de letra da Google, Cloudflare Insights, imagens externas):
  // o browser trata deles sozinho. Refeitos aqui com fetch(), passavam a obedecer ao
  // `connect-src` do CSP, que não inclui esses domínios: eram recusados e, a partir da segunda
  // página, as fontes Inter e Fraunces falhavam e o site caía para as do sistema (auditoria,
  // 9.6). A excepção são as imagens públicas do Storage do Supabase — as capas —, que o
  // connect-src autoriza e que vale a pena guardar para a visita seguinte.
  const isStorageImage = url.pathname.includes('/storage/v1/object/public/');
  if (url.origin !== self.location.origin && !isStorageImage) return;

  // 1. Imagens (do site, do Supabase Storage ou externas): cache primeiro, actualizada em segundo plano.
  const isImage = event.request.destination === 'image' ||
                  /\.(png|jpg|jpeg|gif|webp|svg|ico)$/i.test(url.pathname) ||
                  url.pathname.includes('/storage/v1/object/public/');

  if (isImage) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          const fetchPromise = fetch(event.request).then((networkResponse) => {
            if (networkResponse.ok) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => cachedResponse || Response.error());

          // Return cached image immediately, or fallback to fetching
          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }

  // 2. Navegação (o HTML): rede primeiro, cache só se a rede falhar.
  //
  // Com stale-while-revalidate, depois de cada publicação o browser recebia o index.html
  // antigo, que aponta para ficheiros /assets/<hash> já substituídos — página em branco até
  // um segundo recarregamento. O HTML é pequeno e tem de ser sempre o actual; o que é grande
  // (os assets com hash no nome) é que vale a pena servir da cache.
  const isNavigation = event.request.mode === 'navigate' ||
                       event.request.destination === 'document' ||
                       (event.request.headers.get('accept') || '').includes('text/html');

  if (isNavigation) {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() =>
        // Sem rede: a última versão vista desta página, ou a raiz (a aplicação trata a rota).
        caches.match(event.request).then((cached) => cached || caches.match('/'))
      )
    );
    return;
  }

  // 3. Ficheiros com hash no nome (/assets/index-ab12cd34.js): o conteúdo nunca muda para o
  // mesmo nome, por isso a cache serve primeiro e não há nada a revalidar.
  if (url.origin === self.location.origin && /^\/assets\/.+-[A-Za-z0-9_-]{8}\./.test(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
        // Um ficheiro que já não existe (versão anterior) vem do Pages como o index.html, com
        // 200: guardá-lo aqui servia HTML no lugar do JavaScript para sempre, sem rede.
        const html = (response.headers.get('content-type') || '').includes('text/html');
        if (response.ok && !html) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }))
    );
    return;
  }

  // 4. O resto (manifest, ícones, tipos de letra): stale-while-revalidate.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetched = fetch(event.request).then((response) => {
        if (response.ok && (url.origin === self.location.origin)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached || Response.error());
      return cached || fetched;
    })
  );
});
