import type { FastifyPluginAsync } from "fastify";
import { importAllActivities } from "../services/strava.js";
import { consumeQuota } from "../services/subscription.js";
import { UsageFeature } from "@prisma/client";

export const importRoutes: FastifyPluginAsync = async (app) => {
  app.post("/basic", { preHandler: [app.authenticate] }, async (request, reply) => {
    const quota = await consumeQuota(request.userId, UsageFeature.STRAVA_IMPORT);
    if (!quota.allowed) {
      return reply.code(429).send({
        message:
          quota.message ??
          "Quota import Strava atteint. Essaie plus tard.",
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

    const result = await importAllActivities(request.userId);

    return {
      ok: true,
      quota: {
        feature: quota.feature,
        tier: quota.tier,
        limit: quota.limit,
        used: quota.used,
        remaining: quota.remaining,
        window: quota.window,
        resetAt: quota.resetAt,
      },
      ...result,
    };
  });
};
