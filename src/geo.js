const EARTH_RADIUS_M = 6_371_008.8;
const DEG = Math.PI / 180;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function normalizeAngle(angle) {
  let result = angle % (Math.PI * 2);
  if (result < 0) result += Math.PI * 2;
  return result;
}

export function distanceMeters(a, b) {
  const lat1 = a.lat * DEG;
  const lat2 = b.lat * DEG;
  const dLat = (b.lat - a.lat) * DEG;
  const dLng = (b.lng - a.lng) * DEG;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingRadians(a, b) {
  const lat1 = a.lat * DEG;
  const lat2 = b.lat * DEG;
  const dLng = (b.lng - a.lng) * DEG;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return Math.atan2(y, x);
}

export function offsetMeters(origin, eastMeters, northMeters) {
  const latRadians = origin.lat * DEG;
  const dLat = northMeters / EARTH_RADIUS_M;
  const dLng = eastMeters / (EARTH_RADIUS_M * Math.max(0.000001, Math.cos(latRadians)));
  return {
    lat: origin.lat + dLat / DEG,
    lng: origin.lng + dLng / DEG
  };
}

export function destinationPoint(origin, bearingRad, distanceM) {
  const angular = distanceM / EARTH_RADIUS_M;
  const lat1 = origin.lat * DEG;
  const lng1 = origin.lng * DEG;
  const sinLat1 = Math.sin(lat1);
  const cosLat1 = Math.cos(lat1);
  const sinAngular = Math.sin(angular);
  const cosAngular = Math.cos(angular);

  const lat2 = Math.asin(
    sinLat1 * cosAngular + cosLat1 * sinAngular * Math.cos(bearingRad)
  );
  const lng2 = lng1 + Math.atan2(
    Math.sin(bearingRad) * sinAngular * cosLat1,
    cosAngular - sinLat1 * Math.sin(lat2)
  );

  return { lat: lat2 / DEG, lng: lng2 / DEG };
}

export function moveToward(current, target, maxDistanceM) {
  const distance = distanceMeters(current, target);
  if (distance <= maxDistanceM || distance === 0) {
    return { position: { ...target }, reached: true, travelled: distance };
  }
  const bearing = bearingRadians(current, target);
  return {
    position: destinationPoint(current, bearing, maxDistanceM),
    reached: false,
    travelled: maxDistanceM
  };
}

export function localMeters(origin, point) {
  const latScale = 111_320;
  const lngScale = 111_320 * Math.cos(origin.lat * DEG);
  return {
    x: (point.lng - origin.lng) * lngScale,
    y: (point.lat - origin.lat) * latScale
  };
}

export function latLngFromLocalMeters(origin, x, y) {
  const latScale = 111_320;
  const lngScale = 111_320 * Math.cos(origin.lat * DEG);
  return {
    lat: origin.lat + y / latScale,
    lng: origin.lng + x / Math.max(0.000001, lngScale)
  };
}

export function formatDistance(distanceM) {
  if (!Number.isFinite(distanceM)) return "—";
  if (distanceM < 1000) return `${Math.max(0, Math.round(distanceM))} m`;
  return `${(distanceM / 1000).toFixed(distanceM < 10_000 ? 1 : 0)} km`;
}

export function formatClock(totalMinutes) {
  const minuteOfDay = ((Math.floor(totalMinutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function gameDay(totalMinutes) {
  return Math.floor(totalMinutes / 1440) + 1;
}

export function isNight(totalMinutes) {
  const minute = ((totalMinutes % 1440) + 1440) % 1440;
  return minute >= 20 * 60 || minute < 6 * 60;
}

export function crossedMinute(previous, current, minuteOfDay) {
  if (current <= previous) return false;
  const firstDay = Math.floor(previous / 1440);
  const lastDay = Math.floor(current / 1440);
  for (let day = firstDay; day <= lastDay; day += 1) {
    const target = day * 1440 + minuteOfDay;
    if (previous < target && current >= target) return true;
  }
  return false;
}

export function closestEntity(origin, entities, predicate = (_entity) => true) {
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const entity of entities) {
    if (!predicate(entity)) continue;
    const distance = distanceMeters(origin, entity.pos);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entity;
    }
  }
  return best ? { entity: best, distance: bestDistance } : null;
}

export function roundedCoordinate(point, digits = 5) {
  return {
    lat: Number(point.lat.toFixed(digits)),
    lng: Number(point.lng.toFixed(digits))
  };
}
