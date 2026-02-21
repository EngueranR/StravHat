import { Prisma, SubscriptionTier, UsageFeature } from "@prisma/client";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { getConfiguredAdminEmails } from "../services/adminPolicy.js";
import { logSecurityEvent } from "../services/securityAudit.js";
import { getPlanLimits, planDisplayName, planTagline } from "../services/subscription.js";

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

function mapPlan(tier: SubscriptionTier) {
  return {
    tier,
    name: planDisplayName(tier),
    tagline: planTagline(tier),
    limits: getPlanLimits(tier),
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
            subscription: mapPlan(row.subscriptionTier),
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
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          lastLoginAt: row.lastLoginAt,
          activityCount: row._count.activities,
          trainingPlanCount: row._count.trainingPlans,
          securityEventCount: row._count.securityEvents,
          subscription: mapPlan(row.subscriptionTier),
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
            subscriptionTier: target.subscriptionTier,
          },
          after: {
            isAdmin: updated.isAdmin,
            isApproved: updated.isApproved,
            bannedAt: updated.bannedAt,
            bannedReason: updated.bannedReason,
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
          updatedAt: updated.updatedAt,
          subscription: mapPlan(updated.subscriptionTier),
        },
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
