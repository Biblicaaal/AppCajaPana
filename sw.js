self.addEventListener("install", function(event) {
  event.waitUntil(caches.open("caja-panaderia-v1").then(function(cache) {
    return cache.addAll(["index.html", "styles.css", "app.js", "assets/logo.png", "assets/cash_register.mp3"]);
  }));
});

self.addEventListener("fetch", function(event) {
  event.respondWith(caches.match(event.request).then(function(cached) {
    return cached || fetch(event.request);
  }));
});
