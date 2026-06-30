import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { queryClient } from './lib/queryClient';
import { LoginPage } from './routes/LoginPage';
import { ProgressPage } from './routes/ProgressPage';

/**
 * App shell + router. Public: /login (the only public screen — constitution III). Protected:
 * /progress (reviewer landing). Admin + forced-password-change routes are added in US2. Unknown
 * paths redirect to /login. The client guard is defense-in-depth; the server enforces every gate.
 */
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute role="REVIEWER" />}>
              <Route path="/progress" element={<ProgressPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
