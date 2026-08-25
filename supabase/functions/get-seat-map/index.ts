import { z } from 'npm:zod@4'
import { preflight } from '../_shared/cors.ts'
import { apiError, json, methodNotAllowed } from '../_shared/http.ts'
import { serviceClient } from '../_shared/supabase.ts'

const requestSchema = z.object({ event_id: z.uuid().optional() }).optional()

Deno.serve(async (request) => {
  const optionsResponse = preflight(request)
  if (optionsResponse) return optionsResponse
  if (request.method !== 'POST') return methodNotAllowed()

  try {
    const body = request.headers.get('content-length') === '0' ? undefined : await request.json().catch(() => undefined)
    const parsed = requestSchema.safeParse(body)
    if (!parsed.success) return apiError('VALIDATION_ERROR', 'Invalid event identifier.', 422)

    const { data, error } = await serviceClient().rpc('get_public_seat_map', { p_event_id: parsed.data?.event_id ?? null })
    if (error) throw error
    if (!data?.event) return apiError('EVENT_NOT_FOUND', 'The event could not be found.', 404)

    return json({
      event: {
        id: data.event.id,
        name: data.event.name,
        eventDate: data.event.event_date,
        venue: data.event.venue,
        timezone: data.event.timezone,
        currency: data.event.currency,
      },
      seats: data.seats.map((seat: Record<string, unknown>) => ({
        id: seat.id,
        section: seat.section,
        rowLabel: seat.row_label,
        seatNumber: seat.seat_number,
        priceCategory: seat.price_category,
        priceMinor: seat.price_minor,
        currency: seat.currency,
        x: Number(seat.pos_x),
        y: Number(seat.pos_y),
        rotation: Number(seat.rotation),
        accessible: seat.is_accessible,
        status: seat.status,
        holdExpiresAt: seat.hold_expires_at ?? undefined,
      })),
      serverTime: data.server_time,
    })
  } catch (error) {
    console.error(JSON.stringify({ event: 'get-seat-map-failed', message: error instanceof Error ? error.message : 'unknown' }))
    return apiError('INTERNAL_ERROR', 'The seat map is temporarily unavailable.', 500)
  }
})
