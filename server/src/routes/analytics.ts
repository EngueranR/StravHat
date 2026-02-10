import type { FastifyPluginAsync } from "fastify";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "../db.js";
import {
  type CorrelationMethod,
  type DistributionMetric,
  type PivotMetric,
  type PivotRow,
  type TimeBucket,
  type TimeSeriesMetric,
  buildCorrelations,
  buildDistribution,
  buildLoadModel,
  buildPivot,
  buildTimeseries,
  summarize,
} from "../utils/analytics.js";
import { withEstimatedCaloriesList } from "../utils/calories.js";
import { buildActivityWhere, parseBool, parseDate, parseIdList, parseNumber } from "../utils/filters.js";
import { collectRunDynamicsBackfills } from "../utils/runDynamics.js";

const baseFilterSchema = z.object({
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

function normalizeForHash(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeForHash(item));
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entryValue]) => [key, normalizeForHash(entryValue)]);

    return Object.fromEntries(entries);
  }

  return value;
}

function buildFilterHash(filters: unknown) {
  const normalized = normalizeForHash(filters);
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

async function persistChartSnapshot(userId: string, chartType: string, query: unknown, payload: unknown) {
  const filterHash = buildFilterHash(query);
  const safePayload = JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue;

  await prisma.chartSnapshot.upsert({
    where: {
      userId_chartType_filterHash: {
        userId,
        chartType,
        filterHash,
      },
    },
    update: {
      payload: safePayload,
    },
    create: {
      userId,
      chartType,
      filterHash,
      payload: safePayload,
    },
  });
}

async function getActivities(userId: string, query: z.infer<typeof baseFilterSchema>) {
  const minCalories = parseNumber(query.minCalories);
  const maxCalories = parseNumber(query.maxCalories);
  const [activities, user] = await Promise.all([
    prisma.activity.findMany({
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
        minCalories: undefined,
        maxCalories: undefined,
        minKilojoules: parseNumber(query.minKilojoules),
        maxKilojoules: parseNumber(query.maxKilojoules),
        hasHR: parseBool(query.hasHR),
        hasPower: parseBool(query.hasPower),
        ids: parseIdList(query.ids),
      }),
      orderBy: {
        startDate: "asc",
      },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        hrMax: true,
        weightKg: true,
        age: true,
        heightCm: true,
      },
    }),
  ]);

  const activitiesWithCalories = withEstimatedCaloriesList(activities, {
    hrMax: user?.hrMax ?? null,
    weightKg: user?.weightKg ?? null,
    age: user?.age ?? null,
    heightCm: user?.heightCm ?? null,
  });

  const runDynamicsBackfills = collectRunDynamicsBackfills(activitiesWithCalories);
  const runDynamicsById = new Map(
    runDynamicsBackfills.map((item) => [item.id, item]),
  );

  if (runDynamicsBackfills.length > 0) {
    await prisma.$transaction(
      runDynamicsBackfills.map((item) =>
        prisma.activity.update({
          where: { id: item.id },
          data: {
            strideLength: item.strideLength,
            groundContactTime: item.groundContactTime,
            verticalOscillation: item.verticalOscillation,
          },
        }),
      ),
    );
  }

  const activitiesWithRunDynamics = activitiesWithCalories.map((activity) => {
    const backfill = runDynamicsById.get(activity.id);
    if (!backfill) {
      return activity;
    }

    return {
      ...activity,
      strideLength: backfill.strideLength,
      groundContactTime: backfill.groundContactTime,
      verticalOscillation: backfill.verticalOscillation,
    };
  });

  if (minCalories === undefined && maxCalories === undefined) {
    return activitiesWithRunDynamics;
  }

  return activitiesWithRunDynamics.filter((activity) => {
    if (activity.calories === null || !Number.isFinite(activity.calories)) {
      return false;
    }
    if (minCalories !== undefined && activity.calories < minCalories) {
      return false;
    }
    if (maxCalories !== undefined && activity.calories > maxCalories) {
      return false;
    }
    return true;
  });
}

export const analyticsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/summary", { preHandler: [app.authenticate] }, async (request) => {
    const query = baseFilterSchema.parse(request.query);
    const activities = await getActivities(request.userId, query);

    const byTypeMap = new Map<string, { count: number; distance: number; time: number; elev: number }>();

    for (const activity of activities) {
      const key = activity.sportType || activity.type;
      const existing = byTypeMap.get(key) ?? { count: 0, distance: 0, time: 0, elev: 0 };
      existing.count += 1;
      existing.distance += activity.distance / 1000;
      existing.time += activity.movingTime / 3600;
      existing.elev += activity.totalElevationGain;
      byTypeMap.set(key, existing);
    }

    const payload = {
      ...summarize(activities),
      byType: [...byTypeMap.entries()]
        .map(([type, values]) => ({ type, ...values }))
        .sort((a, b) => b.distance - a.distance),
    };

    await persistChartSnapshot(request.userId, "summary", query, payload);

    return payload;
  });

  app.get("/timeseries", { preHandler: [app.authenticate] }, async (request) => {
    const query = baseFilterSchema
      .extend({
        metric: z
          .enum(
            [
              "distance",
              "time",
              "elev",
              "count",
              "avgHR",
              "maxHR",
              "avgSpeed",
              "maxSpeed",
              "avgWatts",
              "maxWatts",
              "cadence",
              "strideLength",
              "groundContactTime",
              "verticalOscillation",
              "kilojoules",
              "calories",
              "sufferScore",
            ] as [TimeSeriesMetric, ...TimeSeriesMetric[]],
          )
          .default("distance"),
        bucket: z.enum(["day", "week", "month"] as [TimeBucket, ...TimeBucket[]]).default("week"),
      })
      .parse(request.query);

    const activities = await getActivities(request.userId, query);
    const timeseries = buildTimeseries(activities, query.metric, query.bucket);

    const payload = {
      ...timeseries,
      bucket: query.bucket,
    };

    await persistChartSnapshot(request.userId, "timeseries", query, payload);

    return payload;
  });

  app.get("/distribution", { preHandler: [app.authenticate] }, async (request) => {
    const query = baseFilterSchema
      .extend({
        metric: z
          .enum(
            [
              "distance",
              "time",
              "elev",
              "avgHR",
              "maxHR",
              "avgSpeed",
              "maxSpeed",
              "avgWatts",
              "maxWatts",
              "cadence",
              "strideLength",
              "groundContactTime",
              "verticalOscillation",
              "kilojoules",
              "calories",
              "sufferScore",
            ] as [DistributionMetric, ...DistributionMetric[]],
          )
          .default("distance"),
        bins: z.coerce.number().int().positive().max(100).default(20),
      })
      .parse(request.query);

    const activities = await getActivities(request.userId, query);

    const payload = buildDistribution(activities, query.metric, query.bins);
    await persistChartSnapshot(request.userId, "distribution", query, payload);

    return payload;
  });

  app.get("/pivot", { preHandler: [app.authenticate] }, async (request) => {
    const query = baseFilterSchema
      .extend({
        row: z.enum(["month", "week", "type"] as [PivotRow, ...PivotRow[]]).default("type"),
        metrics: z
          .string()
          .default(
            "distance,time,elev,count,avgHR,avgSpeed,avgWatts,cadence,strideLength,groundContactTime,verticalOscillation,kilojoules,calories",
          ),
      })
      .parse(request.query);

    const activities = await getActivities(request.userId, query);
    const metrics = query.metrics.split(",").map((value) => value.trim()) as PivotMetric[];

    const payload = buildPivot(activities, query.row, metrics);
    await persistChartSnapshot(request.userId, "pivot", query, payload);

    return payload;
  });

  app.get("/correlations", { preHandler: [app.authenticate] }, async (request) => {
    const query = baseFilterSchema
      .extend({
        vars: z
          .string()
          .default(
            "distance,movingTime,elevGain,avgSpeed,maxSpeed,avgHR,maxHR,avgWatts,maxWatts,cadence,strideLength,groundContactTime,verticalOscillation,kilojoules,calories,charge",
          ),
        scatterX: z.string().optional(),
        scatterY: z.string().optional(),
        scatterColor: z.string().optional(),
        method: z.enum(["pearson", "spearman"] as [CorrelationMethod, ...CorrelationMethod[]]).default("pearson"),
      })
      .parse(request.query);

    const [activities, user] = await Promise.all([
      getActivities(request.userId, query),
      prisma.user.findUnique({ where: { id: request.userId } }),
    ]);

    const payload = buildCorrelations(
      activities,
      query.vars.split(",").map((value) => value.trim()),
      query.method,
      user?.hrMax ?? 190,
      query.scatterX,
      query.scatterY,
      query.scatterColor,
    );

    await persistChartSnapshot(request.userId, "correlations", query, payload);

    return payload;
  });

  app.get("/load", { preHandler: [app.authenticate] }, async (request) => {
    const query = baseFilterSchema.parse(request.query);

    const [activities, user] = await Promise.all([
      getActivities(request.userId, query),
      prisma.user.findUnique({ where: { id: request.userId } }),
    ]);

    const payload = buildLoadModel(activities, user?.hrMax ?? 190);
    await persistChartSnapshot(request.userId, "load", query, payload);

    return payload;
  });
};
