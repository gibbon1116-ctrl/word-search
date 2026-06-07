const CACHE_NAME = "local-document-search-pwa-v8";
const APP_SHELL = ["./", "./index.html", "./manifest.json"];
const PDFJS_ASSETS = [
  "./pdfjs/cmaps/Adobe-Japan1-UCS2.bcmap",
  "./pdfjs/cmaps/UniJIS-UTF16-H.bcmap",
  "./pdfjs/cmaps/UniJIS-UTF8-H.bcmap",
  "./pdfjs/standard_fonts/LiberationSans-Regular.ttf",
  "./pdfjs/standard_fonts/LiberationSans-Bold.ttf",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([...APP_SHELL, ...PDFJS_ASSETS])).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match("./index.html")),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type === "opaque") {
          return response;
        }
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      });
    }),
  );
});
