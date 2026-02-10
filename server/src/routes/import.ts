import type { FastifyPluginAsync } from "fastify";
import { importAllActivities } from "../services/strava.js";

export const importRoutes: FastifyPluginAsync = async (app) => {
  app.post("/basic", { preHandler: [app.authenticate] }, async (request) => {
    const result = await importAllActivities(request.userId);

    return {
      ok: true,
      ...result,
    };
  });
};
