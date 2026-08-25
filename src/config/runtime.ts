import { ServiceRuntime } from "../services/ticketing-service";

const requestedTestMode = import.meta.env.VITE_TEST_MODE === "true";

console.log("VITE_TEST_MODE:", import.meta.env.VITE_TEST_MODE);
console.log("requestedTestMode:", requestedTestMode);

export async function createServiceRuntime(): Promise<ServiceRuntime> {
  console.log("Creating runtime...");

  if (requestedTestMode) {
    console.log("Using MOCK runtime");
    const { createMockRuntime } =
      await import("../test-mode/mock-ticketing-service");
    return createMockRuntime();
  }

  console.log("Using SUPABASE runtime");
  const { createSupabaseRuntime } =
    await import("../services/supabase-ticketing-service");
  return createSupabaseRuntime();
}
