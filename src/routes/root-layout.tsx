import { Link, Outlet } from '@tanstack/react-router'
import { ScanLine, Ticket } from 'lucide-react'
import { TestModeBanner } from '../components/test-mode-banner'

export function RootLayout() {
  return <>
    <TestModeBanner />
    <header className="site-header">
      <Link to="/" className="brand"><Ticket aria-hidden="true" /> <span>Tumbao Tickets</span></Link>
      <nav aria-label="Main navigation">
        <Link to="/" activeProps={{ className: 'active' }}>Seats</Link>
        <Link to="/admin" activeProps={{ className: 'active' }}>Admin</Link>
        <Link to="/admin/scan" activeProps={{ className: 'active' }}><ScanLine size={17} /> Check-in</Link>
      </nav>
    </header>
    <main><Outlet /></main>
    <footer>Official ticket portal · Galavečer Tumbao 2027</footer>
  </>
}
