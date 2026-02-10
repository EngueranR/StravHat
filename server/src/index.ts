import cors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import Fastify from "fastify";
import { ZodError } from "zod";
import { env } from "./config.js";
import { prisma } from "./db.js";
import { apiRoutes } from "./routes/index.js";

const app = Fastify({
  logger: true,
});

await app.register(cors, {
  origin: env.WEB_URL,
  credentials: true,
});

await app.register(fastifyJwt, {
  secret: env.JWT_SECRET,
});

app.decorate("authenticate", async (request, reply) => {
  try {
    const payload = await request.jwtVerify<{ sub: string }>();
    request.userId = payload.sub;
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

  request.log.error({ error }, "Unhandled error");
  const message = error instanceof Error ? error.message : "Internal server error";

  return reply.code(500).send({
    message,
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
