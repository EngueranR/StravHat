export interface ActivityFilterState {
  from?: string;
  to?: string;
  type?: string;
  q?: string;
  hasHR?: boolean;
  hasPower?: boolean;
  minDistanceKm?: string;
  maxDistanceKm?: string;
  minTimeMin?: string;
  maxTimeMin?: string;
  minElev?: string;
  maxElev?: string;
  minAvgHR?: string;
  maxAvgHR?: string;
  minAvgSpeedKmh?: string;
  maxAvgSpeedKmh?: string;
  minAvgWatts?: string;
  maxAvgWatts?: string;
  minCadence?: string;
  maxCadence?: string;
  minCalories?: string;
  maxCalories?: string;
  minKilojoules?: string;
  maxKilojoules?: string;
}

const fields: Array<keyof ActivityFilterState> = [
  "from",
  "to",
  "type",
  "q",
  "hasHR",
  "hasPower",
  "minDistanceKm",
  "maxDistanceKm",
  "minTimeMin",
  "maxTimeMin",
  "minElev",
  "maxElev",
  "minAvgHR",
  "maxAvgHR",
  "minAvgSpeedKmh",
  "maxAvgSpeedKmh",
  "minAvgWatts",
  "maxAvgWatts",
  "minCadence",
  "maxCadence",
  "minCalories",
  "maxCalories",
  "minKilojoules",
  "maxKilojoules",
];

export function buildActivityFilterQuery(filters: ActivityFilterState) {
  const params = new URLSearchParams();

  for (const key of fields) {
    const value = filters[key];
    if (value === undefined || value === "") {
      continue;
    }

    if (typeof value === "boolean") {
      if (value) {
        params.set(key, "true");
      }
      continue;
    }

    params.set(key, value);
  }

  return params.toString();
}
