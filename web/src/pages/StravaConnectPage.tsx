import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { Card } from '../components/Card';
import { PageHeader } from '../components/PageHeader';
import { inputClass, primaryButtonClass, secondaryButtonClass } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../i18n/framework';

interface StravaCredentialStatus {
  hasCustomCredentials: boolean;
  clientId: string | null;
}

export function StravaConnectPage() {
  const { t } = useI18n();
  const { token, user, refreshMe } = useAuth();
  const defaultRedirectUri = `${window.location.origin}/auth/callback`;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [status, setStatus] = useState<StravaCredentialStatus | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
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
    return <Navigate replace to={user?.hasImportedActivities ? '/analytics' : '/settings'} />;
  }

  const hasCredentialsConfigured = !!status?.hasCustomCredentials;
  const activeStepLabel =
    hasCredentialsConfigured ?
      'Etape active: 2/2 - connecte Strava avec OAuth.'
    : 'Etape active: 1/2 - enregistre tes credentials Strava.';

  const refreshStatus = async () => {
    if (!token) {
      return;
    }
    const data = await apiRequest<StravaCredentialStatus>('/me/strava-credentials', {
      token,
    });
    setStatus(data);
    setClientId(data.clientId ?? '');
  };

  const onSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!token) {
      setError('Session expiree.');
      return;
    }
    if (!currentPassword.trim()) {
      setError('Mot de passe courant requis pour valider la modification.');
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
          redirectUri: defaultRedirectUri,
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
        "Etape 1 manquante: enregistre d'abord tes credentials Strava.",
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
        description='Parcours simple en 2 etapes: 1) credentials 2) OAuth.'
      />

      <Card>
        <div className='space-y-4'>
          <p className='text-sm font-semibold'>Guide rapide</p>
          <ol className='space-y-2 text-xs text-muted'>
            <li className='rounded-lg border border-black/10 bg-black/[0.03] p-2'>
              <p className='font-semibold text-ink'>1) Cree/ouvre ton app Strava</p>
              <a
                className='underline'
                href='https://www.strava.com/settings/api'
                rel='noreferrer'
                target='_blank'
              >
                strava.com/settings/api
              </a>
            </li>
            <li className='rounded-lg border border-black/10 bg-black/[0.03] p-2'>
              <p className='font-semibold text-ink'>
                2) Configure les champs API de ton application Strava
              </p>
              <p>
                Utilise le meme domaine public que ton application (Railway ou
                domaine custom).
              </p>
            </li>
            <li className='rounded-lg border border-black/10 bg-black/[0.03] p-2'>
              <p className='font-semibold text-ink'>3) Reviens ici et suis les 2 boutons</p>
              <p>Etape 1: sauvegarder credentials, puis Etape 2: OAuth.</p>
            </li>
          </ol>
        </div>
      </Card>

      <Card>
        {loading ? (
          <p className='text-sm text-muted'>Chargement...</p>
        ) : (
          <div className='space-y-4'>
            <div className='rounded-xl border border-black/10 bg-black/[0.03] p-3 text-xs text-muted'>
              <p className='font-semibold text-ink'>{activeStepLabel}</p>
              <p className='mt-1'>
                Etat credentials:{' '}
                {hasCredentialsConfigured ? 'configures' : 'non configures'}
              </p>
            </div>

            <form className='space-y-3' onSubmit={onSave}>
              <p className='text-xs font-semibold text-ink'>Etape 1/2 - Credentials Strava</p>
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
                <p className='text-[11px] text-muted'>
                  Champ obligatoire pour sauvegarder/supprimer les credentials.
                </p>
              </div>

              <div className='flex flex-wrap gap-2'>
                <button
                  className={`px-4 ${primaryButtonClass}`}
                  disabled={saving}
                  type='submit'
                >
                  {saving ? 'Sauvegarde...' : 'Etape 1 - Sauvegarder credentials'}
                </button>
                <button
                  className={secondaryButtonClass}
                  disabled={resetting || !hasCredentialsConfigured}
                  onClick={onReset}
                  type='button'
                >
                  {resetting ? 'Suppression...' : 'Supprimer credentials'}
                </button>
              </div>
            </form>

            {error ? <p className='text-sm text-red-700'>{error}</p> : null}
            {info ? <p className='text-sm text-emerald-700'>{info}</p> : null}
          </div>
        )}
      </Card>

      {hasCredentialsConfigured ? (
        <Card>
          <div className='space-y-3'>
            <p className='text-sm font-semibold'>Connexion OAuth</p>
            <p className='text-xs text-muted'>
              Credentials OK. Lance la connexion OAuth Strava.
            </p>
            <button
              className='inline-flex h-12 w-full items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300'
              disabled={oauthLoading}
              onClick={startStravaAuth}
              type='button'
            >
              {oauthLoading ? 'Redirection...' : 'Connexion OAuth Strava'}
            </button>
            <p className='text-[11px] text-muted'>
              {t('stravaConnect.redirectToSettingsImport')}
            </p>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
