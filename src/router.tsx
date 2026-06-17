import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Stop the preview from feeling like it constantly refreshes:
        // don't refetch every time the iframe regains focus, and treat data
        // as fresh for a minute so back-to-back tab clicks reuse the cache.
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: 60_000,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
