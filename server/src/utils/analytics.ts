import { type Activity } from "@prisma/client";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { resolveRunDynamics } from "./runDynamics.js";

export type TimeSeriesMetric =
  | "distance"
  | "time"
  | "elev"
  | "count"
  | "avgHR"
  | "maxHR"
  | "avgSpeed"
  | "maxSpeed"
  | "avgWatts"
  | "maxWatts"
  | "cadence"
  | "strideLength"
  | "groundContactTime"
  | "verticalOscillation"
  | "kilojoules"
  | "calories"
  | "sufferScore";
export type TimeBucket = "day" | "week" | "month";

export type DistributionMetric =
  | "distance"
  | "time"
  | "elev"
  | "avgHR"
  | "maxHR"
  | "avgSpeed"
  | "maxSpeed"
  | "avgWatts"
  | "maxWatts"
  | "cadence"
  | "strideLength"
  | "groundContactTime"
  | "verticalOscillation"
  | "kilojoules"
  | "calories"
  | "sufferScore";

export type PivotRow = "month" | "week" | "type";

export type PivotMetric =
  | "distance"
  | "time"
  | "elev"
  | "count"
  | "avgHR"
  | "avgSpeed"
  | "avgWatts"
  | "cadence"
  | "strideLength"
  | "groundContactTime"
  | "verticalOscillation"
  | "kilojoules"
  | "calories"
  | "sufferScore";

export type CorrelationMethod = "pearson" | "spearman";

export const SUPPORTED_CORRELATION_VARS = [
  "distance",
  "movingTime",
  "elevGain",
  "avgSpeed",
  "maxSpeed",
  "avgHR",
  "maxHR",
  "avgWatts",
  "maxWatts",
  "cadence",
  "strideLength",
  "groundContactTime",
  "verticalOscillation",
  "sufferScore",
  "kilojoules",
  "calories",
  "charge",
] as const;

export type CorrelationVar = (typeof SUPPORTED_CORRELATION_VARS)[number];

type Aggregation = "sum" | "avg" | "max";

type MetricConfig = {
  select: (activity: Activity) => number | null;
  aggregation: Aggregation;
};

const runDynamicsCache = new WeakMap<
  Activity,
  ReturnType<typeof resolveRunDynamics>
>();

function getRunDynamics(activity: Activity) {
  if (runDynamicsCache.has(activity)) {
    return runDynamicsCache.get(activity) ?? null;
  }

  const resolved = resolveRunDynamics(activity);
  runDynamicsCache.set(activity, resolved);
  return resolved;
}

const timeSeriesSelectors: Record<TimeSeriesMetric, MetricConfig> = {
  distance: { select: (activity) => activity.distance / 1000, aggregation: "sum" },
  time: { select: (activity) => activity.movingTime / 3600, aggregation: "sum" },
  elev: { select: (activity) => activity.totalElevationGain, aggregation: "sum" },
  count: { select: () => 1, aggregation: "sum" },
  avgHR: { select: (activity) => activity.averageHeartrate, aggregation: "avg" },
  maxHR: { select: (activity) => activity.maxHeartrate, aggregation: "max" },
  avgSpeed: { select: (activity) => activity.averageSpeed * 3.6, aggregation: "avg" },
  maxSpeed: { select: (activity) => activity.maxSpeed * 3.6, aggregation: "max" },
  avgWatts: { select: (activity) => activity.averageWatts, aggregation: "avg" },
  maxWatts: { select: (activity) => activity.maxWatts, aggregation: "max" },
  cadence: { select: (activity) => activity.averageCadence, aggregation: "avg" },
  strideLength: {
    select: (activity) => getRunDynamics(activity)?.strideLength ?? null,
    aggregation: "avg",
  },
  groundContactTime: {
    select: (activity) => getRunDynamics(activity)?.groundContactTime ?? null,
    aggregation: "avg",
  },
  verticalOscillation: {
    select: (activity) => getRunDynamics(activity)?.verticalOscillation ?? null,
    aggregation: "avg",
  },
  kilojoules: { select: (activity) => activity.kilojoules, aggregation: "sum" },
  calories: { select: (activity) => activity.calories, aggregation: "sum" },
  sufferScore: { select: (activity) => activity.sufferScore, aggregation: "avg" },
};

const distributionSelectors: Record<DistributionMetric, (activity: Activity) => number | null> = {
  distance: (activity) => activity.distance / 1000,
  time: (activity) => activity.movingTime / 60,
  elev: (activity) => activity.totalElevationGain,
  avgHR: (activity) => activity.averageHeartrate,
  maxHR: (activity) => activity.maxHeartrate,
  avgSpeed: (activity) => activity.averageSpeed * 3.6,
  maxSpeed: (activity) => activity.maxSpeed * 3.6,
  avgWatts: (activity) => activity.averageWatts,
  maxWatts: (activity) => activity.maxWatts,
  cadence: (activity) => activity.averageCadence,
  strideLength: (activity) => getRunDynamics(activity)?.strideLength ?? null,
  groundContactTime: (activity) => getRunDynamics(activity)?.groundContactTime ?? null,
  verticalOscillation: (activity) => getRunDynamics(activity)?.verticalOscillation ?? null,
  kilojoules: (activity) => activity.kilojoules,
  calories: (activity) => activity.calories,
  sufferScore: (activity) => activity.sufferScore,
};

const pivotMetricSelectors: Record<PivotMetric, MetricConfig> = {
  distance: { select: (activity) => activity.distance / 1000, aggregation: "sum" },
  time: { select: (activity) => activity.movingTime / 3600, aggregation: "sum" },
  elev: { select: (activity) => activity.totalElevationGain, aggregation: "sum" },
  count: { select: () => 1, aggregation: "sum" },
  avgHR: { select: (activity) => activity.averageHeartrate, aggregation: "avg" },
  avgSpeed: { select: (activity) => activity.averageSpeed * 3.6, aggregation: "avg" },
  avgWatts: { select: (activity) => activity.averageWatts, aggregation: "avg" },
  cadence: { select: (activity) => activity.averageCadence, aggregation: "avg" },
  strideLength: {
    select: (activity) => getRunDynamics(activity)?.strideLength ?? null,
    aggregation: "avg",
  },
  groundContactTime: {
    select: (activity) => getRunDynamics(activity)?.groundContactTime ?? null,
    aggregation: "avg",
  },
  verticalOscillation: {
    select: (activity) => getRunDynamics(activity)?.verticalOscillation ?? null,
    aggregation: "avg",
  },
  kilojoules: { select: (activity) => activity.kilojoules, aggregation: "sum" },
  calories: { select: (activity) => activity.calories, aggregation: "sum" },
  sufferScore: { select: (activity) => activity.sufferScore, aggregation: "avg" },
};

function bucketLabel(date: Date, bucket: TimeBucket): string {
  if (bucket === "day") {
    return format(date, "yyyy-MM-dd");
  }

  if (bucket === "week") {
    return format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
  }

  return format(date, "yyyy-MM");
}

function avg(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function summarize(activities: Activity[]) {
  const count = activities.length;
  const totalDistanceKm = activities.reduce((sum, activity) => sum + activity.distance, 0) / 1000;
  const totalMovingTimeHours = activities.reduce((sum, activity) => sum + activity.movingTime, 0) / 3600;
  const totalElevationGain = activities.reduce((sum, activity) => sum + activity.totalElevationGain, 0);
  const totalKilojoules = activities.reduce((sum, activity) => sum + (activity.kilojoules ?? 0), 0);
  const totalCalories = activities.reduce((sum, activity) => sum + (activity.calories ?? 0), 0);

  const hrValues = activities
    .map((activity) => activity.averageHeartrate)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const speedValues = activities
    .map((activity) => activity.averageSpeed * 3.6)
    .filter((value) => Number.isFinite(value));
  const wattsValues = activities
    .map((activity) => activity.averageWatts)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const cadenceValues = activities
    .map((activity) => activity.averageCadence)
    .filter((value): value is number => value !== null && Number.isFinite(value));

  return {
    count,
    totalDistanceKm,
    totalMovingTimeHours,
    totalElevationGain,
    totalKilojoules,
    totalCalories,
    avgDistanceKm: count === 0 ? 0 : totalDistanceKm / count,
    avgElevationPerKm: totalDistanceKm === 0 ? 0 : totalElevationGain / totalDistanceKm,
    avgHeartrate: avg(hrValues),
    avgSpeedKmh: avg(speedValues),
    avgWatts: avg(wattsValues),
    avgCadence: avg(cadenceValues),
    hrSamples: hrValues.length,
    wattsSamples: wattsValues.length,
    cadenceSamples: cadenceValues.length,
  };
}

export function buildTimeseries(activities: Activity[], metric: TimeSeriesMetric, bucket: TimeBucket) {
  const selector = timeSeriesSelectors[metric];

  const map = new Map<string, { sum: number; count: number; max: number | null }>();

  for (const activity of activities) {
    const value = selector.select(activity);

    if (value === null || !Number.isFinite(value)) {
      continue;
    }

    const label = bucketLabel(activity.startDateLocal, bucket);
    const current = map.get(label) ?? { sum: 0, count: 0, max: null };
    current.sum += value;
    current.count += 1;
    current.max = current.max === null ? value : Math.max(current.max, value);
    map.set(label, current);
  }

  const series = [...map.entries()]
    .map(([bucketKey, values]) => {
      let pointValue = 0;

      if (selector.aggregation === "avg") {
        pointValue = values.count === 0 ? 0 : values.sum / values.count;
      } else if (selector.aggregation === "max") {
        pointValue = values.max ?? 0;
      } else {
        pointValue = values.sum;
      }

      return {
        bucket: bucketKey,
        value: pointValue,
        samples: values.count,
      };
    })
    .sort((a, b) => a.bucket.localeCompare(b.bucket));

  return {
    metric,
    aggregation: selector.aggregation,
    series,
  };
}

export function buildDistribution(
  activities: Activity[],
  metric: DistributionMetric,
  binsRequested: number,
) {
  const bins = Number.isFinite(binsRequested) ? Math.max(1, Math.min(100, binsRequested)) : 20;
  const selector = distributionSelectors[metric];
  const values = activities
    .map(selector)
    .filter((value): value is number => value !== null && Number.isFinite(value));

  if (values.length === 0) {
    return {
      metric,
      bins: [],
      sampleSize: 0,
      min: null,
      max: null,
    };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) {
    return {
      metric,
      bins: [{ from: min, to: max, count: values.length }],
      sampleSize: values.length,
      min,
      max,
    };
  }

  const width = (max - min) / bins;
  const counts = new Array<number>(bins).fill(0);

  for (const value of values) {
    const idx = Math.min(Math.floor((value - min) / width), bins - 1);
    counts[idx] += 1;
  }

  return {
    metric,
    bins: counts.map((count, idx) => {
      const from = min + idx * width;
      const to = idx === bins - 1 ? max : from + width;

      return {
        from,
        to,
        count,
      };
    }),
    sampleSize: values.length,
    min,
    max,
  };
}

function pivotRowKey(activity: Activity, row: PivotRow) {
  if (row === "type") {
    return activity.sportType || activity.type;
  }

  if (row === "week") {
    return format(startOfWeek(activity.startDateLocal, { weekStartsOn: 1 }), "yyyy-MM-dd");
  }

  return format(activity.startDateLocal, "yyyy-MM");
}

export function buildPivot(activities: Activity[], row: PivotRow, metrics: PivotMetric[]) {
  const uniqueMetrics = [...new Set(metrics)].filter((metric): metric is PivotMetric => metric in pivotMetricSelectors);
  const metricList =
    uniqueMetrics.length === 0
      ? ([
          "distance",
          "time",
          "elev",
          "count",
          "avgHR",
          "avgSpeed",
          "avgWatts",
          "cadence",
          "strideLength",
          "groundContactTime",
          "verticalOscillation",
        ] as PivotMetric[])
      : uniqueMetrics;

  const table = new Map<string, Record<string, { sum: number; count: number }>>();

  for (const activity of activities) {
    const key = pivotRowKey(activity, row);
    const existing = table.get(key) ?? {};

    for (const metric of metricList) {
      const config = pivotMetricSelectors[metric];
      const value = config.select(activity);

      if (value === null || !Number.isFinite(value)) {
        continue;
      }

      const metricAcc = existing[metric] ?? { sum: 0, count: 0 };
      metricAcc.sum += value;
      metricAcc.count += 1;
      existing[metric] = metricAcc;
    }

    table.set(key, existing);
  }

  return {
    row,
    metrics: metricList,
    rows: [...table.entries()]
      .map(([key, values]) => {
        const rowData: Record<string, string | number> = { key };

        for (const metric of metricList) {
          const config = pivotMetricSelectors[metric];
          const metricAcc = values[metric];

          if (!metricAcc || metricAcc.count === 0) {
            rowData[metric] = 0;
            continue;
          }

          rowData[metric] = config.aggregation === "avg" ? metricAcc.sum / metricAcc.count : metricAcc.sum;
        }

        return rowData;
      })
      .sort((a, b) => String(a.key).localeCompare(String(b.key))),
  };
}

function ema(previous: number | null, value: number, days: number) {
  const alpha = 2 / (days + 1);

  if (previous === null) {
    return value;
  }

  return previous + alpha * (value - previous);
}

export function averageSpeedOrDefault(activities: Activity[]) {
  const valid = activities.map((a) => a.averageSpeed).filter((value) => value > 0);

  if (valid.length === 0) {
    return 2.5;
  }

  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

export function computeCharge(activity: Activity, hrMax: number, userAvgSpeed: number) {
  if (activity.sufferScore !== null) {
    return activity.sufferScore;
  }

  const movingTimeMinutes = activity.movingTime / 60;

  if (activity.averageHeartrate !== null) {
    return movingTimeMinutes * (activity.averageHeartrate / hrMax);
  }

  const relativeSpeed = userAvgSpeed <= 0 ? 1 : activity.averageSpeed / userAvgSpeed;
  const boundedIntensity = Math.max(0.5, Math.min(1.8, relativeSpeed));

  return movingTimeMinutes * boundedIntensity;
}

function correlationValue(
  activity: Activity,
  variable: CorrelationVar,
  hrMax: number,
  userAvgSpeed: number,
): number | null {
  switch (variable) {
    case "distance":
      return activity.distance / 1000;
    case "movingTime":
      return activity.movingTime / 60;
    case "elevGain":
      return activity.totalElevationGain;
    case "avgSpeed":
      return activity.averageSpeed * 3.6;
    case "maxSpeed":
      return activity.maxSpeed * 3.6;
    case "avgHR":
      return activity.averageHeartrate;
    case "maxHR":
      return activity.maxHeartrate;
    case "avgWatts":
      return activity.averageWatts;
    case "maxWatts":
      return activity.maxWatts;
    case "cadence":
      return activity.averageCadence;
    case "strideLength":
      return getRunDynamics(activity)?.strideLength ?? null;
    case "groundContactTime":
      return getRunDynamics(activity)?.groundContactTime ?? null;
    case "verticalOscillation":
      return getRunDynamics(activity)?.verticalOscillation ?? null;
    case "sufferScore":
      return activity.sufferScore;
    case "kilojoules":
      return activity.kilojoules;
    case "calories":
      return activity.calories;
    case "charge":
      return computeCharge(activity, hrMax, userAvgSpeed);
    default:
      return null;
  }
}

function buildScatterPoints(
  activities: Activity[],
  xVar: CorrelationVar,
  yVar: CorrelationVar,
  hrMax: number,
  userAvgSpeed: number,
  colorVar?: CorrelationVar,
) {
  return activities
    .map((activity) => {
      const x = correlationValue(activity, xVar, hrMax, userAvgSpeed);
      const y = correlationValue(activity, yVar, hrMax, userAvgSpeed);
      const colorValue = colorVar ? correlationValue(activity, colorVar, hrMax, userAvgSpeed) : null;

      if (x === null || y === null) {
        return null;
      }

      return {
        id: activity.id,
        stravaActivityId: activity.stravaActivityId,
        x,
        y,
        color: colorValue,
        label: activity.name,
        date: format(activity.startDateLocal, "yyyy-MM-dd"),
      };
    })
    .filter(
      (
        point,
      ): point is {
        id: string;
        stravaActivityId: string;
        x: number;
        y: number;
        color: number | null;
        label: string;
        date: string;
      } => point !== null,
    );
}

function rank(values: number[]) {
  const sorted = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);

  const ranks = new Array<number>(values.length);
  let i = 0;

  while (i < sorted.length) {
    let j = i;

    while (j + 1 < sorted.length && sorted[j + 1].value === sorted[i].value) {
      j += 1;
    }

    const avgRank = (i + j + 2) / 2;
    for (let k = i; k <= j; k += 1) {
      ranks[sorted[k].index] = avgRank;
    }

    i = j + 1;
  }

  return ranks;
}

function pearson(x: number[], y: number[]) {
  if (x.length !== y.length || x.length < 2) {
    return null;
  }

  const n = x.length;
  const meanX = x.reduce((sum, value) => sum + value, 0) / n;
  const meanY = y.reduce((sum, value) => sum + value, 0) / n;

  let numerator = 0;
  let sx = 0;
  let sy = 0;

  for (let i = 0; i < n; i += 1) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    numerator += dx * dy;
    sx += dx * dx;
    sy += dy * dy;
  }

  if (sx === 0 || sy === 0) {
    return null;
  }

  return numerator / Math.sqrt(sx * sy);
}

function spearman(x: number[], y: number[]) {
  if (x.length !== y.length || x.length < 2) {
    return null;
  }

  return pearson(rank(x), rank(y));
}

export function buildCorrelations(
  activities: Activity[],
  requestedVars: string[],
  method: CorrelationMethod,
  hrMax: number,
  scatterX?: string,
  scatterY?: string,
  scatterColor?: string,
) {
  const variables = requestedVars
    .filter((value): value is CorrelationVar => (SUPPORTED_CORRELATION_VARS as readonly string[]).includes(value))
    .slice(0, 20);

  const vars =
    variables.length < 2
      ? (["distance", "movingTime", "elevGain", "avgSpeed", "avgHR", "avgWatts", "calories"] as CorrelationVar[])
      : variables;
  const userAvgSpeed = averageSpeedOrDefault(activities);

  const matrix: Array<{ x: string; y: string; value: number | null; n: number }> = [];

  const correlationFn = method === "spearman" ? spearman : pearson;

  for (const xVar of vars) {
    for (const yVar of vars) {
      const pairs = activities
        .map((activity) => ({
          x: correlationValue(activity, xVar, hrMax, userAvgSpeed),
          y: correlationValue(activity, yVar, hrMax, userAvgSpeed),
        }))
        .filter((pair): pair is { x: number; y: number } => pair.x !== null && pair.y !== null);

      const xValues = pairs.map((pair) => pair.x);
      const yValues = pairs.map((pair) => pair.y);

      matrix.push({
        x: xVar,
        y: yVar,
        value: correlationFn(xValues, yValues),
        n: pairs.length,
      });
    }
  }

  const safeX = (scatterX ?? vars[0]) as CorrelationVar;
  const safeY = (scatterY ?? vars[1]) as CorrelationVar;
  const xVar = (SUPPORTED_CORRELATION_VARS as readonly string[]).includes(safeX) ? safeX : vars[0];
  const yVar = (SUPPORTED_CORRELATION_VARS as readonly string[]).includes(safeY) ? safeY : vars[1];

  const colorVar = scatterColor && (SUPPORTED_CORRELATION_VARS as readonly string[]).includes(scatterColor)
    ? (scatterColor as CorrelationVar)
    : undefined;
  const scatterPoints = buildScatterPoints(activities, xVar, yVar, hrMax, userAvgSpeed, colorVar);

  const scatterR = correlationFn(
    scatterPoints.map((point) => point.x),
    scatterPoints.map((point) => point.y),
  );

  return {
    method,
    vars,
    matrix,
    scatter: {
      xVar,
      yVar,
      r: scatterR,
      n: scatterPoints.length,
      points: scatterPoints,
    },
  };
}

export function buildLoadModel(activities: Activity[], hrMax: number) {
  if (activities.length === 0) {
    return {
      hrMax,
      series: [],
    };
  }

  const userAvgSpeed = averageSpeedOrDefault(activities);
  const sorted = [...activities].sort((a, b) => a.startDateLocal.getTime() - b.startDateLocal.getTime());

  const dailyLoad = new Map<string, number>();

  for (const activity of sorted) {
    const key = format(activity.startDateLocal, "yyyy-MM-dd");
    dailyLoad.set(key, (dailyLoad.get(key) ?? 0) + computeCharge(activity, hrMax, userAvgSpeed));
  }

  const sortedKeys = [...dailyLoad.keys()].sort();
  const firstDate = parseISO(sortedKeys[0]);
  const lastDate = parseISO(sortedKeys.at(-1) ?? sortedKeys[0]);

  const series: Array<{ date: string; charge: number; ctl: number; atl: number; tsb: number }> = [];

  let ctl: number | null = null;
  let atl: number | null = null;

  for (let date = firstDate; date <= lastDate; date = addDays(date, 1)) {
    const key = format(date, "yyyy-MM-dd");
    const charge = dailyLoad.get(key) ?? 0;
    ctl = ema(ctl, charge, 42);
    atl = ema(atl, charge, 7);

    series.push({
      date: key,
      charge,
      ctl,
      atl,
      tsb: ctl - atl,
    });
  }

  return {
    hrMax,
    series,
  };
}
