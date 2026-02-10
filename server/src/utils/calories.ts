export interface ActivityForCalories {
  type: string;
  sportType: string;
  movingTime: number;
  averageSpeed: number;
  averageHeartrate: number | null;
  averageWatts: number | null;
  kilojoules: number | null;
  calories: number | null;
}

export interface AthleteCaloriesProfile {
  weightKg?: number | null;
  hrMax?: number | null;
  age?: number | null;
  heightCm?: number | null;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function isFinitePositive(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value) && value > 0;
}

function runMet(speedKmh: number) {
  if (speedKmh < 8) return 8.3;
  if (speedKmh < 9.7) return 9.8;
  if (speedKmh < 11.3) return 11;
  if (speedKmh < 12.1) return 11.8;
  if (speedKmh < 12.9) return 12.3;
  if (speedKmh < 13.8) return 12.8;
  if (speedKmh < 14.5) return 14.5;
  if (speedKmh < 16.1) return 16;
  return 19;
}

function walkMet(speedKmh: number) {
  if (speedKmh < 3.2) return 2.5;
  if (speedKmh < 4.8) return 3.5;
  if (speedKmh < 5.6) return 4.3;
  if (speedKmh < 6.4) return 5;
  if (speedKmh < 7.2) return 7;
  return 8;
}

function rideMet(speedKmh: number) {
  if (speedKmh < 16) return 4;
  if (speedKmh < 19) return 6.8;
  if (speedKmh < 22.5) return 8;
  if (speedKmh < 25.7) return 10;
  if (speedKmh < 30.6) return 12;
  if (speedKmh < 35.4) return 15.8;
  return 16.8;
}

function estimateMet(activity: ActivityForCalories) {
  const combinedType = `${activity.sportType} ${activity.type}`.toLowerCase();
  const speedKmh = activity.averageSpeed > 0 ? activity.averageSpeed * 3.6 : 0;

  if (combinedType.includes("run")) {
    return runMet(speedKmh);
  }

  if (combinedType.includes("walk") || combinedType.includes("hike")) {
    return walkMet(speedKmh);
  }

  if (combinedType.includes("ride") || combinedType.includes("cycle") || combinedType.includes("bike")) {
    return rideMet(speedKmh);
  }

  if (combinedType.includes("swim")) {
    return 8.5;
  }

  if (combinedType.includes("row")) {
    return 7;
  }

  if (combinedType.includes("ski")) {
    return 7.5;
  }

  return 6;
}

export function estimateCalories(activity: ActivityForCalories, profile: AthleteCaloriesProfile = {}) {
  const existing = activity.calories;
  if (isFinitePositive(existing)) {
    return round2(existing);
  }

  if (activity.movingTime <= 0) {
    return null;
  }

  if (isFinitePositive(activity.kilojoules)) {
    // Rule of thumb in endurance sports: 1 kJ mechanical ~= 1 kcal metabolique.
    return round2(activity.kilojoules);
  }

  if (isFinitePositive(activity.averageWatts)) {
    const kcal = (activity.averageWatts * activity.movingTime) / 1000;
    return round2(kcal);
  }

  const weightKg = isFinitePositive(profile.weightKg) ? profile.weightKg : 70;
  let met = estimateMet(activity);

  const hrMax = isFinitePositive(profile.hrMax) ? profile.hrMax : null;
  if (hrMax && isFinitePositive(activity.averageHeartrate)) {
    const relativeHr = clamp(activity.averageHeartrate / hrMax, 0.5, 1.05);
    met *= clamp(relativeHr / 0.72, 0.8, 1.25);
  }

  const hours = activity.movingTime / 3600;
  const kcal = met * weightKg * hours;
  return round2(kcal);
}

export function withEstimatedCalories<T extends ActivityForCalories>(
  activity: T,
  profile: AthleteCaloriesProfile = {},
): T {
  const calories = estimateCalories(activity, profile);
  if (calories === null) {
    return activity;
  }

  return {
    ...activity,
    calories,
  };
}

export function withEstimatedCaloriesList<T extends ActivityForCalories>(
  activities: T[],
  profile: AthleteCaloriesProfile = {},
) {
  return activities.map((activity) => withEstimatedCalories(activity, profile));
}
