import { useQuery } from '@tanstack/react-query'
import { Activity, Armchair, Banknote, ScanLine, TicketCheck } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useRuntime } from '../app/runtime-context'
import { Badge, Card, Notice } from '../components/ui'
import { formatMoney } from '../domain/models'

const toneFor = (status: string) => status === 'PAID' ? 'success' : status === 'PENDING' ? 'warning' : status === 'RECONCILIATION_REQUIRED' ? 'danger' : 'neutral'

export function AdminPage() {
  const { service, testMode } = useRuntime()
  const stats = useQuery({ queryKey: ['admin-stats'], queryFn: () => service.getAdminStats() })
  const orders = useQuery({ queryKey: ['admin-orders'], queryFn: () => service.listOrders() })
  if (stats.isPending || orders.isPending) return <div className="page"><div className="skeleton tall" /></div>
  if (!stats.data || !orders.data) return <div className="page"><Notice tone="danger">Admin data is unavailable. Staff authentication may be required.</Notice></div>
  return <div className="page admin-page">
    <div className="admin-heading"><div><p className="eyebrow">Operations</p><h1>Event overview</h1></div><Link to="/admin/scan" className="button primary"><ScanLine size={18} /> Open scanner</Link></div>
    {testMode ? <Notice>Demo admin access is intentionally open only in local test mode. Production routes use Supabase Auth and role-checked Edge Functions.</Notice> : null}
    <div className="stats-grid"><Card><Banknote /><span>Revenue</span><strong>{formatMoney(stats.data.revenueMinor, stats.data.currency)}</strong></Card><Card><TicketCheck /><span>Seats sold</span><strong>{stats.data.soldSeats}</strong></Card><Card><Armchair /><span>Seats held</span><strong>{stats.data.heldSeats}</strong></Card><Card><Activity /><span>Checked in</span><strong>{stats.data.checkedInTickets}</strong></Card></div>
    <Card className="orders-card"><div className="card-heading"><div><p className="eyebrow">Latest activity</p><h2>Orders</h2></div><span>{orders.data.length} total</span></div><div className="table-scroll"><table><thead><tr><th>Order</th><th>Customer</th><th>Seats</th><th>Total</th><th>Status</th></tr></thead><tbody>{orders.data.map((order) => <tr key={order.id}><td><strong>{order.orderNumber}</strong><small>{new Date(order.createdAt).toLocaleString()}</small></td><td>{order.customerName ?? '—'}<small>{order.customerEmail}</small></td><td>{order.seatLabels.join(', ')}</td><td>{formatMoney(order.totalMinor, order.currency)}</td><td><Badge tone={toneFor(order.status)}>{order.status}</Badge></td></tr>)}</tbody></table></div></Card>
  </div>
}
