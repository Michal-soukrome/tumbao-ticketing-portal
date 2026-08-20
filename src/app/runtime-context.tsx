import { createContext, useContext, type PropsWithChildren } from 'react'
import type { ServiceRuntime } from '../services/ticketing-service'

const RuntimeContext = createContext<ServiceRuntime | null>(null)

export function RuntimeProvider({ runtime, children }: PropsWithChildren<{ runtime: ServiceRuntime }>) {
  return <RuntimeContext.Provider value={runtime}>{children}</RuntimeContext.Provider>
}

// Runtime is initialized once before React renders; exporting the hook beside its
// provider keeps the context private without changing hot-reload behavior.
// eslint-disable-next-line react-refresh/only-export-components
export function useRuntime() {
  const runtime = useContext(RuntimeContext)
  if (!runtime) throw new Error('RuntimeProvider is missing.')
  return runtime
}
