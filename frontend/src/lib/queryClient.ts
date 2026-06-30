import { QueryClient } from '@tanstack/react-query';

/** Shared TanStack Query client. Auth state is fetched once and cached; no retry on 401. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});
