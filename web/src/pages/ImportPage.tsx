import { useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../api/client";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { SectionHeader } from "../components/SectionHeader";
import { primaryButtonClass, secondaryButtonClass, subtlePanelClass } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";

interface ImportResult {
  ok: boolean;
  imported: number;
  pages: number;
}

export function ImportPage() {
  const { token, user } = useAuth();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const hasCustomStravaCredentials = !!user?.hasCustomStravaCredentials;
  const connectedToStrava = !!user?.connectedToStrava;

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

  const startStravaAuth = async () => {
    if (!token) {
      setOauthError("Session expiree. Reconnecte-toi.");
      return;
    }

    if (!hasCustomStravaCredentials) {
      setOauthError(
        "Configure d'abord les credentials Strava (Client ID / Secret / Redirect URI).",
      );
      return;
    }

    setOauthLoading(true);
    setOauthError(null);

    try {
      const response = await apiRequest<{ url: string }>("/auth/strava/start", {
        token,
      });
      window.location.href = response.url;
    } catch (err) {
      setOauthError(err instanceof Error ? err.message : "Impossible de lancer OAuth Strava");
      setOauthLoading(false);
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
        ) : !connectedToStrava ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Ton compte Strava n'est pas encore connecte. L'import reste vide tant que
              l'OAuth Strava n'est pas actif.
            </p>

            {!hasCustomStravaCredentials ? (
              <p className="text-xs text-amber-700">
                Credentials Strava non configures: complete d'abord la page Strava Credentials.
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <button
                className={primaryButtonClass}
                disabled={oauthLoading || !hasCustomStravaCredentials}
                onClick={startStravaAuth}
                type="button"
              >
                {oauthLoading ? "Redirection..." : "Connecter Strava (OAuth)"}
              </button>
              <Link className={secondaryButtonClass} to="/strava-credentials">
                Strava Credentials
              </Link>
            </div>

            {oauthError ? <p className="text-sm text-red-700">{oauthError}</p> : null}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Lance l'import complet pour remplir la base locale avec tes activites Strava.
            </p>

            <button
              className={primaryButtonClass}
              disabled={running}
              onClick={launchImport}
              type="button"
            >
              {running ? "Import en cours..." : "Lancer import complet"}
            </button>

            {!result && !error ? (
              <p className="text-xs text-muted">
                Aucun import lance pour le moment.
              </p>
            ) : null}

            {result ? (
              <div className={`${subtlePanelClass} space-y-2 text-sm`}>
                <p>Pages importees: {result.pages}</p>
                <p>Activites upsert: {result.imported}</p>
                <Link className={secondaryButtonClass} to="/activities">
                  Voir mes activites
                </Link>
              </div>
            ) : null}

            {error ? <p className="text-sm text-red-700">{error}</p> : null}
          </div>
        )}
      </Card>
    </div>
  );
}
