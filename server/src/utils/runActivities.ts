import { Prisma } from "@prisma/client";

const RUN_ACTIVITY_KEYWORDS = ["run", "trail", "jog", "treadmill"] as const;

export function isRunLikeActivityType(input: {
  sportType?: string | null;
  type?: string | null;
}) {
  const combined = `${input.sportType ?? ""} ${input.type ?? ""}`.toLowerCase();
  return RUN_ACTIVITY_KEYWORDS.some((keyword) => combined.includes(keyword));
}

export function buildRunOnlyActivityWhere(): Prisma.ActivityWhereInput {
  const runClauses: Prisma.ActivityWhereInput[] = [];

  for (const keyword of RUN_ACTIVITY_KEYWORDS) {
    runClauses.push({
      sportType: { contains: keyword, mode: "insensitive" },
    });
    runClauses.push({
      type: { contains: keyword, mode: "insensitive" },
    });
  }

  return {
    OR: runClauses,
  };
}
