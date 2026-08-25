import type { ServiceRuntime } from "../services/ticketing-service";

const requestedTestMode = import.meta.env.VITE_TEST_MODE === "true";

export async function createServiceRuntime(): Promise<ServiceRuntime> {
  if (requestedTestMode) {
    const { createMockRuntime } =
      await import("../test-mode/mock-ticketing-service");
    return createMockRuntime();
  }

  const { createSupabaseRuntime } =
    await import("../services/supabase-ticketing-service");
  return createSupabaseRuntime();
}
