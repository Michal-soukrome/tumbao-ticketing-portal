import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { RootLayout } from '../routes/root-layout'
import { EventPage } from '../routes/event-page'
import { CheckoutPage } from '../routes/checkout-page'
import { OrderPage } from '../routes/order-page'
import { AdminPage } from '../routes/admin-page'
import { ScannerPage } from '../routes/scanner-page'

const rootRoute = createRootRoute({ component: RootLayout })
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: EventPage })
const checkoutRoute = createRoute({ getParentRoute: () => rootRoute, path: '/checkout/$orderId', component: () => { const { orderId } = checkoutRoute.useParams(); return <CheckoutPage orderId={orderId} /> } })
const orderRoute = createRoute({ getParentRoute: () => rootRoute, path: '/order/$orderId', component: () => { const { orderId } = orderRoute.useParams(); return <OrderPage orderId={orderId} /> } })
const adminRoute = createRoute({ getParentRoute: () => rootRoute, path: '/admin', component: AdminPage })
const scannerRoute = createRoute({ getParentRoute: () => rootRoute, path: '/admin/scan', component: ScannerPage })

const routeTree = rootRoute.addChildren([indexRoute, checkoutRoute, orderRoute, adminRoute, scannerRoute])
export const router = createRouter({ routeTree, defaultPreload: 'intent', scrollRestoration: true })

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}
