import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Armchair,
  Banknote,
  ScanLine,
  TicketCheck,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useRuntime } from "../app/runtime-context";
import { Badge, Card, Notice } from "../components/ui";
import { formatMoney, orderStatusLabel } from "../domain/models";

const toneFor = (status: string) =>
  status === "PAID"
    ? "success"
    : status === "PENDING"
      ? "warning"
      : status === "RECONCILIATION_REQUIRED"
        ? "danger"
        : "neutral";

// NOTE: same caveat as EventPage — `Card`, `Notice`, and `Badge` are
// imported from "../components/ui" and I don't have their source, so I'm
// assuming they forward `className`/`tone` onto their root element. `Badge`
// still receives its `tone` prop as before since that's presumably driving
// its own internal color classes, not something to convert here.

const statCards = [
  { icon: Banknote, label: "Tržby" },
  { icon: TicketCheck, label: "Prodána místa" },
  { icon: Armchair, label: "Držená místa" },
  { icon: Activity, label: "Odbaveno" },
] as const;

export function AdminPage() {
  const { service, testMode } = useRuntime();
  const stats = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => service.getAdminStats(),
  });
  const orders = useQuery({
    queryKey: ["admin-orders"],
    queryFn: () => service.listOrders(),
  });
  if (stats.isPending || orders.isPending)
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="h-[520px] animate-pulse rounded-2xl bg-slate-200" />
      </div>
    );
  if (!stats.data || !orders.data)
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Notice className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Admin data nejsou dostupná. Může být vyžadováno ověření personálu.
        </Notice>
      </div>
    );
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-500">
            Akce
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">
            Přehled akce
          </h1>
        </div>
        <Link
          to="/admin/scan"
          className="inline-flex items-center gap-2 rounded-full bg-rose-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-600"
        >
          <ScanLine size={18} /> Otevřít čtečku
        </Link>
      </div>
      {testMode ? (
        <Notice className="mb-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Demo přístup administrátora je záměrně otevřen pouze v lokálním
          testovacím režimu. Produkční cesty používají Supabase Auth a
          role-checked Edge Functions.
        </Notice>
      ) : null}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {(
          [
            [
              Banknote,
              "Tržby",
              formatMoney(stats.data.revenueMinor, stats.data.currency),
            ],
            [TicketCheck, "Prodána místa", stats.data.soldSeats],
            [Armchair, "Držená místa", stats.data.heldSeats],
            [Activity, "Odbaveno", stats.data.checkedInTickets],
          ] as const
        ).map(([Icon, label, value]) => (
          <Card
            key={label}
            className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <Icon size={20} className="text-rose-500" />
            <span className="text-sm text-slate-500">{label}</span>
            <strong className="text-2xl font-semibold text-slate-900">
              {value}
            </strong>
          </Card>
        ))}
      </div>
      <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-500">
              Poslední aktivita
            </p>
            <h2 className="text-xl font-semibold text-slate-900">Objednávky</h2>
          </div>
          <span className="text-sm text-slate-500">
            {orders.data.length} celkem
          </span>
        </div>
        <div className="-mx-6 overflow-x-auto px-6">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4 font-medium">Objednávka</th>
                <th className="py-2 pr-4 font-medium">Zákazník</th>
                <th className="py-2 pr-4 font-medium">Místa</th>
                <th className="py-2 pr-4 font-medium">Celkem</th>
                <th className="py-2 pr-4 font-medium">Stav</th>
              </tr>
            </thead>
            <tbody>
              {orders.data.map((order) => (
                <tr
                  key={order.id}
                  className="border-b border-slate-100 align-top last:border-0"
                >
                  <td className="py-3 pr-4">
                    <strong className="block font-medium text-slate-900">
                      {order.orderNumber}
                    </strong>
                    <small className="text-xs text-slate-500">
                      {new Date(order.createdAt).toLocaleString()}
                    </small>
                  </td>
                  <td className="py-3 pr-4">
                    <span className="block text-slate-700">
                      {order.customerName ?? "—"}
                    </span>
                    <small className="text-xs text-slate-500">
                      {order.customerEmail}
                    </small>
                  </td>
                  <td className="py-3 pr-4 text-slate-700">
                    {order.seatLabels.join(", ")}
                  </td>
                  <td className="py-3 pr-4 font-medium text-slate-900">
                    {formatMoney(order.totalMinor, order.currency)}
                  </td>
                  <td className="py-3 pr-4">
                    <Badge tone={toneFor(order.status)}>
                      {orderStatusLabel(order.status)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
