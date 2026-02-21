import type { FastifyPluginAsync } from "fastify";
import { activitiesRoutes } from "./activities.js";
import { adminRoutes } from "./admin.js";
import { aiRoutes } from "./ai.js";
import { analyticsRoutes } from "./analytics.js";
import { authRoutes } from "./auth.js";
import { exportRoutes } from "./export.js";
import { importRoutes } from "./import.js";
import { meRoutes } from "./me.js";

export const apiRoutes: FastifyPluginAsync = async (app) => {
  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(meRoutes);
  await app.register(adminRoutes, { prefix: "/admin" });
  await app.register(importRoutes, { prefix: "/import" });
  await app.register(activitiesRoutes, { prefix: "/activities" });
  await app.register(analyticsRoutes, { prefix: "/analytics" });
  await app.register(aiRoutes, { prefix: "/ai" });
  await app.register(exportRoutes, { prefix: "/export" });
};
