// Service worker de Money Manager — hace la app instalable y usable OFFLINE.
// Estrategia deliberadamente conservadora para no romper el sync a Supabase:
//   · Solo toca peticiones GET del MISMO origen (el "app shell": index.html + íconos + manifest).
//   · Todo lo demás (Supabase, dolarapi, OpenAI…) pasa DIRECTO a la red, sin cachear ni interceptar.
//   · El HTML va network-first (siempre intenta la última versión; si no hay red, sirve la cacheada),
//     así una mejora publicada en GitHub Pages se toma al reabrir con internet.
//
// Subí el número de versión cuando cambien los assets cacheados para invalidar el caché viejo.
const VERSION = "mm-v1";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable.png", "./apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Solo el app shell propio. El resto (APIs) no se toca.
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // Navegación / HTML → network-first (última versión, con respaldo offline).
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    e.respondWith(
      fetch(req).then((res) => { caches.open(VERSION).then((c) => c.put("./index.html", res.clone())); return res; })
        .catch(() => caches.match("./index.html").then((r) => r || caches.match("./"))),
    );
    return;
  }
  // Assets propios (íconos, manifest) → cache-first (rápido y offline).
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
    return res;
  })));
});
