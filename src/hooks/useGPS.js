import { useState, useEffect, useRef, useCallback } from "react";

// ── RA3 Raccordo Autostradale 3 — Siena Nord → Firenze ────────
const RA3_POINTS = [
  { km:  0.0, lat: 43.3394, lng: 11.2994, loc: "Siena Nord" },
  { km:  6.0, lat: 43.3760, lng: 11.2600, loc: "Badesse" },
  { km: 10.0, lat: 43.3958, lng: 11.2191, loc: "Monteriggioni" },
  { km: 16.0, lat: 43.4280, lng: 11.1720, loc: "Colle Val d'Elsa Sud" },
  { km: 18.0, lat: 43.4420, lng: 11.1580, loc: "Colle Val d'Elsa Nord" },
  { km: 23.0, lat: 43.4660, lng: 11.1410, loc: "Poggibonsi Sud" },
  { km: 25.0, lat: 43.4820, lng: 11.1350, loc: "Poggibonsi Nord" },
  { km: 35.0, lat: 43.5380, lng: 11.1430, loc: "San Donato in Poggio" },
  { km: 40.0, lat: 43.5650, lng: 11.1460, loc: "Tavarnelle Val di Pesa" },
  { km: 45.0, lat: 43.5990, lng: 11.1540, loc: "Bargino" },
  { km: 48.0, lat: 43.6190, lng: 11.1680, loc: "San Casciano Sud" },
  { km: 51.0, lat: 43.6430, lng: 11.1830, loc: "San Casciano Nord" },
  { km: 53.0, lat: 43.6640, lng: 11.2050, loc: "Impruneta / Greve in Chianti" },
  { km: 56.4, lat: 43.6930, lng: 11.2280, loc: "Firenze (Fine RA3)" },
];

// ── SS674 Tangenziale Ovest di Siena — 8.3 km ─────────────────
const TANG_POINTS = [
  { km: 0.0, lat: 43.3394, lng: 11.2994, loc: "Innesto RA3 / Siena Nord" },
  { km: 0.3, lat: 43.3368, lng: 11.2978, loc: "Siena Nord" },
  { km: 2.5, lat: 43.3190, lng: 11.2800, loc: "Acqua Calda" },
  { km: 6.5, lat: 43.2985, lng: 11.2440, loc: "Siena Ovest" },
  { km: 7.7, lat: 43.2890, lng: 11.2490, loc: "Siena Sud" },
  { km: 8.3, lat: 43.2838, lng: 11.2518, loc: "Fine SS674 / SS223" },
];

function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getLocInfo(kmVal, pts) {
  if (kmVal <= pts[0].km + 0.4) return `svincolo ${pts[0].loc}`;
  if (kmVal >= pts[pts.length - 1].km - 0.4) return pts[pts.length - 1].loc;

  let segIdx = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    if (kmVal >= pts[i].km && kmVal <= pts[i + 1].km) { segIdx = i; break; }
  }
  const s = pts[segIdx];
  const e = pts[segIdx + 1];
  const frac = (kmVal - s.km) / (e.km - s.km);

  if (frac > 0.65) return `prima dell'uscita ${e.loc}`;
  return `dopo l'uscita ${s.loc}`;
}

function interpolateKm(lat, lng, pts, closestIdx) {
  let km = pts[closestIdx].km;
  if (closestIdx > 0 && closestIdx < pts.length - 1) {
    const prev = pts[closestIdx - 1];
    const next = pts[closestIdx + 1];
    const curr = pts[closestIdx];
    const dPrev = distanceKm(lat, lng, prev.lat, prev.lng);
    const dNext = distanceKm(lat, lng, next.lat, next.lng);
    const dCurr = distanceKm(lat, lng, curr.lat, curr.lng);
    if (dPrev < dNext) {
      km = curr.km - (dCurr / (dCurr + dPrev)) * (curr.km - prev.km);
    } else {
      km = curr.km + (dCurr / (dCurr + dNext)) * (next.km - curr.km);
    }
  }
  return Math.round(km * 10) / 10;
}

function buildPosition(lat, lng, pts, closestIdx, minDist, road) {
  const kmRounded = interpolateKm(lat, lng, pts, closestIdx);
  const kmInt     = Math.floor(kmRounded);
  const kmDec     = Math.round((kmRounded - kmInt) * 1000);
  const prefix    = road === "SS674" ? "SS674 Km" : "Km";

  return {
    km:      kmRounded,
    kmLabel: `${prefix} ${kmInt}+${String(kmDec).padStart(3, "0")}`,
    kmShort: `Km ${kmInt}`,
    loc:     pts[closestIdx].loc,
    locInfo: getLocInfo(kmRounded, pts),
    road,
    lat,
    lng,
    onRoute: minDist < 2.0,
  };
}

function gpsToKmRoute(lat, lng) {
  // Trova punto più vicino su RA3
  let minRA3 = Infinity, idxRA3 = 0;
  RA3_POINTS.forEach((p, i) => {
    const d = distanceKm(lat, lng, p.lat, p.lng);
    if (d < minRA3) { minRA3 = d; idxRA3 = i; }
  });

  // Trova punto più vicino su SS674 Tangenziale
  let minTANG = Infinity, idxTANG = 0;
  TANG_POINTS.forEach((p, i) => {
    const d = distanceKm(lat, lng, p.lat, p.lng);
    if (d < minTANG) { minTANG = d; idxTANG = i; }
  });

  // Usa la strada più vicina (con piccolo vantaggio a RA3 in caso di parità
  // vicino a Siena Nord dove le due strade si sovrappongono)
  if (minTANG < minRA3 - 0.1 && minTANG < 2.0) {
    return buildPosition(lat, lng, TANG_POINTS, idxTANG, minTANG, "SS674");
  }
  return buildPosition(lat, lng, RA3_POINTS, idxRA3, minRA3, "RA3");
}

export function useGPS() {
  const [position, setPosition] = useState(null);
  const [error, setError]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const positionRef             = useRef(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError("GPS non disponibile su questo dispositivo");
      setLoading(false);
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const result = gpsToKmRoute(pos.coords.latitude, pos.coords.longitude);
        positionRef.current = result;
        setPosition(result);
        setLoading(false);
        setError(null);
      },
      (err) => {
        let msg = "Posizione non disponibile";
        if (err.code === 1) msg = "Permesso GPS negato. Attivalo nelle impostazioni.";
        if (err.code === 3) msg = "GPS: timeout. Verifica la connessione.";
        setError(msg);
        setLoading(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const snapshotNow = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (positionRef.current) { resolve(positionRef.current); return; }
      if (!navigator.geolocation) { reject(new Error("GPS non disponibile")); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const result = gpsToKmRoute(pos.coords.latitude, pos.coords.longitude);
          positionRef.current = result;
          setPosition(result);
          resolve(result);
        },
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    });
  }, []);

  return { position, error, loading, snapshotNow };
}
