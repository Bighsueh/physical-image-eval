import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { SessionBootstrap } from './auth/SessionBootstrap';
import { ProtectedRoute } from './components/ProtectedRoute';
import { queryClient } from './lib/queryClient';
import { ForcePasswordChangePage } from './routes/ForcePasswordChangePage';
import { LoginPage } from './routes/LoginPage';
import { ReviewProgressPage } from './routes/ReviewProgressPage';
import { ReviewWorkspacePage } from './routes/ReviewWorkspacePage';
import { AccountCreatePage } from './routes/admin/AccountCreatePage';
import { AccountsListPage } from './routes/admin/AccountsListPage';
import { DashboardPage } from './routes/admin/dashboard/DashboardPage';
import { ImageDrillDownPage } from './routes/admin/dashboard/ImageDrillDownPage';

/**
 * Route tree. Public: /login (the ONLY public screen — constitution III; there is no /register,
 * /signup, or create-account route anywhere). Unknown paths → /login. The client guard is
 * defense-in-depth; the server enforces every gate. Exported for routing tests.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Any authenticated user — forced/voluntary password change (allowed while mustChange). */}
      <Route element={<ProtectedRoute allowPasswordChange />}>
        <Route path="/password/change" element={<ForcePasswordChangePage />} />
      </Route>

      {/* Reviewer-only. */}
      <Route element={<ProtectedRoute role="REVIEWER" />}>
        <Route path="/progress" element={<ReviewProgressPage />} />
        <Route path="/review/:blueprintId" element={<ReviewWorkspacePage />} />
      </Route>

      {/* Admin-only. */}
      <Route element={<ProtectedRoute role="ADMIN" />}>
        <Route path="/admin/accounts" element={<AccountsListPage />} />
        <Route path="/admin/accounts/new" element={<AccountCreatePage />} />
        <Route path="/admin/dashboard" element={<DashboardPage />} />
        <Route path="/admin/dashboard/images/:blueprintId" element={<ImageDrillDownPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider initialStatus="unknown">
        <BrowserRouter>
          <SessionBootstrap />
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
