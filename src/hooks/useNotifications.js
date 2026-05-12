import { useEffect, useState } from "react";
import { getToken, onMessage } from "firebase/messaging";
import { messaging, VAPID_KEY } from "../lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

export function useNotifications() {
  const [permission, setPermission] = useState(Notification.permission);
  const [incomingAlert, setIncomingAlert] = useState(null);

  async function requestPermission() {
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === "granted") {
        await registerToken();
      }
      return result;
    } catch (e) {
      console.error("Notification permission error:", e);
    }
  }

  async function registerToken() {
    try {
      const token = await getToken(messaging, { vapidKey: VAPID_KEY });
      if (token) {
        // Salva token su Firestore (anonimo, nessun dato personale)
        await setDoc(doc(db, "tokens", token), {
          token,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.error("FCM token error:", e);
    }
  }

  useEffect(() => {
    if (permission !== "granted") return;
    // Notifiche quando app è in foreground
    const unsub = onMessage(messaging, (payload) => {
      const { title, body } = payload.notification || {};
      setIncomingAlert({ title, body, data: payload.data });
      setTimeout(() => setIncomingAlert(null), 8000);
    });
    return unsub;
  }, [permission]);

  return { permission, requestPermission, incomingAlert, setIncomingAlert };
}
