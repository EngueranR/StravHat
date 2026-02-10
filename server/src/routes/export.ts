import type { Activity } from "@prisma/client";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { stringifyCsv } from "../utils/csv.js";
import { buildActivityWhere, parseBool, parseDate, parseIdList, parseNumber } from "../utils/filters.js";

const baseExportSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  localFrom: z.string().optional(),
  localTo: z.string().optional(),
  type: z.string().optional(),
  q: z.string().optional(),
  minDistanceKm: z.string().optional(),
  maxDistanceKm: z.string().optional(),
  minTimeMin: z.string().optional(),
  maxTimeMin: z.string().optional(),
  minElev: z.string().optional(),
  maxElev: z.string().optional(),
  minAvgHR: z.string().optional(),
  maxAvgHR: z.string().optional(),
  minAvgSpeedKmh: z.string().optional(),
  maxAvgSpeedKmh: z.string().optional(),
  minAvgWatts: z.string().optional(),
  maxAvgWatts: z.string().optional(),
  minCadence: z.string().optional(),
  maxCadence: z.string().optional(),
  minCalories: z.string().optional(),
  maxCalories: z.string().optional(),
  minKilojoules: z.string().optional(),
  maxKilojoules: z.string().optional(),
  hasHR: z.string().optional(),
  hasPower: z.string().optional(),
  ids: z.string().optional(),
});

const exportDatasetSchema = z.enum(["activities", "settings", "charts"]);
type ExportDataset = z.infer<typeof exportDatasetSchema>;

const exportMetricSchema = z.enum([
  "avgHr",
  "maxHr",
  "paceMinKm",
  "avgSpeedKmh",
  "cadence",
  "strideLength",
  "groundContactTime",
  "verticalOscillation",
  "avgWatts",
  "maxWatts",
  "calories",
  "kilojoules",
  "distanceKm",
  "movingTimeMin",
  "elevGainM",
  "sufferScore",
]);
type ExportMetric = z.infer<typeof exportMetricSchema>;

const activityHeaders = [
  "id",
  "stravaActivityId",
  "name",
  "type",
  "sportType",
  "startDate",
  "startDateLocal",
  "timezone",
  "distance",
  "movingTime",
  "elapsedTime",
  "totalElevationGain",
  "averageSpeed",
  "maxSpeed",
  "averageHeartrate",
  "maxHeartrate",
  "averageWatts",
  "maxWatts",
  "weightedAverageWatts",
  "kilojoules",
  "calories",
  "averageCadence",
  "strideLength",
  "groundContactTime",
  "verticalOscillation",
  "sufferScore",
  "trainer",
  "commute",
  "manual",
  "hasHeartrate",
  "importedAt",
  "updatedAt",
];

const settingsHeaders = [
  "id",
  "email",
  "stravaAthleteId",
  "hrMax",
  "age",
  "weightKg",
  "heightCm",
  "goalType",
  "goalDistanceKm",
  "goalTimeSec",
  "speedUnit",
  "distanceUnit",
  "elevationUnit",
  "cadenceUnit",
  "createdAt",
  "updatedAt",
];

const chartHeaders = ["id", "chartType", "filterHash", "payload", "createdAt", "updatedAt"];

const metricBaseHeaders = [
  "id",
  "stravaActivityId",
  "name",
  "type",
  "sportType",
  "startDate",
  "startDateLocal",
];

function round2(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  return Number(value.toFixed(2));
}

function paceMinPerKm(speedMs: number) {
  if (!Number.isFinite(speedMs) || speedMs <= 0) {
    return null;
  }
  return 1000 / speedMs / 60;
}

function metricValue(activity: Activity, metric: ExportMetric) {
  switch (metric) {
    case "avgHr":
      return round2(activity.averageHeartrate ?? null);
    case "maxHr":
      return round2(activity.maxHeartrate ?? null);
    case "paceMinKm":
      return round2(paceMinPerKm(activity.averageSpeed));
    case "avgSpeedKmh":
      return round2(activity.averageSpeed * 3.6);
    case "cadence":
      return round2(activity.averageCadence ?? null);
    case "strideLength":
      return round2(activity.strideLength ?? null);
    case "groundContactTime":
      return round2(activity.groundContactTime ?? null);
    case "verticalOscillation":
      return round2(activity.verticalOscillation ?? null);
    case "avgWatts":
      return round2(activity.averageWatts ?? null);
    case "maxWatts":
      return round2(activity.maxWatts ?? null);
    case "calories":
      return round2(activity.calories ?? null);
    case "kilojoules":
      return round2(activity.kilojoules ?? null);
    case "distanceKm":
      return round2(activity.distance / 1000);
    case "movingTimeMin":
      return round2(activity.movingTime / 60);
    case "elevGainM":
      return round2(activity.totalElevationGain);
    case "sufferScore":
      return round2(activity.sufferScore ?? null);
    default:
      return null;
  }
}

function parseMetricList(metricsRaw?: string) {
  if (!metricsRaw) {
    return [] as ExportMetric[];
  }

  const metricOptions = new Set(exportMetricSchema.options);
  const metrics = metricsRaw
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is ExportMetric => metricOptions.has(value as ExportMetric));

  return [...new Set(metrics)];
}

function buildMetricRows(items: Activity[], metrics: ExportMetric[]) {
  return items.map((activity) => {
    const row: Record<string, unknown> = {
      id: activity.id,
      stravaActivityId: activity.stravaActivityId,
      name: activity.name,
      type: activity.type,
      sportType: activity.sportType,
      startDate: activity.startDate,
      startDateLocal: activity.startDateLocal,
    };

    for (const metric of metrics) {
      row[metric] = metricValue(activity, metric);
    }

    return row;
  });
}

async function fetchActivities(userId: string, query: z.infer<typeof baseExportSchema>) {
  return prisma.activity.findMany({
    where: buildActivityWhere(userId, {
      from: parseDate(query.from),
      to: parseDate(query.to),
      localFrom: parseDate(query.localFrom),
      localTo: parseDate(query.localTo),
      type: query.type,
      q: query.q,
      minDistanceKm: parseNumber(query.minDistanceKm),
      maxDistanceKm: parseNumber(query.maxDistanceKm),
      minTimeMin: parseNumber(query.minTimeMin),
      maxTimeMin: parseNumber(query.maxTimeMin),
      minElev: parseNumber(query.minElev),
      maxElev: parseNumber(query.maxElev),
      minAvgHR: parseNumber(query.minAvgHR),
      maxAvgHR: parseNumber(query.maxAvgHR),
      minAvgSpeedKmh: parseNumber(query.minAvgSpeedKmh),
      maxAvgSpeedKmh: parseNumber(query.maxAvgSpeedKmh),
      minAvgWatts: parseNumber(query.minAvgWatts),
      maxAvgWatts: parseNumber(query.maxAvgWatts),
      minCadence: parseNumber(query.minCadence),
      maxCadence: parseNumber(query.maxCadence),
      minCalories: parseNumber(query.minCalories),
      maxCalories: parseNumber(query.maxCalories),
      minKilojoules: parseNumber(query.minKilojoules),
      maxKilojoules: parseNumber(query.maxKilojoules),
      hasHR: parseBool(query.hasHR),
      hasPower: parseBool(query.hasPower),
      ids: parseIdList(query.ids),
    }),
    orderBy: {
      startDate: "desc",
    },
  });
}

async function fetchSettings(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      stravaAthleteId: true,
      hrMax: true,
      age: true,
      weightKg: true,
      heightCm: true,
      goalType: true,
      goalDistanceKm: true,
      goalTimeSec: true,
      speedUnit: true,
      distanceUnit: true,
      elevationUnit: true,
      cadenceUnit: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return user ? [user] : [];
}

async function fetchCharts(userId: string) {
  return prisma.chartSnapshot.findMany({
    where: { userId },
    select: {
      id: true,
      chartType: true,
      filterHash: true,
      payload: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });
}

async function buildDatasetRows(dataset: ExportDataset, userId: string, query: z.infer<typeof baseExportSchema>) {
  if (dataset === "activities") {
    const rows = await fetchActivities(userId, query);
    return {
      rows: rows as unknown as Record<string, unknown>[],
      headers: activityHeaders,
      filename: "stravhat-activities.csv",
    };
  }

  if (dataset === "settings") {
    const rows = await fetchSettings(userId);
    return {
      rows: rows as unknown as Record<string, unknown>[],
      headers: settingsHeaders,
      filename: "stravhat-settings.csv",
    };
  }

  const rows = await fetchCharts(userId);
  return {
    rows: rows as unknown as Record<string, unknown>[],
    headers: chartHeaders,
    filename: "stravhat-charts.csv",
  };
}

function sendCsv(reply: FastifyReply, filename: string, csv: string) {
  reply.header("Content-Type", "text/csv; charset=utf-8");
  reply.header("Content-Disposition", `attachment; filename="${filename}"`);
  return reply.send(csv);
}

export const exportRoutes: FastifyPluginAsync = async (app) => {
  app.get("/activities.csv", { preHandler: [app.authenticate] }, async (request, reply) => {
    const query = baseExportSchema.parse(request.query);
    const { rows, headers, filename } = await buildDatasetRows("activities", request.userId, query);
    const csv = stringifyCsv(rows, headers);
    return sendCsv(reply, filename, csv);
  });

  app.get("/dataset.csv", { preHandler: [app.authenticate] }, async (request, reply) => {
    const query = baseExportSchema
      .extend({
        dataset: exportDatasetSchema.default("activities"),
      })
      .parse(request.query);

    const { dataset, ...filters } = query;
    const { rows, headers, filename } = await buildDatasetRows(dataset, request.userId, filters);
    const csv = stringifyCsv(rows, headers);

    return sendCsv(reply, filename, csv);
  });

  app.get("/combined.csv", { preHandler: [app.authenticate] }, async (request, reply) => {
    const query = baseExportSchema
      .extend({
        datasets: z.string().optional(),
      })
      .parse(request.query);

    const datasets =
      query.datasets?.split(",").map((value) => value.trim()).filter(Boolean).filter((value): value is ExportDataset =>
        exportDatasetSchema.options.includes(value as ExportDataset),
      ) ?? [];

    const selectedDatasets: ExportDataset[] =
      datasets.length > 0 ? [...new Set(datasets)] : [...exportDatasetSchema.options];

    const datasetRows = await Promise.all(
      selectedDatasets.map(async (dataset) => ({
        dataset,
        ...(await buildDatasetRows(dataset, request.userId, query)),
      })),
    );

    const mergedRows = datasetRows.flatMap(({ dataset, rows }) =>
      rows.map((row) => ({
        dataset,
        ...row,
      })),
    );

    const headerSet = new Set<string>(["dataset"]);
    for (const row of mergedRows) {
      for (const key of Object.keys(row)) {
        headerSet.add(key);
      }
    }

    const headers = ["dataset", ...[...headerSet].filter((header) => header !== "dataset")];
    const csv = stringifyCsv(mergedRows, headers);

    return sendCsv(reply, "stravhat-export-combined.csv", csv);
  });

  app.get("/metrics.csv", { preHandler: [app.authenticate] }, async (request, reply) => {
    const query = baseExportSchema
      .extend({
        metrics: z.string().default("avgHr"),
      })
      .parse(request.query);

    const selectedMetrics = parseMetricList(query.metrics);
    if (selectedMetrics.length === 0) {
      return reply.code(400).send({ message: "Aucune metrique valide selectionnee." });
    }

    const items = await fetchActivities(request.userId, query);
    const rows = buildMetricRows(items, selectedMetrics);
    const headers = [...metricBaseHeaders, ...selectedMetrics];
    const filename =
      selectedMetrics.length === 1 ?
        `stravhat-metric-${selectedMetrics[0]}.csv`
      : "stravhat-metrics-combined.csv";
    const csv = stringifyCsv(rows, headers);

    return sendCsv(reply, filename, csv);
  });
};
