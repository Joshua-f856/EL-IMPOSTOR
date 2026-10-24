// Service worker de El Impostor — "red primero": siempre intenta traer la versión nueva y solo usa la
// caché si no hay conexión. Así nunca se queda atascado con un online.js viejo.
// Sube la versión cuando cambies archivos estáticos para limpiar cachés antiguas.
const VERSION = 'impostor-v6';

const BASICOS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './online.js',
  './social.js',
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
      .then((c) => {
        // Usamos addAll en lugar de un map individual para que si falla uno, 
        // sepamos exactamente qué ruta no se encontró.
        return c.addAll(BASICOS);
      })
      .then(() => self.skipWaiting())
      .catch((err) => console.error('Fallo al cachear recursos básicos:', err))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(
        claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))
      ))
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
        // Solo guardamos en caché respuestas exitosas
        if (res && res.status === 200 && res.type === 'basic') {
          const copia = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copia)).catch(() => {});
        }
        return res;
      })
      .catch(() => {
        // Si falla la red, buscamos en la caché. 
        // Agregamos tanto './index.html' como 'index.html' para evitar fallos de coincidencia.
        return caches.match(req).then((r) => {
          if (r) return r;
          if (req.mode === 'navigate') {
            return caches.match('./index.html') || caches.match('index.html');
          }
        });
      })
  );
});