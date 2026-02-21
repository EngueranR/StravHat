import { type Prisma } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { buildRunOnlyActivityWhere } from "../utils/runActivities.js";
import { withEstimatedCalories, withEstimatedCaloriesList } from "../utils/calories.js";
import { buildActivityWhere, parseBool, parseDate, parseIdList, parseNumber } from "../utils/filters.js";
import { collectRunDynamicsBackfills } from "../utils/runDynamics.js";

const listQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  localFrom: z.string().optional(),
  localTo: z.string().optional(),
  type: z.string().optional(),
  q: z.string().optional(),
  hasHR: z.string().optional(),
  hasPower: z.string().optional(),
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
  ids: z.string().optional(),
  sort: z.string().optional(),
  limit: z.coerce.number().int().positive().max(500).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

const sortableFields = [
  "startDate",
  "distance",
  "movingTime",
  "totalElevationGain",
  "averageSpeed",
  "averageHeartrate",
  "averageWatts",
  "averageCadence",
  "strideLength",
  "groundContactTime",
  "verticalOscillation",
  "kilojoules",
  "calories",
  "name",
] as const;

function parseSort(sort?: string): Prisma.ActivityOrderByWithRelationInput {
  const [fieldCandidate, directionCandidate] = (sort ?? "startDate:desc").split(":");
  const field = sortableFields.includes(fieldCandidate as (typeof sortableFields)[number])
    ? fieldCandidate
    : "startDate";
  const direction: Prisma.SortOrder = directionCandidate === "asc" ? "asc" : "desc";

  return {
    [field]: direction,
  } as Prisma.ActivityOrderByWithRelationInput;
}

export const activitiesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { preHandler: [app.authenticate] }, async (request) => {
    const query = listQuerySchema.parse(request.query);

    const where = buildActivityWhere(request.userId, {
      from: parseDate(query.from),
      to: parseDate(query.to),
      localFrom: parseDate(query.localFrom),
      localTo: parseDate(query.localTo),
      type: query.type,
      q: query.q,
      hasHR: parseBool(query.hasHR),
      hasPower: parseBool(query.hasPower),
      ids: parseIdList(query.ids),
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
    });

    const [items, total, user] = await Promise.all([
      prisma.activity.findMany({
        where,
        orderBy: parseSort(query.sort),
        take: query.limit,
        skip: query.offset,
      }),
      prisma.activity.count({ where }),
      prisma.user.findUnique({
        where: { id: request.userId },
        select: {
          hrMax: true,
          weightKg: true,
          age: true,
          heightCm: true,
        },
      }),
    ]);

    const itemsWithCalories = withEstimatedCaloriesList(items, {
      hrMax: user?.hrMax ?? null,
      weightKg: user?.weightKg ?? null,
      age: user?.age ?? null,
      heightCm: user?.heightCm ?? null,
    });

    const runDynamicsBackfills = collectRunDynamicsBackfills(itemsWithCalories);
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

    const itemsWithRunDynamics = itemsWithCalories.map((activity) => {
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

    return {
      total,
      limit: query.limit,
      offset: query.offset,
      items: itemsWithRunDynamics,
    };
  });

  app.get("/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const runOnlyWhere = buildRunOnlyActivityWhere();

    const [activity, user] = await Promise.all([
      prisma.activity.findFirst({
        where: {
          userId: request.userId,
          AND: [
            runOnlyWhere,
            { OR: [{ id: params.id }, { stravaActivityId: params.id }] },
          ],
        },
      }),
      prisma.user.findUnique({
        where: { id: request.userId },
        select: {
          hrMax: true,
          weightKg: true,
          age: true,
          heightCm: true,
        },
      }),
    ]);

    if (!activity) {
      return reply.code(404).send({ message: "Activity not found" });
    }

    const activityWithCalories = withEstimatedCalories(activity, {
      hrMax: user?.hrMax ?? null,
      weightKg: user?.weightKg ?? null,
      age: user?.age ?? null,
      heightCm: user?.heightCm ?? null,
    });

    const runDynamicsBackfills = collectRunDynamicsBackfills([
      activityWithCalories,
    ]);

    if (runDynamicsBackfills.length > 0) {
      const [backfill] = runDynamicsBackfills;
      await prisma.activity.update({
        where: { id: backfill.id },
        data: {
          strideLength: backfill.strideLength,
          groundContactTime: backfill.groundContactTime,
          verticalOscillation: backfill.verticalOscillation,
        },
      });

      return {
        ...activityWithCalories,
        strideLength: backfill.strideLength,
        groundContactTime: backfill.groundContactTime,
        verticalOscillation: backfill.verticalOscillation,
      };
    }

    return activityWithCalories;
  });
};
