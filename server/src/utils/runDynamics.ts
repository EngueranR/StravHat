import { isRunLikeActivityType } from "./runActivities.js";

export interface ActivityForRunDynamics {
  type: string;
  sportType: string;
  averageSpeed: number;
  averageCadence: number | null;
  strideLength?: number | null;
  groundContactTime?: number | null;
  verticalOscillation?: number | null;
}

export interface RunDynamicsValues {
  strideLength: number;
  groundContactTime: number;
  verticalOscillation: number;
}

export interface RunDynamicsBackfill extends RunDynamicsValues {
  id: string;
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

function cadenceToStepsPerMinute(cadence: number) {
  if (!Number.isFinite(cadence) || cadence <= 0) {
    return null;
  }

  // Some devices export running cadence per leg; normalize to total steps/min.
  return cadence < 130 ? cadence * 2 : cadence;
}

export function estimateRunDynamics(activity: ActivityForRunDynamics): RunDynamicsValues | null {
  if (!isRunLikeActivityType(activity)) {
    return null;
  }

  if (!Number.isFinite(activity.averageSpeed) || activity.averageSpeed <= 0) {
    return null;
  }

  if (activity.averageCadence === null) {
    return null;
  }

  const stepsPerMinute = cadenceToStepsPerMinute(activity.averageCadence);
  if (!stepsPerMinute || stepsPerMinute <= 0) {
    return null;
  }

  const speedMs = activity.averageSpeed;
  const stepTimeMs = 60_000 / stepsPerMinute;
  const strideLength = clamp((speedMs * 60) / stepsPerMinute, 0.5, 2.2);

  // Empirical approximation from running gait literature (duty factor vs speed/cadence).
  const dutyFromSpeed = clamp(0.78 - 0.06 * speedMs, 0.45, 0.72);
  const cadenceAdjustment = clamp((175 - stepsPerMinute) / 220, -0.06, 0.06);
  const dutyFactor = clamp(dutyFromSpeed + cadenceAdjustment, 0.42, 0.78);
  const groundContactTime = clamp(stepTimeMs * dutyFactor, 120, 420);

  // Approximate vertical oscillation from stride length and contact profile.
  const verticalOscillation = clamp(
    strideLength * 100 * (0.055 + (groundContactTime - 200) / 5000),
    5,
    14,
  );

  return {
    strideLength: round2(strideLength),
    groundContactTime: round2(groundContactTime),
    verticalOscillation: round2(verticalOscillation),
  };
}

export function resolveRunDynamics(activity: ActivityForRunDynamics): RunDynamicsValues | null {
  const persistedStrideLength = isFinitePositive(activity.strideLength) ? round2(activity.strideLength) : null;
  const persistedGroundContactTime = isFinitePositive(activity.groundContactTime) ? round2(activity.groundContactTime) : null;
  const persistedVerticalOscillation = isFinitePositive(activity.verticalOscillation)
    ? round2(activity.verticalOscillation)
    : null;

  if (persistedStrideLength !== null && persistedGroundContactTime !== null && persistedVerticalOscillation !== null) {
    return {
      strideLength: persistedStrideLength,
      groundContactTime: persistedGroundContactTime,
      verticalOscillation: persistedVerticalOscillation,
    };
  }

  const estimated = estimateRunDynamics(activity);
  if (!estimated) {
    return null;
  }

  return {
    strideLength: persistedStrideLength ?? estimated.strideLength,
    groundContactTime: persistedGroundContactTime ?? estimated.groundContactTime,
    verticalOscillation: persistedVerticalOscillation ?? estimated.verticalOscillation,
  };
}

export function collectRunDynamicsBackfills<T extends ActivityForRunDynamics & { id: string }>(
  activities: T[],
) {
  const updates: RunDynamicsBackfill[] = [];

  for (const activity of activities) {
    const resolved = resolveRunDynamics(activity);
    if (!resolved) {
      continue;
    }

    const needsPersist =
      !isFinitePositive(activity.strideLength) ||
      !isFinitePositive(activity.groundContactTime) ||
      !isFinitePositive(activity.verticalOscillation);

    if (!needsPersist) {
      continue;
    }

    updates.push({
      id: activity.id,
      ...resolved,
    });
  }

  return updates;
}
