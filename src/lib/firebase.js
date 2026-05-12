// ╔══════════════════════════════════════════════════════════╗
// ║  STEP 1: Incolla qui il tuo firebaseConfig               ║
// ║  Lo trovi su: Firebase Console → Impostazioni progetto   ║
// ╚══════════════════════════════════════════════════════════╝
const firebaseConfig = {
  apiKey:            "AIzaSyCti3ij7PQ_hcrX-xuEs3BqlPZpay8hVks",
  authDomain:        "siena-firenze.firebaseapp.com",
  projectId:         "siena-firenze",
  storageBucket:     "siena-firenze.firebasestorage.app",
  messagingSenderId: "143628745682",
  appId:             "1:143628745682:web:0e8f19ff316400ad85260b",
};

// ╔══════════════════════════════════════════════════════════╗
// ║  STEP 2: Incolla qui il VAPID key (per notifiche push)   ║
// ║  Firebase Console → Impostazioni progetto →              ║
// ║  Cloud Messaging → Web Push certificates → Genera coppia ║
// ╚══════════════════════════════════════════════════════════╝
export const VAPID_KEY = "BPjlyJ1zMIhj_AWQKCMlMQ30eFIYGhgg5gIwgZy15MfZM3NiL3NVCgZCK8_a0bqjhHJn7DWisMXBcmwLbaWpToo";

// ╔══════════════════════════════════════════════════════════╗
// ║  STEP 3: Token del bot Telegram                          ║
// ║  Crealo su Telegram cercando @BotFather                  ║
// ║  Comando: /newbot  →  copia il token                     ║
// ╚══════════════════════════════════════════════════════════╝
export const TELEGRAM_BOT_TOKEN = "8517785774:AAFvOupSMnKho_bGR9H9g0vHiavsgDf1XVQ";

// ╔══════════════════════════════════════════════════════════╗
// ║  STEP 4: ID del gruppo Telegram                          ║
// ║  Aggiungi @userinfobot al gruppo →  ti dice il chat_id  ║
// ║  Di solito è un numero negativo tipo -1001234567890      ║
// ╚══════════════════════════════════════════════════════════╝
export const TELEGRAM_CHAT_ID = "8517785774";

// ─────────────────────────────────────────────────────────────
// NON MODIFICARE SOTTO QUESTA LINEA
// ─────────────────────────────────────────────────────────────
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getMessaging } from "firebase/messaging";
import { getAuth } from "firebase/auth";

const app       = initializeApp(firebaseConfig);
export const db        = getFirestore(app);
export const auth      = getAuth(app);
export const messaging = getMessaging(app);
export default app;
