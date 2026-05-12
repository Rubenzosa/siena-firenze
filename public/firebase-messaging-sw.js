// Service Worker per Firebase Cloud Messaging
// Gestisce notifiche push quando l'app è in background

importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js");

// ╔══════════════════════════════════════════════════════════╗
// ║  Copia qui lo stesso firebaseConfig che hai messo        ║
// ║  in src/lib/firebase.js                                  ║
// ╚══════════════════════════════════════════════════════════╝
firebase.initializeApp({
  apiKey:            "INSERISCI_QUI",
  authDomain:        "INSERISCI_QUI",
  projectId:         "INSERISCI_QUI",
  storageBucket:     "INSERISCI_QUI",
  messagingSenderId: "INSERISCI_QUI",
  appId:             "INSERISCI_QUI",
});

const messaging = firebase.messaging();

// Notifica in background
messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification;
  self.registration.showNotification(title, {
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    vibrate: [200, 100, 200],
    data: payload.data,
  });
});

// Click sulla notifica → apre l'app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow("/"));
});
