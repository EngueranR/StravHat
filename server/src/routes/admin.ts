import { Prisma, SubscriptionTier, UsageFeature } from "@prisma/client";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { getConfiguredAdminEmails } from "../services/adminPolicy.js";
import { logSecurityEvent } from "../services/securityAudit.js";
import { getPlanLimits, planDisplayName, planTagline } from "../services/subscription.js";
import { normalizeEmail } from "../utils/security.js";

const usersQuerySchema = z.object({
  q: z.string().trim().max(160).optional(),
  status: z.enum(["all", "pending", "approved", "banned"]).default("all"),
  tier: z.enum(["all", "FREE", "SUPPORTER"]).default("all"),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

const userParamsSchema = z.object({
  userId: z.string().min(1).max(120),
});

const userUpdateSchema = z
  .object({
    isApproved: z.boolean().optional(),
    isBanned: z.boolean().optional(),
    bannedReason: z.string().trim().max(280).nullable().optional(),
    subscriptionTier: z.nativeEnum(SubscriptionTier).optional(),
    isAdmin: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.isApproved !== undefined ||
      value.isBanned !== undefined ||
      value.bannedReason !== undefined ||
      value.subscriptionTier !== undefined ||
      value.isAdmin !== undefined,
    { message: "Aucune modification demandee." },
  );

const securityEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  eventType: z.string().trim().max(120).optional(),
  userId: z.string().trim().max(120).optional(),
});

const adminDbTableKeys = [
  "users",
  "stravaTokens",
  "activities",
  "trainingPlans",
  "chartSnapshots",
  "securityEvents",
  "usageCounters",
] as const;
type AdminDbTableKey = (typeof adminDbTableKeys)[number];
const adminDbTableKeySchema = z.enum(adminDbTableKeys);

const adminDbTableParamsSchema = z.object({
  table: adminDbTableKeySchema,
});

const adminDbRowParamsSchema = adminDbTableParamsSchema.extend({
  rowId: z.string().min(1).max(120),
});

const adminDbRowsQuerySchema = z.object({
  q: z.string().trim().max(160).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const adminDbPatchBodySchema = z.object({
  changes: z.record(z.unknown()),
});

const dateTimeInputSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Date invalide, format ISO attendu.",
  });

const userDbEditableFields = [
  "email",
  "isApproved",
  "subscriptionTier",
  "language",
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
] as const;

const activityDbEditableFields = [
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
] as const;

const trainingPlanDbEditableFields = [
  "title",
  "goal",
  "weeks",
  "startDate",
  "raceDate",
  "daysToRace",
  "overview",
  "methodology",
  "sourceModel",
] as const;

const usageCounterDbEditableFields = ["feature", "bucketStart", "count"] as const;

const adminDbUserUpdateSchema = z
  .object({
    email: z.string().trim().email().max(320).optional(),
    isApproved: z.boolean().optional(),
    subscriptionTier: z.nativeEnum(SubscriptionTier).optional(),
    language: z.enum(["fr", "en"]).optional(),
    hrMax: z.number().int().min(120).max(260).optional(),
    age: z.number().int().min(10).max(120).nullable().optional(),
    weightKg: z.number().min(30).max(250).nullable().optional(),
    heightCm: z.number().min(120).max(230).nullable().optional(),
    goalType: z.enum(["marathon", "half_marathon", "10k", "5k", "custom"]).nullable().optional(),
    goalDistanceKm: z.number().min(1).max(1000).nullable().optional(),
    goalTimeSec: z.number().int().min(60).max(864_000).nullable().optional(),
    speedUnit: z.enum(["kmh", "pace_km", "pace_mi"]).optional(),
    distanceUnit: z.enum(["km", "mi"]).optional(),
    elevationUnit: z.enum(["m", "ft"]).optional(),
    cadenceUnit: z.enum(["rpm", "ppm", "spm"]).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "Aucune modification demandee." });

const adminDbActivityUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(220).optional(),
    type: z.string().trim().min(1).max(80).optional(),
    sportType: z.string().trim().min(1).max(80).optional(),
    startDate: dateTimeInputSchema.optional(),
    startDateLocal: dateTimeInputSchema.optional(),
    timezone: z.string().trim().min(1).max(120).optional(),
    distance: z.number().min(0).max(400_000).optional(),
    movingTime: z.number().int().min(0).max(1_000_000).optional(),
    elapsedTime: z.number().int().min(0).max(1_000_000).optional(),
    totalElevationGain: z.number().min(-500).max(50_000).optional(),
    averageSpeed: z.number().min(0).max(50).optional(),
    maxSpeed: z.number().min(0).max(60).optional(),
    averageHeartrate: z.number().min(20).max(260).nullable().optional(),
    maxHeartrate: z.number().min(20).max(260).nullable().optional(),
    averageWatts: z.number().min(0).max(3_500).nullable().optional(),
    maxWatts: z.number().min(0).max(5_500).nullable().optional(),
    weightedAverageWatts: z.number().min(0).max(3_500).nullable().optional(),
    kilojoules: z.number().min(0).max(200_000).nullable().optional(),
    calories: z.number().min(0).max(50_000).nullable().optional(),
    averageCadence: z.number().min(0).max(400).nullable().optional(),
    strideLength: z.number().min(0).max(6).nullable().optional(),
    groundContactTime: z.number().min(0).max(1_000).nullable().optional(),
    verticalOscillation: z.number().min(0).max(100).nullable().optional(),
    sufferScore: z.number().min(0).max(2_000).nullable().optional(),
    trainer: z.boolean().optional(),
    commute: z.boolean().optional(),
    manual: z.boolean().optional(),
    hasHeartrate: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "Aucune modification demandee." });

const adminDbTrainingPlanUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(220).optional(),
    goal: z.string().trim().min(1).max(300).optional(),
    weeks: z.number().int().min(1).max(104).optional(),
    startDate: dateTimeInputSchema.optional(),
    raceDate: dateTimeInputSchema.optional(),
    daysToRace: z.number().int().min(1).max(1_500).optional(),
    overview: z.string().trim().min(1).max(20_000).optional(),
    methodology: z.string().trim().min(1).max(20_000).optional(),
    sourceModel: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "Aucune modification demandee." });

const adminDbUsageCounterUpdateSchema = z
  .object({
    feature: z.nativeEnum(UsageFeature).optional(),
    bucketStart: dateTimeInputSchema.optional(),
    count: z.number().int().min(0).max(1_000_000).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "Aucune modification demandee." });

const adminDbUserSelect = {
  id: true,
  email: true,
  isAdmin: true,
  isApproved: true,
  bannedAt: true,
  bannedReason: true,
  failedLoginAttempts: true,
  lockedUntil: true,
  lastLoginAt: true,
  tokenVersion: true,
  stravaClientIdEnc: true,
  stravaClientSecretEnc: true,
  stravaRedirectUriEnc: true,
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
  language: true,
  subscriptionTier: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const adminDbStravaTokenSelect = {
  id: true,
  userId: true,
  accessToken: true,
  refreshToken: true,
  oauthClientIdEnc: true,
  oauthClientSecretEnc: true,
  expiresAt: true,
  updatedAt: true,
} satisfies Prisma.StravaTokenSelect;

const adminDbActivitySelect = {
  id: true,
  userId: true,
  stravaActivityId: true,
  name: true,
  type: true,
  sportType: true,
  startDate: true,
  startDateLocal: true,
  timezone: true,
  distance: true,
  movingTime: true,
  elapsedTime: true,
  totalElevationGain: true,
  averageSpeed: true,
  maxSpeed: true,
  averageHeartrate: true,
  maxHeartrate: true,
  averageWatts: true,
  maxWatts: true,
  weightedAverageWatts: true,
  kilojoules: true,
  calories: true,
  averageCadence: true,
  strideLength: true,
  groundContactTime: true,
  verticalOscillation: true,
  sufferScore: true,
  trainer: true,
  commute: true,
  manual: true,
  hasHeartrate: true,
  importedAt: true,
  updatedAt: true,
} satisfies Prisma.ActivitySelect;

const adminDbTrainingPlanSelect = {
  id: true,
  userId: true,
  title: true,
  goal: true,
  weeks: true,
  startDate: true,
  raceDate: true,
  daysToRace: true,
  overview: true,
  methodology: true,
  warnings: true,
  plan: true,
  sourceModel: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TrainingPlanSelect;

const adminDbChartSnapshotSelect = {
  id: true,
  userId: true,
  chartType: true,
  filterHash: true,
  payload: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ChartSnapshotSelect;

const adminDbSecurityEventSelect = {
  id: true,
  userId: true,
  eventType: true,
  success: true,
  ipHash: true,
  metadata: true,
  createdAt: true,
} satisfies Prisma.SecurityEventSelect;

const adminDbUsageCounterSelect = {
  id: true,
  userId: true,
  feature: true,
  bucketStart: true,
  count: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UsageCounterSelect;

type AdminDbUserRow = Prisma.UserGetPayload<{ select: typeof adminDbUserSelect }>;
type AdminDbStravaTokenRow = Prisma.StravaTokenGetPayload<{ select: typeof adminDbStravaTokenSelect }>;
type AdminDbActivityRow = Prisma.ActivityGetPayload<{ select: typeof adminDbActivitySelect }>;
type AdminDbTrainingPlanRow = Prisma.TrainingPlanGetPayload<{ select: typeof adminDbTrainingPlanSelect }>;
type AdminDbChartSnapshotRow = Prisma.ChartSnapshotGetPayload<{ select: typeof adminDbChartSnapshotSelect }>;
type AdminDbSecurityEventRow = Prisma.SecurityEventGetPayload<{ select: typeof adminDbSecurityEventSelect }>;
type AdminDbUsageCounterRow = Prisma.UsageCounterGetPayload<{ select: typeof adminDbUsageCounterSelect }>;

const adminDbTableMeta: Record<
  AdminDbTableKey,
  {
    label: string;
    description: string;
    readOnly: boolean;
    editableFields: readonly string[];
  }
> = {
  users: {
    label: "Utilisateurs",
    description: "Comptes, preferences et niveau d'abonnement.",
    readOnly: false,
    editableFields: userDbEditableFields,
  },
  stravaTokens: {
    label: "Tokens Strava",
    description: "Etat des tokens OAuth (valeurs sensibles masquees).",
    readOnly: true,
    editableFields: [],
  },
  activities: {
    label: "Activites",
    description: "Seances importees depuis Strava.",
    readOnly: false,
    editableFields: activityDbEditableFields,
  },
  trainingPlans: {
    label: "Plans d'entrainement",
    description: "Plans IA sauvegardes par utilisateur.",
    readOnly: false,
    editableFields: trainingPlanDbEditableFields,
  },
  chartSnapshots: {
    label: "Snapshots analytics",
    description: "Caches des graphiques et vues analytics.",
    readOnly: true,
    editableFields: [],
  },
  securityEvents: {
    label: "Journal securite",
    description: "Evenements de securite et traces d'auth.",
    readOnly: true,
    editableFields: [],
  },
  usageCounters: {
    label: "Compteurs quota",
    description: "Compteurs des limites import / IA / plan.",
    readOnly: false,
    editableFields: usageCounterDbEditableFields,
  },
};

function toAdminDbUserRow(row: AdminDbUserRow) {
  return {
    id: row.id,
    email: row.email,
    isAdmin: row.isAdmin,
    isApproved: row.isApproved,
    bannedAt: row.bannedAt,
    bannedReason: row.bannedReason,
    failedLoginAttempts: row.failedLoginAttempts,
    lockedUntil: row.lockedUntil,
    lastLoginAt: row.lastLoginAt,
    tokenVersion: row.tokenVersion,
    stravaAthleteId: row.stravaAthleteId,
    hasCustomStravaCredentials:
      row.stravaClientIdEnc !== null ||
      row.stravaClientSecretEnc !== null ||
      row.stravaRedirectUriEnc !== null,
    hrMax: row.hrMax,
    age: row.age,
    weightKg: row.weightKg,
    heightCm: row.heightCm,
    goalType: row.goalType,
    goalDistanceKm: row.goalDistanceKm,
    goalTimeSec: row.goalTimeSec,
    speedUnit: row.speedUnit,
    distanceUnit: row.distanceUnit,
    elevationUnit: row.elevationUnit,
    cadenceUnit: row.cadenceUnit,
    language: row.language,
    subscriptionTier: row.subscriptionTier,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  } as Record<string, unknown>;
}

function toAdminDbStravaTokenRow(row: AdminDbStravaTokenRow) {
  return {
    id: row.id,
    userId: row.userId,
    hasAccessToken: row.accessToken.length > 0,
    hasRefreshToken: row.refreshToken.length > 0,
    hasCustomOauthClientId: row.oauthClientIdEnc !== null,
    hasCustomOauthClientSecret: row.oauthClientSecretEnc !== null,
    expiresAt: row.expiresAt,
    updatedAt: row.updatedAt,
  } as Record<string, unknown>;
}

function toAdminDbActivityRow(row: AdminDbActivityRow) {
  return row as unknown as Record<string, unknown>;
}

function toAdminDbTrainingPlanRow(row: AdminDbTrainingPlanRow) {
  return row as unknown as Record<string, unknown>;
}

function toAdminDbChartSnapshotRow(row: AdminDbChartSnapshotRow) {
  return row as unknown as Record<string, unknown>;
}

function toAdminDbSecurityEventRow(row: AdminDbSecurityEventRow) {
  return row as unknown as Record<string, unknown>;
}

function toAdminDbUsageCounterRow(row: AdminDbUsageCounterRow) {
  return row as unknown as Record<string, unknown>;
}

async function countAdminDbRows(table: AdminDbTableKey) {
  switch (table) {
    case "users":
      return prisma.user.count();
    case "stravaTokens":
      return prisma.stravaToken.count();
    case "activities":
      return prisma.activity.count();
    case "trainingPlans":
      return prisma.trainingPlan.count();
    case "chartSnapshots":
      return prisma.chartSnapshot.count();
    case "securityEvents":
      return prisma.securityEvent.count();
    case "usageCounters":
      return prisma.usageCounter.count();
  }
}

async function listAdminDbRows(
  table: AdminDbTableKey,
  query: z.infer<typeof adminDbRowsQuerySchema>,
) {
  switch (table) {
    case "users": {
      const where: Prisma.UserWhereInput = {};
      if (query.q) {
        where.OR = [
          { id: { contains: query.q } },
          { email: { contains: query.q, mode: "insensitive" } },
        ];
      }
      const [total, rows] = await Promise.all([
        prisma.user.count({ where }),
        prisma.user.findMany({
          where,
          select: adminDbUserSelect,
          orderBy: { createdAt: "desc" },
          take: query.limit,
          skip: query.offset,
        }),
      ]);
      return {
        total,
        items: rows.map(toAdminDbUserRow),
      };
    }
    case "stravaTokens": {
      const where: Prisma.StravaTokenWhereInput = {};
      if (query.q) {
        where.OR = [{ id: { contains: query.q } }, { userId: { contains: query.q } }];
      }
      const [total, rows] = await Promise.all([
        prisma.stravaToken.count({ where }),
        prisma.stravaToken.findMany({
          where,
          select: adminDbStravaTokenSelect,
          orderBy: { updatedAt: "desc" },
          take: query.limit,
          skip: query.offset,
        }),
      ]);
      return {
        total,
        items: rows.map(toAdminDbStravaTokenRow),
      };
    }
    case "activities": {
      const where: Prisma.ActivityWhereInput = {};
      if (query.q) {
        where.OR = [
          { id: { contains: query.q } },
          { userId: { contains: query.q } },
          { stravaActivityId: { contains: query.q } },
          { name: { contains: query.q, mode: "insensitive" } },
          { type: { contains: query.q, mode: "insensitive" } },
          { sportType: { contains: query.q, mode: "insensitive" } },
        ];
      }
      const [total, rows] = await Promise.all([
        prisma.activity.count({ where }),
        prisma.activity.findMany({
          where,
          select: adminDbActivitySelect,
          orderBy: { startDate: "desc" },
          take: query.limit,
          skip: query.offset,
        }),
      ]);
      return {
        total,
        items: rows.map(toAdminDbActivityRow),
      };
    }
    case "trainingPlans": {
      const where: Prisma.TrainingPlanWhereInput = {};
      if (query.q) {
        where.OR = [
          { id: { contains: query.q } },
          { userId: { contains: query.q } },
          { title: { contains: query.q, mode: "insensitive" } },
          { goal: { contains: query.q, mode: "insensitive" } },
        ];
      }
      const [total, rows] = await Promise.all([
        prisma.trainingPlan.count({ where }),
        prisma.trainingPlan.findMany({
          where,
          select: adminDbTrainingPlanSelect,
          orderBy: { updatedAt: "desc" },
          take: query.limit,
          skip: query.offset,
        }),
      ]);
      return {
        total,
        items: rows.map(toAdminDbTrainingPlanRow),
      };
    }
    case "chartSnapshots": {
      const where: Prisma.ChartSnapshotWhereInput = {};
      if (query.q) {
        where.OR = [
          { id: { contains: query.q } },
          { userId: { contains: query.q } },
          { chartType: { contains: query.q, mode: "insensitive" } },
          { filterHash: { contains: query.q } },
        ];
      }
      const [total, rows] = await Promise.all([
        prisma.chartSnapshot.count({ where }),
        prisma.chartSnapshot.findMany({
          where,
          select: adminDbChartSnapshotSelect,
          orderBy: { updatedAt: "desc" },
          take: query.limit,
          skip: query.offset,
        }),
      ]);
      return {
        total,
        items: rows.map(toAdminDbChartSnapshotRow),
      };
    }
    case "securityEvents": {
      const where: Prisma.SecurityEventWhereInput = {};
      if (query.q) {
        where.OR = [
          { id: { contains: query.q } },
          { userId: { contains: query.q } },
          { eventType: { contains: query.q, mode: "insensitive" } },
        ];
      }
      const [total, rows] = await Promise.all([
        prisma.securityEvent.count({ where }),
        prisma.securityEvent.findMany({
          where,
          select: adminDbSecurityEventSelect,
          orderBy: { createdAt: "desc" },
          take: query.limit,
          skip: query.offset,
        }),
      ]);
      return {
        total,
        items: rows.map(toAdminDbSecurityEventRow),
      };
    }
    case "usageCounters": {
      const where: Prisma.UsageCounterWhereInput = {};
      if (query.q) {
        const normalizedFeature =
          query.q === UsageFeature.AI_REQUEST ||
          query.q === UsageFeature.STRAVA_IMPORT ||
          query.q === UsageFeature.TRAINING_PLAN ?
            query.q
          : null;
        const orFilters: Prisma.UsageCounterWhereInput[] = [
          { id: { contains: query.q } },
          { userId: { contains: query.q } },
        ];
        if (normalizedFeature) {
          orFilters.push({ feature: normalizedFeature });
        }
        where.OR = orFilters;
      }
      const [total, rows] = await Promise.all([
        prisma.usageCounter.count({ where }),
        prisma.usageCounter.findMany({
          where,
          select: adminDbUsageCounterSelect,
          orderBy: { bucketStart: "desc" },
          take: query.limit,
          skip: query.offset,
        }),
      ]);
      return {
        total,
        items: rows.map(toAdminDbUsageCounterRow),
      };
    }
  }
}

async function getAdminDbRowById(table: AdminDbTableKey, rowId: string) {
  switch (table) {
    case "users": {
      const row = await prisma.user.findUnique({
        where: { id: rowId },
        select: adminDbUserSelect,
      });
      return row ? toAdminDbUserRow(row) : null;
    }
    case "stravaTokens": {
      const row = await prisma.stravaToken.findUnique({
        where: { id: rowId },
        select: adminDbStravaTokenSelect,
      });
      return row ? toAdminDbStravaTokenRow(row) : null;
    }
    case "activities": {
      const row = await prisma.activity.findUnique({
        where: { id: rowId },
        select: adminDbActivitySelect,
      });
      return row ? toAdminDbActivityRow(row) : null;
    }
    case "trainingPlans": {
      const row = await prisma.trainingPlan.findUnique({
        where: { id: rowId },
        select: adminDbTrainingPlanSelect,
      });
      return row ? toAdminDbTrainingPlanRow(row) : null;
    }
    case "chartSnapshots": {
      const row = await prisma.chartSnapshot.findUnique({
        where: { id: rowId },
        select: adminDbChartSnapshotSelect,
      });
      return row ? toAdminDbChartSnapshotRow(row) : null;
    }
    case "securityEvents": {
      const row = await prisma.securityEvent.findUnique({
        where: { id: rowId },
        select: adminDbSecurityEventSelect,
      });
      return row ? toAdminDbSecurityEventRow(row) : null;
    }
    case "usageCounters": {
      const row = await prisma.usageCounter.findUnique({
        where: { id: rowId },
        select: adminDbUsageCounterSelect,
      });
      return row ? toAdminDbUsageCounterRow(row) : null;
    }
  }
}

function createClientError(message: string) {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = 400;
  return error;
}

async function updateAdminDbRow(input: {
  table: AdminDbTableKey;
  rowId: string;
  actorUserId: string;
  changes: Record<string, unknown>;
}) {
  if (input.table === "users") {
    const changes = adminDbUserUpdateSchema.parse(input.changes);
    if (input.rowId === input.actorUserId && changes.isApproved === false) {
      throw createClientError(
        "Tu ne peux pas retirer ta propre whitelist depuis l'editeur DB.",
      );
    }

    const data: Prisma.UserUpdateInput = {};
    if (changes.email !== undefined) {
      data.email = normalizeEmail(changes.email);
    }
    if (changes.isApproved !== undefined) {
      data.isApproved = changes.isApproved;
    }
    if (changes.subscriptionTier !== undefined) {
      data.subscriptionTier = changes.subscriptionTier;
    }
    if (changes.language !== undefined) {
      data.language = changes.language;
    }
    if (changes.hrMax !== undefined) {
      data.hrMax = changes.hrMax;
    }
    if (changes.age !== undefined) {
      data.age = changes.age;
    }
    if (changes.weightKg !== undefined) {
      data.weightKg = changes.weightKg;
    }
    if (changes.heightCm !== undefined) {
      data.heightCm = changes.heightCm;
    }
    if (changes.goalType !== undefined) {
      data.goalType = changes.goalType;
    }
    if (changes.goalDistanceKm !== undefined) {
      data.goalDistanceKm = changes.goalDistanceKm;
    }
    if (changes.goalTimeSec !== undefined) {
      data.goalTimeSec = changes.goalTimeSec;
    }
    if (changes.speedUnit !== undefined) {
      data.speedUnit = changes.speedUnit;
    }
    if (changes.distanceUnit !== undefined) {
      data.distanceUnit = changes.distanceUnit;
    }
    if (changes.elevationUnit !== undefined) {
      data.elevationUnit = changes.elevationUnit;
    }
    if (changes.cadenceUnit !== undefined) {
      data.cadenceUnit = changes.cadenceUnit;
    }

    const row = await prisma.user.update({
      where: { id: input.rowId },
      data,
      select: adminDbUserSelect,
    });
    return {
      row: toAdminDbUserRow(row),
      changedFields: Object.keys(changes),
    };
  }

  if (input.table === "activities") {
    const changes = adminDbActivityUpdateSchema.parse(input.changes);
    const data: Prisma.ActivityUpdateInput = {};

    if (changes.name !== undefined) {
      data.name = changes.name;
    }
    if (changes.type !== undefined) {
      data.type = changes.type;
    }
    if (changes.sportType !== undefined) {
      data.sportType = changes.sportType;
    }
    if (changes.startDate !== undefined) {
      data.startDate = new Date(changes.startDate);
    }
    if (changes.startDateLocal !== undefined) {
      data.startDateLocal = new Date(changes.startDateLocal);
    }
    if (changes.timezone !== undefined) {
      data.timezone = changes.timezone;
    }
    if (changes.distance !== undefined) {
      data.distance = changes.distance;
    }
    if (changes.movingTime !== undefined) {
      data.movingTime = changes.movingTime;
    }
    if (changes.elapsedTime !== undefined) {
      data.elapsedTime = changes.elapsedTime;
    }
    if (changes.totalElevationGain !== undefined) {
      data.totalElevationGain = changes.totalElevationGain;
    }
    if (changes.averageSpeed !== undefined) {
      data.averageSpeed = changes.averageSpeed;
    }
    if (changes.maxSpeed !== undefined) {
      data.maxSpeed = changes.maxSpeed;
    }
    if (changes.averageHeartrate !== undefined) {
      data.averageHeartrate = changes.averageHeartrate;
    }
    if (changes.maxHeartrate !== undefined) {
      data.maxHeartrate = changes.maxHeartrate;
    }
    if (changes.averageWatts !== undefined) {
      data.averageWatts = changes.averageWatts;
    }
    if (changes.maxWatts !== undefined) {
      data.maxWatts = changes.maxWatts;
    }
    if (changes.weightedAverageWatts !== undefined) {
      data.weightedAverageWatts = changes.weightedAverageWatts;
    }
    if (changes.kilojoules !== undefined) {
      data.kilojoules = changes.kilojoules;
    }
    if (changes.calories !== undefined) {
      data.calories = changes.calories;
    }
    if (changes.averageCadence !== undefined) {
      data.averageCadence = changes.averageCadence;
    }
    if (changes.strideLength !== undefined) {
      data.strideLength = changes.strideLength;
    }
    if (changes.groundContactTime !== undefined) {
      data.groundContactTime = changes.groundContactTime;
    }
    if (changes.verticalOscillation !== undefined) {
      data.verticalOscillation = changes.verticalOscillation;
    }
    if (changes.sufferScore !== undefined) {
      data.sufferScore = changes.sufferScore;
    }
    if (changes.trainer !== undefined) {
      data.trainer = changes.trainer;
    }
    if (changes.commute !== undefined) {
      data.commute = changes.commute;
    }
    if (changes.manual !== undefined) {
      data.manual = changes.manual;
    }
    if (changes.hasHeartrate !== undefined) {
      data.hasHeartrate = changes.hasHeartrate;
    }

    const row = await prisma.activity.update({
      where: { id: input.rowId },
      data,
      select: adminDbActivitySelect,
    });

    return {
      row: toAdminDbActivityRow(row),
      changedFields: Object.keys(changes),
    };
  }

  if (input.table === "trainingPlans") {
    const changes = adminDbTrainingPlanUpdateSchema.parse(input.changes);
    const data: Prisma.TrainingPlanUpdateInput = {};

    if (changes.title !== undefined) {
      data.title = changes.title;
    }
    if (changes.goal !== undefined) {
      data.goal = changes.goal;
    }
    if (changes.weeks !== undefined) {
      data.weeks = changes.weeks;
    }
    if (changes.startDate !== undefined) {
      data.startDate = new Date(changes.startDate);
    }
    if (changes.raceDate !== undefined) {
      data.raceDate = new Date(changes.raceDate);
    }
    if (changes.daysToRace !== undefined) {
      data.daysToRace = changes.daysToRace;
    }
    if (changes.overview !== undefined) {
      data.overview = changes.overview;
    }
    if (changes.methodology !== undefined) {
      data.methodology = changes.methodology;
    }
    if (changes.sourceModel !== undefined) {
      data.sourceModel = changes.sourceModel;
    }

    const row = await prisma.trainingPlan.update({
      where: { id: input.rowId },
      data,
      select: adminDbTrainingPlanSelect,
    });

    return {
      row: toAdminDbTrainingPlanRow(row),
      changedFields: Object.keys(changes),
    };
  }

  if (input.table === "usageCounters") {
    const changes = adminDbUsageCounterUpdateSchema.parse(input.changes);
    const data: Prisma.UsageCounterUpdateInput = {};

    if (changes.feature !== undefined) {
      data.feature = changes.feature;
    }
    if (changes.bucketStart !== undefined) {
      data.bucketStart = new Date(changes.bucketStart);
    }
    if (changes.count !== undefined) {
      data.count = changes.count;
    }

    const row = await prisma.usageCounter.update({
      where: { id: input.rowId },
      data,
      select: adminDbUsageCounterSelect,
    });

    return {
      row: toAdminDbUsageCounterRow(row),
      changedFields: Object.keys(changes),
    };
  }

  throw createClientError("Table en lecture seule.");
}

function startOfUtcDay(date = new Date()) {
  const result = new Date(date);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

function startOfUtcIsoWeek(date = new Date()) {
  const dayStart = startOfUtcDay(date);
  const dayOfWeek = dayStart.getUTCDay();
  const isoOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  dayStart.setUTCDate(dayStart.getUTCDate() - isoOffset);
  return dayStart;
}

function dayKeyUtc(date: Date) {
  return date.toISOString().slice(0, 10);
}

function mapPlan(tier: SubscriptionTier, isAdmin = false) {
  return {
    tier,
    name: planDisplayName(tier, isAdmin),
    tagline: planTagline(tier, isAdmin),
    limits: getPlanLimits(tier, isAdmin),
  };
}

function adminGuard(request: FastifyRequest, reply: FastifyReply) {
  if (!request.userIsAdmin) {
    return reply.code(403).send({ message: "Acces administrateur requis." });
  }
  return null;
}

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/overview",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const denied = adminGuard(request, reply);
      if (denied) {
        return denied;
      }

      const now = new Date();
      const dayStart = startOfUtcDay(now);
      const nextDay = new Date(dayStart);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      const weekStart = startOfUtcIsoWeek(now);
      const nextWeek = new Date(weekStart);
      nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
      const fourteenDaysAgo = new Date(dayStart);
      fourteenDaysAgo.setUTCDate(fourteenDaysAgo.getUTCDate() - 13);
      const loginWindow24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const loginWindow7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [
        totalUsers,
        approvedUsers,
        pendingUsersCount,
        bannedUsersCount,
        adminUsersCount,
        supporterUsersCount,
        connectedToStravaCount,
        activeUsers24h,
        activeUsers7d,
        activitiesCount,
        trainingPlansCount,
        chartSnapshotsCount,
        securityEventsCount,
        signupRows,
        loginRows,
        pendingUsers,
        recentBans,
        recentSecurityEvents,
        usageTodayByFeatureRows,
        usageWeekByFeatureRows,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { isApproved: true, bannedAt: null } }),
        prisma.user.count({ where: { isApproved: false, bannedAt: null } }),
        prisma.user.count({ where: { bannedAt: { not: null } } }),
        prisma.user.count({ where: { isAdmin: true } }),
        prisma.user.count({ where: { subscriptionTier: SubscriptionTier.SUPPORTER } }),
        prisma.user.count({ where: { token: { isNot: null } } }),
        prisma.user.count({
          where: {
            lastLoginAt: { gte: loginWindow24h },
            bannedAt: null,
          },
        }),
        prisma.user.count({
          where: {
            lastLoginAt: { gte: loginWindow7d },
            bannedAt: null,
          },
        }),
        prisma.activity.count(),
        prisma.trainingPlan.count(),
        prisma.chartSnapshot.count(),
        prisma.securityEvent.count(),
        prisma.user.findMany({
          where: {
            createdAt: { gte: fourteenDaysAgo },
          },
          select: { createdAt: true },
        }),
        prisma.user.findMany({
          where: {
            lastLoginAt: { not: null, gte: fourteenDaysAgo },
          },
          select: { lastLoginAt: true },
        }),
        prisma.user.findMany({
          where: {
            isApproved: false,
            bannedAt: null,
          },
          select: {
            id: true,
            email: true,
            createdAt: true,
            subscriptionTier: true,
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
        prisma.user.findMany({
          where: {
            bannedAt: { not: null },
          },
          select: {
            id: true,
            email: true,
            bannedAt: true,
            bannedReason: true,
          },
          orderBy: { bannedAt: "desc" },
          take: 20,
        }),
        prisma.securityEvent.findMany({
          orderBy: { createdAt: "desc" },
          take: 25,
          select: {
            id: true,
            userId: true,
            eventType: true,
            success: true,
            createdAt: true,
          },
        }),
        prisma.usageCounter.groupBy({
          by: ["feature"],
          where: {
            bucketStart: {
              gte: dayStart,
              lt: nextDay,
            },
          },
          _sum: {
            count: true,
          },
        }),
        prisma.usageCounter.groupBy({
          by: ["feature"],
          where: {
            bucketStart: {
              gte: weekStart,
              lt: nextWeek,
            },
          },
          _sum: {
            count: true,
          },
        }),
      ]);

      const signupSeriesMap = new Map<string, number>();
      const loginSeriesMap = new Map<string, number>();
      for (let i = 0; i < 14; i += 1) {
        const day = new Date(fourteenDaysAgo);
        day.setUTCDate(day.getUTCDate() + i);
        const key = dayKeyUtc(day);
        signupSeriesMap.set(key, 0);
        loginSeriesMap.set(key, 0);
      }

      for (const row of signupRows) {
        const key = dayKeyUtc(row.createdAt);
        signupSeriesMap.set(key, (signupSeriesMap.get(key) ?? 0) + 1);
      }

      for (const row of loginRows) {
        if (!row.lastLoginAt) {
          continue;
        }
        const key = dayKeyUtc(row.lastLoginAt);
        loginSeriesMap.set(key, (loginSeriesMap.get(key) ?? 0) + 1);
      }

      const usageTodayByFeature = {
        STRAVA_IMPORT: 0,
        AI_REQUEST: 0,
        TRAINING_PLAN: 0,
      } as Record<UsageFeature, number>;
      for (const row of usageTodayByFeatureRows) {
        usageTodayByFeature[row.feature] = row._sum.count ?? 0;
      }

      const usageWeekByFeature = {
        STRAVA_IMPORT: 0,
        AI_REQUEST: 0,
        TRAINING_PLAN: 0,
      } as Record<UsageFeature, number>;
      for (const row of usageWeekByFeatureRows) {
        usageWeekByFeature[row.feature] = row._sum.count ?? 0;
      }

      return {
        generatedAt: now.toISOString(),
        users: {
          total: totalUsers,
          approved: approvedUsers,
          pending: pendingUsersCount,
          banned: bannedUsersCount,
          admins: adminUsersCount,
          supporters: supporterUsersCount,
          connectedToStrava: connectedToStravaCount,
          active24h: activeUsers24h,
          active7d: activeUsers7d,
        },
        data: {
          activities: activitiesCount,
          trainingPlans: trainingPlansCount,
          chartSnapshots: chartSnapshotsCount,
          securityEvents: securityEventsCount,
        },
        usage: {
          today: usageTodayByFeature,
          currentWeek: usageWeekByFeature,
        },
        series: {
          signupsLast14Days: [...signupSeriesMap.entries()].map(([day, count]) => ({
            day,
            count,
          })),
          loginsLast14Days: [...loginSeriesMap.entries()].map(([day, count]) => ({
            day,
            count,
          })),
        },
        queues: {
          pendingUsers: pendingUsers.map((row) => ({
            ...row,
            subscription: mapPlan(row.subscriptionTier, false),
          })),
          recentBans,
          recentSecurityEvents,
        },
        plans: {
          configuredAdminEmails: getConfiguredAdminEmails(),
          byTier: [mapPlan(SubscriptionTier.FREE), mapPlan(SubscriptionTier.SUPPORTER)],
        },
      };
    },
  );

  app.get(
    "/users",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const denied = adminGuard(request, reply);
      if (denied) {
        return denied;
      }

      const query = usersQuerySchema.parse(request.query);
      const where: Prisma.UserWhereInput = {};

      if (query.q && query.q.length > 0) {
        where.OR = [
          { email: { contains: query.q, mode: "insensitive" } },
          { id: { contains: query.q } },
        ];
      }

      if (query.status === "pending") {
        where.isApproved = false;
        where.bannedAt = null;
      } else if (query.status === "approved") {
        where.isApproved = true;
        where.bannedAt = null;
      } else if (query.status === "banned") {
        where.bannedAt = { not: null };
      }

      if (query.tier !== "all") {
        where.subscriptionTier = query.tier as SubscriptionTier;
      }

      const [total, items] = await Promise.all([
        prisma.user.count({ where }),
        prisma.user.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: query.offset,
          take: query.limit,
          select: {
            id: true,
            email: true,
            isAdmin: true,
            isApproved: true,
            bannedAt: true,
            bannedReason: true,
            subscriptionTier: true,
            stravaAthleteId: true,
            language: true,
            createdAt: true,
            updatedAt: true,
            lastLoginAt: true,
            _count: {
              select: {
                activities: true,
                trainingPlans: true,
                securityEvents: true,
              },
            },
          },
        }),
      ]);

      return {
        total,
        limit: query.limit,
        offset: query.offset,
        items: items.map((row) => ({
          id: row.id,
          email: row.email,
          isAdmin: row.isAdmin,
          isApproved: row.isApproved,
          isBanned: !!row.bannedAt,
          bannedAt: row.bannedAt,
          bannedReason: row.bannedReason,
          stravaAthleteId: row.stravaAthleteId,
          language: row.language === "en" ? "en" : "fr",
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          lastLoginAt: row.lastLoginAt,
          activityCount: row._count.activities,
          trainingPlanCount: row._count.trainingPlans,
          securityEventCount: row._count.securityEvents,
          subscription: mapPlan(row.subscriptionTier, row.isAdmin),
        })),
      };
    },
  );

  app.patch(
    "/users/:userId",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const denied = adminGuard(request, reply);
      if (denied) {
        return denied;
      }

      const params = userParamsSchema.parse(request.params);
      const body = userUpdateSchema.parse(request.body);
      const target = await prisma.user.findUnique({
        where: { id: params.userId },
        select: {
          id: true,
          email: true,
          isAdmin: true,
          isApproved: true,
          bannedAt: true,
          bannedReason: true,
          language: true,
          subscriptionTier: true,
        },
      });

      if (!target) {
        return reply.code(404).send({ message: "Utilisateur introuvable." });
      }

      if (target.id === request.userId && body.isAdmin === false) {
        return reply.code(400).send({ message: "Tu ne peux pas retirer ton propre role admin." });
      }

      if (target.id === request.userId && body.isApproved === false) {
        return reply.code(400).send({ message: "Tu ne peux pas retirer ta propre whitelist." });
      }

      if (target.id === request.userId && body.isBanned === true) {
        return reply.code(400).send({ message: "Tu ne peux pas bannir ton propre compte." });
      }

      if (body.isAdmin === false && target.isAdmin) {
        const activeAdminCount = await prisma.user.count({
          where: {
            isAdmin: true,
            id: { not: target.id },
          },
        });
        if (activeAdminCount === 0) {
          return reply
            .code(400)
            .send({ message: "Impossible de retirer le dernier administrateur." });
        }
      }

      if (body.bannedReason !== undefined && body.isBanned === undefined && !target.bannedAt) {
        return reply
          .code(400)
          .send({ message: "Le motif de ban ne peut etre defini que pour un compte banni." });
      }

      const data: Prisma.UserUpdateInput = {};
      if (body.isApproved !== undefined) {
        data.isApproved = body.isApproved;
      }
      if (body.subscriptionTier !== undefined) {
        data.subscriptionTier = body.subscriptionTier;
      }
      if (body.isAdmin !== undefined) {
        data.isAdmin = body.isAdmin;
      }
      if (body.isBanned !== undefined) {
        if (body.isBanned) {
          data.bannedAt = target.bannedAt ?? new Date();
          data.bannedReason =
            body.bannedReason === null || body.bannedReason === undefined ?
              target.bannedReason ?? "Suspendu par un administrateur."
            : body.bannedReason;
        } else {
          data.bannedAt = null;
          data.bannedReason = null;
        }
        data.tokenVersion = { increment: 1 };
      } else if (body.bannedReason !== undefined && target.bannedAt) {
        data.bannedReason = body.bannedReason;
      }

      const updated = await prisma.user.update({
        where: { id: target.id },
        data,
        select: {
          id: true,
          email: true,
          isAdmin: true,
          isApproved: true,
          bannedAt: true,
          bannedReason: true,
          language: true,
          subscriptionTier: true,
          updatedAt: true,
        },
      });

      await logSecurityEvent({
        eventType: "admin.user.updated",
        success: true,
        userId: request.userId,
        ip: request.ip,
        metadata: {
          targetUserId: target.id,
          targetEmail: target.email,
          before: {
            isAdmin: target.isAdmin,
            isApproved: target.isApproved,
            bannedAt: target.bannedAt,
            bannedReason: target.bannedReason,
            language: target.language,
            subscriptionTier: target.subscriptionTier,
          },
          after: {
            isAdmin: updated.isAdmin,
            isApproved: updated.isApproved,
            bannedAt: updated.bannedAt,
            bannedReason: updated.bannedReason,
            language: updated.language,
            subscriptionTier: updated.subscriptionTier,
          },
        },
      });

      return {
        item: {
          id: updated.id,
          email: updated.email,
          isAdmin: updated.isAdmin,
          isApproved: updated.isApproved,
          isBanned: !!updated.bannedAt,
          bannedAt: updated.bannedAt,
          bannedReason: updated.bannedReason,
          language: updated.language === "en" ? "en" : "fr",
          updatedAt: updated.updatedAt,
          subscription: mapPlan(updated.subscriptionTier, updated.isAdmin),
        },
      };
    },
  );

  app.get(
    "/db/tables",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const denied = adminGuard(request, reply);
      if (denied) {
        return denied;
      }

      const counts = await Promise.all(
        adminDbTableKeys.map(async (table) => ({
          table,
          rowCount: await countAdminDbRows(table),
        })),
      );

      return {
        tables: counts.map((item) => ({
          key: item.table,
          label: adminDbTableMeta[item.table].label,
          description: adminDbTableMeta[item.table].description,
          readOnly: adminDbTableMeta[item.table].readOnly,
          editableFields: [...adminDbTableMeta[item.table].editableFields],
          rowCount: item.rowCount,
        })),
      };
    },
  );

  app.get(
    "/db/:table",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const denied = adminGuard(request, reply);
      if (denied) {
        return denied;
      }

      const params = adminDbTableParamsSchema.parse(request.params);
      const query = adminDbRowsQuerySchema.parse(request.query);
      const tableMeta = adminDbTableMeta[params.table];
      const result = await listAdminDbRows(params.table, query);

      return {
        table: {
          key: params.table,
          label: tableMeta.label,
          description: tableMeta.description,
          readOnly: tableMeta.readOnly,
          editableFields: [...tableMeta.editableFields],
        },
        total: result.total,
        limit: query.limit,
        offset: query.offset,
        items: result.items,
      };
    },
  );

  app.patch(
    "/db/:table/:rowId",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const denied = adminGuard(request, reply);
      if (denied) {
        return denied;
      }

      const params = adminDbRowParamsSchema.parse(request.params);
      const body = adminDbPatchBodySchema.parse(request.body);
      const tableMeta = adminDbTableMeta[params.table];
      if (tableMeta.readOnly) {
        return reply.code(400).send({
          message: "Cette table est en lecture seule.",
        });
      }

      const before = await getAdminDbRowById(params.table, params.rowId);
      if (!before) {
        return reply.code(404).send({
          message: "Ligne introuvable.",
        });
      }

      const updated = await updateAdminDbRow({
        table: params.table,
        rowId: params.rowId,
        actorUserId: request.userId,
        changes: body.changes,
      }).catch((error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2025"
        ) {
          throw createClientError("Ligne introuvable.");
        }
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw createClientError("Contrainte unique violee. Valeur deja utilisee.");
        }
        throw error;
      });

      await logSecurityEvent({
        eventType: "admin.db.updated",
        success: true,
        userId: request.userId,
        ip: request.ip,
        metadata: {
          table: params.table,
          rowId: params.rowId,
          changedFields: updated.changedFields,
          before,
          after: updated.row,
        },
      });

      return {
        item: updated.row,
      };
    },
  );

  app.get(
    "/security-events",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const denied = adminGuard(request, reply);
      if (denied) {
        return denied;
      }

      const query = securityEventsQuerySchema.parse(request.query);
      const where: Prisma.SecurityEventWhereInput = {};
      if (query.eventType) {
        where.eventType = { contains: query.eventType, mode: "insensitive" };
      }
      if (query.userId) {
        where.userId = query.userId;
      }

      const [total, items] = await Promise.all([
        prisma.securityEvent.count({ where }),
        prisma.securityEvent.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: query.limit,
          skip: query.offset,
          select: {
            id: true,
            userId: true,
            eventType: true,
            success: true,
            ipHash: true,
            metadata: true,
            createdAt: true,
          },
        }),
      ]);

      return {
        total,
        limit: query.limit,
        offset: query.offset,
        items,
      };
    },
  );
};
