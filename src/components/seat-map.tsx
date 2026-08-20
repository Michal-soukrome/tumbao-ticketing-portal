import { useEffect, useRef, useState } from 'react'
import Panzoom, { type PanzoomObject } from '@panzoom/panzoom'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import type { SeatDto } from '../domain/models'
import { Button } from './ui'

interface SeatMapProps {
  seats: SeatDto[]
  selected: Set<string>
  onToggle: (seat: SeatDto) => void
}

const statusLabel = (seat: SeatDto, selected: boolean) =>
  `Section ${seat.section}, row ${seat.rowLabel}, seat ${seat.seatNumber}, ${seat.priceCategory}, ${seat.priceMinor / 100} CZK, ${selected ? 'selected' : seat.status.toLowerCase()}`

export function SeatMap({ seats, selected, onToggle }: SeatMapProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const panzoomRef = useRef<PanzoomObject | null>(null)
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    if (!svgRef.current) return
    const svgElement = svgRef.current
    const instance = Panzoom(svgElement, { minScale: 0.8, maxScale: 3.5, contain: 'outside', cursor: 'grab' })
    panzoomRef.current = instance
    const parent = svgElement.parentElement
    const wheel = (event: WheelEvent) => instance.zoomWithWheel(event)
    parent?.addEventListener('wheel', wheel, { passive: false })
    const changed = () => setZoom(instance.getScale())
    svgElement.addEventListener('panzoomchange', changed)
    return () => {
      parent?.removeEventListener('wheel', wheel)
      svgElement.removeEventListener('panzoomchange', changed)
      instance.destroy()
    }
  }, [])

  const sections = [...new Set(seats.map((seat) => seat.section))]

  return <div className="seat-map-card">
    <div className="seat-map-toolbar" aria-label="Map controls">
      <Button aria-label="Zoom out" onClick={() => panzoomRef.current?.zoomOut()}><Minus size={18} /></Button>
      <span>{Math.round(zoom * 100)}%</span>
      <Button aria-label="Zoom in" onClick={() => panzoomRef.current?.zoomIn()}><Plus size={18} /></Button>
      <Button aria-label="Reset map" onClick={() => panzoomRef.current?.reset()}><RotateCcw size={18} /></Button>
    </div>
    <div className="seat-map-viewport">
      <svg ref={svgRef} className="seat-map" viewBox="0 0 1000 530" role="group" aria-label="Interactive seating map">
        <rect className="stage" x="310" y="22" width="380" height="42" rx="4" />
        <text className="stage-label" x="500" y="49" textAnchor="middle">STAGE · JEVIŠTĚ</text>
        {sections.map((section) => {
          const first = seats.find((seat) => seat.section === section)
          return first ? <text key={section} className="section-label" x={first.x + 70} y={first.y - 16} textAnchor="middle">SECTION {section}</text> : null
        })}
        {seats.map((seat) => {
          const isSelected = selected.has(seat.id)
          const disabled = seat.status !== 'AVAILABLE'
          return <g key={seat.id} transform={`translate(${seat.x} ${seat.y}) rotate(${seat.rotation})`}>
            <circle
              className={`seat seat-${seat.status.toLowerCase()} ${isSelected ? 'seat-selected' : ''}`}
              r="8"
              aria-hidden="true"
            />
            <text className="seat-number" textAnchor="middle" dominantBaseline="central" aria-hidden="true">{seat.seatNumber}</text>
            <circle
              className="seat-hit-target"
              r="12"
              role="button"
              tabIndex={disabled ? -1 : 0}
              aria-disabled={disabled}
              aria-pressed={isSelected}
              aria-label={statusLabel(seat, isSelected)}
              onClick={() => !disabled && onToggle(seat)}
              onKeyDown={(event) => {
                if (!disabled && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault()
                  onToggle(seat)
                }
              }}
            />
          </g>
        })}
      </svg>
    </div>
  </div>
}
