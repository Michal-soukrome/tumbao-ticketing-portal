import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { CalendarDays, MapPin, ShieldCheck } from 'lucide-react'
import { rememberOrder } from '../app/order-session'
import { useRuntime } from '../app/runtime-context'
import { AppError, formatMoney, seatLabel, type SeatDto } from '../domain/models'
import { SeatMap } from '../components/seat-map'
import { Button, Card, Notice } from '../components/ui'

export function EventPage() {
  const { service } = useRuntime()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const seatMap = useQuery({ queryKey: ['seat-map'], queryFn: () => service.getSeatMap() })

  useEffect(() => service.subscribeToSeatChanges(() => void queryClient.invalidateQueries({ queryKey: ['seat-map'] })), [queryClient, service])

  useEffect(() => {
    if (!seatMap.data) return
    const available = new Set(seatMap.data.seats.filter((seat) => seat.status === 'AVAILABLE').map((seat) => seat.id))
    setSelected((current) => new Set([...current].filter((seatId) => available.has(seatId))))
  }, [seatMap.data])

  const selectedSeats = useMemo(
    () => seatMap.data?.seats.filter((seat) => selected.has(seat.id)) ?? [],
    [seatMap.data, selected],
  )

  const reserve = useMutation({
    mutationFn: () => service.reserveSeats(seatMap.data!.event.id, [...selected]),
    onSuccess: async (reservation) => {
      rememberOrder({ orderId: reservation.orderId, accessToken: reservation.accessToken })
      await queryClient.invalidateQueries({ queryKey: ['seat-map'] })
      await navigate({ to: '/checkout/$orderId', params: { orderId: reservation.orderId } })
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: ['seat-map'] }),
  })

  const toggle = (seat: SeatDto) => setSelected((current) => {
    const next = new Set(current)
    if (next.has(seat.id)) next.delete(seat.id)
    else if (next.size < 10) next.add(seat.id)
    return next
  })

  if (seatMap.isPending) return <div className="page narrow"><div className="skeleton tall" /></div>
  if (seatMap.isError || !seatMap.data) return <div className="page narrow"><Notice tone="danger">Could not load the seating map. Check the backend configuration and retry.</Notice></div>

  const { event, seats } = seatMap.data
  const total = selectedSeats.reduce((sum, seat) => sum + seat.priceMinor, 0)
  const reserveError = reserve.error instanceof AppError ? reserve.error.message : reserve.error ? 'Reservation failed. Please try again.' : null

  return <div className="page">
    <section className="event-hero">
      <p className="eyebrow">One night · live in Prague</p>
      <h1>{event.name}</h1>
      <div className="event-facts">
        <span><CalendarDays size={19} /> {new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone: event.timezone }).format(new Date(event.eventDate))}</span>
        <span><MapPin size={19} /> {event.venue}</span>
      </div>
    </section>

    <div className="booking-layout">
      <div>
        <div className="map-heading"><div><p className="eyebrow">Choose your exact seats</p><h2>Seating plan</h2></div><span className="availability"><i /> {seats.filter((seat) => seat.status === 'AVAILABLE').length} available</span></div>
        <SeatMap seats={seats} selected={selected} onToggle={toggle} />
        <div className="legend" aria-label="Seat map legend"><span><i className="available" />Available</span><span><i className="selected" />Selected</span><span><i className="held" />Held</span><span><i className="sold" />Sold</span></div>
      </div>

      <Card className="selection-summary">
        <p className="eyebrow">Your selection</p>
        <h2>{selectedSeats.length ? `${selectedSeats.length} seat${selectedSeats.length === 1 ? '' : 's'}` : 'No seats yet'}</h2>
        {selectedSeats.length ? <ul>{selectedSeats.map((seat) => <li key={seat.id}><span>{seatLabel(seat)}</span><strong>{formatMoney(seat.priceMinor, seat.currency)}</strong></li>)}</ul> : <p className="muted">Tap any available seat on the plan. You can reserve up to 10.</p>}
        <div className="summary-total"><span>Total</span><strong>{formatMoney(total, event.currency)}</strong></div>
        {reserveError ? <Notice tone="danger">{reserveError}</Notice> : null}
        <Button className="primary wide" disabled={!selected.size || reserve.isPending} onClick={() => reserve.mutate()}>{reserve.isPending ? 'Reserving…' : 'Reserve and continue'}</Button>
        <p className="secure-note"><ShieldCheck size={17} /> Seats are held atomically for 10 minutes.</p>
      </Card>
    </div>
    {selectedSeats.length ? createPortal(<div className="mobile-booking-bar"><span><strong>{selectedSeats.length} seats</strong><small>{formatMoney(total, event.currency)}</small></span><Button className="primary" disabled={reserve.isPending} onClick={() => reserve.mutate()}>Continue</Button></div>, document.body) : null}
  </div>
}
