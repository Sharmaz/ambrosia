import { defaultCache } from "@serwist/next/worker";
import { CacheFirst, ExpirationPlugin, NetworkFirst, Serwist } from "serwist";

const ASSET_CACHE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const API_CACHE_MAX_AGE_SECONDS = 5 * 60;
const NETWORK_TIMEOUT_SECONDS = 5;

import {
  getPendingCheckouts,
  markCheckoutCompleted,
} from "@/lib/btcCheckoutStore";
import { httpClient, parseJsonResponse } from "@/lib/http";

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
  runtimeCaching: [
    {
      matcher: /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?)$/,
      handler: new CacheFirst({
        cacheName: "static-assets",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 64,
            maxAgeSeconds: ASSET_CACHE_MAX_AGE_SECONDS,
          }),
        ],
      }),
    },
    {
      matcher: /^\/api\//,
      handler: new NetworkFirst({
        cacheName: "api-cache",
        networkTimeoutSeconds: NETWORK_TIMEOUT_SECONDS,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 32,
            maxAgeSeconds: API_CACHE_MAX_AGE_SECONDS,
          }),
        ],
      }),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();

self.addEventListener("sync", (event) => {
  if (event.tag === "btc-checkout") {
    event.waitUntil(recoverPendingCheckouts());
  }
});

self.addEventListener("push", (event) => {
  console.warn("[sw] admin push received");
  event.waitUntil(
    self.registration
      .showNotification("Nueva actividad administrativa", {
        body: "Abre Ambrosia para ver detalles",
        tag: "admin-activity",
        renotify: true,
        data: {
          url: "/store/notifications",
        },
      })
      .then(() => console.warn("[sw] admin push notification shown"))
      .catch((error) => console.error("[sw] admin push notification failed", error)),
  );
});

self.addEventListener("notificationclick", (event) => {
  console.warn("[sw] admin notification clicked");
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/store/notifications";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const existingClient = clientList.find((client) => client.url.includes(targetUrl));
      if (existingClient) {
        return existingClient.focus();
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});

async function recoverPendingCheckouts() {
  let pending;
  try {
    pending = await getPendingCheckouts();
  } catch {
    return;
  }

  for (const entry of pending) {
    try {
      const statusResponse = await httpClient(
        `store/orders/payment-status/${entry.paymentHash}`,
      );
      const statusData = await parseJsonResponse(statusResponse);
      if (!statusResponse.ok) continue;

      if (statusData?.status === "completed") {
        await markCheckoutCompleted(entry.paymentHash, statusData);
        continue;
      }

      if (statusData?.status === "paid") {
        const checkoutResponse = await httpClient("store/orders/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entry.checkoutPayload),
        });
        const checkoutData = await parseJsonResponse(checkoutResponse);
        if (checkoutResponse.ok) {
          await markCheckoutCompleted(entry.paymentHash, checkoutData);
        }
      }
    } catch {
      continue;
    }
  }
}

self.addEventListener("install", (event) => {
  const requestPromises = Promise.all(
    ["/"].map((entry) => serwist.handleRequest({ request: new Request(entry), event }),
    ),
  );
  event.waitUntil(requestPromises);
});
