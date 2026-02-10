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
  const [collapsed, setCollapsed] = useState(false);

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
        <div className='mx-auto w-full max-w-xl space-y-6'>
          <SectionHeader
            title='StravHat'
            subtitle='Connectez votre compte Strava pour commencer a explorer vos donnees et reveler des tendances cachees.'
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed((prev) => !prev)}
          />
          {collapsed ? (
            <p className='text-xs text-muted'>Section repliee.</p>
          ) : (
            <>
              <button
                className={`w-full py-3 ${primaryButtonClass}`}
                disabled={loading}
                onClick={startStravaAuth}
                type='button'
              >
                {loading ? 'Redirection...' : 'Connect Strava'}
              </button>

              {error ?
                <p className='text-sm text-red-700'>{error}</p>
              : null}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
