import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { queryClient } from './lib/queryClient';

/**
 * App shell (T040): TanStack Query provider + Router. Real routes (login, forced password change,
 * admin account management, protected progress) are wired in their user-story phases. Until then
 * everything redirects to /login — the only public screen (constitution III).
 */
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              <main className="min-h-screen flex items-center justify-center text-gray-700">
                <p>運動衛教圖審查工具</p>
              </main>
            }
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
