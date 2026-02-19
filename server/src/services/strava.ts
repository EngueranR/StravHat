import { type Activity } from "@prisma/client";
import { prisma } from "../db.js";
import type { StravaActivity, StravaTokenResponse } from "../types/strava.js";
import { estimateCalories } from "../utils/calories.js";
import { resolveRunDynamics } from "../utils/runDynamics.js";
import {
  decryptSecret,
  decryptSecretIfEncrypted,
  encryptSecret,
  isEncryptedSecret,
} from "../utils/security.js";

const STRAVA_OAUTH_URL = "https://www.strava.com/oauth/token";
const STRAVA_ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities";

interface StravaAppCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export class MissingStravaCredentialsError extends Error {}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function exchangeToken(params: Record<string, string>, credentials: StravaAppCredentials) {
  const body = new URLSearchParams({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
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

export async function resolveUserStravaAppCredentials(
  userId: string,
): Promise<StravaAppCredentials> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      stravaClientIdEnc: true,
      stravaClientSecretEnc: true,
      stravaRedirectUriEnc: true,
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  if (
    !user.stravaClientIdEnc ||
    !user.stravaClientSecretEnc ||
    !user.stravaRedirectUriEnc
  ) {
    throw new MissingStravaCredentialsError(
      "Credentials Strava manquants: configure ton Client ID / Secret / Redirect URI dans Strava Credentials.",
    );
  }

  return {
    clientId: decryptSecret(user.stravaClientIdEnc),
    clientSecret: decryptSecret(user.stravaClientSecretEnc),
    redirectUri: decryptSecret(user.stravaRedirectUriEnc),
  };
}

function resolveRefreshCredentials(input: {
  oauthClientIdEnc: string | null;
  oauthClientSecretEnc: string | null;
  fallback: StravaAppCredentials;
}) {
  if (!input.oauthClientIdEnc || !input.oauthClientSecretEnc) {
    return input.fallback;
  }

  return {
    clientId: decryptSecret(input.oauthClientIdEnc),
    clientSecret: decryptSecret(input.oauthClientSecretEnc),
    redirectUri: input.fallback.redirectUri,
  };
}

export function stravaAuthorizeUrl(credentials: StravaAppCredentials, state?: string) {
  const url = new URL("https://www.strava.com/oauth/authorize");
  url.searchParams.set("client_id", credentials.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("approval_prompt", "auto");
  url.searchParams.set("scope", "read,activity:read_all");
  url.searchParams.set("redirect_uri", credentials.redirectUri);
  if (state) {
    url.searchParams.set("state", state);
  }

  return url.toString();
}

export async function exchangeCodeForToken(
  code: string,
  credentials: StravaAppCredentials,
) {
  return exchangeToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: credentials.redirectUri,
  }, credentials);
}

export async function refreshStravaToken(refreshToken: string, credentials: StravaAppCredentials) {
  return exchangeToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  }, credentials);
}

export async function getValidAccessToken(userId: string) {
  const token = await prisma.stravaToken.findUnique({
    where: { userId },
    select: {
      accessToken: true,
      refreshToken: true,
      expiresAt: true,
      oauthClientIdEnc: true,
      oauthClientSecretEnc: true,
    },
  });

  if (!token) {
    throw new Error("Strava not connected");
  }

  const decryptedAccessToken = decryptSecretIfEncrypted(token.accessToken);
  const decryptedRefreshToken = decryptSecretIfEncrypted(token.refreshToken);
  const requiresTokenReEncryption =
    !isEncryptedSecret(token.accessToken) || !isEncryptedSecret(token.refreshToken);
  const expiresSoon = token.expiresAt.getTime() <= Date.now() + 60_000;

  if (!expiresSoon) {
    if (requiresTokenReEncryption) {
      await prisma.stravaToken.update({
        where: { userId },
        data: {
          accessToken: encryptSecret(decryptedAccessToken),
          refreshToken: encryptSecret(decryptedRefreshToken),
        },
      });
    }

    return decryptedAccessToken;
  }

  const fallbackCredentials = await resolveUserStravaAppCredentials(userId);
  const refreshCredentials = resolveRefreshCredentials({
    oauthClientIdEnc: token.oauthClientIdEnc,
    oauthClientSecretEnc: token.oauthClientSecretEnc,
    fallback: fallbackCredentials,
  });
  const refreshed = await refreshStravaToken(decryptedRefreshToken, refreshCredentials);

  await prisma.stravaToken.update({
    where: { userId },
    data: {
      accessToken: encryptSecret(refreshed.access_token),
      refreshToken: encryptSecret(refreshed.refresh_token),
      expiresAt: new Date(refreshed.expires_at * 1000),
      oauthClientIdEnc: token.oauthClientIdEnc ?? encryptSecret(refreshCredentials.clientId),
      oauthClientSecretEnc:
        token.oauthClientSecretEnc ?? encryptSecret(refreshCredentials.clientSecret),
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
