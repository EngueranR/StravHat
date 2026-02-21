import { Prisma } from "@prisma/client";
import { buildRunOnlyActivityWhere } from "./runActivities.js";

export interface ActivityFilters {
  from?: Date;
  to?: Date;
  localFrom?: Date;
  localTo?: Date;
  type?: string;
  q?: string;
  hasHR?: boolean;
  hasPower?: boolean;
  ids?: string[];
  minDistanceKm?: number;
  maxDistanceKm?: number;
  minTimeMin?: number;
  maxTimeMin?: number;
  minElev?: number;
  maxElev?: number;
  minAvgHR?: number;
  maxAvgHR?: number;
  minAvgSpeedKmh?: number;
  maxAvgSpeedKmh?: number;
  minAvgWatts?: number;
  maxAvgWatts?: number;
  minCadence?: number;
  maxCadence?: number;
  minCalories?: number;
  maxCalories?: number;
  minKilojoules?: number;
  maxKilojoules?: number;
}

export function parseDate(value?: string) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }

  return date;
}

export function parseBool(value?: string) {
  if (value === undefined) {
    return undefined;
  }

  return value === "true" || value === "1";
}

export function parseNumber(value?: string) {
  if (value === undefined) {
    return undefined;
  }

  const num = Number(value);

  if (Number.isNaN(num)) {
    throw new Error(`Invalid number: ${value}`);
  }

  return num;
}

export function parseIdList(value?: string) {
  if (!value) {
    return undefined;
  }

  const ids = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return ids.length > 0 ? ids : undefined;
}

export function buildActivityWhere(userId: string, filters: ActivityFilters): Prisma.ActivityWhereInput {
  const where: Prisma.ActivityWhereInput = {
    userId,
  };
  const andConditions: Prisma.ActivityWhereInput[] = [buildRunOnlyActivityWhere()];

  if (filters.ids && filters.ids.length > 0) {
    where.id = { in: filters.ids };
  }

  if (filters.from || filters.to) {
    where.startDate = {};

    if (filters.from) {
      where.startDate.gte = filters.from;
    }

    if (filters.to) {
      where.startDate.lte = filters.to;
    }
  }

  if (filters.localFrom || filters.localTo) {
    where.startDateLocal = {};

    if (filters.localFrom) {
      where.startDateLocal.gte = filters.localFrom;
    }

    if (filters.localTo) {
      where.startDateLocal.lte = filters.localTo;
    }
  }

  if (filters.type) {
    andConditions.push({
      OR: [
        { type: { equals: filters.type, mode: "insensitive" } },
        { sportType: { equals: filters.type, mode: "insensitive" } },
      ],
    });
  }

  if (filters.q) {
    where.name = {
      contains: filters.q,
      mode: "insensitive",
    };
  }

  if (filters.hasHR !== undefined) {
    where.averageHeartrate = filters.hasHR ? { not: null } : null;
  }

  if (filters.hasPower !== undefined) {
    where.averageWatts = filters.hasPower ? { not: null } : null;
  }

  if (filters.minDistanceKm !== undefined || filters.maxDistanceKm !== undefined) {
    where.distance = {};
    if (filters.minDistanceKm !== undefined) {
      where.distance.gte = filters.minDistanceKm * 1000;
    }
    if (filters.maxDistanceKm !== undefined) {
      where.distance.lte = filters.maxDistanceKm * 1000;
    }
  }

  if (filters.minTimeMin !== undefined || filters.maxTimeMin !== undefined) {
    where.movingTime = {};
    if (filters.minTimeMin !== undefined) {
      where.movingTime.gte = Math.round(filters.minTimeMin * 60);
    }
    if (filters.maxTimeMin !== undefined) {
      where.movingTime.lte = Math.round(filters.maxTimeMin * 60);
    }
  }

  if (filters.minElev !== undefined || filters.maxElev !== undefined) {
    where.totalElevationGain = {};
    if (filters.minElev !== undefined) {
      where.totalElevationGain.gte = filters.minElev;
    }
    if (filters.maxElev !== undefined) {
      where.totalElevationGain.lte = filters.maxElev;
    }
  }

  if (filters.minAvgHR !== undefined || filters.maxAvgHR !== undefined) {
    where.averageHeartrate = {
      ...(where.averageHeartrate && typeof where.averageHeartrate === "object" ? where.averageHeartrate : {}),
    };
    if (filters.minAvgHR !== undefined) {
      (where.averageHeartrate as Prisma.FloatNullableFilter).gte = filters.minAvgHR;
    }
    if (filters.maxAvgHR !== undefined) {
      (where.averageHeartrate as Prisma.FloatNullableFilter).lte = filters.maxAvgHR;
    }
  }

  if (filters.minAvgSpeedKmh !== undefined || filters.maxAvgSpeedKmh !== undefined) {
    where.averageSpeed = {};
    if (filters.minAvgSpeedKmh !== undefined) {
      where.averageSpeed.gte = filters.minAvgSpeedKmh / 3.6;
    }
    if (filters.maxAvgSpeedKmh !== undefined) {
      where.averageSpeed.lte = filters.maxAvgSpeedKmh / 3.6;
    }
  }

  if (filters.minAvgWatts !== undefined || filters.maxAvgWatts !== undefined) {
    where.averageWatts = {
      ...(where.averageWatts && typeof where.averageWatts === "object" ? where.averageWatts : {}),
    };
    if (filters.minAvgWatts !== undefined) {
      (where.averageWatts as Prisma.FloatNullableFilter).gte = filters.minAvgWatts;
    }
    if (filters.maxAvgWatts !== undefined) {
      (where.averageWatts as Prisma.FloatNullableFilter).lte = filters.maxAvgWatts;
    }
  }

  if (filters.minCadence !== undefined || filters.maxCadence !== undefined) {
    where.averageCadence = {
      ...(where.averageCadence && typeof where.averageCadence === "object" ? where.averageCadence : {}),
    };
    if (filters.minCadence !== undefined) {
      (where.averageCadence as Prisma.FloatNullableFilter).gte = filters.minCadence;
    }
    if (filters.maxCadence !== undefined) {
      (where.averageCadence as Prisma.FloatNullableFilter).lte = filters.maxCadence;
    }
  }

  if (filters.minCalories !== undefined || filters.maxCalories !== undefined) {
    where.calories = {
      ...(where.calories && typeof where.calories === "object" ? where.calories : {}),
    };
    if (filters.minCalories !== undefined) {
      (where.calories as Prisma.FloatNullableFilter).gte = filters.minCalories;
    }
    if (filters.maxCalories !== undefined) {
      (where.calories as Prisma.FloatNullableFilter).lte = filters.maxCalories;
    }
  }

  if (filters.minKilojoules !== undefined || filters.maxKilojoules !== undefined) {
    where.kilojoules = {
      ...(where.kilojoules && typeof where.kilojoules === "object" ? where.kilojoules : {}),
    };
    if (filters.minKilojoules !== undefined) {
      (where.kilojoules as Prisma.FloatNullableFilter).gte = filters.minKilojoules;
    }
    if (filters.maxKilojoules !== undefined) {
      (where.kilojoules as Prisma.FloatNullableFilter).lte = filters.maxKilojoules;
    }
  }

  const existingAndConditions =
    where.AND === undefined ?
      []
    : Array.isArray(where.AND) ?
      where.AND
    : [where.AND];
  where.AND = [...existingAndConditions, ...andConditions];

  return where;
}
