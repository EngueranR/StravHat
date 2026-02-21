import { Prisma, type PrismaClient } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { env } from "../config.js";
import { prisma } from "../db.js";
import { logSecurityEvent } from "../services/securityAudit.js";
import {
  exchangeCodeForToken,
  MissingStravaCredentialsError,
  resolveUserStravaAppCredentials,
  stravaAuthorizeUrl,
} from "../services/strava.js";
import {
  authDelay,
  enforceRateLimit,
  encryptSecret,
  hashPassword,
  normalizeEmail,
  passwordPolicyError,
  verifyPassword,
} from "../utils/security.js";

const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 60 * 60 * 1000;
const REGISTER_LIMIT = 10;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 60 * 60 * 1000;
const STRAVA_START_LIMIT = 40;
const STRAVA_START_WINDOW_MS = 15 * 60 * 1000;
const STRAVA_EXCHANGE_LIMIT = 20;
const STRAVA_EXCHANGE_WINDOW_MS = 15 * 60 * 1000;

const credentialsSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(128),
});

const exchangeSchema = z.object({
  code: z.string().min(1),
});

const startQuerySchema = z.object({
  redirect: z.string().optional(),
  state: z.string().optional(),
});

const publicUserSelect = {
  id: true,
  email: true,
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

type PublicUserRecord = Prisma.UserGetPayload<{
  select: typeof publicUserSelect;
}>;

function mapUser(user: PublicUserRecord) {
  return {
    id: user.id,
    email: user.email,
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

async function loadPublicUser(db: PrismaClient, userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: publicUserSelect,
  });

  if (!user) {
    throw new Error("User not found");
  }

  return mapUser(user);
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/register", async (request, reply) => {
    const body = credentialsSchema.parse(request.body);

    const rate = await enforceRateLimit({
      key: `register:${request.ip}`,
      limit: REGISTER_LIMIT,
      windowMs: REGISTER_WINDOW_MS,
    });

    if (!rate.allowed) {
      await logSecurityEvent({
        eventType: "auth.register.rate_limited",
        success: false,
        ip: request.ip,
      });
      return reply
        .header("Retry-After", String(rate.retryAfterSec))
        .code(429)
        .send({ message: "Trop de tentatives. Reessaie plus tard." });
    }

    const email = normalizeEmail(body.email);
    const policyError = passwordPolicyError(body.password);

    if (policyError) {
      await logSecurityEvent({
        eventType: "auth.register.password_policy_failed",
        success: false,
        ip: request.ip,
        metadata: {
          emailDomain: email.split("@")[1] ?? null,
        },
      });
      return reply.code(400).send({ message: policyError });
    }

    const passwordHash = await hashPassword(body.password);
    let created = true;

    try {
      await prisma.user.create({
        data: {
          email,
          passwordHash,
          isApproved: false,
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
        throw error;
      }

      created = false;
      await authDelay(200);
    }

    await logSecurityEvent({
      eventType: created ? "auth.register.success" : "auth.register.duplicate_email",
      success: created,
      ip: request.ip,
      metadata: {
        emailDomain: email.split("@")[1] ?? null,
      },
    });

    return reply.code(201).send({
      message: "Compte cree. En attente de validation par le gestionnaire.",
      requiresApproval: true,
    });
  });

  app.post("/login", async (request, reply) => {
    const body = credentialsSchema.parse(request.body);

    const rate = await enforceRateLimit({
      key: `login:${request.ip}`,
      limit: LOGIN_LIMIT,
      windowMs: LOGIN_WINDOW_MS,
    });

    if (!rate.allowed) {
      await logSecurityEvent({
        eventType: "auth.login.rate_limited",
        success: false,
        ip: request.ip,
      });
      return reply
        .header("Retry-After", String(rate.retryAfterSec))
        .code(429)
        .send({ message: "Trop de tentatives. Reessaie plus tard." });
    }

    const email = normalizeEmail(body.email);
    const account = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        passwordHash: true,
        isApproved: true,
        failedLoginAttempts: true,
        lockedUntil: true,
        tokenVersion: true,
      },
    });

    if (!account?.passwordHash) {
      await logSecurityEvent({
        eventType: "auth.login.invalid_credentials",
        success: false,
        ip: request.ip,
        metadata: {
          emailDomain: email.split("@")[1] ?? null,
        },
      });
      await authDelay();
      return reply.code(401).send({ message: "Identifiants invalides." });
    }

    if (account.lockedUntil && account.lockedUntil.getTime() > Date.now()) {
      const retryAfterSec = Math.max(
        Math.ceil((account.lockedUntil.getTime() - Date.now()) / 1000),
        1,
      );
      await logSecurityEvent({
        eventType: "auth.login.account_locked",
        success: false,
        userId: account.id,
        ip: request.ip,
      });
      return reply
        .header("Retry-After", String(retryAfterSec))
        .code(429)
        .send({ message: "Compte temporairement verrouille. Reessaie plus tard." });
    }

    const passwordOk = await verifyPassword(body.password, account.passwordHash);

    if (!passwordOk) {
      const nextFailures = account.failedLoginAttempts + 1;
      const shouldLock = nextFailures >= MAX_FAILED_LOGIN_ATTEMPTS;

      await prisma.user.update({
        where: { id: account.id },
        data: {
          failedLoginAttempts: shouldLock ? 0 : nextFailures,
          lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_MS) : null,
        },
      });

      await logSecurityEvent({
        eventType:
          shouldLock ? "auth.login.account_locked" : "auth.login.invalid_credentials",
        success: false,
        userId: account.id,
        ip: request.ip,
      });

      await authDelay();
      return reply.code(401).send({ message: "Identifiants invalides." });
    }

    if (!account.isApproved) {
      await prisma.user.update({
        where: { id: account.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
      await logSecurityEvent({
        eventType: "auth.login.not_approved",
        success: false,
        userId: account.id,
        ip: request.ip,
      });
      return reply.code(403).send({
        message:
          "Compte en attente de validation. Contacte le gestionnaire pour etre ajoute a la whitelist.",
      });
    }

    await prisma.user.update({
      where: { id: account.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    await logSecurityEvent({
      eventType: "auth.login.success",
      success: true,
      userId: account.id,
      ip: request.ip,
    });

    const jwt = await app.jwt.sign(
      {
        sub: account.id,
        v: account.tokenVersion,
      },
      {
        expiresIn: env.JWT_TTL,
      },
    );

    const user = await loadPublicUser(prisma, account.id);

    return {
      jwt,
      user,
    };
  });

  app.get("/strava/start", { preHandler: [app.authenticate] }, async (request, reply) => {
    const rate = await enforceRateLimit({
      key: `strava:start:${request.userId}:${request.ip}`,
      limit: STRAVA_START_LIMIT,
      windowMs: STRAVA_START_WINDOW_MS,
    });

    if (!rate.allowed) {
      await logSecurityEvent({
        eventType: "strava.oauth_start.rate_limited",
        success: false,
        userId: request.userId,
        ip: request.ip,
      });
      return reply
        .header("Retry-After", String(rate.retryAfterSec))
        .code(429)
        .send({ message: "Trop de tentatives. Reessaie plus tard." });
    }

    const query = startQuerySchema.parse(request.query);
    let credentials;

    try {
      credentials = await resolveUserStravaAppCredentials(request.userId);
    } catch (error) {
      if (error instanceof MissingStravaCredentialsError) {
        await logSecurityEvent({
          eventType: "strava.oauth_start.missing_credentials",
          success: false,
          userId: request.userId,
          ip: request.ip,
        });
        return reply.code(400).send({ message: error.message });
      }

      throw error;
    }

    const url = stravaAuthorizeUrl(credentials, query.state);

    if (query.redirect === "true" || query.redirect === "1") {
      await logSecurityEvent({
        eventType: "strava.oauth_start.success",
        success: true,
        userId: request.userId,
        ip: request.ip,
      });
      return reply.redirect(url);
    }

    await logSecurityEvent({
      eventType: "strava.oauth_start.success",
      success: true,
      userId: request.userId,
      ip: request.ip,
    });

    return {
      url,
    };
  });

  app.post("/strava/exchange", { preHandler: [app.authenticate] }, async (request, reply) => {
    const rate = await enforceRateLimit({
      key: `strava:exchange:${request.userId}:${request.ip}`,
      limit: STRAVA_EXCHANGE_LIMIT,
      windowMs: STRAVA_EXCHANGE_WINDOW_MS,
    });

    if (!rate.allowed) {
      await logSecurityEvent({
        eventType: "strava.oauth_exchange.rate_limited",
        success: false,
        userId: request.userId,
        ip: request.ip,
      });
      return reply
        .header("Retry-After", String(rate.retryAfterSec))
        .code(429)
        .send({ message: "Trop de tentatives. Reessaie plus tard." });
    }

    const body = exchangeSchema.parse(request.body);
    let credentials;

    try {
      credentials = await resolveUserStravaAppCredentials(request.userId);
    } catch (error) {
      if (error instanceof MissingStravaCredentialsError) {
        await logSecurityEvent({
          eventType: "strava.oauth_exchange.missing_credentials",
          success: false,
          userId: request.userId,
          ip: request.ip,
        });
        return reply.code(400).send({ message: error.message });
      }

      throw error;
    }

    let tokenData;

    try {
      tokenData = await exchangeCodeForToken(body.code, credentials);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Strava token exchange failed";

      if (message.includes("Strava token exchange failed (400)")) {
        await logSecurityEvent({
          eventType: "strava.oauth_exchange.invalid_code",
          success: false,
          userId: request.userId,
          ip: request.ip,
        });
        return reply.code(400).send({
          message: "Code OAuth invalide ou deja utilise. Relance la connexion Strava.",
        });
      }

      if (message.includes("Strava token exchange failed (401)")) {
        await logSecurityEvent({
          eventType: "strava.oauth_exchange.invalid_application",
          success: false,
          userId: request.userId,
          ip: request.ip,
        });
        return reply.code(400).send({
          message:
            "Application Strava invalide. Verifie le Client ID / Client Secret dans Strava Credentials puis reconnecte Strava.",
        });
      }

      await logSecurityEvent({
        eventType: "strava.oauth_exchange.error",
        success: false,
        userId: request.userId,
        ip: request.ip,
        metadata: {
          message,
        },
      });

      throw error;
    }

    const alreadyLinked = await prisma.user.findUnique({
      where: {
        stravaAthleteId: tokenData.athlete.id,
      },
      select: {
        id: true,
      },
    });

    if (alreadyLinked && alreadyLinked.id !== request.userId) {
      await logSecurityEvent({
        eventType: "strava.oauth_exchange.conflict",
        success: false,
        userId: request.userId,
        ip: request.ip,
      });
      return reply.code(409).send({
        message: "Ce compte Strava est deja associe a un autre compte applicatif.",
      });
    }

    try {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: request.userId },
          data: {
            stravaAthleteId: tokenData.athlete.id,
          },
        });

        await tx.stravaToken.upsert({
          where: {
            userId: request.userId,
          },
          update: {
            accessToken: encryptSecret(tokenData.access_token),
            refreshToken: encryptSecret(tokenData.refresh_token),
            expiresAt: new Date(tokenData.expires_at * 1000),
            oauthClientIdEnc: encryptSecret(credentials.clientId),
            oauthClientSecretEnc: encryptSecret(credentials.clientSecret),
          },
          create: {
            userId: request.userId,
            accessToken: encryptSecret(tokenData.access_token),
            refreshToken: encryptSecret(tokenData.refresh_token),
            expiresAt: new Date(tokenData.expires_at * 1000),
            oauthClientIdEnc: encryptSecret(credentials.clientId),
            oauthClientSecretEnc: encryptSecret(credentials.clientSecret),
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        await logSecurityEvent({
          eventType: "strava.oauth_exchange.conflict",
          success: false,
          userId: request.userId,
          ip: request.ip,
        });
        return reply.code(409).send({
          message: "Ce compte Strava est deja associe a un autre compte applicatif.",
        });
      }

      throw error;
    }

    const user = await loadPublicUser(prisma, request.userId);

    await logSecurityEvent({
      eventType: "strava.oauth_exchange.success",
      success: true,
      userId: request.userId,
      ip: request.ip,
      metadata: {
        stravaAthleteId: tokenData.athlete.id,
      },
    });

    return {
      user,
    };
  });
};
