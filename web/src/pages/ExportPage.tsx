import { useMemo, useState } from "react";
import { buildApiUrl } from "../api/client";
import { Card } from "../components/Card";
import { FilterToggleButton } from "../components/FilterToggleButton";
import { PageHeader } from "../components/PageHeader";
import { SectionHeader } from "../components/SectionHeader";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { buildActivityFilterQuery, type ActivityFilterState } from "../utils/activityFilters";

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
type ExportPreset = "all" | "performance" | "cardio" | "power" | "runningDynamics";

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

const allMetrics = metricOptions.map((metric) => metric.value);

const exportPresetOptions: Array<{
  value: ExportPreset;
  label: string;
  description: string;
  metrics: ExportMetric[];
  filename: string;
}> = [
  {
    value: "all",
    label: "Tous les metrics",
    description: "Export complet en 1 CSV (recommande).",
    metrics: allMetrics,
    filename: "stravhat-metrics-all.csv",
  },
  {
    value: "performance",
    label: "Performance",
    description: "Distance, temps, allure, vitesse, D+ et suffer score.",
    metrics: ["distanceKm", "movingTimeMin", "paceMinKm", "avgSpeedKmh", "elevGainM", "sufferScore"],
    filename: "stravhat-metrics-performance.csv",
  },
  {
    value: "cardio",
    label: "Cardio",
    description: "FC moyenne/max + cadence + suffer score.",
    metrics: ["avgHr", "maxHr", "cadence", "sufferScore"],
    filename: "stravhat-metrics-cardio.csv",
  },
  {
    value: "power",
    label: "Puissance & energie",
    description: "Watts, kilojoules, calories et temps.",
    metrics: ["avgWatts", "maxWatts", "kilojoules", "calories", "movingTimeMin"],
    filename: "stravhat-metrics-power-energy.csv",
  },
  {
    value: "runningDynamics",
    label: "Run dynamics",
    description: "Cadence, foulee, contact sol, oscillation + allure.",
    metrics: [
      "paceMinKm",
      "cadence",
      "strideLength",
      "groundContactTime",
      "verticalOscillation",
      "distanceKm",
      "movingTimeMin",
    ],
    filename: "stravhat-metrics-running-dynamics.csv",
  },
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
  const [filters, setFilters] = useState<ActivityFilterState>({
    from: "",
    to: "",
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
  const [collapsed, setCollapsed] = useState(true);
  const [activePreset, setActivePreset] = useState<ExportPreset>("all");
  const [isExporting, setIsExporting] = useState(false);

  const query = useMemo(() => {
    return buildActivityFilterQuery(filters);
  }, [filters]);

  const selectedPreset = useMemo(
    () => exportPresetOptions.find((preset) => preset.value === activePreset) ?? exportPresetOptions[0],
    [activePreset],
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

  const download = async (presetValue: ExportPreset) => {
    if (!token) {
      return;
    }

    const preset = exportPresetOptions.find((item) => item.value === presetValue) ?? exportPresetOptions[0];
    const metrics = preset.metrics;

    if (metrics.length === 0) {
      setStatus("Aucune metrique trouvee pour ce preset.");
      return;
    }

    setActivePreset(preset.value);
    setIsExporting(true);
    setStatus(`Export "${preset.label}" en cours...`);

    try {
      const baseQuery = query ? `&${query}` : "";
      const metricsParam = encodeURIComponent(metrics.join(","));
      await requestCsv(
        `/export/metrics.csv?metrics=${metricsParam}${baseQuery}`,
        preset.filename,
      );

      setStatus(`Export termine (${metrics.length} metriques).`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Erreur export");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        description="Export CSV simple: 1 clic pour tout exporter, plus des presets prets a l'emploi."
        title="Export CSV"
      />
      <Card>
        <SectionHeader
          title="Export rapide"
          subtitle="Simple et efficace: export complet par defaut, sans checkboxes."
          infoHint={{
            title: "Comment ca marche",
            description:
              "Le bouton principal exporte toutes les metriques dans un seul CSV. Les presets servent a sortir rapidement un sous-ensemble utile (cardio, performance, puissance, run dynamics).",
          }}
          rightActions={
            <FilterToggleButton
              collapsed={collapsed}
              onToggle={() => setCollapsed((prev) => !prev)}
            />
          }
        />
        {collapsed ? (
          <p className="text-[11px] text-muted/80">Filtres masques.</p>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2">
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
            </div>

            <div className="mt-4 rounded-xl border border-black/10 bg-black/5 p-3">
              <p className="text-sm font-semibold text-ink">Export principal</p>
              <p className="mt-1 text-xs text-muted">
                1 CSV complet avec toutes les metriques ({allMetrics.length} colonnes metriques).
              </p>
              <button
                className={`mt-3 ${primaryButtonClass}`}
                disabled={isExporting}
                onClick={() => download("all")}
                type="button"
              >
                {isExporting && activePreset === "all" ? "Export..." : "Exporter tous les metrics"}
              </button>
            </div>

            <div className="mt-4">
              <p className="text-xs uppercase tracking-wide text-muted">Exports rapides par theme</p>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {exportPresetOptions
                  .filter((preset) => preset.value !== "all")
                  .map((preset) => (
                    <button
                      key={preset.value}
                      className={`${secondaryButtonClass} h-auto w-full flex-col items-start gap-1 p-3 text-left ${
                        activePreset === preset.value ? "border-black/50 bg-black/[0.03]" : ""
                      }`}
                      disabled={isExporting}
                      onClick={() => download(preset.value)}
                      type="button"
                    >
                      <span className="text-sm font-semibold text-ink">{preset.label}</span>
                      <span className="text-xs text-muted">{preset.description}</span>
                    </button>
                  ))}
              </div>
            </div>

            <details className="mt-3 rounded-lg border border-black/10 bg-black/[0.03] p-2.5">
              <summary className="cursor-pointer text-[11px] uppercase tracking-wide text-muted">Plus de filtres</summary>
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
            <p className="mt-3 text-xs text-muted">
              Preset selectionne: <strong>{selectedPreset.label}</strong>
            </p>
            {status ? <p className="mt-3 text-sm text-muted">{status}</p> : null}
          </>
        )}
      </Card>
    </div>
  );
}
