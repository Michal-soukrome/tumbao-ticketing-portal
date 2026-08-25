import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { CalendarDays, MapPin, ShieldCheck } from 'lucide-react'
import { clearActiveOrder, getActiveOrderCredentials, rememberOrder } from '../app/order-session'
import { useRuntime } from '../app/runtime-context'
import { AppError, formatMoney, seatLabel, type SeatDto } from '../domain/models'
import { HoldCountdown } from '../components/hold-countdown'
import { SeatMap } from '../components/seat-map'
import { Button, Card, Notice } from '../components/ui'

function MobileBookingBar({
  seatCount,
  totalLabel,
  pending,
  held,
  onContinue,
}: {
  seatCount: number
  totalLabel: string
  pending: boolean
  held?: boolean
  onContinue: () => void
}) {
  const barRef = useRef<HTMLDivElement>(null)
  const supportsPopover = typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype

  useEffect(() => {
    const bar = barRef.current
    if (!bar || !supportsPopover) return
    bar.showPopover()
    return () => {
      if (bar.matches(':popover-open')) bar.hidePopover()
    }
  }, [supportsPopover])

  return <div ref={barRef} popover={supportsPopover ? 'manual' : undefined} className="mobile-booking-bar">
    <span><strong>{seatCount} {held ? 'held ' : ''}seat{seatCount === 1 ? '' : 's'}</strong><small>{totalLabel}</small></span>
    <Button className="primary" disabled={pending} onClick={onContinue}>{held ? 'Continue checkout' : 'Continue'}</Button>
  </div>
}

export function EventPage() {
  const { service } = useRuntime()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [activeCredentials, setActiveCredentials] = useState(() => getActiveOrderCredentials())
  const seatMap = useQuery({ queryKey: ['seat-map'], queryFn: () => service.getSeatMap() })
  const activeOrder = useQuery({
    queryKey: ['active-order', activeCredentials?.orderId],
    queryFn: () => service.getOrder(activeCredentials!),
    enabled: Boolean(activeCredentials),
    retry: false,
  })

  useEffect(() => service.subscribeToSeatChanges(() => {
    void queryClient.invalidateQueries({ queryKey: ['seat-map'] })
    void queryClient.invalidateQueries({ queryKey: ['active-order'] })
  }), [queryClient, service])

  useEffect(() => {
    if (!activeCredentials || activeOrder.isPending) return
    if (activeOrder.isError || activeOrder.data?.status !== 'PENDING') {
      clearActiveOrder(activeCredentials.orderId)
      setActiveCredentials(null)
      void queryClient.invalidateQueries({ queryKey: ['seat-map'] })
    }
  }, [activeCredentials, activeOrder.data?.status, activeOrder.isError, activeOrder.isPending, queryClient])

  useEffect(() => {
    if (!seatMap.data) return
    const available = new Set(seatMap.data.seats.filter((seat) => seat.status === 'AVAILABLE').map((seat) => seat.id))
    setSelected((current) => new Set([...current].filter((seatId) => available.has(seatId))))
  }, [seatMap.data])

  const selectedSeats = useMemo(
    () => seatMap.data?.seats.filter((seat) => selected.has(seat.id)) ?? [],
    [seatMap.data, selected],
  )
  const heldOrder = activeOrder.data?.status === 'PENDING' ? activeOrder.data : null
  const ownedHeldIds = useMemo(() => new Set(heldOrder?.seats.map((seat) => seat.id) ?? []), [heldOrder])

  const reserve = useMutation({
    mutationFn: () => service.reserveSeats(seatMap.data!.event.id, [...selected]),
    onSuccess: async (reservation) => {
      rememberOrder({ orderId: reservation.orderId, accessToken: reservation.accessToken })
      await queryClient.invalidateQueries({ queryKey: ['seat-map'] })
      await navigate({ to: '/checkout/$orderId', params: { orderId: reservation.orderId } })
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: ['seat-map'] }),
  })

  const toggle = (seat: SeatDto) => {
    if (heldOrder) return
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(seat.id)) next.delete(seat.id)
      else if (next.size < 10) next.add(seat.id)
      return next
    })
  }

  if (seatMap.isPending) return <div className="page narrow"><div className="skeleton tall" /></div>
  if (seatMap.isError || !seatMap.data) return <div className="page narrow"><Notice tone="danger">Could not load the seating map. Check the backend configuration and retry.</Notice></div>

  const { event, seats } = seatMap.data
  const cartSeats = heldOrder?.seats ?? selectedSeats
  const total = heldOrder?.totalMinor ?? selectedSeats.reduce((sum, seat) => sum + seat.priceMinor, 0)
  const reserveError = reserve.error instanceof AppError ? reserve.error.message : reserve.error ? 'Reservation failed. Please try again.' : null
  const continueCheckout = () => {
    if (heldOrder && activeCredentials) {
      void navigate({ to: '/checkout/$orderId', params: { orderId: activeCredentials.orderId } })
    } else {
      reserve.mutate()
    }
  }

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
        <SeatMap seats={seats} selected={selected} ownedHeld={ownedHeldIds} selectionLocked={Boolean(heldOrder)} onToggle={toggle} />
        <div className="legend" aria-label="Seat map legend"><span><i className="available" />Available</span><span><i className="selected" />Selected</span><span><i className="held" />Held</span><span><i className="yours" />Your hold</span><span><i className="sold" />Sold</span></div>
      </div>

      <Card className="selection-summary">
        <p className="eyebrow">{heldOrder ? 'Your held seats' : 'Your selection'}</p>
        <h2>{activeCredentials && activeOrder.isPending ? 'Restoring your hold...' : cartSeats.length ? `${cartSeats.length} ${heldOrder ? 'held ' : ''}seat${cartSeats.length === 1 ? '' : 's'}` : 'No seats yet'}</h2>
        {cartSeats.length ? <ul>{cartSeats.map((seat) => <li key={seat.id}><span>{seatLabel(seat)}</span><strong>{formatMoney(seat.priceMinor, seat.currency)}</strong></li>)}</ul> : <p className="muted">Tap any available seat on the plan. You can reserve up to 10.</p>}
        <div className="summary-total"><span>Total</span><strong>{formatMoney(total, event.currency)}</strong></div>
        {heldOrder ? <Notice tone="warning">These seats are held for this browser session. Complete checkout before the timer expires.</Notice> : null}
        {heldOrder ? <HoldCountdown expiresAt={heldOrder.expiresAt} onExpired={() => {
          void activeOrder.refetch()
          void queryClient.invalidateQueries({ queryKey: ['seat-map'] })
        }} /> : null}
        {reserveError ? <Notice tone="danger">{reserveError}</Notice> : null}
        <Button className="primary wide" disabled={heldOrder ? false : !selected.size || reserve.isPending} onClick={continueCheckout}>{heldOrder ? 'Continue checkout' : reserve.isPending ? 'Reserving…' : 'Reserve and continue'}</Button>
        <p className="secure-note"><ShieldCheck size={17} /> Seats are held atomically for 10 minutes.</p>
      </Card>
    </div>
    {cartSeats.length ? <MobileBookingBar seatCount={cartSeats.length} totalLabel={formatMoney(total, event.currency)} pending={reserve.isPending} held={Boolean(heldOrder)} onContinue={continueCheckout} /> : null}
  </div>
}
