import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { createServiceRuntime } from "./config/runtime";
import { RuntimeProvider } from "./app/runtime-context";
import { router } from "./app/router";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element is missing.");
}

console.log("=== TUMBAO BOOT ===");
console.log("VITE_TEST_MODE:", import.meta.env.VITE_TEST_MODE);
console.log("DEV:", import.meta.env.DEV);
console.log("PROD:", import.meta.env.PROD);

let runtime;

try {
  console.log("BEFORE createServiceRuntime()");

  runtime = await createServiceRuntime();

  console.log("AFTER createServiceRuntime()", runtime);
} catch (error) {
  console.error("RUNTIME FAILED:", error);

  root.innerHTML = `
    <div style="
      padding: 40px;
      font-family: system-ui, sans-serif;
      color: #b91c1c;
    ">
      <h1>Runtime initialization failed</h1>
      <pre style="
        margin-top: 20px;
        white-space: pre-wrap;
        background: #fef2f2;
        padding: 20px;
        border-radius: 8px;
      ">${error instanceof Error ? (error.stack ?? error.message) : String(error)}</pre>
    </div>
  `;

  throw error;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
    },
  },
});

console.log("BEFORE React render");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RuntimeProvider runtime={runtime}>
        <RouterProvider router={router} />
      </RuntimeProvider>
    </QueryClientProvider>
  </StrictMode>,
);

console.log("AFTER React render");
