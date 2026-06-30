import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { SessionBootstrap } from './auth/SessionBootstrap';
import { ProtectedRoute } from './components/ProtectedRoute';
import { queryClient } from './lib/queryClient';
import { ForcePasswordChangePage } from './routes/ForcePasswordChangePage';
import { LoginPage } from './routes/LoginPage';
import { ProgressPage } from './routes/ProgressPage';
import { AccountCreatePage } from './routes/admin/AccountCreatePage';
import { AccountsListPage } from './routes/admin/AccountsListPage';

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
        <Route path="/progress" element={<ProgressPage />} />
      </Route>

      {/* Admin-only. */}
      <Route element={<ProtectedRoute role="ADMIN" />}>
        <Route path="/admin/accounts" element={<AccountsListPage />} />
        <Route path="/admin/accounts/new" element={<AccountCreatePage />} />
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
