import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiRequest } from "../api/client";
import type { Activity, ActivityListResponse } from "../api/types";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { SectionHeader } from "../components/SectionHeader";
import { subtlePanelClass } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { formatDate, formatHours, formatMinutes } from "../utils/format";
import {
  formatCadenceFromRpm,
  formatDistanceFromMeters,
  formatElevationFromMeters,
  formatSpeedFromMetersPerSecond,
  resolveUnitPreferences,
} from "../utils/units";

type DetailMetricValue = number | null;

function mean(values: number[]) {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function percentileRank(values: number[], current: number) {
  if (values.length === 0) {
    return null;
  }

  const belowOrEqual = values.filter((value) => value <= current).length;
  return (belowOrEqual / values.length) * 100;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function asValidNumber(value: number | null | undefined): number | null {
  return value === null || value === undefined || !Number.isFinite(value) ? null : value;
}

function paceMinPerKm(speedMs: number) {
  if (!Number.isFinite(speedMs) || speedMs <= 0) {
    return null;
  }
  return 1000 / (60 * speedMs);
}

function paceFromGoal(goalDistanceKm: number | null, goalTimeSec: number | null) {
  if (
    goalDistanceKm === null ||
    goalTimeSec === null ||
    !Number.isFinite(goalDistanceKm) ||
    !Number.isFinite(goalTimeSec) ||
    goalDistanceKm <= 0 ||
    goalTimeSec <= 0
  ) {
    return null;
  }

  return goalTimeSec / 60 / goalDistanceKm;
}

function relativeDifference(value: number, reference: number) {
  if (!Number.isFinite(value) || !Number.isFinite(reference) || reference === 0) {
    return null;
  }
  return ((value - reference) / Math.abs(reference)) * 100;
}

function isRunLikeActivity(activity: Activity) {
  const combinedType = `${activity.sportType || ""} ${activity.type || ""}`.toLowerCase();
  return combinedType.includes("run") || combinedType.includes("trail") || combinedType.includes("jog");
}

function relevanceScore(current: Activity, candidate: Activity) {
  const currentDistanceKm = current.distance / 1000;
  const candidateDistanceKm = candidate.distance / 1000;
  const currentTimeMin = current.movingTime / 60;
  const candidateTimeMin = candidate.movingTime / 60;
  const currentElev = current.totalElevationGain;
  const candidateElev = candidate.totalElevationGain;

  const components: number[] = [];
  const pushDiff = (a: number, b: number) => {
    if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) {
      return;
    }
    components.push(Math.min(Math.abs(a - b) / Math.max(a, b), 1));
  };

  pushDiff(currentDistanceKm, candidateDistanceKm);
  pushDiff(currentTimeMin, candidateTimeMin);
  if (currentElev > 0 || candidateElev > 0) {
    pushDiff(currentElev + 1, candidateElev + 1);
  }

  if (components.length === 0) {
    return null;
  }

  const averageDiff = components.reduce((sum, value) => sum + value, 0) / components.length;
  return round2(Math.max(0, 100 - averageDiff * 100));
}

export function ActivityDetailPage() {
  const { token, user } = useAuth();
  const unitPreferences = resolveUnitPreferences(user);
  const { id } = useParams();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [recentComparable, setRecentComparable] = useState<Activity[]>([]);
  const [recentComparableError, setRecentComparableError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!token || !id) {
      return;
    }

    apiRequest<Activity>(`/activities/${id}`, { token })
      .then(setActivity)
      .catch((err) => setError(err instanceof Error ? err.message : "Erreur"));
  }, [id, token]);

  useEffect(() => {
    if (!token || !activity) {
      return;
    }

    const type = activity.sportType || activity.type;
    const localTo = activity.startDateLocal.slice(0, 10);
    const params = new URLSearchParams();
    params.set("type", type);
    params.set("localTo", localTo);
    params.set("sort", "startDate:desc");
    params.set("limit", "120");
    params.set("offset", "0");

    setRecentComparableError(null);
    setRecentComparable([]);
    apiRequest<ActivityListResponse>(`/activities?${params.toString()}`, { token })
      .then((response) => {
        const normalizedType = type.toLowerCase();
        const base = response.items
          .filter((item) => item.id !== activity.id)
          .filter((item) => (item.sportType || item.type).toLowerCase() === normalizedType)
          .slice(0, 20);
        setRecentComparable(base);
      })
      .catch((err) =>
        setRecentComparableError(
          err instanceof Error ? err.message : "Erreur chargement des seances comparables",
        ),
      );
  }, [activity, token]);

  const activityQuestion =
    "Agis comme un expert en sciences du sport et analyste de performance de haut niveau. Analyse cette seance avec rigueur mathematique et scientifique, sans blabla inutile. Compare obligatoirement la seance actuelle aux 20 dernieres seances comparables et a des reperes externes prudents pour des coureurs similaires. Si allure lente avec FC elevee (ex: ~6 min/km avec ~180 bpm), quantifie l'ecart, discute les hypotheses possibles et le niveau de confiance.";

  const activityAiContext = useMemo(() => {
    if (!activity) {
      return {};
    }

    const runLike = isRunLikeActivity(activity);
    const currentPace = paceMinPerKm(activity.averageSpeed);
    const targetPaceMinPerKm = paceFromGoal(user?.goalDistanceKm ?? null, user?.goalTimeSec ?? null);
    const hrMax = user?.hrMax ?? null;
    const currentAvgHrPct =
      hrMax && hrMax > 0 && activity.averageHeartrate ?
        round2((activity.averageHeartrate / hrMax) * 100)
      : null;

    const sessionsWithRelevance = recentComparable.map((session) => ({
      id: session.id,
      date: session.startDateLocal.slice(0, 10),
      type: session.sportType || session.type,
      distanceKm: round2(session.distance / 1000),
      movingTimeMin: round2(session.movingTime / 60),
      avgSpeedKmh: round2(session.averageSpeed * 3.6),
      paceMinPerKm: paceMinPerKm(session.averageSpeed),
      avgHr: asValidNumber(session.averageHeartrate),
      maxHr: asValidNumber(session.maxHeartrate),
      avgWatts: asValidNumber(session.averageWatts),
      cadence: asValidNumber(session.averageCadence),
      strideLength: asValidNumber(session.strideLength),
      groundContactTime: asValidNumber(session.groundContactTime),
      verticalOscillation: asValidNumber(session.verticalOscillation),
      relevanceScore: relevanceScore(activity, session),
    }));

    const relevantScores = sessionsWithRelevance
      .map((item) => item.relevanceScore)
      .filter((value): value is number => value !== null);

    const buildComparison = (
      label: string,
      unit: string,
      current: DetailMetricValue,
      series: Array<number | null>,
    ) => {
      const values = series.filter((value): value is number => value !== null && Number.isFinite(value));
      const baselineMean = mean(values);
      const baselineMedian = median(values);
      const deltaPct =
        current !== null && baselineMean !== null ?
          relativeDifference(current, baselineMean)
        : null;
      const percentile =
        current !== null ? percentileRank(values, current) : null;

      return {
        label,
        unit,
        current,
        baselineMean: baselineMean === null ? null : round2(baselineMean),
        baselineMedian: baselineMedian === null ? null : round2(baselineMedian),
        deltaPct: deltaPct === null ? null : round2(deltaPct),
        percentile: percentile === null ? null : round2(percentile),
        sampleSize: values.length,
      };
    };

    const comparisons = [
      buildComparison(
        "Allure",
        "min/km",
        currentPace,
        sessionsWithRelevance.map((item) => item.paceMinPerKm),
      ),
      buildComparison(
        "FC moyenne",
        "bpm",
        asValidNumber(activity.averageHeartrate),
        sessionsWithRelevance.map((item) => item.avgHr),
      ),
      buildComparison(
        "Vitesse moyenne",
        "km/h",
        round2(activity.averageSpeed * 3.6),
        sessionsWithRelevance.map((item) => item.avgSpeedKmh),
      ),
      buildComparison(
        "Cadence",
        "rpm",
        asValidNumber(activity.averageCadence),
        sessionsWithRelevance.map((item) => item.cadence),
      ),
      buildComparison(
        "Longueur de foulee",
        "m",
        asValidNumber(activity.strideLength),
        sessionsWithRelevance.map((item) => item.strideLength),
      ),
      buildComparison(
        "Contact au sol",
        "ms",
        asValidNumber(activity.groundContactTime),
        sessionsWithRelevance.map((item) => item.groundContactTime),
      ),
      buildComparison(
        "Oscillation verticale",
        "cm",
        asValidNumber(activity.verticalOscillation),
        sessionsWithRelevance.map((item) => item.verticalOscillation),
      ),
    ];

    const easyPaceHighHrFlag =
      runLike &&
      currentPace !== null &&
      currentAvgHrPct !== null &&
      currentPace >= 5.7 &&
      currentAvgHrPct >= 87;

    return {
      sectionType: "activity_detail",
      selectedActivity: {
        id: activity.id,
        date: activity.startDateLocal.slice(0, 10),
        name: activity.name,
        type: activity.sportType || activity.type,
        distanceKm: round2(activity.distance / 1000),
        movingTimeMin: round2(activity.movingTime / 60),
        elevGain: round2(activity.totalElevationGain),
        avgSpeedKmh: round2(activity.averageSpeed * 3.6),
        paceMinPerKm: currentPace === null ? null : round2(currentPace),
        avgHr: asValidNumber(activity.averageHeartrate),
        maxHr: asValidNumber(activity.maxHeartrate),
        avgWatts: asValidNumber(activity.averageWatts),
        cadence: asValidNumber(activity.averageCadence),
        strideLength: asValidNumber(activity.strideLength),
        groundContactTime: asValidNumber(activity.groundContactTime),
        verticalOscillation: asValidNumber(activity.verticalOscillation),
      },
      comparisonWindow: {
        strategy: "20 dernieres seances comparables du meme type (avant ou a la date de la seance)",
        requestedSessions: 20,
        collectedSessions: sessionsWithRelevance.length,
        reliability:
          sessionsWithRelevance.length >= 20 ? "high"
          : sessionsWithRelevance.length >= 12 ? "medium"
          : "low",
      },
      sessionRelevance: {
        meanScore: mean(relevantScores),
        medianScore: median(relevantScores),
        highRelevanceCount: relevantScores.filter((value) => value >= 75).length,
        lowRelevanceCount: relevantScores.filter((value) => value < 50).length,
        sessions: sessionsWithRelevance,
      },
      currentVsRecent20: comparisons,
      runSpecificSignals:
        !runLike ?
          null
        : {
            hrMax,
            currentAvgHrPct,
            easyPaceHighHrFlag,
            flagReason:
              easyPaceHighHrFlag ?
                "Allure plutot lente avec sollicitation cardiaque elevee pour cette seance."
              : null,
            guardrails: {
              easyRunHrPct: "65-78% FCmax",
              tempoHrPct: "80-88% FCmax",
              highIntensityHrPct: "> 88% FCmax",
            },
          },
      goalContext: {
        goalType: user?.goalType ?? null,
        goalDistanceKm: user?.goalDistanceKm ?? null,
        goalTimeSec: user?.goalTimeSec ?? null,
        targetPaceMinPerKm:
          targetPaceMinPerKm === null ? null : round2(targetPaceMinPerKm),
        currentVsTargetPacePct:
          currentPace !== null && targetPaceMinPerKm !== null && targetPaceMinPerKm > 0 ?
            round2(((currentPace - targetPaceMinPerKm) / targetPaceMinPerKm) * 100)
          : null,
      },
    };
  }, [
    activity,
    recentComparable,
    user?.hrMax,
    user?.goalType,
    user?.goalDistanceKm,
    user?.goalTimeSec,
  ]);

  const activityAiInsight =
    activity ?
      {
        token,
        payload: {
          page: "activities",
          sectionKey: `activity:${activity.id}`,
          sectionTitle: `Analyse IA - ${activity.name}`,
          sectionSubtitle: `${activity.startDateLocal.slice(0, 10)} · ${activity.sportType || activity.type}`,
          question: activityQuestion,
          context: activityAiContext,
        },
      }
    : undefined;

  const runDynamicsSummary = useMemo(() => {
    if (!activity) {
      return "Mesures de foulée estimees/calculees non disponibles.";
    }

    const availableCount = [
      activity.strideLength,
      activity.groundContactTime,
      activity.verticalOscillation,
    ].filter((value) => value !== null && value !== undefined).length;

    if (availableCount === 3) {
      return "Mesures de foulée disponibles.";
    }
    if (availableCount > 0) {
      return "Mesures de foulée partiellement disponibles.";
    }
    return "Mesures de foulée non disponibles pour cette activite.";
  }, [activity]);

  return (
    <div>
      <PageHeader description="Toutes les metriques disponibles pour l'activite." title="Activity Detail" />
      <Card>
        <div className="mb-4">
          <Link className="text-sm underline" to="/activities">
            Retour activities
          </Link>
        </div>
        <SectionHeader
          title={activity?.name ?? "Detail activite"}
          subtitle={
            activity
              ? `${formatDate(activity.startDateLocal)} · ${activity.sportType || activity.type || "Activity"}`
              : "Toutes les metriques disponibles pour cette activite."
          }
          infoHint={{
            title: "Detail activite",
            description:
              "Affiche l'ensemble des mesures synchronisees et derivees pour une analyse complete d'une sortie.",
          }}
          aiInsight={activityAiInsight}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((prev) => !prev)}
        />
        {collapsed ? (
          <p className="text-xs text-muted">Section repliee.</p>
        ) : (
          <>
            {error ? <p className="text-sm text-red-700">{error}</p> : null}
            {!error && !activity ? <p className="text-sm text-muted">Chargement de l'activite...</p> : null}
            {recentComparableError ? (
              <p className="mb-3 text-xs text-red-700">
                Contexte IA: impossible de charger les seances comparables ({recentComparableError}).
              </p>
            ) : null}
            {activity ? (
              <>
                <p className="mb-1 text-xs text-muted">{runDynamicsSummary}</p>
                <p className="mb-3 text-xs text-muted">
                  IA: comparaison avec {recentComparable.length} seances comparables (objectif: 20).
                </p>
              </>
            ) : null}
            {activity ? (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <Metric label="Nom" value={activity.name} />
            <Metric label="Date" value={formatDate(activity.startDateLocal)} />
            <Metric label="Type" value={activity.sportType || activity.type} />
            <Metric label="Distance" value={formatDistanceFromMeters(activity.distance, unitPreferences)} />
            <Metric label="Moving time" value={formatHours(activity.movingTime)} />
            <Metric label="Elapsed time" value={formatHours(activity.elapsedTime)} />
            <Metric label="D+" value={formatElevationFromMeters(activity.totalElevationGain, unitPreferences)} />
            <Metric label="Vitesse moyenne" value={formatSpeedFromMetersPerSecond(activity.averageSpeed, unitPreferences)} />
            <Metric label="Vitesse max" value={formatSpeedFromMetersPerSecond(activity.maxSpeed, unitPreferences)} />
            <Metric label="HR moyenne" value={activity.averageHeartrate ? `${activity.averageHeartrate.toFixed(0)} bpm` : "-"} />
            <Metric label="HR max" value={activity.maxHeartrate ? `${activity.maxHeartrate.toFixed(0)} bpm` : "-"} />
            <Metric label="Watts moyenne" value={activity.averageWatts ? `${activity.averageWatts.toFixed(0)} W` : "-"} />
            <Metric label="Watts max" value={activity.maxWatts ? `${activity.maxWatts.toFixed(0)} W` : "-"} />
            <Metric
              label="Watts ponderes"
              value={activity.weightedAverageWatts ? `${activity.weightedAverageWatts.toFixed(0)} W` : "-"}
            />
            <Metric
              label="Cadence"
              value={activity.averageCadence ? formatCadenceFromRpm(activity.averageCadence, unitPreferences, 0) : "-"}
            />
            <Metric
              label="Longueur de foulee"
              value={
                activity.strideLength !== null && activity.strideLength !== undefined ?
                  `${activity.strideLength.toFixed(2)} m`
                : "-"
              }
            />
            <Metric
              label="Contact au sol"
              value={
                activity.groundContactTime !== null &&
                activity.groundContactTime !== undefined ?
                  `${activity.groundContactTime.toFixed(0)} ms`
                : "-"
              }
            />
            <Metric
              label="Oscillation verticale"
              value={
                activity.verticalOscillation !== null &&
                activity.verticalOscillation !== undefined ?
                  `${activity.verticalOscillation.toFixed(2)} cm`
                : "-"
              }
            />
            <Metric label="Suffer score" value={activity.sufferScore ? activity.sufferScore.toFixed(1) : "-"} />
            <Metric label="Energie" value={activity.kilojoules ? `${activity.kilojoules.toFixed(0)} kJ` : "-"} />
            <Metric label="Calories" value={activity.calories ? `${activity.calories.toFixed(0)} kcal` : "-"} />
            <Metric label="Flags" value={[activity.trainer && "trainer", activity.commute && "commute", activity.manual && "manual"].filter(Boolean).join(", ") || "-"} />
            <Metric label="Temps en minutes" value={formatMinutes(activity.movingTime)} />
          </div>
            ) : null}
          </>
        )}
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className={subtlePanelClass}>
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-sm">{value}</p>
    </div>
  );
}
