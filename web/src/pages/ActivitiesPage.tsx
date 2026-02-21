import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../api/client";
import type { ActivityListResponse } from "../api/types";
import { Card } from "../components/Card";
import { FilterToggleButton } from "../components/FilterToggleButton";
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
type SectionKey = "filters" | "list";

export function ActivitiesPage() {
  const { token, user } = useAuth();
  const isMobile = useMediaQuery("(max-width: 1023px)");
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<SectionKey, boolean>>({
    filters: true,
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

  const nextDisabled = !data || data.offset + data.limit >= data.total;

  return (
    <div>
      <PageHeader description="Historique complet avec filtres/tri/recherche." title="Activites" />
      <Card>
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
          <p className="text-[11px] text-muted/80">Filtres masques.</p>
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
            <details className="mt-3 rounded-lg border border-black/10 bg-black/[0.03] p-2.5">
              <summary className="cursor-pointer text-[11px] uppercase tracking-wide text-muted">Plus de filtres</summary>
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
        <div className="my-4 h-px bg-black/10" />
        <SectionHeader
          title="Liste des activites"
          subtitle={data ? `${data.total} activites` : "Resultats filtres"}
          infoHint={{
            title: "Tableau activites",
            description: "Clique sur le nom d'une activite pour ouvrir son detail complet.",
          }}
          collapsed={collapsedSections.list}
          onToggleCollapse={() =>
            setCollapsedSections((prev) => ({ ...prev, list: !prev.list }))
          }
        />
        {collapsedSections.list ? (
          <p className="text-xs text-muted">Section repliee.</p>
        ) : (
          <>
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
      </Card>
    </div>
  );
}
