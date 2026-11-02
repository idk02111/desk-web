// Offline shell cache only. No push in plan B (alerts go to Discord).
self.addEventListener('install',e=>e.waitUntil(caches.open('desk-v1').then(c=>c.addAll(['./','index.html','app.css','app.js','chart.js','manifest.json']))));
self.addEventListener('fetch',e=>{if(e.request.url.includes('/d/'))return;e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))});
