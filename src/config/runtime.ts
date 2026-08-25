import type { ServiceRuntime } from '../services/ticketing-service'

const requestedTestMode = import.meta.env.VITE_TEST_MODE === 'true'

if (requestedTestMode && (!import.meta.env.DEV || !__TEST_MODE_BUILD_ALLOWED__)) {
  throw new Error('VITE_TEST_MODE is development-only and cannot run in a production build.')
}

export async function createServiceRuntime(): Promise<ServiceRuntime> {
  if (requestedTestMode) {
    const { createMockRuntime } = await import('../test-mode/mock-ticketing-service')
    return createMockRuntime()
  }

  const { createSupabaseRuntime } = await import('../services/supabase-ticketing-service')
  return createSupabaseRuntime()
}
