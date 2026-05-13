import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<React.StrictMode><App /></React.StrictMode>);

// Registra Service Worker per notifiche push in background
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/firebase-messaging-sw.js")
      .catch(err => console.error("SW registration failed:", err));
  });
}
