export interface User {
  id: string;
  email: string | null;
  stravaAthleteId: number | null;
  hrMax: number;
  age: number | null;
  weightKg: number | null;
  heightCm: number | null;
  goalType: "marathon" | "half_marathon" | "10k" | "5k" | "custom" | null;
  goalDistanceKm: number | null;
  goalTimeSec: number | null;
  speedUnit: "kmh" | "pace_km" | "pace_mi";
  distanceUnit: "km" | "mi";
  elevationUnit: "m" | "ft";
  cadenceUnit: "rpm" | "ppm" | "spm";
  createdAt: string;
  updatedAt: string;
  connectedToStrava?: boolean;
}

export interface Activity {
  id: string;
  userId: string;
  stravaActivityId: string;
  name: string;
  type: string;
  sportType: string;
  startDate: string;
  startDateLocal: string;
  timezone: string;
  distance: number;
  movingTime: number;
  elapsedTime: number;
  totalElevationGain: number;
  averageSpeed: number;
  maxSpeed: number;
  averageHeartrate: number | null;
  maxHeartrate: number | null;
  averageWatts: number | null;
  maxWatts: number | null;
  weightedAverageWatts: number | null;
  kilojoules: number | null;
  calories: number | null;
  averageCadence: number | null;
  strideLength: number | null;
  groundContactTime: number | null;
  verticalOscillation: number | null;
  sufferScore: number | null;
  trainer: boolean;
  commute: boolean;
  manual: boolean;
  hasHeartrate: boolean;
  importedAt: string;
  updatedAt: string;
}

export interface ActivityListResponse {
  total: number;
  limit: number;
  offset: number;
  items: Activity[];
}
