import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../api/client";
import type { Activity, ActivityListResponse } from "../api/types";
import { Card } from "../components/Card";
import { FilterToggleButton } from "../components/FilterToggleButton";
import { MobileTabs } from "../components/MobileTabs";
import { PageHeader } from "../components/PageHeader";
import { SectionHeader } from "../components/SectionHeader";
import {
  checkboxPillClass,
  inputClass,
  secondaryButtonCompactClass,
  selectClass,
} from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { formatDate, formatHours } from "../utils/format";
import {
  cadenceUnitLabel,
  distanceUnitLabel,
  elevationUnitLabel,
  formatCadenceFromRpm,
  formatDistanceFromMeters,
  formatElevationFromMeters,
  formatSpeedFromMetersPerSecond,
  resolveUnitPreferences,
  speedUnitLabel,
} from "../utils/units";
import { buildActivityFilterQuery, type ActivityFilterState } from "../utils/activityFilters";

const PAGE_SIZE = 30;
const AI_POOL_FETCH_LIMIT = 500;
type SectionKey = "filters" | "list";
type ActivitiesMobileTab = "filters" | "list";
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

function quantile(values: number[], q: number) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * q;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return sorted[lower];
  }
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
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

function relevanceScore(reference: Activity, candidate: Activity) {
  const referenceDistanceKm = reference.distance / 1000;
  const candidateDistanceKm = candidate.distance / 1000;
  const referenceTimeMin = reference.movingTime / 60;
  const candidateTimeMin = candidate.movingTime / 60;
  const referenceElev = reference.totalElevationGain;
  const candidateElev = candidate.totalElevationGain;

  const components: number[] = [];
  const pushDiff = (a: number, b: number) => {
    if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) {
      return;
    }
    components.push(Math.min(Math.abs(a - b) / Math.max(a, b), 1));
  };

  pushDiff(referenceDistanceKm, candidateDistanceKm);
  pushDiff(referenceTimeMin, candidateTimeMin);
  if (referenceElev > 0 || candidateElev > 0) {
    pushDiff(referenceElev + 1, candidateElev + 1);
  }

  if (components.length === 0) {
    return null;
  }

  const averageDiff = components.reduce((sum, value) => sum + value, 0) / components.length;
  return round2(Math.max(0, 100 - averageDiff * 100));
}

export function ActivitiesPage() {
  const { token, user } = useAuth();
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const [mobileTab, setMobileTab] = useState<ActivitiesMobileTab>("filters");
  const unitPreferences = resolveUnitPreferences(user);
  const [filters, setFilters] = useState<ActivityFilterState>({
    q: "",
    type: "",
    from: "",
    to: "",
    hasHR: false,
    hasPower: false,
    minDistanceKm: "",
    maxDistanceKm: "",
    minTimeMin: "",
    maxTimeMin: "",
    minElev: "",
    maxElev: "",
    minAvgHR: "",
    maxAvgHR: "",
    minAvgSpeedKmh: "",
    maxAvgSpeedKmh: "",
    minAvgWatts: "",
    maxAvgWatts: "",
    minCadence: "",
    maxCadence: "",
    minCalories: "",
    maxCalories: "",
    minKilojoules: "",
    maxKilojoules: "",
  });
  const [sort, setSort] = useState("startDate:desc");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<ActivityListResponse | null>(null);
  const [allActivitiesForAi, setAllActivitiesForAi] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiPoolLoading, setAiPoolLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiPoolError, setAiPoolError] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<SectionKey, boolean>>({
    filters: isMobile,
    list: false,
  });

  const qs = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(offset));
    params.set("sort", sort);
    const filterQuery = buildActivityFilterQuery(filters);
    if (filterQuery) {
      filterQuery.split("&").forEach((pair) => {
        const [key, value] = pair.split("=");
        params.set(key, decodeURIComponent(value ?? ""));
      });
    }
    return params.toString();
  }, [offset, sort, filters]);

  const aiPoolBaseQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", String(AI_POOL_FETCH_LIMIT));
    params.set("offset", "0");
    params.set("sort", sort);
    const filterQuery = buildActivityFilterQuery(filters);
    if (filterQuery) {
      filterQuery.split("&").forEach((pair) => {
        const [key, value] = pair.split("=");
        params.set(key, decodeURIComponent(value ?? ""));
      });
    }
    return params.toString();
  }, [sort, filters]);

  useEffect(() => {
    if (!token) {
      return;
    }

    setLoading(true);
    setError(null);

    apiRequest<ActivityListResponse>(`/activities?${qs}`, { token })
      .then(setData)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Erreur chargement activites");
      })
      .finally(() => setLoading(false));
  }, [qs, token]);

  useEffect(() => {
    if (!token) {
      setAllActivitiesForAi([]);
      setAiPoolError(null);
      return;
    }

    let cancelled = false;
    const loadAllForAi = async () => {
      setAiPoolLoading(true);
      setAiPoolError(null);
      try {
        const allItems: Activity[] = [];
        let nextOffset = 0;
        let total = 0;

        do {
          const params = new URLSearchParams(aiPoolBaseQuery);
          params.set("offset", String(nextOffset));
          const response = await apiRequest<ActivityListResponse>(`/activities?${params.toString()}`, { token });

          allItems.push(...response.items);
          total = response.total;
          nextOffset += response.limit;

          if (response.items.length === 0) {
            break;
          }
        } while (nextOffset < total);

        if (!cancelled) {
          setAllActivitiesForAi(allItems);
        }
      } catch (err) {
        if (!cancelled) {
          setAllActivitiesForAi([]);
          setAiPoolError(err instanceof Error ? err.message : "Erreur chargement contexte IA");
        }
      } finally {
        if (!cancelled) {
          setAiPoolLoading(false);
        }
      }
    };

    void loadAllForAi();

    return () => {
      cancelled = true;
    };
  }, [aiPoolBaseQuery, token]);

  const listAiQuestion =
    "Agis comme un expert en sciences du sport et analyste de performance de haut niveau. Fais une analyse globale de l'ensemble des seances filtrees avec une lecture population interne (toutes les seances), sans centrer l'analyse sur une seance unique. Identifie les tendances de fond, les metriques stables/instables, et les priorites d'entrainement les plus utiles.";

  const listAiContext = useMemo(() => {
    if (allActivitiesForAi.length === 0) {
      return {};
    }

    const sessions = [...allActivitiesForAi].sort(
      (a, b) => new Date(b.startDateLocal).getTime() - new Date(a.startDateLocal).getTime(),
    );
    const sessionCount = sessions.length;
    const sliceSize = Math.max(1, Math.floor(sessionCount / 3));
    const recentSlice = sessions.slice(0, sliceSize);
    const olderSlice = sessions.slice(-sliceSize);
    const runSessions = sessions.filter((session) => isRunLikeActivity(session));

    const targetPaceMinPerKm = paceFromGoal(user?.goalDistanceKm ?? null, user?.goalTimeSec ?? null);
    const hrMax = user?.hrMax ?? null;

    const collectValues = (selector: (session: Activity) => number | null) =>
      sessions
        .map(selector)
        .filter((value): value is number => value !== null && Number.isFinite(value));

    const collectSliceValues = (slice: Activity[], selector: (session: Activity) => number | null) =>
      slice
        .map(selector)
        .filter((value): value is number => value !== null && Number.isFinite(value));

    const summarizeMetric = (label: string, unit: string, values: number[]) => ({
      label,
      unit,
      sampleSize: values.length,
      mean: mean(values) === null ? null : round2(mean(values)!),
      median: median(values) === null ? null : round2(median(values)!),
      p10: quantile(values, 0.1) === null ? null : round2(quantile(values, 0.1)!),
      p90: quantile(values, 0.9) === null ? null : round2(quantile(values, 0.9)!),
      min: values.length === 0 ? null : round2(Math.min(...values)),
      max: values.length === 0 ? null : round2(Math.max(...values)),
    });

    const metricDefinitions: Array<{
      key: string;
      label: string;
      unit: string;
      selector: (session: Activity) => number | null;
    }> = [
      { key: "pace", label: "Allure", unit: "min/km", selector: (session) => paceMinPerKm(session.averageSpeed) },
      { key: "avgHr", label: "FC moyenne", unit: "bpm", selector: (session) => asValidNumber(session.averageHeartrate) },
      { key: "avgSpeed", label: "Vitesse moyenne", unit: "km/h", selector: (session) => round2(session.averageSpeed * 3.6) },
      { key: "cadence", label: "Cadence", unit: "rpm", selector: (session) => asValidNumber(session.averageCadence) },
      { key: "strideLength", label: "Longueur de foulee", unit: "m", selector: (session) => asValidNumber(session.strideLength) },
      { key: "gct", label: "Contact au sol", unit: "ms", selector: (session) => asValidNumber(session.groundContactTime) },
      { key: "vo", label: "Oscillation verticale", unit: "cm", selector: (session) => asValidNumber(session.verticalOscillation) },
      { key: "avgWatts", label: "Watts moyens", unit: "W", selector: (session) => asValidNumber(session.averageWatts) },
    ];

    const metricsGlobalSummary = metricDefinitions.map((definition) =>
      summarizeMetric(definition.label, definition.unit, collectValues(definition.selector)),
    );

    const trendOldestVsRecent = metricDefinitions.map((definition) => {
      const olderMean = mean(collectSliceValues(olderSlice, definition.selector));
      const recentMean = mean(collectSliceValues(recentSlice, definition.selector));
      const deltaPct =
        olderMean !== null && recentMean !== null ?
          relativeDifference(recentMean, olderMean)
        : null;

      return {
        key: definition.key,
        label: definition.label,
        unit: definition.unit,
        olderMean: olderMean === null ? null : round2(olderMean),
        recentMean: recentMean === null ? null : round2(recentMean),
        deltaPct: deltaPct === null ? null : round2(deltaPct),
        olderSampleSize: collectSliceValues(olderSlice, definition.selector).length,
        recentSampleSize: collectSliceValues(recentSlice, definition.selector).length,
      };
    });

    const typeMap = new Map<string, number>();
    for (const session of sessions) {
      const key = session.sportType || session.type;
      typeMap.set(key, (typeMap.get(key) ?? 0) + 1);
    }

    const distanceKmSeries = sessions.map((session) => session.distance / 1000);
    const movingTimeMinSeries = sessions.map((session) => session.movingTime / 60);
    const elevGainSeries = sessions.map((session) => session.totalElevationGain);
    const paceSeries = collectValues((session) => paceMinPerKm(session.averageSpeed));

    const runHrPercentages =
      hrMax && hrMax > 0 ?
        runSessions
          .map((session) =>
            session.averageHeartrate && Number.isFinite(session.averageHeartrate) ?
              (session.averageHeartrate / hrMax) * 100
            : null,
          )
          .filter((value): value is number => value !== null)
      : [];

    const runHrZones =
      runHrPercentages.length === 0 ?
        null
      : {
          z1_under_65: runHrPercentages.filter((value) => value < 65).length,
          z2_65_78: runHrPercentages.filter((value) => value >= 65 && value < 78).length,
          z3_78_88: runHrPercentages.filter((value) => value >= 78 && value < 88).length,
          z4_88_94: runHrPercentages.filter((value) => value >= 88 && value < 94).length,
          z5_over_94: runHrPercentages.filter((value) => value >= 94).length,
        };

    const meanPace = mean(paceSeries);

    return {
      sectionType: "activities_list_global",
      analysisScope: {
        mode: "global",
        focusRule: "Analyse de fond sur l'ensemble des seances filtrees, sans focus principal sur une seance unique.",
      },
      globalWindow: {
        totalSessions: sessionCount,
        recentSliceSize: recentSlice.length,
        olderSliceSize: olderSlice.length,
        newestDate: sessions[0]?.startDateLocal.slice(0, 10) ?? null,
        oldestDate: sessions[sessions.length - 1]?.startDateLocal.slice(0, 10) ?? null,
      },
      globalSummary: {
        totalDistanceKm: round2(distanceKmSeries.reduce((sum, value) => sum + value, 0)),
        totalMovingTimeHours: round2(movingTimeMinSeries.reduce((sum, value) => sum + value, 0) / 60),
        totalElevGainM: round2(elevGainSeries.reduce((sum, value) => sum + value, 0)),
        avgDistancePerSessionKm: mean(distanceKmSeries) === null ? null : round2(mean(distanceKmSeries)!),
        avgMovingTimePerSessionMin: mean(movingTimeMinSeries) === null ? null : round2(mean(movingTimeMinSeries)!),
        avgPaceMinPerKm: meanPace === null ? null : round2(meanPace),
      },
      poolSummary: {
        typeBreakdown: [...typeMap.entries()]
          .map(([type, count]) => ({ type, count }))
          .sort((a, b) => b.count - a.count),
      },
      metricsGlobalSummary,
      trendOldestVsRecent,
      runSpecificSignals:
        runSessions.length === 0 ?
          null
        : {
            runSessionsCount: runSessions.length,
            hrMax,
            avgHrPctFcMax:
              runHrPercentages.length === 0 ? null : round2(mean(runHrPercentages)!),
            hrZoneDistributionBySession: runHrZones,
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
        globalMeanVsTargetPacePct:
          meanPace !== null && targetPaceMinPerKm !== null && targetPaceMinPerKm > 0 ?
            round2(((meanPace - targetPaceMinPerKm) / targetPaceMinPerKm) * 100)
          : null,
      },
      sampleSessions: {
        recentSample: sessions.slice(0, 20).map((session) => ({
          id: session.id,
          date: session.startDateLocal.slice(0, 10),
          type: session.sportType || session.type,
          distanceKm: round2(session.distance / 1000),
          movingTimeMin: round2(session.movingTime / 60),
          paceMinPerKm: paceMinPerKm(session.averageSpeed),
          avgHr: asValidNumber(session.averageHeartrate),
        })),
        oldestSample: sessions.slice(-20).map((session) => ({
          id: session.id,
          date: session.startDateLocal.slice(0, 10),
          type: session.sportType || session.type,
          distanceKm: round2(session.distance / 1000),
          movingTimeMin: round2(session.movingTime / 60),
          paceMinPerKm: paceMinPerKm(session.averageSpeed),
          avgHr: asValidNumber(session.averageHeartrate),
        })),
      },
    };
  }, [
    allActivitiesForAi,
    user?.hrMax,
    user?.goalType,
    user?.goalDistanceKm,
    user?.goalTimeSec,
  ]);

  const listAiInsight =
    allActivitiesForAi.length > 0 ?
      {
        token,
        payload: {
          page: "activities",
          sectionKey: "activities:list",
          sectionTitle: "Analyse IA - Liste des activites",
          sectionSubtitle: `${allActivitiesForAi.length} seances filtrees`,
          question: listAiQuestion,
          context: listAiContext,
        },
      }
    : undefined;

  const nextDisabled = !data || data.offset + data.limit >= data.total;

  return (
    <div>
      <PageHeader description="Historique complet avec filtres/tri/recherche." title="Activities" />
      {isMobile ? (
        <MobileTabs
          activeKey={mobileTab}
          onChange={setMobileTab}
          tabs={[
            { key: "filters", label: "Filtres" },
            { key: "list", label: "Liste" },
          ]}
        />
      ) : null}
      {!isMobile || mobileTab === "filters" ? <Card>
        <SectionHeader
          title="Filtres activites"
          subtitle="Recherche, periode, tri et filtres avances"
          infoHint={{
            title: "Filtres",
            description:
              "Utilise les filtres rapides puis les filtres avances pour affiner le tableau sans perdre la pagination.",
          }}
          rightActions={
            <FilterToggleButton
              collapsed={collapsedSections.filters}
              onToggle={() =>
                setCollapsedSections((prev) => ({ ...prev, filters: !prev.filters }))
              }
            />
          }
        />
        {collapsedSections.filters ? (
          <p className="text-xs text-muted">Section repliee.</p>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-7">
              <input
                className={inputClass}
                onChange={(e) => {
                  setOffset(0);
                  setFilters((prev) => ({ ...prev, q: e.target.value }));
                }}
                placeholder="Recherche nom"
                value={filters.q ?? ""}
              />
              <input
                className={inputClass}
                onChange={(e) => {
                  setOffset(0);
                  setFilters((prev) => ({ ...prev, type: e.target.value }));
                }}
                placeholder="Type (Run, Ride...)"
                value={filters.type ?? ""}
              />
              <input
                className={inputClass}
                onChange={(e) => {
                  setOffset(0);
                  setFilters((prev) => ({ ...prev, from: e.target.value }));
                }}
                type="date"
                value={filters.from ?? ""}
              />
              <input
                className={inputClass}
                onChange={(e) => {
                  setOffset(0);
                  setFilters((prev) => ({ ...prev, to: e.target.value }));
                }}
                type="date"
                value={filters.to ?? ""}
              />
              <select
                className={selectClass}
                onChange={(e) => {
                  setOffset(0);
                  setSort(e.target.value);
                }}
                value={sort}
              >
                <option value="startDate:desc">Date desc</option>
                <option value="startDate:asc">Date asc</option>
                <option value="distance:desc">Distance desc</option>
                <option value="movingTime:desc">Temps desc</option>
                <option value="totalElevationGain:desc">D+ desc</option>
                <option value="averageHeartrate:desc">HR desc</option>
                <option value="averageWatts:desc">Watts desc</option>
                <option value="averageCadence:desc">Cadence desc</option>
                <option value="kilojoules:desc">Energie desc</option>
                <option value="calories:desc">Calories desc</option>
              </select>
              <label className={checkboxPillClass}>
                <input
                  checked={!!filters.hasHR}
                  onChange={(e) => {
                    setOffset(0);
                    setFilters((prev) => ({ ...prev, hasHR: e.target.checked }));
                  }}
                  type="checkbox"
                />
                has HR
              </label>
              <label className={checkboxPillClass}>
                <input
                  checked={!!filters.hasPower}
                  onChange={(e) => {
                    setOffset(0);
                    setFilters((prev) => ({ ...prev, hasPower: e.target.checked }));
                  }}
                  type="checkbox"
                />
                has Power
              </label>
            </div>
            <details className="mt-4 rounded-lg border border-black/10 bg-black/5 p-3">
              <summary className="cursor-pointer text-xs uppercase tracking-wide text-muted">Plus de filtres</summary>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <input
                  className={inputClass}
                  placeholder="Min km"
                  value={filters.minDistanceKm ?? ""}
                  onChange={(e) => setFilters((prev) => ({ ...prev, minDistanceKm: e.target.value }))}
                />
                <input
                  className={inputClass}
                  placeholder="Max km"
                  value={filters.maxDistanceKm ?? ""}
                  onChange={(e) => setFilters((prev) => ({ ...prev, maxDistanceKm: e.target.value }))}
                />
                <input
                  className={inputClass}
                  placeholder="Min temps (min)"
                  value={filters.minTimeMin ?? ""}
                  onChange={(e) => setFilters((prev) => ({ ...prev, minTimeMin: e.target.value }))}
                />
                <input
                  className={inputClass}
                  placeholder="Max temps (min)"
                  value={filters.maxTimeMin ?? ""}
                  onChange={(e) => setFilters((prev) => ({ ...prev, maxTimeMin: e.target.value }))}
                />
                <input
                  className={inputClass}
                  placeholder="Min D+"
                  value={filters.minElev ?? ""}
                  onChange={(e) => setFilters((prev) => ({ ...prev, minElev: e.target.value }))}
                />
                <input
                  className={inputClass}
                  placeholder="Max D+"
                  value={filters.maxElev ?? ""}
                  onChange={(e) => setFilters((prev) => ({ ...prev, maxElev: e.target.value }))}
                />
                <input
                  className={inputClass}
                  placeholder="Min HR"
                  value={filters.minAvgHR ?? ""}
                  onChange={(e) => setFilters((prev) => ({ ...prev, minAvgHR: e.target.value }))}
                />
                <input
                  className={inputClass}
                  placeholder="Max HR"
                  value={filters.maxAvgHR ?? ""}
                  onChange={(e) => setFilters((prev) => ({ ...prev, maxAvgHR: e.target.value }))}
                />
                <input
                  className={inputClass}
                  placeholder="Min vitesse"
                  value={filters.minAvgSpeedKmh ?? ""}
                  onChange={(e) => setFilters((prev) => ({ ...prev, minAvgSpeedKmh: e.target.value }))}
                />
                <input
                  className={inputClass}
                  placeholder="Max vitesse"
                  value={filters.maxAvgSpeedKmh ?? ""}
                  onChange={(e) => setFilters((prev) => ({ ...prev, maxAvgSpeedKmh: e.target.value }))}
                />
                <input
                  className={inputClass}
                  placeholder="Min watts"
                  value={filters.minAvgWatts ?? ""}
                  onChange={(e) => setFilters((prev) => ({ ...prev, minAvgWatts: e.target.value }))}
                />
                <input
                  className={inputClass}
                  placeholder="Max watts"
                  value={filters.maxAvgWatts ?? ""}
                  onChange={(e) => setFilters((prev) => ({ ...prev, maxAvgWatts: e.target.value }))}
                />
                <input
                  className={inputClass}
                  placeholder="Min cadence"
                  value={filters.minCadence ?? ""}
                  onChange={(e) => setFilters((prev) => ({ ...prev, minCadence: e.target.value }))}
                />
                <input
                  className={inputClass}
                  placeholder="Max cadence"
                  value={filters.maxCadence ?? ""}
                  onChange={(e) => setFilters((prev) => ({ ...prev, maxCadence: e.target.value }))}
                />
                <input
                  className={inputClass}
                  placeholder="Min calories"
                  value={filters.minCalories ?? ""}
                  onChange={(e) => setFilters((prev) => ({ ...prev, minCalories: e.target.value }))}
                />
                <input
                  className={inputClass}
                  placeholder="Max calories"
                  value={filters.maxCalories ?? ""}
                  onChange={(e) => setFilters((prev) => ({ ...prev, maxCalories: e.target.value }))}
                />
                <input
                  className={inputClass}
                  placeholder="Min kJ"
                  value={filters.minKilojoules ?? ""}
                  onChange={(e) => setFilters((prev) => ({ ...prev, minKilojoules: e.target.value }))}
                />
                <input
                  className={inputClass}
                  placeholder="Max kJ"
                  value={filters.maxKilojoules ?? ""}
                  onChange={(e) => setFilters((prev) => ({ ...prev, maxKilojoules: e.target.value }))}
                />
              </div>
            </details>
          </>
        )}
      </Card> : null}

      {!isMobile || mobileTab === "list" ? <Card>
        <SectionHeader
          title="Liste des activites"
          subtitle={data ? `${data.total} activites` : "Resultats filtres"}
          infoHint={{
            title: "Tableau activites",
            description: "Clique sur le nom d'une activite pour ouvrir son detail complet.",
          }}
          aiInsight={listAiInsight}
          collapsed={collapsedSections.list}
          onToggleCollapse={() =>
            setCollapsedSections((prev) => ({ ...prev, list: !prev.list }))
          }
        />
        {collapsedSections.list ? (
          <p className="text-xs text-muted">Section repliee.</p>
        ) : (
          <>
            {aiPoolLoading ? (
              <p className="mb-2 text-xs text-muted">IA: chargement de toutes les seances filtrees...</p>
            ) : null}
            {aiPoolError ? (
              <p className="mb-2 text-xs text-red-700">IA: impossible de charger le contexte complet ({aiPoolError}).</p>
            ) : null}
            {!aiPoolLoading && !aiPoolError && allActivitiesForAi.length > 0 ? (
              <p className="mb-2 text-xs text-muted">
                IA: analyse globale sur {allActivitiesForAi.length} seances filtrees (tendance globale, distributions et evolution ancien vs recent).
              </p>
            ) : null}
            {loading ? <p className="text-sm text-muted">Chargement...</p> : null}
            {error ? <p className="text-sm text-red-700">{error}</p> : null}
            {data ? (
              <>
                {isMobile ? (
                  <div className="space-y-2">
                    {data.items.map((activity) => (
                      <article
                        className="rounded-xl border border-black/10 bg-black/[0.03] p-3"
                        key={activity.id}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <Link className="break-words font-medium underline" to={`/activities/${activity.id}`}>
                              {activity.name}
                            </Link>
                            <p className="mt-1 text-xs text-muted">
                              {formatDate(activity.startDateLocal)} · {activity.sportType || activity.type}
                            </p>
                          </div>
                          <p className="text-xs font-semibold">
                            {formatDistanceFromMeters(activity.distance, unitPreferences)}
                          </p>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                          <p>
                            <span className="text-muted">Temps:</span>{" "}
                            {formatHours(activity.movingTime)}
                          </p>
                          <p>
                            <span className="text-muted">D+:</span>{" "}
                            {formatElevationFromMeters(activity.totalElevationGain, unitPreferences)}
                          </p>
                          <p>
                            <span className="text-muted">Vitesse:</span>{" "}
                            {formatSpeedFromMetersPerSecond(activity.averageSpeed, unitPreferences)}
                          </p>
                          <p>
                            <span className="text-muted">HR:</span>{" "}
                            {activity.averageHeartrate ? `${activity.averageHeartrate.toFixed(0)} bpm` : "-"}
                          </p>
                          <p>
                            <span className="text-muted">Watts:</span>{" "}
                            {activity.averageWatts ? `${activity.averageWatts.toFixed(0)} W` : "-"}
                          </p>
                          <p>
                            <span className="text-muted">Cadence:</span>{" "}
                            {activity.averageCadence ? formatCadenceFromRpm(activity.averageCadence, unitPreferences, 0) : "-"}
                          </p>
                          <p className="col-span-2">
                            <span className="text-muted">Calories:</span>{" "}
                            {activity.calories ? `${activity.calories.toFixed(0)} kcal` : "-"}
                          </p>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-black/10 text-left">
                          <th className="px-2 py-2">Date</th>
                          <th className="px-2 py-2">Nom</th>
                          <th className="px-2 py-2">Type</th>
                          <th className="px-2 py-2">Distance ({distanceUnitLabel(unitPreferences.distanceUnit)})</th>
                          <th className="px-2 py-2">Temps</th>
                          <th className="px-2 py-2">D+ ({elevationUnitLabel(unitPreferences.elevationUnit)})</th>
                          <th className="px-2 py-2">Vitesse ({speedUnitLabel(unitPreferences.speedUnit)})</th>
                          <th className="px-2 py-2">HR</th>
                          <th className="px-2 py-2">Watts</th>
                          <th className="px-2 py-2">Cadence ({cadenceUnitLabel(unitPreferences.cadenceUnit)})</th>
                          <th className="px-2 py-2">Calories</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.items.map((activity) => (
                          <tr className="border-b border-black/5 hover:bg-black/5" key={activity.id}>
                            <td className="px-2 py-2">{formatDate(activity.startDateLocal)}</td>
                            <td className="px-2 py-2">
                              <Link className="underline" to={`/activities/${activity.id}`}>
                                {activity.name}
                              </Link>
                            </td>
                            <td className="px-2 py-2">{activity.sportType || activity.type}</td>
                            <td className="px-2 py-2">{formatDistanceFromMeters(activity.distance, unitPreferences)}</td>
                            <td className="px-2 py-2">{formatHours(activity.movingTime)}</td>
                            <td className="px-2 py-2">{formatElevationFromMeters(activity.totalElevationGain, unitPreferences)}</td>
                            <td className="px-2 py-2">{formatSpeedFromMetersPerSecond(activity.averageSpeed, unitPreferences)}</td>
                            <td className="px-2 py-2">{activity.averageHeartrate ? `${activity.averageHeartrate.toFixed(0)} bpm` : "-"}</td>
                            <td className="px-2 py-2">{activity.averageWatts ? `${activity.averageWatts.toFixed(0)} W` : "-"}</td>
                            <td className="px-2 py-2">
                              {activity.averageCadence ? formatCadenceFromRpm(activity.averageCadence, unitPreferences, 0) : "-"}
                            </td>
                            <td className="px-2 py-2">{activity.calories ? `${activity.calories.toFixed(0)} kcal` : "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="mt-4 flex items-center justify-between text-sm">
                  <button
                    className={secondaryButtonCompactClass}
                    disabled={data.offset === 0}
                    onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
                    type="button"
                  >
                    Prev
                  </button>
                  <span>
                    {data.offset + 1}-{Math.min(data.offset + data.limit, data.total)} / {data.total}
                  </span>
                  <button
                    className={secondaryButtonCompactClass}
                    disabled={nextDisabled}
                    onClick={() => setOffset((current) => current + PAGE_SIZE)}
                    type="button"
                  >
                    Next
                  </button>
                </div>
              </>
            ) : null}
          </>
        )}
      </Card> : null}
    </div>
  );
}
