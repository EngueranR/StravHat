import { Prisma } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { logSecurityEvent } from "../services/securityAudit.js";
import {
  authDelay,
  decryptSecret,
  enforceRateLimit,
  encryptSecret,
  verifyPassword,
} from "../utils/security.js";

const nullableNumber = (min: number, max: number) =>
  z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? null : Number(value)),
    z.number().min(min).max(max).nullable(),
  );

const nullableInt = (min: number, max: number) =>
  z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? null : Number(value)),
    z.number().int().min(min).max(max).nullable(),
  );

const settingsSchema = z.object({
  hrMax: z.coerce.number().int().min(120).max(240),
  age: nullableNumber(10, 100),
  weightKg: nullableNumber(30, 250),
  heightCm: nullableNumber(120, 250),
  goalType: z.enum(["marathon", "half_marathon", "10k", "5k", "custom"]).nullable(),
  goalDistanceKm: nullableNumber(1, 500),
  goalTimeSec: nullableInt(600, 172800),
  speedUnit: z.enum(["kmh", "pace_km", "pace_mi"]),
  distanceUnit: z.enum(["km", "mi"]),
  elevationUnit: z.enum(["m", "ft"]),
  cadenceUnit: z.enum(["rpm", "ppm", "spm"]),
});

const stravaCredentialUpdateSchema = z.object({
  clientId: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^\d+$/, "Le client ID Strava doit etre numerique."),
  clientSecret: z.string().trim().min(8).max(256),
  redirectUri: z.string().trim().url(),
  currentPassword: z.string().min(1).max(128),
});

const passwordConfirmationSchema = z.object({
  currentPassword: z.string().min(1).max(128),
});

const STRAVA_CREDENTIAL_UPDATE_LIMIT = 8;
const STRAVA_CREDENTIAL_UPDATE_WINDOW_MS = 15 * 60 * 1000;
const STRAVA_CREDENTIAL_RESET_LIMIT = 6;
const STRAVA_CREDENTIAL_RESET_WINDOW_MS = 15 * 60 * 1000;

const meSelect = {
  id: true,
  email: true,
  isApproved: true,
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
  stravaClientIdEnc: true,
  stravaClientSecretEnc: true,
  stravaRedirectUriEnc: true,
  token: {
    select: {
      id: true,
    },
  },
} satisfies Prisma.UserSelect;

type MeRecord = Prisma.UserGetPayload<{
  select: typeof meSelect;
}>;

function mapMe(user: MeRecord) {
  return {
    id: user.id,
    email: user.email,
    isApproved: user.isApproved,
    stravaAthleteId: user.stravaAthleteId,
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
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    connectedToStrava: !!user.token,
    hasCustomStravaCredentials: !!(
      user.stravaClientIdEnc &&
      user.stravaClientSecretEnc &&
      user.stravaRedirectUriEnc
    ),
  };
}

async function loadMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: meSelect,
  });

  if (!user) {
    throw new Error("User not found");
  }

  return mapMe(user);
}

function isAllowedRedirectUri(value: string) {
  const uri = new URL(value);

  if (uri.protocol === "https:") {
    return true;
  }

  if (uri.protocol !== "http:") {
    return false;
  }

  return (
    uri.hostname === "localhost" ||
    uri.hostname === "127.0.0.1" ||
    uri.hostname === "[::1]"
  );
}

export const meRoutes: FastifyPluginAsync = async (app) => {
  app.get("/me", { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      return await loadMe(request.userId);
    } catch {
      return reply.code(404).send({ message: "User not found" });
    }
  });

  app.patch("/me/settings", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = settingsSchema.parse(request.body);

    await prisma.user.update({
      where: { id: request.userId },
      data: {
        hrMax: body.hrMax,
        age: body.age,
        weightKg: body.weightKg,
        heightCm: body.heightCm,
        goalType: body.goalType,
        goalDistanceKm: body.goalDistanceKm,
        goalTimeSec: body.goalTimeSec,
        speedUnit: body.speedUnit,
        distanceUnit: body.distanceUnit,
        elevationUnit: body.elevationUnit,
        cadenceUnit: body.cadenceUnit,
      },
    });

    try {
      return await loadMe(request.userId);
    } catch {
      return reply.code(404).send({ message: "User not found" });
    }
  });

  app.get(
    "/me/strava-credentials",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = await prisma.user.findUnique({
        where: { id: request.userId },
        select: {
          stravaClientIdEnc: true,
          stravaClientSecretEnc: true,
          stravaRedirectUriEnc: true,
        },
      });

      if (!user) {
        return reply.code(404).send({ message: "User not found" });
      }

      const hasCustomCredentials = !!(
        user.stravaClientIdEnc &&
        user.stravaClientSecretEnc &&
        user.stravaRedirectUriEnc
      );

      if (!hasCustomCredentials) {
        return {
          hasCustomCredentials: false,
          clientId: null,
          redirectUri: null,
        };
      }

      return {
        hasCustomCredentials: true,
        clientId: decryptSecret(user.stravaClientIdEnc!),
        redirectUri:
          user.stravaRedirectUriEnc ? decryptSecret(user.stravaRedirectUriEnc) : null,
      };
    },
  );

  app.patch(
    "/me/strava-credentials",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const rate = await enforceRateLimit({
        key: `strava:credentials:update:${request.userId}:${request.ip}`,
        limit: STRAVA_CREDENTIAL_UPDATE_LIMIT,
        windowMs: STRAVA_CREDENTIAL_UPDATE_WINDOW_MS,
      });

      if (!rate.allowed) {
        await logSecurityEvent({
          eventType: "strava.credentials_update.rate_limited",
          success: false,
          userId: request.userId,
          ip: request.ip,
        });
        return reply
          .header("Retry-After", String(rate.retryAfterSec))
          .code(429)
          .send({ message: "Trop de tentatives. Reessaie plus tard." });
      }

      const body = stravaCredentialUpdateSchema.parse(request.body);

      if (body.redirectUri && !isAllowedRedirectUri(body.redirectUri)) {
        await logSecurityEvent({
          eventType: "strava.credentials_update.invalid_redirect_uri",
          success: false,
          userId: request.userId,
          ip: request.ip,
        });
        return reply.code(400).send({
          message:
            "Redirect URI invalide: utilise https (ou http uniquement en localhost).",
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: request.userId },
        select: {
          id: true,
          passwordHash: true,
        },
      });

      if (!user || !user.passwordHash) {
        await logSecurityEvent({
          eventType: "strava.credentials_update.invalid_auth",
          success: false,
          userId: request.userId,
          ip: request.ip,
        });
        await authDelay();
        return reply.code(401).send({ message: "Authentification invalide." });
      }

      const isPasswordValid = await verifyPassword(body.currentPassword, user.passwordHash);

      if (!isPasswordValid) {
        await logSecurityEvent({
          eventType: "strava.credentials_update.invalid_auth",
          success: false,
          userId: request.userId,
          ip: request.ip,
        });
        await authDelay();
        return reply.code(401).send({ message: "Mot de passe incorrect." });
      }

      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: {
            stravaClientIdEnc: encryptSecret(body.clientId.trim()),
            stravaClientSecretEnc: encryptSecret(body.clientSecret.trim()),
            stravaRedirectUriEnc: encryptSecret(body.redirectUri),
          },
        }),
        prisma.stravaToken.deleteMany({
          where: {
            userId: user.id,
          },
        }),
      ]);

      await logSecurityEvent({
        eventType: "strava.credentials_update.success",
        success: true,
        userId: request.userId,
        ip: request.ip,
      });

      return {
        ok: true,
        requiresReconnect: true,
      };
    },
  );

  app.post(
    "/me/strava-credentials/reset",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const rate = await enforceRateLimit({
        key: `strava:credentials:reset:${request.userId}:${request.ip}`,
        limit: STRAVA_CREDENTIAL_RESET_LIMIT,
        windowMs: STRAVA_CREDENTIAL_RESET_WINDOW_MS,
      });

      if (!rate.allowed) {
        await logSecurityEvent({
          eventType: "strava.credentials_reset.rate_limited",
          success: false,
          userId: request.userId,
          ip: request.ip,
        });
        return reply
          .header("Retry-After", String(rate.retryAfterSec))
          .code(429)
          .send({ message: "Trop de tentatives. Reessaie plus tard." });
      }

      const body = passwordConfirmationSchema.parse(request.body);
      const user = await prisma.user.findUnique({
        where: { id: request.userId },
        select: {
          id: true,
          passwordHash: true,
        },
      });

      if (!user || !user.passwordHash) {
        await logSecurityEvent({
          eventType: "strava.credentials_reset.invalid_auth",
          success: false,
          userId: request.userId,
          ip: request.ip,
        });
        await authDelay();
        return reply.code(401).send({ message: "Authentification invalide." });
      }

      const isPasswordValid = await verifyPassword(body.currentPassword, user.passwordHash);

      if (!isPasswordValid) {
        await logSecurityEvent({
          eventType: "strava.credentials_reset.invalid_auth",
          success: false,
          userId: request.userId,
          ip: request.ip,
        });
        await authDelay();
        return reply.code(401).send({ message: "Mot de passe incorrect." });
      }

      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: {
            stravaClientIdEnc: null,
            stravaClientSecretEnc: null,
            stravaRedirectUriEnc: null,
          },
        }),
        prisma.stravaToken.deleteMany({
          where: {
            userId: user.id,
          },
        }),
      ]);

      await logSecurityEvent({
        eventType: "strava.credentials_reset.success",
        success: true,
        userId: request.userId,
        ip: request.ip,
      });

      return {
        ok: true,
        credentialsCleared: true,
        requiresReconnect: true,
      };
    },
  );

  app.delete("/me", { preHandler: [app.authenticate] }, async (request) => {
    await prisma.user.delete({
      where: {
        id: request.userId,
      },
    });

    return {
      ok: true,
    };
  });
};
