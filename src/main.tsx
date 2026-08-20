import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { createServiceRuntime } from './config/runtime'
import { RuntimeProvider } from './app/runtime-context'
import { router } from './app/router'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Root element is missing.')

const runtime = await createServiceRuntime()
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, retry: 1 } } })

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RuntimeProvider runtime={runtime}>
        <RouterProvider router={router} />
      </RuntimeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
