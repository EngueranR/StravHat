import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../api/client";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { SectionHeader } from "../components/SectionHeader";
import { primaryButtonClass, secondaryButtonClass, subtlePanelClass } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../i18n/framework";

interface ImportResult {
  ok: boolean;
  imported: number;
  pages: number;
}

const importStepLabels = [
  "Verification de session et du token",
  "Requete vers l'API Strava (pagination)",
  "Transformation des activites recuperees",
  "Upsert en base locale",
];

export function ImportPage() {
  const { t } = useI18n();
  const { token, refreshMe, user } = useAuth();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!running) {
      setActiveStepIndex(0);
      setElapsedSeconds(0);
      return;
    }

    const stepTimer = window.setInterval(() => {
      setActiveStepIndex((current) =>
        Math.min(current + 1, importStepLabels.length - 1),
      );
    }, 3200);

    const elapsedTimer = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => {
      window.clearInterval(stepTimer);
      window.clearInterval(elapsedTimer);
    };
  }, [running]);

  const launchImport = async () => {
    if (!token) {
      return;
    }

    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const data = await apiRequest<ImportResult>("/import/basic", {
        method: "POST",
        token,
      });
      await refreshMe();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import impossible");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <PageHeader
        description="Importe l'historique Strava des seances de course a pied uniquement (Run/Trail/Virtual Run), via pagination 200/page."
        title={t("pages.import.title")}
      />
      <Card>
        <SectionHeader
          title="Import Strava"
          subtitle="Recupere les seances de course a pied puis fait un upsert local"
          infoHint={{
            title: "Import",
            description:
              "L'import lit les pages Strava (200 activites/page), conserve seulement les seances de course a pied, puis met a jour les activites existantes.",
          }}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((prev) => !prev)}
        />
        {collapsed ? (
          <p className="text-xs text-muted">Section repliee.</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Lance l'import pour remplir la base locale avec tes seances de course a pied.
            </p>

            <button
              className={primaryButtonClass}
              disabled={running}
              onClick={launchImport}
              type="button"
            >
              {running ? "Import en cours..." : "Lancer import complet"}
            </button>

            {running ? (
              <div className={`${subtlePanelClass} space-y-3`}>
                <div className="flex items-center gap-2 text-sm">
                  <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-ink/20 border-t-ink" />
                  <span>Import en cours ({elapsedSeconds}s)</span>
                </div>
                <ul className="space-y-1 text-xs">
                  {importStepLabels.map((label, index) => {
                    const done = index < activeStepIndex;
                    const active = index === activeStepIndex;
                    return (
                      <li
                        className="flex items-center gap-2"
                        key={label}
                      >
                        <span
                          className={`inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] ${
                            done ?
                              "border-emerald-700 bg-emerald-700 text-white"
                            : active ?
                              "border-ink bg-ink text-white"
                            : "border-black/20 bg-white text-muted"
                          }`}
                        >
                          {done ? "✓" : index + 1}
                        </span>
                        <span
                          className={
                            active ? "text-ink" : done ? "text-emerald-700" : "text-muted"
                          }
                        >
                          {label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {!result && !error ? (
              <p className="text-xs text-muted">
                Aucun import lance pour le moment.
              </p>
            ) : null}

            {result ? (
              <div className={`${subtlePanelClass} space-y-2 text-sm`}>
                <p>Pages importees: {result.pages}</p>
                <p>Activites upsert: {result.imported}</p>
                <div className="rounded-lg border border-black/10 bg-white/70 p-2 text-xs text-muted">
                  <p className="font-medium text-ink">Actions API effectuees</p>
                  <p>1. Authentification et verification du token: OK</p>
                  <p>2. Lecture API Strava: {result.pages} page(s) traitee(s)</p>
                  <p>3. Filtre course a pied + upsert base locale: {result.imported} element(s)</p>
                </div>
                <Link className={secondaryButtonClass} to="/activities">
                  Voir mes activites
                </Link>
                {user?.hasImportedActivities ? (
                  <Link className={secondaryButtonClass} to="/analytics">
                    Ouvrir les analyses
                  </Link>
                ) : null}
              </div>
            ) : null}

            {error ? <p className="text-sm text-red-700">{error}</p> : null}
          </div>
        )}
      </Card>
    </div>
  );
}
