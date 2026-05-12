import { useState, useEffect } from "react";

// Punti km progressivi SS2 Cassia (Siena-Firenze)
// Coordinate reali dei km principali
const SS2_KM_POINTS = [
  { km: 0,  lat: 43.3188, lng: 11.3307 }, // Siena
  { km: 5,  lat: 43.3580, lng: 11.3050 },
  { km: 10, lat: 43.3970, lng: 11.2750 },
  { km: 15, lat: 43.4350, lng: 11.2500 },
  { km: 20, lat: 43.4720, lng: 11.2200 },
  { km: 25, lat: 43.5100, lng: 11.1950 },
  { km: 30, lat: 43.5480, lng: 11.1700 },
  { km: 35, lat: 43.5850, lng: 11.1450 },
  { km: 40, lat: 43.6220, lng: 11.1200 },
  { km: 45, lat: 43.6600, lng: 11.0950 },
  { km: 50, lat: 43.6980, lng: 11.0700 },
  { km: 55, lat: 43.7350, lng: 11.0500 },
  { km: 60, lat: 43.7720, lng: 11.0300 }, // Firenze Sud
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

// Calcola km progressivo SS2 dalla posizione GPS
function gpsToKmSS2(lat, lng) {
  let minDist = Infinity;
  let closestKm = null;
  let closestIdx = 0;

  SS2_KM_POINTS.forEach((p, i) => {
    const d = distanceKm(lat, lng, p.lat, p.lng);
    if (d < minDist) { minDist = d; closestKm = p.km; closestIdx = i; }
  });

  // Interpolazione tra i due punti più vicini
  if (closestIdx > 0 && closestIdx < SS2_KM_POINTS.length - 1) {
    const prev = SS2_KM_POINTS[closestIdx - 1];
    const next = SS2_KM_POINTS[closestIdx + 1];
    const curr = SS2_KM_POINTS[closestIdx];
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

  return {
    km: Math.round(closestKm * 10) / 10,
    kmLabel: `Km ${Math.floor(closestKm)}+${String(Math.round((closestKm % 1) * 1000)).padStart(3,"0")}`,
    lat, lng,
    onRoute: minDist < 1.5, // entro 1.5km dalla SS2
  };
}

export function useGPS() {
  const [position, setPosition] = useState(null); // { km, kmLabel, lat, lng, onRoute }
  const [error, setError]       = useState(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError("GPS non disponibile");
      setLoading(false);
      return;
    }

    const watcher = navigator.geolocation.watchPosition(
      (pos) => {
        const result = gpsToKmSS2(pos.coords.latitude, pos.coords.longitude);
        setPosition(result);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError("Posizione non disponibile");
        setLoading(false);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(watcher);
  }, []);

  return { position, error, loading };
}
