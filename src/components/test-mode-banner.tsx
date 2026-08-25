import { useState } from 'react'
import { FlaskConical, RotateCcw } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useRuntime } from '../app/runtime-context'
import { Button } from './ui'

export function TestModeBanner() {
  const { testMode, testControls } = useRuntime()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  if (!testMode || !testControls) return null

  const reset = async () => {
    setBusy(true)
    await testControls.reset()
    sessionStorage.clear()
    await queryClient.invalidateQueries()
    setBusy(false)
  }

  return <aside className="test-banner">
    <span><FlaskConical size={16} /> Local test mode · no external connections</span>
    <Button onClick={reset} disabled={busy}><RotateCcw size={15} /> Reset demo data</Button>
  </aside>
}
