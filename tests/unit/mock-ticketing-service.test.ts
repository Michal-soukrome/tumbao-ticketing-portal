import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryStorage, MockTicketingService } from '../../src/test-mode/mock-ticketing-service'

const eventId = '00000000-0000-4000-8000-000000000001'

describe('MockTicketingService', () => {
  let now: number
  let service: MockTicketingService

  beforeEach(() => {
    now = Date.parse('2026-08-20T12:00:00Z')
    service = new MockTicketingService(createMemoryStorage(), () => now)
  })

  it('matches the venue reference row lengths and outward M extensions', async () => {
    const { seats } = await service.getSeatMap()
    const rowCounts = (predicate: (id: string, section: string) => boolean, rows: number) =>
      Array.from({ length: rows }, (_, index) => seats.filter((seat) => predicate(seat.id, seat.section) && seat.rowLabel === String(index + 1)).length)

    expect(seats).toHaveLength(860)
    for (const section of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
      expect(rowCounts((_id, candidate) => candidate === section, 7)).toEqual([10, 10, 10, 10, 10, 10, 10])
    }
    expect(rowCounts((_id, section) => section === 'L', 4)).toEqual([9, 8, 6, 5])
    expect(rowCounts((_id, section) => section === 'I', 4)).toEqual([9, 8, 6, 5])
    expect(rowCounts((_id, section) => section === 'K', 6)).toEqual([10, 10, 10, 10, 10, 10])
    expect(rowCounts((_id, section) => section === 'J', 6)).toEqual([10, 10, 10, 10, 10, 10])
    expect(rowCounts((id) => id.startsWith('seat-M-left-'), 6)).toEqual([10, 10, 10, 10, 10, 12])
    expect(rowCounts((id) => id.startsWith('seat-M-right-'), 6)).toEqual([10, 10, 10, 10, 10, 12])

    const xRange = (idPrefix: string, row: string) => {
      const xValues = seats.filter((seat) => seat.id.startsWith(idPrefix) && seat.rowLabel === row).map((seat) => seat.x)
      return { min: Math.min(...xValues), max: Math.max(...xValues) }
    }
    const leftFive = xRange('seat-M-left-', '5')
    const leftSix = xRange('seat-M-left-', '6')
    const rightFive = xRange('seat-M-right-', '5')
    const rightSix = xRange('seat-M-right-', '6')
    expect(leftSix.min).toBeLessThan(leftFive.min)
    expect(leftSix.max).toBeLessThanOrEqual(leftFive.max)
    expect(rightSix.min).toBeGreaterThanOrEqual(rightFive.min)
    expect(rightSix.max).toBeGreaterThan(rightFive.max)
  })

  it('atomically rejects a second reservation for an allocated seat', async () => {
    const map = await service.getSeatMap()
    const seat = map.seats.find((candidate) => candidate.status === 'AVAILABLE')!
    await service.reserveSeats(eventId, [seat.id])

    await expect(service.reserveSeats(eventId, [seat.id])).rejects.toMatchObject({
      code: 'SEAT_UNAVAILABLE',
      seatIds: [seat.id],
    })
  })

  it('releases all held seats when an order expires', async () => {
    const map = await service.getSeatMap()
    const seatIds = map.seats.filter((seat) => seat.status === 'AVAILABLE').slice(0, 2).map((seat) => seat.id)
    const reservation = await service.reserveSeats(eventId, seatIds)
    now = new Date(reservation.expiresAt).getTime() + 1

    const expired = await service.getOrder({ orderId: reservation.orderId, accessToken: reservation.accessToken })
    expect(expired.status).toBe('EXPIRED')
    const refreshed = await service.getSeatMap()
    expect(refreshed.seats.filter((seat) => seatIds.includes(seat.id)).every((seat) => seat.status === 'AVAILABLE')).toBe(true)
  })

  it('simulates payment, sold allocations, and one ticket per seat', async () => {
    const map = await service.getSeatMap()
    const seatIds = map.seats.filter((seat) => seat.status === 'AVAILABLE').slice(0, 2).map((seat) => seat.id)
    const reservation = await service.reserveSeats(eventId, seatIds)
    const credentials = { orderId: reservation.orderId, accessToken: reservation.accessToken }
    await service.updateCustomer(credentials, { name: 'Ada Lovelace', email: 'ada@example.test' })
    const payment = await service.startPayment(credentials)

    expect(payment.kind).toBe('paid')
    if (payment.kind !== 'paid') return
    expect(payment.order.status).toBe('PAID')
    expect(payment.order.tickets).toHaveLength(2)
    expect((await service.getSeatMap()).seats.filter((seat) => seatIds.includes(seat.id)).every((seat) => seat.status === 'SOLD')).toBe(true)
  })

  it('checks a ticket in exactly once', async () => {
    const first = await service.checkinTicket('TUM-DEMO-001')
    const second = await service.checkinTicket('TUM-DEMO-001')
    expect(first.result).toBe('CHECKED_IN')
    expect(second.result).toBe('ALREADY_USED')
  })

  it('restores the deterministic sample after reset', async () => {
    await service.checkinTicket('TUM-DEMO-001')
    await service.reset()
    expect((await service.checkinTicket('TUM-DEMO-001')).result).toBe('CHECKED_IN')
  })
})
