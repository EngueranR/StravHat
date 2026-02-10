import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { exchangeCodeForToken, stravaAuthorizeUrl } from "../services/strava.js";

const exchangeSchema = z.object({
  code: z.string().min(1),
  redirectUri: z.string().url().optional(),
});

const startQuerySchema = z.object({
  redirectUri: z.string().url().optional(),
  redirect: z.string().optional(),
  state: z.string().optional(),
});

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.get("/strava/start", async (request, reply) => {
    const query = startQuerySchema.parse(request.query);
    const url = stravaAuthorizeUrl(query.redirectUri, query.state);

    if (query.redirect === "true" || query.redirect === "1") {
      return reply.redirect(url);
    }

    return {
      url,
    };
  });

  app.post("/strava/exchange", async (request, reply) => {
    const body = exchangeSchema.parse(request.body);
    let tokenData;

    try {
      tokenData = await exchangeCodeForToken(body.code, body.redirectUri);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Strava token exchange failed";

      if (message.includes("Strava token exchange failed (400)")) {
        return reply.code(400).send({
          message: "Code OAuth invalide ou deja utilise. Relance la connexion Strava.",
        });
      }

      throw error;
    }

    const user = await prisma.user.upsert({
      where: {
        stravaAthleteId: tokenData.athlete.id,
      },
      update: {
        stravaAthleteId: tokenData.athlete.id,
      },
      create: {
        stravaAthleteId: tokenData.athlete.id,
      },
    });

    await prisma.stravaToken.upsert({
      where: {
        userId: user.id,
      },
      update: {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: new Date(tokenData.expires_at * 1000),
      },
      create: {
        userId: user.id,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: new Date(tokenData.expires_at * 1000),
      },
    });

    const jwt = await app.jwt.sign({ sub: user.id });

    return {
      jwt,
      user,
    };
  });
};
