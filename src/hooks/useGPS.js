import { useState, useEffect, useRef, useCallback } from "react";

// ── Svincoli RA3 Autopalio Siena-Firenze ──────────────────────
// Km progressivi ufficiali: Km 0 = Siena Nord, Km 56 = Firenze Impruneta
// Coordinate GPS verificate su Google Maps per ogni svincolo
const RA3_POINTS = [
  { km:  0.0, lat: 43.3394, lng: 11.2994, loc: "Siena Nord" },
  { km:  6.0, lat: 43.3760, lng: 11.2600, loc: "Badesse" },
  { km: 10.0, lat: 43.3958, lng: 11.2191, loc: "Monteriggioni" },
  { km: 16.0, lat: 43.4280, lng: 11.1720, loc: "Colle Val d'Elsa Sud" },
  { km: 18.0, lat: 43.4420, lng: 11.1580, loc: "Colle Val d'Elsa Nord" },
  { km: 23.0, lat: 43.4660, lng: 11.1410, loc: "Poggibonsi" },
  { km: 25.0, lat: 43.4820, lng: 11.1350, loc: "Poggibonsi Nord" },
  { km: 35.0, lat: 43.5380, lng: 11.1430, loc: "San Donato in Poggio" },
  { km: 40.0, lat: 43.5650, lng: 11.1460, loc: "Tavarnelle Val di Pesa" },
  { km: 45.0, lat: 43.5990, lng: 11.1540, loc: "Bargino" },
  { km: 48.0, lat: 43.6190, lng: 11.1680, loc: "San Casciano Sud" },
  { km: 51.0, lat: 43.6430, lng: 11.1830, loc: "San Casciano Nord" },
  { km: 53.0, lat: 43.6640, lng: 11.2050, loc: "Impruneta / Greve in Chianti" },
  { km: 56.4, lat: 43.6930, lng: 11.2280, loc: "Firenze (Fine RA3)" },
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

function gpsToKmRA3(lat, lng) {
  let minDist = Infinity;
  let closestIdx = 0;

  RA3_POINTS.forEach((p, i) => {
    const d = distanceKm(lat, lng, p.lat, p.lng);
    if (d < minDist) { minDist = d; closestIdx = i; }
  });

  // Interpolazione lineare tra punti adiacenti
  let closestKm = RA3_POINTS[closestIdx].km;
  if (closestIdx > 0 && closestIdx < RA3_POINTS.length - 1) {
    const prev = RA3_POINTS[closestIdx - 1];
    const next = RA3_POINTS[closestIdx + 1];
    const curr = RA3_POINTS[closestIdx];
    const dPrev = distanceKm(lat, lng, prev.lat, prev.lng);
    const dNext = distanceKm(lat, lng, next.lat, next.lng);
    const dCurr = distanceKm(lat, lng, curr.lat, curr.lng);
    if (dPrev < dNext) {
      const frac = dCurr / (dCurr + dPrev);
      closestKm = curr.km - frac * (curr.km - prev.km);
    } else {
      const frac = dCurr / (dCurr + dNext);
      closestKm = curr.km + frac * (next.km - curr.km);
    }
  }

  const kmRounded = Math.round(closestKm * 10) / 10;
  const kmInt     = Math.floor(kmRounded);
  const kmDec     = Math.round((kmRounded - kmInt) * 1000);
  const loc       = RA3_POINTS[closestIdx].loc;

  return {
    km: kmRounded,
    kmLabel: `Km ${kmInt}+${String(kmDec).padStart(3, "0")}`,
    kmShort: `Km ${kmInt}`,
    loc,
    lat,
    lng,
    onRoute: minDist < 2.0,
  };
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
        const result = gpsToKmRA3(pos.coords.latitude, pos.coords.longitude);
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

  // Snapshot istantaneo al tap "SEGNALA ORA"
  const snapshotNow = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (positionRef.current) {
        resolve(positionRef.current);
        return;
      }
      if (!navigator.geolocation) {
        reject(new Error("GPS non disponibile"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const result = gpsToKmRA3(pos.coords.latitude, pos.coords.longitude);
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