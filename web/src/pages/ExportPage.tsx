import { useMemo, useState } from "react";
import { buildApiUrl } from "../api/client";
import { Card } from "../components/Card";
import { FilterToggleButton } from "../components/FilterToggleButton";
import { PageHeader } from "../components/PageHeader";
import { SectionHeader } from "../components/SectionHeader";
import { checkboxPillClass, inputClass, primaryButtonClass, selectClass } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { buildActivityFilterQuery, type ActivityFilterState } from "../utils/activityFilters";

type ExportMode = "independent" | "combined" | "all";
type ExportMetric =
  | "avgHr"
  | "maxHr"
  | "paceMinKm"
  | "avgSpeedKmh"
  | "cadence"
  | "strideLength"
  | "groundContactTime"
  | "verticalOscillation"
  | "avgWatts"
  | "maxWatts"
  | "calories"
  | "kilojoules"
  | "distanceKm"
  | "movingTimeMin"
  | "elevGainM"
  | "sufferScore";

const metricOptions: Array<{ value: ExportMetric; label: string; description: string }> = [
  { value: "avgHr", label: "FC moyenne (bpm)", description: "Frequence cardiaque moyenne" },
  { value: "maxHr", label: "FC max (bpm)", description: "Frequence cardiaque maximale" },
  { value: "paceMinKm", label: "Allure (min/km)", description: "Allure moyenne au km" },
  { value: "avgSpeedKmh", label: "Vitesse moyenne (km/h)", description: "Vitesse moyenne" },
  { value: "cadence", label: "Cadence", description: "Cadence moyenne" },
  { value: "strideLength", label: "Longueur foulee (m)", description: "Longueur de foulee moyenne" },
  { value: "groundContactTime", label: "Contact sol (ms)", description: "Temps de contact au sol" },
  { value: "verticalOscillation", label: "Oscillation verticale (cm)", description: "Oscillation verticale" },
  { value: "avgWatts", label: "Watts moyens (W)", description: "Puissance moyenne" },
  { value: "maxWatts", label: "Watts max (W)", description: "Puissance maximale" },
  { value: "calories", label: "Calories (kcal)", description: "Calories par activite" },
  { value: "kilojoules", label: "Energie (kJ)", description: "Kilojoules par activite" },
  { value: "distanceKm", label: "Distance (km)", description: "Distance totale" },
  { value: "movingTimeMin", label: "Temps (min)", description: "Temps de deplacement" },
  { value: "elevGainM", label: "D+ (m)", description: "Denivele positif" },
  { value: "sufferScore", label: "Suffer score", description: "Charge percue" },
];

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

function getFilenameFromResponse(response: Response, fallback: string) {
  const contentDisposition = response.headers.get("content-disposition");
  if (!contentDisposition) {
    return fallback;
  }

  const match = contentDisposition.match(/filename="?([^"]+)"?/i);
  if (!match) {
    return fallback;
  }

  return match[1] ?? fallback;
}

export function ExportPage() {
  const { token } = useAuth();
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const [filters, setFilters] = useState<ActivityFilterState>({
    from: "",
    to: "",
    type: "",
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
  const [status, setStatus] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(isMobile);
  const [mode, setMode] = useState<ExportMode>("all");
  const [selectedMetrics, setSelectedMetrics] = useState<Record<ExportMetric, boolean>>({
    avgHr: true,
    maxHr: false,
    paceMinKm: true,
    avgSpeedKmh: false,
    cadence: false,
    strideLength: false,
    groundContactTime: false,
    verticalOscillation: false,
    avgWatts: false,
    maxWatts: false,
    calories: false,
    kilojoules: false,
    distanceKm: false,
    movingTimeMin: false,
    elevGainM: false,
    sufferScore: false,
  });
  const [isExporting, setIsExporting] = useState(false);

  const query = useMemo(() => {
    return buildActivityFilterQuery(filters);
  }, [filters]);

  const selectedMetricValues = useMemo(
    () => metricOptions.filter((metric) => selectedMetrics[metric.value]).map((metric) => metric.value),
    [selectedMetrics],
  );

  const requestCsv = async (urlPath: string, fallbackFilename: string) => {
    if (!token) {
      return;
    }

    const response = await fetch(buildApiUrl(urlPath), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const filename = getFilenameFromResponse(response, fallbackFilename);
    const blob = await response.blob();
    downloadBlob(blob, filename);
  };

  const download = async () => {
    if (!token) {
      return;
    }

    const allMetrics = metricOptions.map((metric) => metric.value);
    const metrics = mode === "all" ? allMetrics : selectedMetricValues;

    if (metrics.length === 0) {
      setStatus("Selectionne au moins une metrique.");
      return;
    }

    setIsExporting(true);
    setStatus("Export en cours...");

    try {
      const baseQuery = query ? `&${query}` : "";

      if (mode === "independent") {
        for (const metric of metrics) {
          await requestCsv(
            `/export/metrics.csv?metrics=${metric}${baseQuery}`,
            `stravhat-metric-${metric}.csv`,
          );
        }
      } else {
        const metricsParam = encodeURIComponent(metrics.join(","));
        await requestCsv(
          `/export/metrics.csv?metrics=${metricsParam}${baseQuery}`,
          "stravhat-metrics-combined.csv",
        );
      }

      setStatus("Export termine.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Erreur export");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div>
      <PageHeader description="Export CSV par metrique (BPM, allure, foulee, watts...)." title="Export CSV" />
      <Card>
        <SectionHeader
          title="Export metriques"
          subtitle="Independant = 1 CSV par metrique, Concatene = 1 CSV avec plusieurs metriques"
          infoHint={{
            title: "Mode export",
            description:
              "Exemple: Independant + FC moyenne + Allure => 2 fichiers. Concatene + FC moyenne + Longueur foulee => 1 seul fichier avec les 2 colonnes.",
          }}
          rightActions={
            <FilterToggleButton
              collapsed={collapsed}
              onToggle={() => setCollapsed((prev) => !prev)}
            />
          }
        />
        {collapsed ? (
          <p className="text-xs text-muted">Section repliee.</p>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="grid gap-1 text-xs text-muted">
                Date debut
                <input
                  className={inputClass}
                  onChange={(event) => setFilters((prev) => ({ ...prev, from: event.target.value }))}
                  type="date"
                  value={filters.from ?? ""}
                />
              </label>
              <label className="grid gap-1 text-xs text-muted">
                Date fin
                <input
                  className={inputClass}
                  onChange={(event) => setFilters((prev) => ({ ...prev, to: event.target.value }))}
                  type="date"
                  value={filters.to ?? ""}
                />
              </label>
              <label className="grid gap-1 text-xs text-muted">
                Type
                <input
                  className={inputClass}
                  onChange={(event) => setFilters((prev) => ({ ...prev, type: event.target.value }))}
                  placeholder="Type"
                  value={filters.type ?? ""}
                />
              </label>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-xs text-muted">
                Mode export
                <select
                  className={selectClass}
                  value={mode}
                  onChange={(event) => setMode(event.target.value as ExportMode)}
                >
                  <option value="independent">Independant (1 CSV par metrique)</option>
                  <option value="combined">Concatene (1 CSV multi-metriques)</option>
                  <option value="all">Tout (toutes les metriques)</option>
                </select>
              </label>
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-3">
              {metricOptions.map((metric) => {
                const disabled = mode === "all";
                return (
                  <label key={metric.value} className={checkboxPillClass}>
                    <input
                      checked={selectedMetrics[metric.value]}
                      disabled={disabled}
                      onChange={(event) =>
                        setSelectedMetrics((prev) => ({ ...prev, [metric.value]: event.target.checked }))
                      }
                      type="checkbox"
                    />
                    <span>
                      <span className="block text-xs font-semibold text-ink">{metric.label}</span>
                      <span className="text-[11px] text-muted">{metric.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>

            <details className="mt-4 rounded-lg border border-black/10 bg-black/5 p-3">
              <summary className="cursor-pointer text-xs uppercase tracking-wide text-muted">Plus de filtres</summary>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <input
                  className={inputClass}
                  placeholder="Min km"
                  value={filters.minDistanceKm ?? ""}
                  onChange={(event) => setFilters((prev) => ({ ...prev, minDistanceKm: event.target.value }))}
                />
                <input
                  className={inputClass}
                  placeholder="Max km"
                  value={filters.maxDistanceKm ?? ""}
                  onChange={(event) => setFilters((prev) => ({ ...prev, maxDistanceKm: event.target.value }))}
                />
                <input
                  className={inputClass}
                  placeholder="Min temps (min)"
                  value={filters.minTimeMin ?? ""}
                  onChange={(event) => setFilters((prev) => ({ ...prev, minTimeMin: event.target.value }))}
                />
                <input
                  className={inputClass}
                  placeholder="Max temps (min)"
                  value={filters.maxTimeMin ?? ""}
                  onChange={(event) => setFilters((prev) => ({ ...prev, maxTimeMin: event.target.value }))}
                />
                <input
                  className={inputClass}
                  placeholder="Min D+"
                  value={filters.minElev ?? ""}
                  onChange={(event) => setFilters((prev) => ({ ...prev, minElev: event.target.value }))}
                />
                <input
                  className={inputClass}
                  placeholder="Max D+"
                  value={filters.maxElev ?? ""}
                  onChange={(event) => setFilters((prev) => ({ ...prev, maxElev: event.target.value }))}
                />
                <input
                  className={inputClass}
                  placeholder="Min HR"
                  value={filters.minAvgHR ?? ""}
                  onChange={(event) => setFilters((prev) => ({ ...prev, minAvgHR: event.target.value }))}
                />
                <input
                  className={inputClass}
                  placeholder="Max HR"
                  value={filters.maxAvgHR ?? ""}
                  onChange={(event) => setFilters((prev) => ({ ...prev, maxAvgHR: event.target.value }))}
                />
                <input
                  className={inputClass}
                  placeholder="Min vitesse"
                  value={filters.minAvgSpeedKmh ?? ""}
                  onChange={(event) => setFilters((prev) => ({ ...prev, minAvgSpeedKmh: event.target.value }))}
                />
                <input
                  className={inputClass}
                  placeholder="Max vitesse"
                  value={filters.maxAvgSpeedKmh ?? ""}
                  onChange={(event) => setFilters((prev) => ({ ...prev, maxAvgSpeedKmh: event.target.value }))}
                />
                <input
                  className={inputClass}
                  placeholder="Min watts"
                  value={filters.minAvgWatts ?? ""}
                  onChange={(event) => setFilters((prev) => ({ ...prev, minAvgWatts: event.target.value }))}
                />
                <input
                  className={inputClass}
                  placeholder="Max watts"
                  value={filters.maxAvgWatts ?? ""}
                  onChange={(event) => setFilters((prev) => ({ ...prev, maxAvgWatts: event.target.value }))}
                />
                <input
                  className={inputClass}
                  placeholder="Min cadence"
                  value={filters.minCadence ?? ""}
                  onChange={(event) => setFilters((prev) => ({ ...prev, minCadence: event.target.value }))}
                />
                <input
                  className={inputClass}
                  placeholder="Max cadence"
                  value={filters.maxCadence ?? ""}
                  onChange={(event) => setFilters((prev) => ({ ...prev, maxCadence: event.target.value }))}
                />
                <input
                  className={inputClass}
                  placeholder="Min calories"
                  value={filters.minCalories ?? ""}
                  onChange={(event) => setFilters((prev) => ({ ...prev, minCalories: event.target.value }))}
                />
                <input
                  className={inputClass}
                  placeholder="Max calories"
                  value={filters.maxCalories ?? ""}
                  onChange={(event) => setFilters((prev) => ({ ...prev, maxCalories: event.target.value }))}
                />
                <input
                  className={inputClass}
                  placeholder="Min kJ"
                  value={filters.minKilojoules ?? ""}
                  onChange={(event) => setFilters((prev) => ({ ...prev, minKilojoules: event.target.value }))}
                />
                <input
                  className={inputClass}
                  placeholder="Max kJ"
                  value={filters.maxKilojoules ?? ""}
                  onChange={(event) => setFilters((prev) => ({ ...prev, maxKilojoules: event.target.value }))}
                />
              </div>
            </details>

            <button
              className={`mt-4 ${primaryButtonClass}`}
              disabled={isExporting}
              onClick={download}
              type="button"
            >
              {isExporting ? "Export..." : "Telecharger CSV"}
            </button>

            {status ? <p className="mt-3 text-sm text-muted">{status}</p> : null}
          </>
        )}
      </Card>
    </div>
  );
}
