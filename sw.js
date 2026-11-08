/* BetControl — Service Worker (08/11/2026)
   Missão principal: receber o PUSH de aposta finalizada com o app
   FECHADO (a função enviar-push-bet manda o aviso cifrado pro serviço
   da Apple/Google, ele entrega no aparelho e quem acorda é ESTE
   service worker — a página não precisa estar aberta).
   De quebra, guarda uma cópia do index pra navegação não abrir em
   branco se a rede cair na hora de abrir.
   NUNCA intercepta: métodos != GET e qualquer chamada ao Supabase. */
const BC_CACHE = 'bc-shell-v1';
const BC_SHELL = ['./', './index.html', './manifest.webmanifest', './favicon.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    try {
      const c = await caches.open(BC_CACHE);
      for (const u of BC_SHELL) { try { await c.add(u); } catch (_) {} }
    } catch (_) {}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== BC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.hostname.endsWith('supabase.co')) return;
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate' || req.destination === 'document') {
    e.respondWith(
      fetch(req).then((r) => {
        if (r && r.ok) {
          const copia = r.clone();
          caches.open(BC_CACHE).then((c) => c.put('./index.html', copia));
        }
        return r;
      }).catch(() => caches.match('./index.html', { ignoreSearch: true })
        .then((m) => m || caches.match('./', { ignoreSearch: true })))
    );
  }
});

/* ---------- 🔔 PUSH de aposta finalizada ----------
   Payload montado pela função: { titulo, corpo, tag, url }. */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; }
  catch (_) { try { d = { corpo: e.data.text() }; } catch (__) {} }
  const titulo = d.titulo || '🔔 BetControl';
  const opcoes = {
    body: d.corpo || '',
    icon: './favicon.png',
    badge: './favicon.png',
    tag: d.tag || 'bc-push',
    data: { url: d.url || './' }
  };
  e.waitUntil(self.registration.showNotification(titulo, opcoes));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if ('focus' in w) {
        try { await w.navigate(url); } catch (_) {}
        return w.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
