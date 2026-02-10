import { type Activity } from "@prisma/client";
import { env } from "../config.js";
import { prisma } from "../db.js";
import type { StravaActivity, StravaTokenResponse } from "../types/strava.js";
import { estimateCalories } from "../utils/calories.js";
import { resolveRunDynamics } from "../utils/runDynamics.js";

const STRAVA_OAUTH_URL = "https://www.strava.com/oauth/token";
const STRAVA_ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function exchangeToken(params: Record<string, string>) {
  const body = new URLSearchParams({
    client_id: env.STRAVA_CLIENT_ID,
    client_secret: env.STRAVA_CLIENT_SECRET,
    ...params,
  });

  const response = await fetch(STRAVA_OAUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Strava token exchange failed (${response.status}): ${message}`);
  }

  return (await response.json()) as StravaTokenResponse;
}

export function stravaAuthorizeUrl(redirectUri?: string, state?: string) {
  const url = new URL("https://www.strava.com/oauth/authorize");
  url.searchParams.set("client_id", env.STRAVA_CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("approval_prompt", "auto");
  url.searchParams.set("scope", "read,activity:read_all");
  url.searchParams.set("redirect_uri", redirectUri ?? env.STRAVA_REDIRECT_URI);
  if (state) {
    url.searchParams.set("state", state);
  }

  return url.toString();
}

export async function exchangeCodeForToken(code: string, redirectUri?: string) {
  return exchangeToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri ?? env.STRAVA_REDIRECT_URI,
  });
}

export async function refreshStravaToken(refreshToken: string) {
  return exchangeToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

export async function getValidAccessToken(userId: string) {
  const token = await prisma.stravaToken.findUnique({
    where: { userId },
  });

  if (!token) {
    throw new Error("Strava not connected");
  }

  const expiresSoon = token.expiresAt.getTime() <= Date.now() + 60_000;

  if (!expiresSoon) {
    return token.accessToken;
  }

  const refreshed = await refreshStravaToken(token.refreshToken);

  await prisma.stravaToken.update({
    where: { userId },
    data: {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      expiresAt: new Date(refreshed.expires_at * 1000),
    },
  });

  return refreshed.access_token;
}

async function fetchActivityPage(accessToken: string, page: number, retry = 0): Promise<StravaActivity[]> {
  const url = new URL(STRAVA_ACTIVITIES_URL);
  url.searchParams.set("per_page", "200");
  url.searchParams.set("page", String(page));

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status === 429) {
    if (retry >= 6) {
      throw new Error("Strava rate limit exceeded after retries");
    }

    const retryAfterRaw = response.headers.get("retry-after");
    const retryAfter = retryAfterRaw ? Number(retryAfterRaw) : 0;
    const waitMs = Math.max(1_000, (Number.isFinite(retryAfter) ? retryAfter : 0) * 1_000 + 2 ** retry * 500);
    await sleep(waitMs);
    return fetchActivityPage(accessToken, page, retry + 1);
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Strava activities failed (${response.status}): ${message}`);
  }

  return (await response.json()) as StravaActivity[];
}

function mapActivity(
  userId: string,
  strava: StravaActivity,
  userProfile?: { hrMax: number; weightKg: number | null; age: number | null; heightCm: number | null } | null,
): Omit<Activity, "id" | "importedAt" | "updatedAt"> {
  const runDynamics = resolveRunDynamics({
    type: strava.type,
    sportType: strava.sport_type ?? strava.type,
    averageSpeed: strava.average_speed ?? 0,
    averageCadence: strava.average_cadence ?? null,
    strideLength: null,
    groundContactTime: null,
    verticalOscillation: null,
  });

  const mapped: Omit<Activity, "id" | "importedAt" | "updatedAt"> = {
    userId,
    stravaActivityId: String(strava.id),
    name: strava.name,
    type: strava.type,
    sportType: strava.sport_type ?? strava.type,
    startDate: new Date(strava.start_date),
    startDateLocal: new Date(strava.start_date_local),
    timezone: strava.timezone,
    distance: strava.distance ?? 0,
    movingTime: strava.moving_time ?? 0,
    elapsedTime: strava.elapsed_time ?? 0,
    totalElevationGain: strava.total_elevation_gain ?? 0,
    averageSpeed: strava.average_speed ?? 0,
    maxSpeed: strava.max_speed ?? 0,
    averageHeartrate: strava.average_heartrate ?? null,
    maxHeartrate: strava.max_heartrate ?? null,
    averageWatts: strava.average_watts ?? null,
    maxWatts: strava.max_watts ?? null,
    weightedAverageWatts: strava.weighted_average_watts ?? null,
    kilojoules: strava.kilojoules ?? null,
    calories: strava.calories ?? null,
    averageCadence: strava.average_cadence ?? null,
    strideLength: runDynamics?.strideLength ?? null,
    groundContactTime: runDynamics?.groundContactTime ?? null,
    verticalOscillation: runDynamics?.verticalOscillation ?? null,
    sufferScore: strava.suffer_score ?? null,
    trainer: strava.trainer ?? false,
    commute: strava.commute ?? false,
    manual: strava.manual ?? false,
    hasHeartrate: strava.has_heartrate ?? false,
  };

  if (mapped.calories === null || mapped.calories <= 0) {
    mapped.calories = estimateCalories(mapped, {
      hrMax: userProfile?.hrMax ?? null,
      weightKg: userProfile?.weightKg ?? null,
      age: userProfile?.age ?? null,
      heightCm: userProfile?.heightCm ?? null,
    });
  }

  return mapped;
}

export async function importAllActivities(userId: string) {
  let accessToken = await getValidAccessToken(userId);
  const userProfile = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      hrMax: true,
      weightKg: true,
      age: true,
      heightCm: true,
    },
  });

  let page = 1;
  let imported = 0;
  let pages = 0;

  while (true) {
    let activities: StravaActivity[];

    try {
      activities = await fetchActivityPage(accessToken, page);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown import error";

      if (message.includes("401")) {
        accessToken = await getValidAccessToken(userId);
        activities = await fetchActivityPage(accessToken, page);
      } else {
        throw error;
      }
    }

    if (activities.length === 0) {
      break;
    }

    pages += 1;

    await prisma.$transaction(
      activities.map((activity) => {
        const mapped = mapActivity(userId, activity, userProfile);

        return prisma.activity.upsert({
          where: {
            stravaActivityId: mapped.stravaActivityId,
          },
          create: mapped,
          update: {
            ...mapped,
          },
        });
      }),
    );

    imported += activities.length;
    page += 1;
  }

  return {
    imported,
    pages,
  };
}
