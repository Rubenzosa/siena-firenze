import {
  collection, addDoc, onSnapshot, updateDoc, doc,
  serverTimestamp, query, orderBy, where, Timestamp
} from "firebase/firestore";
import { db, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from "./firebase";

const REPORTS_COL = "reports";

// ── Ascolta segnalazioni in tempo reale ──────────────────────
export function subscribeReports(callback) {
  const cutoff = Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const q = query(
    collection(db, REPORTS_COL),
    where("createdAt", ">", cutoff),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(q, snap => {
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(data);
  });
}

// ── Invia nuova segnalazione ─────────────────────────────────
export async function addReport({ emoji, label, dirProblema, corsia, km, kmLabel, note, color }) {
  const report = {
    emoji, label, dirProblema, corsia, km, kmLabel, note: note || null,
    color, confirmed: 0, resolved: false, resolvedAt: null,
    soccorsi: false, createdAt: serverTimestamp(),
  };
  const docRef = await addDoc(collection(db, REPORTS_COL), report);

  // Notifica Telegram
  await sendTelegram({ ...report, id: docRef.id });

  return docRef.id;
}

// ── Conferma segnalazione ────────────────────────────────────
export async function confirmReport(id, currentCount) {
  await updateDoc(doc(db, REPORTS_COL, id), { confirmed: currentCount + 1 });
}

// ── Risolvi segnalazione ─────────────────────────────────────
export async function resolveReport(id) {
  await updateDoc(doc(db, REPORTS_COL, id), {
    resolved: true,
    resolvedAt: serverTimestamp(),
  });
}

// ── Riattiva segnalazione ────────────────────────────────────
export async function reactivateReport(id) {
  await updateDoc(doc(db, REPORTS_COL, id), {
    resolved: false,
    resolvedAt: null,
  });
}

// ── Aggiorna flag soccorsi ───────────────────────────────────
export async function toggleSoccorsi(id, current) {
  await updateDoc(doc(db, REPORTS_COL, id), { soccorsi: !current });
}

// ── Aggiungi nota ────────────────────────────────────────────
export async function addNote(id, note) {
  await updateDoc(doc(db, REPORTS_COL, id), { note });
}

// ── Invia messaggio Telegram ─────────────────────────────────
async function sendTelegram({ emoji, label, dirProblema, corsia, km, kmLabel, note, soccorsi }) {
  if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN === "INSERISCI_QUI") return;

  const dir     = dirProblema === "FI" ? "→ Firenze" : "→ Siena";
  const corsiaT = corsia === "propria" ? "Corsia principale" : "Corsia opposta";
  const lat     = 43.3 + (km / 100);   // approssimazione per demo; in prod usa coords reali
  const lng     = 11.1 + (km / 200);

  const text = [
    `${emoji} *${label}* segnalato`,
    `🧭 Direzione: *${dir}*`,
    `📍 Posizione: *${kmLabel}* SS2 Cassia`,
    `🛣 ${corsiaT}`,
    note ? `📝 ${note}` : null,
    soccorsi ? `🚑 Soccorsi già allertati — non chiamare il 112` : null,
    ``,
    `[📌 Apri su Maps](https://maps.google.com/?q=${lat},${lng})`,
    ``,
    `_Segnalazione via app Siena-Firenze_`,
  ].filter(Boolean).join("\n");

  // Messaggio testo
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: false,
    }),
  });

  // Pin posizione nativo Telegram
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendLocation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, latitude: lat, longitude: lng }),
  });
}
