// Service worker de El Impostor — "red primero": siempre intenta traer la versión nueva y solo usa la
// caché si no hay conexión. Así nunca se queda atascado con un online.js viejo.
// Sube VERSION cada vez que cambies archivos estáticos (iconos, css, js) para limpiar cachés antiguas.
const VERSION = 'impostor-v9';

const BASICOS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './online.js',
  './social.js',
  './qr.js',
  './efectos.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      // Se cachea archivo por archivo: si UNO falta (404) los demás se guardan igual y el
      // service worker se instala de todos modos (con addAll una sola ruta mala cancelaba todo).
      .then((c) => Promise.all(BASICOS.map((u) => c.add(u).catch((err) => console.warn('No se pudo cachear', u, err)))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Solo recursos propios por GET. Firebase, Google y la CDN pasan directo al navegador.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        // Solo se guardan respuestas completas y correctas (los audios 206 parciales no se pueden cachear)
        if (res && res.status === 200 && res.type === 'basic') {
          const copia = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copia)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        // Sin red: primero lo pedido; si es una navegación, la página principal.
        // (caches.match devuelve una promesa, por eso se encadena con .then y no con ||)
        caches.match(req).then((r) =>
          r || (req.mode === 'navigate'
            ? caches.match('./index.html').then((i) => i || caches.match('./'))
            : undefined)
        )
      )
  );
});
