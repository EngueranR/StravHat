import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { Card } from '../components/Card';
import { SectionHeader } from '../components/SectionHeader';
import { primaryButtonClass } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';

export function LandingPage() {
  const { isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isAuthenticated) {
    return <Navigate replace to='/analytics' />;
  }

  const startStravaAuth = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiRequest<{ url: string }>('/auth/strava/start');
      window.location.href = response.url;
    } catch (err) {
      setError(
        err instanceof Error ?
          err.message
        : 'Impossible de lancer OAuth Strava',
      );
      setLoading(false);
    }
  };

  return (
    <div className='flex min-h-screen items-center justify-center p-4'>
      <Card>
        <div className='mx-auto w-full max-w-xl space-y-5'>
          <div className='space-y-1'>
            <h1 className='text-2xl font-semibold tracking-tight'>StravHat</h1>
            <p className='text-xs text-muted'>
              Explore tes donnees Strava et detecte les tendances qui font
              progresser.
            </p>
          </div>

          <div className='rounded-xl border border-black/10 bg-white/60 p-4'>
            <SectionHeader
              title='Connexion Strava'
              subtitle='Autorise l acces a ton compte pour importer tes activites.'
              className='mb-0'
            />
            <div className='mt-3 space-y-3'>
              <button
                className={`w-full py-3 ${primaryButtonClass}`}
                disabled={loading}
                onClick={startStravaAuth}
                type='button'
              >
                {loading ? 'Redirection...' : 'Se connecter a Strava'}
              </button>

              {error ? <p className='text-sm text-red-700'>{error}</p> : null}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
