const firebaseConfig = {
  apiKey:            "AIzaSyCti3ij7PQ_hcrX-xuEs3BqlPZpay8hVks",
  authDomain:        "siena-firenze.firebaseapp.com",
  projectId:         "siena-firenze",
  storageBucket:     "siena-firenze.firebasestorage.app",
  messagingSenderId: "143628745682",
  appId:             "1:143628745682:web:0e8f19ff316400ad85260b",
};

export const VAPID_KEY = "BPjlyJ1zMIhj_AWQKCMlMQ30eFIYGhgg5gIwgZy15MfZM3NiL3NVCgZCK8_a0bqjhHJn7DWisMXBcmwLbaWpToo";

export const TELEGRAM_BOT_TOKEN = "8517785774:AAFvOupSMnKho_bGR9H9g0vHiavsgDf1XVQ";

// ╔══════════════════════════════════════════════════════════╗
// ║  CHAT_ID: per inviare messaggi a TE (non a un gruppo)   ║
// ║  Apri Telegram e scrivi a @userinfobot                   ║
// ║  Ti risponde con il tuo ID personale (numero positivo)   ║
// ║  Es: 123456789                                           ║
// ╚══════════════════════════════════════════════════════════╝
export const TELEGRAM_CHAT_ID = "621308435";
// ↑ UNICA COSA DA CAMBIARE — vedi istruzioni sotto

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getMessaging } from "firebase/messaging";
import { getAuth } from "firebase/auth";

const app       = initializeApp(firebaseConfig);
export const db        = getFirestore(app);
export const auth      = getAuth(app);
export const messaging = getMessaging(app);
export default app;
