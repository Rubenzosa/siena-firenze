// Service Worker per Firebase Cloud Messaging
// Gestisce notifiche push quando l'app è in background

importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey:            "AIzaSyCti3ij7PQ_hcrX-xuEs3BqlPZpay8hVks",
  authDomain:        "siena-firenze.firebaseapp.com",
  projectId:         "siena-firenze",
  storageBucket:     "siena-firenze.firebasestorage.app",
  messagingSenderId: "143628745682",
  appId:             "1:143628745682:web:0e8f19ff316400ad85260b",
});

const messaging = firebase.messaging();

// Notifica in background
messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || "Siena-Firenze", {
    body: body || "Nuovo imprevisto segnalato",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    vibrate: [200, 100, 200],
    data: payload.data,
    requireInteraction: false,
  });
});

// Click sulla notifica → apre l'app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow("/"));
});
