import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout";
import { useAuth } from "./contexts/AuthContext";
import { ActivitiesPage } from "./pages/ActivitiesPage";
import { ActivityDetailPage } from "./pages/ActivityDetailPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { CorrelationBuilderPage } from "./pages/CorrelationBuilderPage";
import { ExportPage } from "./pages/ExportPage";
import { ImportPage } from "./pages/ImportPage";
import { LandingPage } from "./pages/LandingPage";
import { OAuthCallbackPage } from "./pages/OAuthCallbackPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TrainingPlanPage } from "./pages/TrainingPlanPage";

export function App() {
  return (
    <Routes>
      <Route element={<LandingPage />} path="/login" />
      <Route element={<OAuthCallbackPage />} path="/auth/callback" />

      <Route element={<ProtectedRoutes />}>
        <Route element={<AppLayout />}>
          <Route element={<ImportPage />} path="/import" />
          <Route element={<ActivitiesPage />} path="/activities" />
          <Route element={<ActivityDetailPage />} path="/activities/:id" />
          <Route element={<Navigate replace to="/analytics" />} path="/dashboard" />
          <Route element={<AnalyticsPage />} path="/analytics" />
          <Route element={<TrainingPlanPage />} path="/training-plan" />
          <Route element={<CorrelationBuilderPage />} path="/correlations" />
          <Route element={<ExportPage />} path="/export" />
          <Route element={<SettingsPage />} path="/settings" />
        </Route>
      </Route>

      <Route element={<RootRedirect />} path="*" />
    </Routes>
  );
}

function RootRedirect() {
  const { isAuthenticated } = useAuth();

  return <Navigate replace to={isAuthenticated ? "/analytics" : "/login"} />;
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
