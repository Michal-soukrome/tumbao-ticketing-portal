import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { AppError, type AppErrorShape } from '../domain/models'
import type { ServiceRuntime, TicketingService } from './ticketing-service'

function requiredEnv(name: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY') {
  const value = import.meta.env[name]
  if (!value) throw new Error(`${name} is required when VITE_TEST_MODE is not true.`)
  return value
}

class SupabaseTicketingService implements TicketingService {
  private readonly anonymousSessionToken: string

  constructor(private readonly client: SupabaseClient) {
    const storageKey = 'tumbao:anonymous-session'
    const existing = localStorage.getItem(storageKey)
    this.anonymousSessionToken = existing ?? crypto.randomUUID()
    if (!existing) localStorage.setItem(storageKey, this.anonymousSessionToken)
  }

  private async invoke<T>(functionName: string, body?: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.client.functions.invoke(functionName, {
      body,
      headers: { 'x-session-token': this.anonymousSessionToken },
    })
    if (error) {
      let apiError: AppErrorShape | undefined
      try {
        apiError = (await error.context?.json()) as AppErrorShape
      } catch {
        // Supabase can return a transport error without a JSON response.
      }
      throw new AppError(apiError?.code ?? 'REQUEST_FAILED', apiError?.message ?? error.message, apiError?.seatIds)
    }
    return data as T
  }

  getSeatMap: TicketingService['getSeatMap'] = () => this.invoke('get-seat-map')
  reserveSeats: TicketingService['reserveSeats'] = (eventId, seatIds) => this.invoke('reserve-seats', { event_id: eventId, seat_ids: seatIds })
  updateCustomer: TicketingService['updateCustomer'] = (credentials, customer) =>
    this.invoke('update-order-customer', { order_id: credentials.orderId, access_token: credentials.accessToken, customer })
  getOrder: TicketingService['getOrder'] = (credentials) =>
    this.invoke('get-order-status', { order_id: credentials.orderId, access_token: credentials.accessToken })
  startPayment: TicketingService['startPayment'] = (credentials) =>
    this.invoke('create-payment', { order_id: credentials.orderId, access_token: credentials.accessToken })
  getAdminStats: TicketingService['getAdminStats'] = () => this.invoke('get-admin-stats')
  listOrders: TicketingService['listOrders'] = () => this.invoke('list-orders')
  checkinTicket: TicketingService['checkinTicket'] = (tokenOrCode) =>
    this.invoke('checkin-ticket', { token_or_code: tokenOrCode })

  subscribeToSeatChanges(onChange: () => void) {
    const channel = this.client
      .channel('public:seat-state')
      .on('broadcast', { event: 'seat-state-changed' }, onChange)
      .subscribe()
    return () => void this.client.removeChannel(channel)
  }
}

export function createSupabaseRuntime(): ServiceRuntime {
  const client = createClient(requiredEnv('VITE_SUPABASE_URL'), requiredEnv('VITE_SUPABASE_ANON_KEY'), {
    auth: { persistSession: true, autoRefreshToken: true },
  })
  return { service: new SupabaseTicketingService(client), testMode: false }
}
