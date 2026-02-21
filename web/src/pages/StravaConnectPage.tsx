import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { Card } from '../components/Card';
import { PageHeader } from '../components/PageHeader';
import { inputClass, primaryButtonClass, secondaryButtonClass } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';

interface StravaCredentialStatus {
  hasCustomCredentials: boolean;
  clientId: string | null;
  redirectUri: string | null;
}

export function StravaConnectPage() {
  const { token, user, refreshMe } = useAuth();
  const defaultRedirectUri = `${window.location.origin}/auth/callback`;
  const callbackDomain = window.location.host;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [status, setStatus] = useState<StravaCredentialStatus | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [redirectUri, setRedirectUri] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      if (!token) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setInfo(null);

      try {
        const data = await apiRequest<StravaCredentialStatus>('/me/strava-credentials', {
          token,
        });
        setStatus(data);
        setClientId(data.clientId ?? '');
        setRedirectUri(data.redirectUri ?? defaultRedirectUri);
      } catch (err) {
        setError(
          err instanceof Error ?
            err.message
          : 'Impossible de charger la configuration Strava',
        );
      } finally {
        setLoading(false);
      }
    };

    run().catch(() => {
      setLoading(false);
      setError('Erreur inconnue');
    });
  }, [defaultRedirectUri, token]);

  if (user?.connectedToStrava) {
    return <Navigate replace to='/analytics' />;
  }

  const refreshStatus = async () => {
    if (!token) {
      return;
    }
    const data = await apiRequest<StravaCredentialStatus>('/me/strava-credentials', {
      token,
    });
    setStatus(data);
    setClientId(data.clientId ?? '');
    setRedirectUri(data.redirectUri ?? defaultRedirectUri);
  };

  const onSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!token) {
      setError('Session expiree.');
      return;
    }

    setSaving(true);
    setError(null);
    setInfo(null);

    try {
      await apiRequest<{ ok: boolean; requiresReconnect: boolean }>('/me/strava-credentials', {
        method: 'PATCH',
        token,
        body: {
          clientId,
          clientSecret,
          redirectUri: redirectUri.trim(),
          currentPassword,
        },
      });
      await refreshStatus();
      await refreshMe();
      setClientSecret('');
      setCurrentPassword('');
      setInfo('Credentials sauvegardes. Tu peux lancer OAuth maintenant.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Echec de sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const onReset = async () => {
    if (!token) {
      setError('Session expiree.');
      return;
    }

    if (!currentPassword) {
      setError('Saisis ton mot de passe courant pour confirmer la suppression.');
      return;
    }

    setResetting(true);
    setError(null);
    setInfo(null);

    try {
      await apiRequest<{ ok: boolean; credentialsCleared: boolean; requiresReconnect: boolean }>(
        '/me/strava-credentials/reset',
        {
          method: 'POST',
          token,
          body: {
            currentPassword,
          },
        },
      );
      await refreshStatus();
      await refreshMe();
      setClientSecret('');
      setCurrentPassword('');
      setInfo('Credentials supprimes.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Echec de reinitialisation');
    } finally {
      setResetting(false);
    }
  };

  const startStravaAuth = async () => {
    if (!token) {
      setError('Session expiree. Reconnecte-toi.');
      return;
    }

    if (!status?.hasCustomCredentials) {
      setError(
        "Configure d'abord les credentials Strava (Client ID / Secret / Redirect URI).",
      );
      return;
    }

    setOauthLoading(true);
    setError(null);
    setInfo(null);

    try {
      const response = await apiRequest<{ url: string }>('/auth/strava/start', {
        token,
      });
      window.location.href = response.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de lancer OAuth Strava');
      setOauthLoading(false);
    }
  };

  return (
    <div className='space-y-5'>
      <PageHeader
        title='Connexion Strava'
        description='Une seule page: configure tes credentials puis connecte OAuth.'
      />

      <Card>
        <div className='space-y-3'>
          <p className='text-sm font-semibold'>Configuration rapide</p>
          <p className='text-xs text-muted'>
            1) Cree ton application sur{' '}
            <a
              className='underline'
              href='https://www.strava.com/settings/api'
              rel='noreferrer'
              target='_blank'
            >
              strava.com/settings/api
            </a>
            .
          </p>
          <p className='text-xs text-muted'>
            2) Authorization Callback Domain: <span className='font-mono'>{callbackDomain}</span>
          </p>
          <p className='text-xs text-muted'>
            3) Redirect URI: <span className='font-mono'>{defaultRedirectUri}</span>
          </p>
        </div>
      </Card>

      <Card>
        {loading ? (
          <p className='text-sm text-muted'>Chargement...</p>
        ) : (
          <div className='space-y-4'>
            <div className='rounded-xl border border-black/10 bg-black/[0.03] p-3 text-xs text-muted'>
              Etat credentials: {status?.hasCustomCredentials ? 'configures' : 'non configures'}
            </div>

            <form className='space-y-3' onSubmit={onSave}>
              <div className='space-y-1.5'>
                <label className='text-xs text-muted' htmlFor='strava-client-id'>
                  Strava Client ID
                </label>
                <input
                  className={inputClass}
                  id='strava-client-id'
                  onChange={(event) => setClientId(event.target.value)}
                  required
                  value={clientId}
                />
              </div>

              <div className='space-y-1.5'>
                <label className='text-xs text-muted' htmlFor='strava-client-secret'>
                  Strava Client Secret
                </label>
                <input
                  className={inputClass}
                  id='strava-client-secret'
                  onChange={(event) => setClientSecret(event.target.value)}
                  placeholder={
                    status?.hasCustomCredentials ?
                      'Laisse vide pour conserver le secret deja stocke'
                    : 'Renseigne le secret a stocker'
                  }
                  type='password'
                  value={clientSecret}
                />
                {status?.hasCustomCredentials ? (
                  <p className='text-[11px] text-muted'>
                    Le secret n'est jamais re-affiche.
                  </p>
                ) : null}
              </div>

              <div className='space-y-1.5'>
                <label className='text-xs text-muted' htmlFor='strava-redirect-uri'>
                  Redirect URI
                </label>
                <input
                  className={inputClass}
                  id='strava-redirect-uri'
                  onChange={(event) => setRedirectUri(event.target.value)}
                  placeholder='https://ton-domaine/auth/callback'
                  required
                  value={redirectUri}
                />
              </div>

              <div className='space-y-1.5'>
                <label className='text-xs text-muted' htmlFor='current-password'>
                  Mot de passe courant (confirmation)
                </label>
                <input
                  className={inputClass}
                  id='current-password'
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                  type='password'
                  value={currentPassword}
                />
              </div>

              <div className='flex flex-wrap gap-2'>
                <button
                  className={`px-4 ${primaryButtonClass}`}
                  disabled={saving}
                  type='submit'
                >
                  {saving ? 'Sauvegarde...' : 'Sauvegarder credentials'}
                </button>
                <button
                  className={secondaryButtonClass}
                  disabled={resetting || !status?.hasCustomCredentials}
                  onClick={onReset}
                  type='button'
                >
                  {resetting ? 'Suppression...' : 'Supprimer credentials'}
                </button>
              </div>
            </form>

            <div className='rounded-xl border border-black/10 bg-white/70 p-3'>
              <p className='text-xs text-muted'>
                Une fois les credentials configures, lance la connexion OAuth.
              </p>
              <button
                className={`mt-2 px-4 ${primaryButtonClass}`}
                disabled={oauthLoading || !status?.hasCustomCredentials}
                onClick={startStravaAuth}
                type='button'
              >
                {oauthLoading ? 'Redirection...' : 'Connecter Strava (OAuth)'}
              </button>
            </div>

            {error ? <p className='text-sm text-red-700'>{error}</p> : null}
            {info ? <p className='text-sm text-emerald-700'>{info}</p> : null}
          </div>
        )}
      </Card>
    </div>
  );
}
