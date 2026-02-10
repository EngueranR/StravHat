import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";

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

export const meRoutes: FastifyPluginAsync = async (app) => {
  app.get("/me", { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: {
        id: request.userId,
      },
      include: {
        token: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!user) {
      return reply.code(404).send({ message: "User not found" });
    }

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
    };
  });

  app.patch("/me/settings", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = settingsSchema.parse(request.body);

    const user = await prisma.user.update({
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

    return user;
  });

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
