export function formatDistanceKm(distanceMeters: number) {
  return `${(distanceMeters / 1000).toFixed(2)} km`;
}

export function formatHours(seconds: number) {
  return `${(seconds / 3600).toFixed(2)} h`;
}

export function formatMinutes(seconds: number) {
  return `${(seconds / 60).toFixed(1)} min`;
}

export function formatSpeedKmh(speedMs: number) {
  return `${(speedMs * 3.6).toFixed(1)} km/h`;
}

export function formatDate(isoDate: string) {
  return new Date(isoDate).toLocaleDateString();
}

export function number(value: number, digits = 1) {
  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: digits,
  }).format(value);
}
