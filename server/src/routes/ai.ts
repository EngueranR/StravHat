import { UsageFeature, type Activity, type Prisma } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import { createHash } from "node:crypto";
import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
  startOfWeek,
} from "date-fns";
import { z } from "zod";
import { prisma } from "../db.js";
import {
  type TrainingPlanSession,
  type TrainingPlanWeek,
  adaptTrainingSessionWithHuggingFace,
  analyzeSectionWithHuggingFace,
  generateTrainingPlanWithHuggingFace,
} from "../services/ai.js";
import { consumeQuota } from "../services/subscription.js";
import { buildLoadModel } from "../utils/analytics.js";
import { buildRunOnlyActivityWhere, isRunLikeActivityType } from "../utils/runActivities.js";

const analyzeSchema = z.object({
  page: z.string().min(1).max(80),
  sectionKey: z.string().min(1).max(120),
  sectionTitle: z.string().min(1).max(160),
  sectionSubtitle: z.string().max(280).optional(),
  question: z.string().max(1000).optional(),
  context: z.record(z.string(), z.unknown()).default({}),
});

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(parseISO(`${value}T00:00:00`).getTime()), {
    message: "Date invalide",
  });

const trainingPlanSchema = z.object({
  objective: z.string().min(8).max(240),
  raceDate: isoDateSchema,
});

const trainingDaySchema = z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
const trainingPlanCommitSchema = z.object({
  trainingPlan: z.object({
    title: z.string().min(2).max(140),
    goal: z.string().min(8).max(240),
    weeks: z.number().int().min(5).max(18),
    startDate: isoDateSchema,
    plan: z.array(
      z.object({
        weekIndex: z.number().int().min(1).max(30),
        theme: z.string().min(2).max(120),
        focus: z.string().min(2).max(220),
        weeklyVolumeKm: z.number().min(0).max(300),
        sessions: z.array(
          z.object({
            day: trainingDaySchema,
            title: z.string().min(2).max(120),
            objective: z.string().min(2).max(260),
            zone: z.string().min(2).max(48),
            durationMin: z.number().min(20).max(300),
            distanceKm: z.number().min(1).max(80),
            paceTarget: z.string().min(2).max(120),
            hrTarget: z.string().min(2).max(120),
            notes: z.string().max(220).optional(),
            rationale: z.string().min(2).max(320),
          }),
        ).length(4),
      }),
    ).min(1).max(18),
  }),
});

const trainingPlanSessionBlockSchema = z.object({
  step: z.string().min(2).max(80),
  durationMin: z.number().min(2).max(240),
  paceTarget: z.string().min(2).max(120),
  hrTarget: z.string().min(2).max(120),
  repeat: z.number().int().min(1).max(20).nullable(),
  notes: z.string().max(180),
});

const trainingPlanSessionSchema = z.object({
  weekIndex: z.number().int().min(1).max(30),
  sessionIndex: z.number().int().min(1).max(8),
  day: trainingDaySchema,
  title: z.string().min(2).max(120),
  objective: z.string().min(2).max(260),
  zone: z.string().min(2).max(48),
  durationMin: z.number().min(20).max(300),
  distanceKm: z.number().min(1).max(80),
  paceTarget: z.string().min(2).max(120),
  hrTarget: z.string().min(2).max(120),
  notes: z.string().max(220),
  rationale: z.string().min(2).max(320),
  blocks: z.array(trainingPlanSessionBlockSchema).min(1).max(8),
});

const storedTrainingPlanSchema = z.object({
  title: z.string().min(2).max(140),
  goal: z.string().min(8).max(240),
  weeks: z.number().int().min(5).max(18),
  startDate: isoDateSchema,
  raceDate: isoDateSchema,
  daysToRace: z.number().int().min(-365).max(366),
  overview: z.string().min(8).max(1500),
  methodology: z.string().min(8).max(1200),
  warnings: z.array(z.string().min(2).max(220)).max(8),
  plan: z
    .array(
      z.object({
        weekIndex: z.number().int().min(1).max(30),
        theme: z.string().min(2).max(120),
        focus: z.string().min(2).max(220),
        weeklyVolumeKm: z.number().min(0).max(300),
        sessions: z.array(trainingPlanSessionSchema).length(4),
      }),
    )
    .min(1)
    .max(18),
});

const persistedTrainingPlanResponseSchema = storedTrainingPlanSchema.extend({
  id: z.string().min(1).max(100),
});

const trainingPlanIdParamSchema = z.object({
  planId: z.string().min(1).max(100),
});

const trainingPlanAdaptSchema = z.object({
  weekIndex: z.number().int().min(1).max(30),
  sessionIndex: z.number().int().min(1).max(4),
  request: z.string().min(8).max(800),
});

interface StoredTrainingPlanRecord {
  id: string;
  title: string;
  goal: string;
  weeks: number;
  startDate: Date;
  raceDate: Date;
  daysToRace: number;
  overview: string;
  methodology: string;
  warnings: unknown;
  plan: unknown;
  sourceModel: string;
  createdAt: Date;
  updatedAt: Date;
}

function dateToIsoDay(value: Date) {
  return format(value, "yyyy-MM-dd");
}

function normalizePlanWarnings(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((row) => (typeof row === "string" ? row.trim() : ""))
    .filter((row) => row.length >= 2)
    .slice(0, 8);
}

function parseStoredPlanWeeks(value: unknown): TrainingPlanWeek[] {
  if (!Array.isArray(value)) {
    throw new Error("Plan stocke invalide: tableau de semaines attendu.");
  }
  const parsed = storedTrainingPlanSchema.shape.plan.parse(value);
  return parsed as TrainingPlanWeek[];
}

function isRacePlanSession(session: {
  title: string;
  zone: string;
  objective: string;
}) {
  const text = `${session.title} ${session.zone} ${session.objective}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return (
    text.includes("course objectif") ||
    text.includes("jour j") ||
    (text.includes("course") && text.includes("objectif")) ||
    text.includes("race day")
  );
}

function serializeTrainingPlanRecord(record: StoredTrainingPlanRecord) {
  const startDate = dateToIsoDay(record.startDate);
  const raceDate = dateToIsoDay(record.raceDate);
  const warnings = normalizePlanWarnings(record.warnings);
  const plan = parseStoredPlanWeeks(record.plan);
  return persistedTrainingPlanResponseSchema.parse({
    id: record.id,
    title: record.title,
    goal: record.goal,
    weeks: record.weeks,
    startDate,
    raceDate,
    daysToRace: record.daysToRace,
    overview: record.overview,
    methodology: record.methodology,
    warnings,
    plan,
  });
}

function mean(values: number[]) {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]) {
  if (values.length < 2) {
    return null;
  }
  const avg = mean(values);
  if (avg === null) {
    return null;
  }
  const variance =
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

function quantile(sortedValues: number[], q: number) {
  if (sortedValues.length === 0) {
    return null;
  }

  const index = (sortedValues.length - 1) * q;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sortedValues[lower];
  }

  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function buildTrainingContext(
  activities: Activity[],
  hrMax: number,
) {
  const sortedActivities = [...activities].sort(
    (a, b) => a.startDateLocal.getTime() - b.startDateLocal.getTime(),
  );
  const runActivities = sortedActivities.filter((activity) =>
    isRunLikeActivityType(activity),
  );
  const runSamples = runActivities
    .map((activity) => {
      if (activity.distance <= 0 || activity.movingTime <= 0) {
        return null;
      }

      const distanceKm = activity.distance / 1000;
      const durationMin = activity.movingTime / 60;
      const paceMinPerKm = durationMin / distanceKm;
      const avgSpeedKmh = distanceKm / (activity.movingTime / 3600);
      return {
        id: activity.id,
        date: format(activity.startDateLocal, "yyyy-MM-dd"),
        distanceKm: Number(distanceKm.toFixed(2)),
        durationMin: Number(durationMin.toFixed(1)),
        paceMinPerKm: Number(paceMinPerKm.toFixed(3)),
        avgSpeedKmh: Number(avgSpeedKmh.toFixed(2)),
        avgHeartrate:
          activity.averageHeartrate === null ?
            null
          : Number(activity.averageHeartrate.toFixed(1)),
        avgCadence:
          activity.averageCadence === null ?
            null
          : Number(activity.averageCadence.toFixed(1)),
        elevGainM: Number(activity.totalElevationGain.toFixed(1)),
        type: activity.sportType || activity.type,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const paceValues = runSamples.map((sample) => sample.paceMinPerKm).sort((a, b) => a - b);
  const hrValues = runSamples
    .map((sample) => sample.avgHeartrate)
    .filter((value): value is number => value !== null);
  const distanceValues = runSamples.map((sample) => sample.distanceKm);
  const last20Runs = runSamples.slice(-20);

  const weeklyDistanceMap = new Map<string, number>();
  for (const sample of runSamples) {
    const localDate = parseISO(`${sample.date}T00:00:00`);
    const weekStart = format(
      startOfWeek(localDate, { weekStartsOn: 1 }),
      "yyyy-MM-dd",
    );
    weeklyDistanceMap.set(
      weekStart,
      (weeklyDistanceMap.get(weekStart) ?? 0) + sample.distanceKm,
    );
  }
  const weeklyDistanceSeries = [...weeklyDistanceMap.entries()]
    .map(([week, distanceKm]) => ({
      week,
      distanceKm: Number(distanceKm.toFixed(2)),
    }))
    .sort((a, b) => a.week.localeCompare(b.week));
  const last12Weeks = weeklyDistanceSeries.slice(-12);
  const last6Weeks = weeklyDistanceSeries.slice(-6);

  const loadModel = buildLoadModel(sortedActivities, hrMax);
  const latestLoad = loadModel.series[loadModel.series.length - 1] ?? null;
  const last7Load = loadModel.series.slice(-7);
  const last7Charge = last7Load.map((row) => row.charge);
  const chargeStd = stdDev(last7Charge);
  const monotony7d =
    chargeStd === null || chargeStd === 0 ? null : (mean(last7Charge) ?? 0) / chargeStd;
  const allActivitiesRaw = sortedActivities.map((activity) => ({
    id: activity.id,
    date: format(activity.startDateLocal, "yyyy-MM-dd"),
    sportType: activity.sportType || activity.type,
    distanceKm: Number((activity.distance / 1000).toFixed(2)),
    durationMin: Number((activity.movingTime / 60).toFixed(1)),
    paceMinPerKm:
      activity.distance <= 0 || activity.movingTime <= 0 ?
        null
      : Number(((activity.movingTime / 60) / (activity.distance / 1000)).toFixed(3)),
    elevGainM: Number(activity.totalElevationGain.toFixed(1)),
    avgHr:
      activity.averageHeartrate === null ?
        null
      : Number(activity.averageHeartrate.toFixed(1)),
    maxHr:
      activity.maxHeartrate === null ? null : Number(activity.maxHeartrate.toFixed(1)),
    avgWatts:
      activity.averageWatts === null ? null : Number(activity.averageWatts.toFixed(1)),
    maxWatts:
      activity.maxWatts === null ? null : Number(activity.maxWatts.toFixed(1)),
    cadence:
      activity.averageCadence === null ? null : Number(activity.averageCadence.toFixed(1)),
    calories:
      activity.calories === null ? null : Number(activity.calories.toFixed(1)),
    kilojoules:
      activity.kilojoules === null ? null : Number(activity.kilojoules.toFixed(1)),
    strideLengthM:
      activity.strideLength === null ? null : Number(activity.strideLength.toFixed(3)),
    groundContactTimeMs:
      activity.groundContactTime === null ?
        null
      : Number(activity.groundContactTime.toFixed(1)),
    verticalOscillationCm:
      activity.verticalOscillation === null ?
        null
      : Number(activity.verticalOscillation.toFixed(2)),
    hasHeartrate: activity.hasHeartrate,
  }));

  return {
    sessions: {
      total: sortedActivities.length,
      running: runActivities.length,
      firstDate:
        sortedActivities[0] ?
          format(sortedActivities[0].startDateLocal, "yyyy-MM-dd")
        : null,
      lastDate:
        sortedActivities[sortedActivities.length - 1] ?
          format(
            sortedActivities[sortedActivities.length - 1].startDateLocal,
            "yyyy-MM-dd",
          )
        : null,
    },
    runningProfile: {
      sampleSize: runSamples.length,
      medianPaceMinPerKm:
        quantile(paceValues, 0.5) === null ?
          null
        : Number((quantile(paceValues, 0.5) ?? 0).toFixed(3)),
      q25PaceMinPerKm:
        quantile(paceValues, 0.25) === null ?
          null
        : Number((quantile(paceValues, 0.25) ?? 0).toFixed(3)),
      q75PaceMinPerKm:
        quantile(paceValues, 0.75) === null ?
          null
        : Number((quantile(paceValues, 0.75) ?? 0).toFixed(3)),
      avgDistanceKm:
        mean(distanceValues) === null ? null : Number((mean(distanceValues) ?? 0).toFixed(2)),
      longestDistanceKm:
        distanceValues.length === 0 ? null : Number(Math.max(...distanceValues).toFixed(2)),
      avgHr:
        mean(hrValues) === null ? null : Number((mean(hrValues) ?? 0).toFixed(1)),
      hrPctMax:
        hrValues.length === 0 || hrMax <= 0 ?
          null
        : Number((((mean(hrValues) ?? 0) / hrMax) * 100).toFixed(1)),
      weeklyDistanceLast6Weeks: last6Weeks,
      weeklyDistanceLast12Weeks: last12Weeks,
      recentRunsSample: last20Runs,
    },
    fatigueNow: {
      latest: latestLoad,
      last7DaysCharge: {
        average:
          mean(last7Charge) === null ? null : Number((mean(last7Charge) ?? 0).toFixed(2)),
        stdDev: chargeStd === null ? null : Number(chargeStd.toFixed(2)),
        monotony:
          monotony7d === null ? null : Number(monotony7d.toFixed(2)),
        total: Number(last7Charge.reduce((sum, value) => sum + value, 0).toFixed(2)),
      },
    },
    fullDbSnapshot: {
      activitiesCount: allActivitiesRaw.length,
      activities: allActivitiesRaw,
    },
  };
}

function resolvePlanWeeksFromRaceDate(daysToRace: number): number | null {
  if (!Number.isFinite(daysToRace) || daysToRace < 35) {
    return null;
  }
  return Math.max(5, Math.min(18, Math.ceil(daysToRace / 7)));
}

function sendQuotaExceeded(
  reply: {
    code: (code: number) => {
      send: (payload: unknown) => unknown;
    };
  },
  quota: {
    message: string | null;
    feature: UsageFeature;
    tier: string;
    limit: number;
    used: number;
    remaining: number;
    window: "day" | "week";
    resetAt: string;
  },
) {
  return reply.code(429).send({
    message:
      quota.message ??
      "Quota atteint pour cette fonctionnalite. Essaie plus tard.",
    quota: {
      feature: quota.feature,
      tier: quota.tier,
      limit: quota.limit,
      used: quota.used,
      remaining: quota.remaining,
      window: quota.window,
      resetAt: quota.resetAt,
    },
  });
}

export const aiRoutes: FastifyPluginAsync = async (app) => {
  app.post("/analyze", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = analyzeSchema.parse(request.body);
    const user = await prisma.user.findUnique({
      where: { id: request.userId },
      select: {
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
      },
    });

    if (!user) {
      return reply.code(404).send({ message: "Utilisateur introuvable" });
    }

    const aiQuota = await consumeQuota(request.userId, UsageFeature.AI_REQUEST);
    if (!aiQuota.allowed) {
      return sendQuotaExceeded(reply, aiQuota);
    }

    const result = await analyzeSectionWithHuggingFace({
      ...body,
      profile: {
        hrMax: user.hrMax,
        age: user.age,
        weightKg: user.weightKg,
        heightCm: user.heightCm,
        goalType: user.goalType,
        goalDistanceKm: user.goalDistanceKm,
        goalTimeSec: user.goalTimeSec,
        speedUnit: user.speedUnit,
        distanceUnit: user.distanceUnit,
        elevationUnit: user.elevationUnit,
        cadenceUnit: user.cadenceUnit,
      },
    });

    return result;
  });

  app.post("/training-plan", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = trainingPlanSchema.parse(request.body);
    const todayDate = format(new Date(), "yyyy-MM-dd");
    const today = parseISO(`${todayDate}T00:00:00`);
    const raceDateObj = parseISO(`${body.raceDate}T00:00:00`);
    const daysToRace = differenceInCalendarDays(raceDateObj, today);
    const resolvedWeeks = resolvePlanWeeksFromRaceDate(daysToRace);
    if (resolvedWeeks === null) {
      return reply.code(400).send({
        message:
          "Date de course trop proche. Renseigne une course a au moins 5 semaines.",
      });
    }

    const [user, activities] = await Promise.all([
      prisma.user.findUnique({
        where: { id: request.userId },
        select: {
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
        },
      }),
      prisma.activity.findMany({
        where: {
          userId: request.userId,
          ...buildRunOnlyActivityWhere(),
        },
        orderBy: { startDateLocal: "asc" },
      }),
    ]);

    if (!user) {
      return reply.code(404).send({ message: "Utilisateur introuvable" });
    }

    const trainingPlanQuota = await consumeQuota(
      request.userId,
      UsageFeature.TRAINING_PLAN,
    );
    if (!trainingPlanQuota.allowed) {
      return sendQuotaExceeded(reply, trainingPlanQuota);
    }

    const context = buildTrainingContext(activities, user.hrMax);
    const result = await generateTrainingPlanWithHuggingFace({
      objective: body.objective,
      weeks: resolvedWeeks,
      startDate: todayDate,
      raceDate: body.raceDate,
      daysToRace,
      context: {
        objectiveFromInput: body.objective,
        raceDate: body.raceDate,
        planStartDate: todayDate,
        daysToRace,
        requestedWeeks: resolvedWeeks,
        objectiveFromSettings: {
          goalType: user.goalType,
          goalDistanceKm: user.goalDistanceKm,
          goalTimeSec: user.goalTimeSec,
        },
        ...context,
      },
      profile: {
        hrMax: user.hrMax,
        age: user.age,
        weightKg: user.weightKg,
        heightCm: user.heightCm,
        goalType: user.goalType,
        goalDistanceKm: user.goalDistanceKm,
        goalTimeSec: user.goalTimeSec,
        speedUnit: user.speedUnit,
        distanceUnit: user.distanceUnit,
        elevationUnit: user.elevationUnit,
        cadenceUnit: user.cadenceUnit,
      },
    });

    const stored = await prisma.trainingPlan.create({
      data: {
        userId: request.userId,
        title: result.title,
        goal: result.goal,
        weeks: result.weeks,
        startDate: parseISO(`${result.startDate}T00:00:00`),
        raceDate: parseISO(`${result.raceDate}T00:00:00`),
        daysToRace: result.daysToRace,
        overview: result.overview,
        methodology: result.methodology,
        warnings: result.warnings as unknown as Prisma.InputJsonValue,
        plan: result.plan as unknown as Prisma.InputJsonValue,
        sourceModel: result.model,
      },
    });

    return serializeTrainingPlanRecord(stored);
  });

  app.get(
    "/training-plan/latest",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const latest = await prisma.trainingPlan.findFirst({
        where: { userId: request.userId },
        orderBy: { updatedAt: "desc" },
      });

      if (!latest) {
        return reply.code(404).send({ message: "Aucun plan d'entrainement enregistre." });
      }

      return serializeTrainingPlanRecord(latest);
    },
  );

  app.patch(
    "/training-plan/:planId/adapt-session",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const params = trainingPlanIdParamSchema.parse(request.params);
      const body = trainingPlanAdaptSchema.parse(request.body);

      const existing = await prisma.trainingPlan.findFirst({
        where: {
          id: params.planId,
          userId: request.userId,
        },
      });

      if (!existing) {
        return reply.code(404).send({ message: "Plan introuvable." });
      }

      const parsedPlan = serializeTrainingPlanRecord(existing);
      const week = parsedPlan.plan.find((row) => row.weekIndex === body.weekIndex);
      if (!week) {
        return reply
          .code(404)
          .send({ message: `Semaine ${body.weekIndex} introuvable dans ce plan.` });
      }
      const session = week.sessions.find(
        (row) => row.sessionIndex === body.sessionIndex,
      );
      if (!session) {
        return reply.code(404).send({
          message: `Seance ${body.sessionIndex} introuvable dans la semaine ${body.weekIndex}.`,
        });
      }
      if (
        isRacePlanSession({
          title: session.title,
          zone: session.zone,
          objective: session.objective,
        })
      ) {
        return reply.code(400).send({
          message:
            "La seance course objectif est verrouillee. Adapte uniquement les 3 seances d'entrainement de la semaine finale.",
        });
      }

      const [user, activities] = await Promise.all([
        prisma.user.findUnique({
          where: { id: request.userId },
          select: {
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
          },
        }),
        prisma.activity.findMany({
          where: {
            userId: request.userId,
            ...buildRunOnlyActivityWhere(),
          },
          orderBy: { startDateLocal: "asc" },
        }),
      ]);

      if (!user) {
        return reply.code(404).send({ message: "Utilisateur introuvable" });
      }

      const context = buildTrainingContext(activities, user.hrMax);
      const siblingSessions = week.sessions.filter(
        (row) => row.sessionIndex !== session.sessionIndex,
      ) as TrainingPlanSession[];
      const aiQuota = await consumeQuota(request.userId, UsageFeature.AI_REQUEST);
      if (!aiQuota.allowed) {
        return sendQuotaExceeded(reply, aiQuota);
      }
      const adapted = await adaptTrainingSessionWithHuggingFace({
        objective: parsedPlan.goal,
        startDate: parsedPlan.startDate,
        raceDate: parsedPlan.raceDate,
        daysToRace: parsedPlan.daysToRace,
        weekIndex: week.weekIndex,
        sessionIndex: session.sessionIndex,
        targetSession: session as TrainingPlanSession,
        siblingSessions,
        userRequest: body.request,
        context: {
          ...context,
          adaptation: {
            weekIndex: week.weekIndex,
            sessionIndex: session.sessionIndex,
            userRequest: body.request,
            sessionToAdapt: session,
            siblingSessions,
          },
          existingPlan: parsedPlan.plan,
        },
        profile: {
          hrMax: user.hrMax,
          age: user.age,
          weightKg: user.weightKg,
          heightCm: user.heightCm,
          goalType: user.goalType,
          goalDistanceKm: user.goalDistanceKm,
          goalTimeSec: user.goalTimeSec,
          speedUnit: user.speedUnit,
          distanceUnit: user.distanceUnit,
          elevationUnit: user.elevationUnit,
          cadenceUnit: user.cadenceUnit,
        },
      });

      const nextPlan: TrainingPlanWeek[] = parsedPlan.plan.map((planWeek) => {
        if (planWeek.weekIndex !== body.weekIndex) {
          return planWeek as TrainingPlanWeek;
        }
        const nextSessions = planWeek.sessions.map((planSession) => {
          if (planSession.sessionIndex !== body.sessionIndex) {
            return planSession as TrainingPlanSession;
          }
          return adapted.session;
        }) as TrainingPlanSession[];

        const weeklyVolumeKm = Number(
          nextSessions.reduce((sum, row) => sum + row.distanceKm, 0).toFixed(1),
        );

        return {
          ...planWeek,
          weeklyVolumeKm,
          sessions: nextSessions,
        } satisfies TrainingPlanWeek;
      });

      const raceDateObj = parseISO(`${parsedPlan.raceDate}T00:00:00`);
      const todayDate = format(new Date(), "yyyy-MM-dd");
      const todayObj = parseISO(`${todayDate}T00:00:00`);
      const updatedDaysToRace = differenceInCalendarDays(raceDateObj, todayObj);

      const updated = await prisma.trainingPlan.update({
        where: { id: existing.id },
        data: {
          plan: nextPlan as unknown as Prisma.InputJsonValue,
          sourceModel: adapted.model,
          daysToRace: updatedDaysToRace,
        },
      });

      return serializeTrainingPlanRecord(updated);
    },
  );

  app.post(
    "/training-plan/create-sessions",
    { preHandler: [app.authenticate] },
    async (request) => {
      const body = trainingPlanCommitSchema.parse(request.body);
      const latest = await prisma.activity.findFirst({
        where: {
          userId: request.userId,
          ...buildRunOnlyActivityWhere(),
        },
        orderBy: { startDateLocal: "desc" },
        select: { timezone: true },
      });
      const timezone = latest?.timezone ?? "UTC";
      const startBase = parseISO(`${body.trainingPlan.startDate}T06:30:00`);
      if (Number.isNaN(startBase.getTime())) {
        throw new Error("Date de debut invalide pour la creation des seances.");
      }
      const mondayAnchor = startOfWeek(startBase, { weekStartsOn: 1 });
      const dayOffset: Record<z.infer<typeof trainingDaySchema>, number> = {
        Mon: 0,
        Tue: 1,
        Wed: 2,
        Thu: 3,
        Fri: 4,
        Sat: 5,
        Sun: 6,
      };

      const rows = body.trainingPlan.plan.flatMap((week) =>
        week.sessions
          .filter((session) => !isRacePlanSession(session))
          .map((session, sessionIdx) => {
          const activityDate = addDays(
            mondayAnchor,
            (week.weekIndex - 1) * 7 + dayOffset[session.day],
          );
          activityDate.setHours(6 + sessionIdx, 30, 0, 0);

          const movingTimeSec = Math.max(20 * 60, Math.round(session.durationMin * 60));
          const distanceMeters = Math.max(1000, Math.round(session.distanceKm * 1000));
          const avgSpeed = distanceMeters / movingTimeSec;
          const maxSpeed = Math.max(avgSpeed * 1.18, avgSpeed + 0.2);
          const idHash = createHash("sha1")
            .update(
              [
                request.userId,
                body.trainingPlan.startDate,
                week.weekIndex,
                session.day,
                session.title,
                distanceMeters,
                movingTimeSec,
              ].join("|"),
            )
            .digest("hex")
            .slice(0, 20);
          const stravaActivityId = `planned-${idHash}`;

          return {
            stravaActivityId,
            data: {
              userId: request.userId,
              stravaActivityId,
              name: `[PLAN W${week.weekIndex}] ${session.title}`,
              type: "Run",
              sportType: "Run",
              startDate: activityDate,
              startDateLocal: activityDate,
              timezone,
              distance: distanceMeters,
              movingTime: movingTimeSec,
              elapsedTime: movingTimeSec,
              totalElevationGain: 0,
              averageSpeed: avgSpeed,
              maxSpeed,
              averageHeartrate: null,
              maxHeartrate: null,
              averageWatts: null,
              maxWatts: null,
              weightedAverageWatts: null,
              kilojoules: null,
              calories: null,
              averageCadence: null,
              strideLength: null,
              groundContactTime: null,
              verticalOscillation: null,
              sufferScore: null,
              trainer: false,
              commute: false,
              manual: true,
              hasHeartrate: false,
              },
            };
          }),
      );

      const ids = rows.map((row) => row.stravaActivityId);
      const existingRows = await prisma.activity.findMany({
        where: {
          userId: request.userId,
          stravaActivityId: { in: ids },
        },
        select: { stravaActivityId: true },
      });
      const existingSet = new Set(existingRows.map((row) => row.stravaActivityId));

      await prisma.$transaction(
        rows.map((row) =>
          prisma.activity.upsert({
            where: { stravaActivityId: row.stravaActivityId },
            update: row.data,
            create: row.data,
          }),
        ),
      );

      return {
        total: rows.length,
        created: rows.length - existingSet.size,
        updated: existingSet.size,
        timezone,
      };
    },
  );
};
