import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { queryClient } from './lib/queryClient';
import { ForcePasswordChangePage } from './routes/ForcePasswordChangePage';
import { LoginPage } from './routes/LoginPage';
import { ProgressPage } from './routes/ProgressPage';
import { AccountCreatePage } from './routes/admin/AccountCreatePage';
import { AccountsListPage } from './routes/admin/AccountsListPage';

/**
 * App shell + router. Public: /login (the only public screen — constitution III). Protected:
 * /password/change (any role), /progress (reviewer), /admin/* (admin). The client guard is
 * defense-in-depth; the server enforces every gate. Unknown paths → /login.
 */
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            {/* Any authenticated user — forced/voluntary password change. */}
            <Route element={<ProtectedRoute />}>
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
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
