import { useState } from "react";
import { apiRequest } from "../api/client";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { SectionHeader } from "../components/SectionHeader";
import { primaryButtonClass, subtlePanelClass } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";

interface ImportResult {
  ok: boolean;
  imported: number;
  pages: number;
}

export function ImportPage() {
  const { token } = useAuth();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const launchImport = async () => {
    if (!token) {
      return;
    }

    setRunning(true);
    setError(null);

    try {
      const data = await apiRequest<ImportResult>("/import/basic", {
        method: "POST",
        token,
      });
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
        description="Importe l'historique complet d'activites Strava via pagination 200/page jusqu'a epuisement."
        title="Import Center"
      />
      <Card>
        <SectionHeader
          title="Import Strava"
          subtitle="Recupere toutes les activites puis fait un upsert local"
          infoHint={{
            title: "Import",
            description:
              "L'import lit les pages Strava (200 activites/page) jusqu'a la fin puis met a jour les activites existantes.",
          }}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((prev) => !prev)}
        />
        {collapsed ? (
          <p className="text-xs text-muted">Section repliee.</p>
        ) : (
          <div className="space-y-4">
          <button
            className={primaryButtonClass}
            disabled={running}
            onClick={launchImport}
            type="button"
          >
            {running ? "Import en cours..." : "Lancer import complet"}
          </button>
          {result ? (
            <div className={`${subtlePanelClass} text-sm`}>
              <p>Pages importees: {result.pages}</p>
              <p>Activites upsert: {result.imported}</p>
            </div>
          ) : null}
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          </div>
        )}
      </Card>
    </div>
  );
}
