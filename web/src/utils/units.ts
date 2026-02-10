import type { User } from "../api/types";

export type SpeedUnit = "kmh" | "pace_km" | "pace_mi";
export type DistanceUnit = "km" | "mi";
export type ElevationUnit = "m" | "ft";
export type CadenceUnit = "rpm" | "ppm" | "spm";

export interface UnitPreferences {
  speedUnit: SpeedUnit;
  distanceUnit: DistanceUnit;
  elevationUnit: ElevationUnit;
  cadenceUnit: CadenceUnit;
}

export const defaultUnitPreferences: UnitPreferences = {
  speedUnit: "kmh",
  distanceUnit: "km",
  elevationUnit: "m",
  cadenceUnit: "rpm",
};

const MI_PER_KM = 0.621371192;
const FT_PER_M = 3.280839895;

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function paceClock(minutesPerUnit: number) {
  if (!Number.isFinite(minutesPerUnit) || minutesPerUnit <= 0) {
    return "n/a";
  }

  const totalSeconds = Math.round(minutesPerUnit * 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function resolveUnitPreferences(user: User | null): UnitPreferences {
  const cadenceUnit: CadenceUnit =
    user?.cadenceUnit === "spm" ? "ppm" : (user?.cadenceUnit ?? defaultUnitPreferences.cadenceUnit);

  return {
    speedUnit: user?.speedUnit ?? defaultUnitPreferences.speedUnit,
    distanceUnit: user?.distanceUnit ?? defaultUnitPreferences.distanceUnit,
    elevationUnit: user?.elevationUnit ?? defaultUnitPreferences.elevationUnit,
    cadenceUnit,
  };
}

export function distanceUnitLabel(unit: DistanceUnit) {
  return unit === "mi" ? "mi" : "km";
}

export function elevationUnitLabel(unit: ElevationUnit) {
  return unit === "ft" ? "ft" : "m";
}

export function speedUnitLabel(unit: SpeedUnit) {
  if (unit === "pace_km") {
    return "min/km";
  }

  if (unit === "pace_mi") {
    return "min/mi";
  }

  return "km/h";
}

export function cadenceUnitLabel(unit: CadenceUnit) {
  return unit === "rpm" ? "rpm" : "ppm";
}

export function convertDistanceKm(distanceKm: number, unit: DistanceUnit) {
  return round2(unit === "mi" ? distanceKm * MI_PER_KM : distanceKm);
}

export function convertElevationMeters(elevationMeters: number, unit: ElevationUnit) {
  return round2(unit === "ft" ? elevationMeters * FT_PER_M : elevationMeters);
}

export function convertSpeedKmh(speedKmh: number, unit: SpeedUnit) {
  if (unit === "pace_km") {
    if (speedKmh <= 0) {
      return 0;
    }
    return round2(60 / speedKmh);
  }

  if (unit === "pace_mi") {
    if (speedKmh <= 0) {
      return 0;
    }
    return round2(60 / (speedKmh * MI_PER_KM));
  }

  return round2(speedKmh);
}

export function convertCadenceRpm(cadenceRpm: number, unit: CadenceUnit) {
  return round2(unit === "rpm" ? cadenceRpm : cadenceRpm * 2);
}

export function formatDistanceFromKm(distanceKm: number, prefs: UnitPreferences, digits = 2) {
  const value = convertDistanceKm(distanceKm, prefs.distanceUnit);
  return `${value.toFixed(digits)} ${distanceUnitLabel(prefs.distanceUnit)}`;
}

export function formatDistanceFromMeters(distanceMeters: number, prefs: UnitPreferences, digits = 2) {
  return formatDistanceFromKm(distanceMeters / 1000, prefs, digits);
}

export function formatElevationFromMeters(elevationMeters: number, prefs: UnitPreferences, digits = 0) {
  const value = convertElevationMeters(elevationMeters, prefs.elevationUnit);
  return `${value.toFixed(digits)} ${elevationUnitLabel(prefs.elevationUnit)}`;
}

export function formatSpeedFromKmh(speedKmh: number, prefs: UnitPreferences, digits = 1) {
  const value = convertSpeedKmh(speedKmh, prefs.speedUnit);
  const label = speedUnitLabel(prefs.speedUnit);

  if (prefs.speedUnit === "pace_km" || prefs.speedUnit === "pace_mi") {
    return `${paceClock(value)} ${label}`;
  }

  return `${value.toFixed(digits)} ${label}`;
}

export function formatSpeedFromMetersPerSecond(speedMs: number, prefs: UnitPreferences, digits = 1) {
  return formatSpeedFromKmh(speedMs * 3.6, prefs, digits);
}

export function formatCadenceFromRpm(cadenceRpm: number, prefs: UnitPreferences, digits = 0) {
  const value = convertCadenceRpm(cadenceRpm, prefs.cadenceUnit);
  return `${value.toFixed(digits)} ${cadenceUnitLabel(prefs.cadenceUnit)}`;
}

export function formatSpeedAxisValue(value: number, prefs: UnitPreferences, digits = 1) {
  if (!Number.isFinite(value)) {
    return "";
  }

  if (prefs.speedUnit === "pace_km" || prefs.speedUnit === "pace_mi") {
    return paceClock(value);
  }

  return value.toFixed(digits);
}

export function convertCorrelationMetricValue(metric: string, value: number, prefs: UnitPreferences) {
  if (!Number.isFinite(value)) {
    return value;
  }

  if (metric === "distance") {
    return convertDistanceKm(value, prefs.distanceUnit);
  }

  if (metric === "elevGain" || metric === "elev") {
    return convertElevationMeters(value, prefs.elevationUnit);
  }

  if (metric === "avgSpeed" || metric === "maxSpeed") {
    return convertSpeedKmh(value, prefs.speedUnit);
  }

  if (metric === "cadence") {
    return convertCadenceRpm(value, prefs.cadenceUnit);
  }
  if (metric === "strideLength" || metric === "groundContactTime" || metric === "verticalOscillation") {
    return round2(value);
  }

  return round2(value);
}

export function metricUnit(metric: string, prefs: UnitPreferences) {
  if (metric === "distance") {
    return distanceUnitLabel(prefs.distanceUnit);
  }
  if (metric === "elevGain" || metric === "elev") {
    return elevationUnitLabel(prefs.elevationUnit);
  }
  if (metric === "avgSpeed" || metric === "maxSpeed") {
    return speedUnitLabel(prefs.speedUnit);
  }
  if (metric === "cadence") {
    return cadenceUnitLabel(prefs.cadenceUnit);
  }
  if (metric === "strideLength") {
    return "m";
  }
  if (metric === "groundContactTime") {
    return "ms";
  }
  if (metric === "verticalOscillation") {
    return "cm";
  }
  if (metric === "movingTime" || metric === "time") {
    return "min";
  }
  if (metric === "avgHR" || metric === "maxHR") {
    return "bpm";
  }
  if (metric === "avgWatts" || metric === "maxWatts") {
    return "W";
  }
  if (metric === "kilojoules") {
    return "kJ";
  }
  if (metric === "calories") {
    return "kcal";
  }
  if (metric === "charge") {
    return "score";
  }
  if (metric === "sufferScore") {
    return "pts";
  }
  return "";
}
