import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Direct SQL is test-only and targets the Postgres instance inside the local
// Supabase stack. Production application code never opens a database socket.
const connectionString = process.env.SUPABASE_LOCAL_DB_URL
const describeDatabase = connectionString ? describe : describe.skip
const sql = connectionString ? postgres(connectionString, { max: 25 }) : null
const eventId = '00000000-0000-4000-8000-000000000001'
const createdOrders: string[] = []
type ReservationRow = { result: { order_id: string } }

describeDatabase('reserve_seats database concurrency', () => {
  let seatIds: string[]

  beforeAll(async () => {
    seatIds = (await sql!<{ id: string }[]>`select id from public.seats s where not exists (select 1 from public.seat_allocations a where a.seat_id = s.id) order by id limit 5`).map((row) => row.id)
  })

  afterAll(async () => {
    if (createdOrders.length) await sql!`delete from public.orders where id = any(${createdOrders}::uuid[])`
    await sql?.end()
  })

  it('allows exactly one of 20 concurrent attempts for one seat', async () => {
    const reserve = async (index: number): Promise<ReservationRow[]> =>
      await sql!<ReservationRow[]>`select public.reserve_seats(${eventId}::uuid, array[${seatIds[0]!}::uuid], ${`session-${index}`}, ${`access-${index}`}) as result`
    const calls = Array.from({ length: 20 }, (_, index) => reserve(index))
    const results = await Promise.allSettled(calls)
    const successes = results.filter((result): result is PromiseFulfilledResult<ReservationRow[]> => result.status === 'fulfilled')
    expect(successes).toHaveLength(1)
    createdOrders.push(successes[0]!.value[0]!.result.order_id)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(19)
  })

  it('never creates a partial allocation for overlapping requests', async () => {
    const reserve = async (ids: [string, string], session: string): Promise<ReservationRow[]> =>
      await sql!<ReservationRow[]>`select public.reserve_seats(${eventId}::uuid, array[${ids[0]}::uuid, ${ids[1]}::uuid], ${session}, ${`access-${session}`}) as result`
    const first = reserve([seatIds[1]!, seatIds[2]!], 'overlap-a')
    const second = reserve([seatIds[2]!, seatIds[3]!], 'overlap-b')
    const results = await Promise.allSettled([first, second])
    const winner = results.find((result): result is PromiseFulfilledResult<ReservationRow[]> => result.status === 'fulfilled')
    expect(winner).toBeDefined()
    createdOrders.push(winner!.value[0]!.result.order_id)
    const allocationCount = await sql!<{ count: number }[]>`select count(*)::int as count from public.seat_allocations where order_id = ${winner!.value[0]!.result.order_id}::uuid`
    expect(allocationCount[0]!.count).toBe(2)
  })
})
