import type { OrderCredentials } from '../services/ticketing-service'

const key = (orderId: string) => `tumbao:order-access:${orderId}`

export function rememberOrder(credentials: OrderCredentials) {
  sessionStorage.setItem(key(credentials.orderId), credentials.accessToken)
}

export function getOrderCredentials(orderId: string): OrderCredentials | null {
  const accessToken = sessionStorage.getItem(key(orderId))
  return accessToken ? { orderId, accessToken } : null
}
