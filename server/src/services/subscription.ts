import { SubscriptionTier, UsageFeature } from '@prisma/client';
import { prisma } from '../db.js';

type QuotaWindow = 'day' | 'week';

interface FeatureQuotaDefinition {
  limit: number;
  window: QuotaWindow;
}

export interface SubscriptionPlanLimits {
  stravaImportsPerDay: number;
  aiRequestsPerDay: number;
  trainingPlansPerWindow: number;
  trainingPlanWindow: QuotaWindow;
}

const adminUnlimitedLimits: SubscriptionPlanLimits = {
  stravaImportsPerDay: Number.MAX_SAFE_INTEGER,
  aiRequestsPerDay: Number.MAX_SAFE_INTEGER,
  trainingPlansPerWindow: Number.MAX_SAFE_INTEGER,
  trainingPlanWindow: 'day',
};

const limitsByTier: Record<SubscriptionTier, SubscriptionPlanLimits> = {
  FREE: {
    stravaImportsPerDay: 1,
    aiRequestsPerDay: 5,
    trainingPlansPerWindow: 1,
    trainingPlanWindow: 'week',
  },
  SUPPORTER: {
    stravaImportsPerDay: 5,
    aiRequestsPerDay: 20,
    trainingPlansPerWindow: 1,
    trainingPlanWindow: 'day',
  },
};

export function planDisplayName(tier: SubscriptionTier, isAdmin = false) {
  if (isAdmin) {
    return 'Administration';
  }
  return tier === 'SUPPORTER' ? 'Ravito' : 'Gratuit';
}

export function planTagline(tier: SubscriptionTier, isAdmin = false) {
  if (isAdmin) {
    return 'Acces administrateur avec quotas illimites.';
  }
  return tier === 'SUPPORTER' ?
      "Tu soutiens l'auteur et tu debloques des quotas elargis."
    : 'Plan de base pour demarrer.';
}

export function getPlanLimits(
  tier: SubscriptionTier,
  isAdmin = false,
): SubscriptionPlanLimits {
  if (isAdmin) {
    return adminUnlimitedLimits;
  }
  return limitsByTier[tier];
}

function quotaDefinitionForFeature(
  tier: SubscriptionTier,
  isAdmin: boolean,
  feature: UsageFeature,
): FeatureQuotaDefinition {
  const limits = getPlanLimits(tier, isAdmin);
  if (feature === 'AI_REQUEST') {
    return {
      limit: limits.aiRequestsPerDay,
      window: 'day',
    };
  }
  if (feature === 'STRAVA_IMPORT') {
    return {
      limit: limits.stravaImportsPerDay,
      window: 'day',
    };
  }
  return {
    limit: limits.trainingPlansPerWindow,
    window: limits.trainingPlanWindow,
  };
}

function startOfUtcDay(date = new Date()) {
  const result = new Date(date);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

function startOfUtcIsoWeek(date = new Date()) {
  const dayStart = startOfUtcDay(date);
  const dayOfWeek = dayStart.getUTCDay();
  const isoOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  dayStart.setUTCDate(dayStart.getUTCDate() - isoOffset);
  return dayStart;
}

function resetAtForWindow(window: QuotaWindow, bucketStart: Date) {
  const resetAt = new Date(bucketStart);
  resetAt.setUTCDate(resetAt.getUTCDate() + (window === 'day' ? 1 : 7));
  return resetAt;
}

function featureLabel(feature: UsageFeature) {
  if (feature === 'STRAVA_IMPORT') {
    return 'import Strava';
  }
  if (feature === 'AI_REQUEST') {
    return 'requete IA';
  }
  return "plan d'entrainement";
}

export interface ConsumedQuota {
  allowed: boolean;
  userId: string;
  feature: UsageFeature;
  tier: SubscriptionTier;
  isUnlimited: boolean;
  limit: number;
  used: number;
  remaining: number;
  window: QuotaWindow;
  bucketStart: string;
  resetAt: string;
  message: string | null;
}

export async function consumeQuota(
  userId: string,
  feature: UsageFeature,
): Promise<ConsumedQuota> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionTier: true, isAdmin: true },
  });

  if (!user) {
    throw new Error('Utilisateur introuvable');
  }

  const tier = user.subscriptionTier;
  const isUnlimited = !!user.isAdmin;

  if (isUnlimited) {
    const now = new Date();
    return {
      allowed: true,
      userId,
      feature,
      tier,
      isUnlimited: true,
      limit: Number.MAX_SAFE_INTEGER,
      used: 0,
      remaining: Number.MAX_SAFE_INTEGER,
      window: 'day',
      bucketStart: startOfUtcDay(now).toISOString(),
      resetAt: now.toISOString(),
      message: null,
    };
  }

  const definition = quotaDefinitionForFeature(tier, isUnlimited, feature);
  const bucketStart =
    definition.window === 'day' ? startOfUtcDay() : startOfUtcIsoWeek();

  const result = await prisma.$transaction(async (tx) => {
    await tx.usageCounter.upsert({
      where: {
        userId_feature_bucketStart: {
          userId,
          feature,
          bucketStart,
        },
      },
      update: {},
      create: {
        userId,
        feature,
        bucketStart,
        count: 0,
      },
    });

    const updated = await tx.usageCounter.updateMany({
      where: {
        userId,
        feature,
        bucketStart,
        count: { lt: definition.limit },
      },
      data: {
        count: { increment: 1 },
      },
    });

    const current = await tx.usageCounter.findUnique({
      where: {
        userId_feature_bucketStart: {
          userId,
          feature,
          bucketStart,
        },
      },
      select: { count: true },
    });

    return {
      incremented: updated.count > 0,
      count: current?.count ?? 0,
    };
  });

  const used = result.count;
  const remaining = Math.max(definition.limit - used, 0);
  const resetAt = resetAtForWindow(definition.window, bucketStart);
  const windowLabel =
    definition.window === 'day' ? "aujourd'hui" : 'cette semaine';
  const planName = planDisplayName(tier);
  const message =
    result.incremented ? null : (
      `Quota ${featureLabel(feature)} atteint (${used}/${definition.limit} ${windowLabel}). Plan actuel: ${planName}. Merci de votre soutien pour debloquer plus de quota directement dans la section Settings!`
    );

  return {
    allowed: result.incremented,
    userId,
    feature,
    tier,
    isUnlimited: false,
    limit: definition.limit,
    used,
    remaining,
    window: definition.window,
    bucketStart: bucketStart.toISOString(),
    resetAt: resetAt.toISOString(),
    message,
  };
}
