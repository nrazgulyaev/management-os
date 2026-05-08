// Stage 5.I — Hand-rolled Service Worker for Arconique Development OS PWA.
// No Workbox; cache strategies are 3 short pure functions, IndexedDB queue
// is 6 helpers. Sensitive financial routes are explicitly excluded from
// caching to prevent leakage on a stolen device.

const CACHE_VERSION = "arconique-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const PHOTO_QUEUE = "arconique-photo-queue";

const STATIC_ASSETS = [
  "/",
  "/development-os/dashboard",
  "/development-os/cabinets/site-supervisor",
  "/development-os/site-reports",
  "/development-os/qa-qc",
  "/manifest.json",
];

// Routes that MUST NOT be cached (sensitive financial data).
const SENSITIVE_PATTERNS = [
  /\/api\/cron\//,
  /investor/i,
  /\/tax/i,
  /wallet/i,
  /payable/i,
  /receivable/i,
  /\/finance/i,
];

function isSensitive(url) {
  return SENSITIVE_PATTERNS.some((p) => p.test(url));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll(STATIC_ASSETS).catch(() => {
        // Allow install to succeed even if some assets 404 in dev.
      }),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter(
            (k) => !k.startsWith(CACHE_VERSION) && k !== PHOTO_QUEUE,
          )
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (isSensitive(url.toString())) {
    // Network-only — never cache.
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request, DYNAMIC_CACHE));
    return;
  }

  if (request.destination === "image" || request.destination === "font") {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE));
});

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response("Offline", { status: 503 });
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cached = await caches.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        // Clone synchronously: the original `response` is returned to the
        // caller below and its body becomes locked once consumed. Cloning
        // inside the async caches.open(...).then(...) chain ran AFTER the
        // lock and threw "Failed to clone Response: body is locked".
        const clone = response.clone();
        caches.open(cacheName).then((c) => c.put(request, clone));
      }
      return response;
    })
    .catch(() => null);
  return cached || (await fetchPromise) || new Response("Offline", { status: 503 });
}

// ---------------------------------------------------------------------------
// Background sync — drain offline queue
// ---------------------------------------------------------------------------

self.addEventListener("sync", (event) => {
  if (event.tag === "sync-offline-queue") {
    event.waitUntil(syncOfflineQueue());
  }
});

async function syncOfflineQueue() {
  const db = await openOfflineDB();
  const items = await getQueueItems(db);
  for (const item of items) {
    try {
      const response = await fetch(item.endpoint, {
        method: item.method,
        headers: {
          "Content-Type": "application/json",
          "X-Offline-Action-Id": item.id,
        },
        body: JSON.stringify(item.payload),
      });
      if (response.ok) {
        await deleteQueueItem(db, item.id);
      } else {
        await markQueueItemFailed(db, item.id, response.statusText);
      }
    } catch (e) {
      // Network still unavailable; leave for next sync.
    }
  }
}

function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("arconique-offline", 1);
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("queue")) {
        db.createObjectStore("queue", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("photos")) {
        db.createObjectStore("photos", { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getQueueItems(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("queue", "readonly");
    const store = tx.objectStore("queue");
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function deleteQueueItem(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("queue", "readwrite");
    const store = tx.objectStore("queue");
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function markQueueItemFailed(db, id, reason) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("queue", "readwrite");
    const store = tx.objectStore("queue");
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const item = getReq.result;
      if (!item) return resolve();
      item.lastAttempt = new Date().toISOString();
      item.failures = (item.failures || 0) + 1;
      item.lastFailureReason = reason;
      store.put(item);
      resolve();
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

// ---------------------------------------------------------------------------
// Push notifications
// ---------------------------------------------------------------------------

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data = {};
  try {
    data = event.data.json();
  } catch (e) {
    data = { title: "Arconique", body: event.data.text() };
  }
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-96x96.png",
    data: data.data || {},
    tag: data.tag || "default",
    requireInteraction: data.severity === "critical",
  };
  event.waitUntil(self.registration.showNotification(data.title || "Arconique", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/development-os/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((windowClients) => {
      const matching = windowClients.find((c) => c.url === url);
      if (matching) return matching.focus();
      return self.clients.openWindow(url);
    }),
  );
});
