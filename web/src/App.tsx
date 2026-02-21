import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout";
import { useAuth } from "./contexts/AuthContext";
import { ActivitiesPage } from "./pages/ActivitiesPage";
import { ActivityDetailPage } from "./pages/ActivityDetailPage";
import { AdminPage } from "./pages/AdminPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { ExportPage } from "./pages/ExportPage";
import { ImportPage } from "./pages/ImportPage";
import { LandingPage } from "./pages/LandingPage";
import { OAuthCallbackPage } from "./pages/OAuthCallbackPage";
import { SettingsPage } from "./pages/SettingsPage";
import { StravaConnectPage } from "./pages/StravaConnectPage";
import { TrainingPlanPage } from "./pages/TrainingPlanPage";

export function App() {
  return (
    <>
      <Routes>
        <Route element={<LandingPage />} path="/login" />
        <Route element={<OAuthCallbackPage />} path="/auth/callback" />

        <Route element={<ProtectedRoutes />}>
          <Route element={<AppLayout />}>
            <Route element={<StravaUnlinkedRoutes />}>
              <Route element={<StravaConnectPage />} path="/connect-strava" />
            </Route>

            <Route element={<AdminOnlyRoutes />}>
              <Route element={<AdminPage />} path="/admin" />
            </Route>

            <Route element={<StravaLinkedRoutes />}>
              <Route element={<SettingsPage />} path="/settings" />
              <Route element={<ImportPage />} path="/import" />
              <Route element={<ActivitiesPage />} path="/activities" />
              <Route element={<ActivityDetailPage />} path="/activities/:id" />
              <Route element={<Navigate replace to="/analytics" />} path="/dashboard" />
              <Route element={<AnalyticsPage />} path="/analytics" />
              <Route element={<TrainingPlanPage />} path="/training-plan" />
              <Route element={<Navigate replace to="/analytics" />} path="/correlations" />
              <Route element={<ExportPage />} path="/export" />
            </Route>
          </Route>
        </Route>

        <Route element={<RootRedirect />} path="*" />
      </Routes>
      <p className="pointer-events-none fixed bottom-2 right-3 z-50 text-[11px] text-black/55">
        © EngueranR
      </p>
    </>
  );
}

function RootRedirect() {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div className="p-6 text-sm text-muted">Chargement session...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate replace to="/login" />;
  }

  if (user?.connectedToStrava) {
    return <Navigate replace to="/analytics" />;
  }

  if (user?.isAdmin) {
    return <Navigate replace to="/admin" />;
  }

  return <Navigate replace to="/connect-strava" />;
}

function ProtectedRoutes() {
  const { loading, isAuthenticated } = useAuth();

  if (loading) {
    return <div className="p-6 text-sm text-muted">Chargement session...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate replace to="/login" />;
  }

  return <Outlet />;
}

function StravaUnlinkedRoutes() {
  const { loading, user } = useAuth();

  if (loading) {
    return <div className="p-6 text-sm text-muted">Chargement session...</div>;
  }

  if (user?.connectedToStrava) {
    return <Navigate replace to="/analytics" />;
  }

  return <Outlet />;
}

function StravaLinkedRoutes() {
  const { loading, user } = useAuth();

  if (loading) {
    return <div className="p-6 text-sm text-muted">Chargement session...</div>;
  }

  if (!user?.connectedToStrava) {
    return <Navigate replace to="/connect-strava" />;
  }

  return <Outlet />;
}

function AdminOnlyRoutes() {
  const { loading, user } = useAuth();

  if (loading) {
    return <div className="p-6 text-sm text-muted">Chargement session...</div>;
  }

  if (!user?.isAdmin) {
    return <Navigate replace to={user?.connectedToStrava ? "/analytics" : "/connect-strava"} />;
  }

  return <Outlet />;
}
