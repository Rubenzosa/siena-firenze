import {
  collection, addDoc, getDocs, updateDoc, doc,
  serverTimestamp, query, orderBy, where, Timestamp
} from "firebase/firestore";
import { db, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from "./firebase";

const REPORTS_COL      = "reports";
const RESOLVED_HIDE_MS = 60 * 60 * 1000; // 1 ora

// ── Fetch segnalazioni (polling ogni 30s — ottimizza letture) ──
export async function fetchReports(callback) {
  try {
    const cutoff = Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
    const q = query(
      collection(db, REPORTS_COL),
      where("createdAt", ">", cutoff),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocs(q);
    const now  = Date.now();
    const data = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(r => {
        if (!r.resolved) return true;
        if (!r.resolvedAt) return false;
        const resolvedMs = r.resolvedAt.toDate
          ? r.resolvedAt.toDate().getTime()
          : new Date(r.resolvedAt).getTime();
        return (now - resolvedMs) < RESOLVED_HIDE_MS;
      });
    callback(data);
  } catch(e) {
    console.warn("fetchReports error:", e.message);
  }
}

// ── Invia nuova segnalazione ─────────────────────────────────
export async function addReport({ emoji, label, dirProblema, corsia, km, kmLabel, note, color, lat, lng }) {
  // Salva su Firestore
  const report = {
    emoji, label, dirProblema, corsia, km, kmLabel,
    note: note || null, color,
    lat: lat || null,
    lng: lng || null,
    confirmed: 0, resolved: false, resolvedAt: null,
    soccorsi: false, createdAt: serverTimestamp(),
  };
  const docRef = await addDoc(collection(db, REPORTS_COL), report);

  // Invia a Telegram passando i dati originali (non il report con serverTimestamp)
  // per evitare problemi con oggetti non serializzabili
  sendTelegram({ emoji, label, dirProblema, corsia, kmLabel, note, soccorsi: false, lat, lng })
    .catch(e => console.warn("Telegram non raggiunto:", e.message));

  return docRef.id;
}

export async function confirmReport(id, currentCount) {
  await updateDoc(doc(db, REPORTS_COL, id), { confirmed: currentCount + 1 });
}

export async function resolveReport(id) {
  await updateDoc(doc(db, REPORTS_COL, id), {
    resolved: true,
    resolvedAt: serverTimestamp(),
  });
}

export async function reactivateReport(id) {
  await updateDoc(doc(db, REPORTS_COL, id), { resolved: false, resolvedAt: null });
}

export async function toggleSoccorsi(id, current) {
  await updateDoc(doc(db, REPORTS_COL, id), { soccorsi: !current });
}

export async function addNote(id, note) {
  await updateDoc(doc(db, REPORTS_COL, id), { note });
}

// ── Invia messaggio Telegram ─────────────────────────────────
async function sendTelegram({ emoji, label, dirProblema, corsia, kmLabel, note, soccorsi, lat, lng }) {
  if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN.includes("INSERISCI") ||
      !TELEGRAM_CHAT_ID   || TELEGRAM_CHAT_ID.includes("SOSTITUISCI")) return;

  // dirProblema è già la direzione DOVE SI TROVA il problema
  // (calcolato nell'app: se guidatore → FI e segna corsia opposta → problema verso SI)
  const dirProblemaLabel = dirProblema === "FI" ? "→ FIRENZE" : "→ SIENA";

  const text = [
    `${emoji} *${label}* — Autopalio RA3`,
    ``,
    `🚨 Problema in direzione: *${dirProblemaLabel}*`,
    `📍 Posizione: *${kmLabel}* _(±300 m)_`,
    note     ? `📝 ${note}` : null,
    soccorsi ? `🚑 Soccorsi già allertati — non richiamare il 112` : null,
    (lat && lng) ? `\n[📌 Apri su Maps](https://maps.google.com/?q=${lat},${lng})` : null,
    ``,
    `_Segnalazione via app Siena↔Firenze_`,
  ].filter(Boolean).join("\n");

  const msgRes = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: false,
      }),
    }
  );
  const msgData = await msgRes.json();
  if (!msgData.ok) {
    console.warn("Telegram sendMessage error:", msgData.description);
    return;
  }

  // Pin posizione nativo solo se abbiamo coordinate reali
  if (lat && lng) {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendLocation`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          latitude: lat,
          longitude: lng,
        }),
      }
    );
  }
}