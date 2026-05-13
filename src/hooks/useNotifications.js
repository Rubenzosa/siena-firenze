import { useEffect, useState, useRef } from "react";
import { getToken, onMessage } from "firebase/messaging";
import { messaging, VAPID_KEY } from "../lib/firebase";
import { doc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

export function useNotifications() {
  const [permission, setPermission] = useState(Notification.permission);
  const [incomingAlert, setIncomingAlert] = useState(null);
  const [notifEnabled, setNotifEnabled] = useState(() => {
    try { return localStorage.getItem("notifDisabled") !== "true"; }
    catch { return true; }
  });
  const tokenRef = useRef(null);

  async function registerToken() {
    try {
      const token = await getToken(messaging, { vapidKey: VAPID_KEY });
      if (token) {
        tokenRef.current = token;
        await setDoc(doc(db, "tokens", token), {
          token,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.error("FCM token error:", e);
    }
  }

  async function requestPermission() {
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === "granted") {
        await registerToken();
        try { localStorage.removeItem("notifDisabled"); } catch {}
        setNotifEnabled(true);
      }
      return result;
    } catch (e) {
      console.error("Notification permission error:", e);
    }
  }

  async function disableNotifications() {
    if (tokenRef.current) {
      try { await deleteDoc(doc(db, "tokens", tokenRef.current)); }
      catch(e) { console.warn("deleteToken error:", e.message); }
      tokenRef.current = null;
    }
    try { localStorage.setItem("notifDisabled", "true"); } catch {}
    setNotifEnabled(false);
  }

  useEffect(() => {
    if (permission !== "granted") return;
    const unsub = onMessage(messaging, (payload) => {
      const { title, body } = payload.notification || {};
      setIncomingAlert({ title, body, data: payload.data });
      setTimeout(() => setIncomingAlert(null), 8000);
    });
    return unsub;
  }, [permission]);

  return { permission, notifEnabled, requestPermission, disableNotifications, incomingAlert, setIncomingAlert };
}
