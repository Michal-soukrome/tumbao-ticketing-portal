import type { OrderCredentials } from '../services/ticketing-service'

const orderAccessPrefix = 'tumbao:order-access:'
const key = (orderId: string) => `${orderAccessPrefix}${orderId}`
const activeOrderKey = 'tumbao:active-order'
const activeOrderMigrationKey = 'tumbao:active-order-migrated'

export function rememberOrder(credentials: OrderCredentials) {
  sessionStorage.setItem(key(credentials.orderId), credentials.accessToken)
  sessionStorage.setItem(activeOrderKey, credentials.orderId)
  sessionStorage.setItem(activeOrderMigrationKey, 'true')
}

export function getOrderCredentials(orderId: string): OrderCredentials | null {
  const accessToken = sessionStorage.getItem(key(orderId))
  return accessToken ? { orderId, accessToken } : null
}

export function getActiveOrderCredentials(): OrderCredentials | null {
  const activeOrderId = sessionStorage.getItem(activeOrderKey)
  if (activeOrderId) return getOrderCredentials(activeOrderId)
  if (sessionStorage.getItem(activeOrderMigrationKey)) return null

  // Orders created before the active-order pointer was introduced still have
  // their scoped access token. Adopt the newest one once for session continuity.
  sessionStorage.setItem(activeOrderMigrationKey, 'true')
  for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
    const storageKey = sessionStorage.key(index)
    if (!storageKey?.startsWith(orderAccessPrefix)) continue
    const orderId = storageKey.slice(orderAccessPrefix.length)
    sessionStorage.setItem(activeOrderKey, orderId)
    return getOrderCredentials(orderId)
  }
  return null
}

export function clearActiveOrder(orderId?: string) {
  if (!orderId || sessionStorage.getItem(activeOrderKey) === orderId) sessionStorage.removeItem(activeOrderKey)
}
