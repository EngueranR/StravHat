import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "../components/Card";
import { SectionHeader } from "../components/SectionHeader";
import { secondaryButtonClass } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";

export function OAuthCallbackPage() {
  const navigate = useNavigate();
  const { connectStravaWithCode, token } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;

    const run = async () => {
      if (!token) {
        setError("Session applicative absente. Connecte-toi d'abord.");
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const oauthError = params.get("error");
      if (oauthError) {
        setError(`Strava OAuth error: ${oauthError}`);
        return;
      }
      const code = params.get("code");

      if (!code) {
        setError("Code OAuth absent");
        return;
      }

      const lockKey = `stravhat_oauth_code_${code}`;
      const currentState = sessionStorage.getItem(lockKey);

      if (currentState === "done") {
        navigate("/import", { replace: true });
        return;
      }

      if (currentState === "pending") {
        setError("Echange OAuth deja en cours. Patiente quelques secondes.");
        return;
      }

      sessionStorage.setItem(lockKey, "pending");

      try {
        await connectStravaWithCode(code);
        sessionStorage.setItem(lockKey, "done");
        navigate("/import", { replace: true });
      } catch (err) {
        sessionStorage.removeItem(lockKey);
        setError(err instanceof Error ? err.message : "Echec OAuth");
      }
    };

    run().catch(() => {
      setError("Erreur inconnue");
    });
  }, [connectStravaWithCode, navigate, token]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card>
        <div className="space-y-4 text-center">
          <SectionHeader
            title="Connexion Strava en cours..."
            subtitle="Echange du code OAuth contre un token de session."
            className="mb-0"
          />
          {error ? (
            <>
              <p className="text-sm text-red-700">{error}</p>
              <Link className={`inline-flex ${secondaryButtonClass}`} to="/login">
                Retour login
              </Link>
            </>
          ) : (
            <p className="text-sm text-muted">Echange du code OAuth contre un token session.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
