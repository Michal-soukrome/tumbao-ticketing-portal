import { useEffect, useRef, useState } from 'react'
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser'
import { Camera, CheckCircle2, Search, StopCircle, XCircle } from 'lucide-react'
import { useRuntime } from '../app/runtime-context'
import type { CheckinResult } from '../domain/models'
import { Button, Card, Input, Notice } from '../components/ui'

export function ScannerPage() {
  const { service, testMode } = useRuntime()
  const [code, setCode] = useState(testMode ? 'TUM-DEMO-001' : '')
  const [result, setResult] = useState<CheckinResult | null>(null)
  const [scanning, setScanning] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)

  const validate = async (value = code) => {
    if (!value.trim()) return
    const next = await service.checkinTicket(value)
    setResult(next)
    if (next.result === 'CHECKED_IN') setCode('')
  }

  const startCamera = async () => {
    if (!videoRef.current) return
    setScanning(true)
    const reader = new BrowserQRCodeReader()
    controlsRef.current = await reader.decodeFromVideoDevice(undefined, videoRef.current, (scanResult) => {
      if (scanResult) {
        controlsRef.current?.stop()
        setScanning(false)
        void validate(scanResult.getText())
      }
    })
  }

  const stopCamera = () => { controlsRef.current?.stop(); controlsRef.current = null; setScanning(false) }
  useEffect(() => stopCamera, [])

  const tone = result?.result === 'CHECKED_IN' ? 'success' : result?.result === 'ALREADY_USED' ? 'warning' : 'danger'
  return <div className="scanner-page"><div className="scanner-shell"><p className="eyebrow">Door staff</p><h1>Ticket check-in</h1><Card><video ref={videoRef} className={scanning ? 'scanner-video active' : 'scanner-video'} muted playsInline /><div className="scanner-actions"><Button className={scanning ? '' : 'primary'} onClick={scanning ? stopCamera : startCamera}>{scanning ? <StopCircle size={18} /> : <Camera size={18} />}{scanning ? 'Stop camera' : 'Scan QR with camera'}</Button></div><div className="divider"><span>or enter a ticket code</span></div><form onSubmit={(event) => { event.preventDefault(); void validate() }} className="manual-code"><Input value={code} onChange={(event) => setCode(event.target.value)} placeholder="TUM-00001-1 or QR token" autoCapitalize="off" /><Button type="submit"><Search size={18} /> Validate</Button></form></Card>{result ? <Notice tone={tone}><div className="scan-result">{result.result === 'CHECKED_IN' ? <CheckCircle2 size={32} /> : <XCircle size={32} />}<div><strong>{result.result.replace('_', ' ')}</strong>{'ticket' in result ? <span>{result.ticket.ticketCode} · Section {result.ticket.seat.section}, row {result.ticket.seat.rowLabel}, seat {result.ticket.seat.seatNumber}{result.ticket.checkedInAt ? ` · ${new Date(result.ticket.checkedInAt).toLocaleTimeString()}` : ''}</span> : <span>No matching ticket.</span>}</div></div></Notice> : null}</div></div>
}
