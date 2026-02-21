import cors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import Fastify from "fastify";
import { ZodError } from "zod";
import { env } from "./config.js";
import { prisma } from "./db.js";
import { apiRoutes } from "./routes/index.js";

const app = Fastify({
  logger: true,
  bodyLimit: 1_000_000,
  trustProxy: true,
});

app.addHook("onSend", async (request, reply, payload) => {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("X-Frame-Options", "DENY");
  reply.header("Referrer-Policy", "no-referrer");
  reply.header(
    "Permissions-Policy",
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
  );
  reply.header("Cross-Origin-Opener-Policy", "same-origin");
  reply.header("Cross-Origin-Resource-Policy", "same-origin");
  reply.header("X-Permitted-Cross-Domain-Policies", "none");
  reply.header(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  );
  reply.header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  reply.header("Pragma", "no-cache");
  reply.header("Expires", "0");

  const forwardedProtoHeader = request.headers["x-forwarded-proto"];
  const forwardedProto =
    typeof forwardedProtoHeader === "string" ?
      forwardedProtoHeader.split(",")[0]?.trim().toLowerCase()
    : null;
  const rawSocket = request.raw.socket as { encrypted?: boolean };
  const isHttpsRequest =
    request.protocol === "https" ||
    rawSocket.encrypted === true ||
    forwardedProto === "https";

  if (isHttpsRequest) {
    reply.header(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }

  return payload;
});

await app.register(cors, {
  origin: env.WEB_URL === "*" ? true : env.WEB_URL,
  credentials: true,
});

await app.register(fastifyJwt, {
  secret: env.JWT_SECRET,
});

app.decorate("authenticate", async (request, reply) => {
  try {
    const payload = await request.jwtVerify<{ sub: string; v?: number }>();

    if (!payload.sub || typeof payload.v !== "number") {
      return reply.code(401).send({ message: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: {
        id: payload.sub,
      },
      select: {
        id: true,
        isAdmin: true,
        bannedAt: true,
        isApproved: true,
        tokenVersion: true,
      },
    });

    if (!user) {
      return reply.code(401).send({ message: "Unauthorized" });
    }

    if (!user.isApproved) {
      return reply
        .code(403)
        .send({ message: "Compte non valide par le gestionnaire." });
    }

    if (user.bannedAt) {
      return reply.code(403).send({ message: "Compte suspendu par un administrateur." });
    }

    if (user.tokenVersion !== payload.v) {
      return reply.code(401).send({ message: "Unauthorized" });
    }

    request.userId = user.id;
    request.userIsAdmin = user.isAdmin;
  } catch {
    return reply.code(401).send({ message: "Unauthorized" });
  }
});

app.get("/health", async () => ({ ok: true }));

await app.register(apiRoutes, {
  prefix: "/api",
});

app.setErrorHandler((error, request, reply) => {
  if (error instanceof ZodError) {
    request.log.warn({ error }, "Validation error");
    return reply.code(400).send({
      message: "Validation error",
      issues: error.issues,
    });
  }

  const statusCode =
    typeof (error as { statusCode?: unknown }).statusCode === "number" ?
      Math.max(400, Math.min(599, (error as { statusCode: number }).statusCode))
    : 500;

  if (statusCode >= 500) {
    request.log.error({ error }, "Unhandled server error");
    return reply.code(statusCode).send({
      message: "Internal server error",
    });
  }

  request.log.warn({ error }, "Handled client error");
  return reply.code(statusCode).send({
    message: error instanceof Error && error.message ? error.message : "Bad request",
  });
});

const shutdown = async () => {
  await app.close();
  await prisma.$disconnect();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

app.listen({ port: env.PORT, host: "0.0.0.0" }).catch(async (error) => {
  app.log.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
