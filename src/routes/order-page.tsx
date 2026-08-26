import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Clock3, Printer } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { getOrderCredentials } from "../app/order-session";
import { useRuntime } from "../app/runtime-context";
import { Badge, Button, Card, EmptyState, Notice } from "../components/ui";
import { formatMoney, orderStatusLabel, seatLabel } from "../domain/models";

// NOTE: same caveat as the other pages — `Badge`, `Button`, `Card`,
// `EmptyState`, and `Notice` come from "../components/ui" and I'm assuming
// they forward `className` onto their root element.

export function OrderPage({ orderId }: { orderId: string }) {
  const credentials = getOrderCredentials(orderId);
  const { service } = useRuntime();
  const order = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => service.getOrder(credentials!),
    enabled: Boolean(credentials),
    refetchInterval: (query) =>
      query.state.data?.status === "PENDING" ? 2500 : false,
  });
  if (!credentials)
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <EmptyState title="Vyžadován bezpečný odkaz na objednávku">
          <p className="text-sm text-slate-600">
            Tento prohlížeč nemá přístupový token pro tuto objednávku.
          </p>
          <Link
            to="/"
            className="mt-2 inline-block text-sm font-medium text-rose-600 hover:text-rose-700 hover:underline"
          >
            Vrátit se na vstupenky
          </Link>
        </EmptyState>
      </div>
    );
  if (order.isPending)
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="h-[520px] animate-pulse rounded-2xl bg-slate-200" />
      </div>
    );
  if (order.isError || !order.data)
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Notice className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Stav objednávky nelze načíst.
        </Notice>
      </div>
    );

  if (order.data.status !== "PAID")
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-16 text-center">
        <Clock3 size={48} className="text-slate-400" />
        <h1 className="text-2xl font-bold text-slate-900">
          {order.data.status === "PENDING"
            ? "Probíhá zpracování platby…"
            : order.data.status === "EXPIRED"
              ? "Rezervace vypršela"
              : "Platba selhala"}
        </h1>
        <p className="text-sm text-slate-500">
          Objednávka {order.data.orderNumber}
        </p>
        <Badge tone="warning">{orderStatusLabel(order.data.status)}</Badge>
      </div>
    );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <section className="flex flex-col items-center gap-2 py-10 text-center">
        <CheckCircle2 size={52} className="text-emerald-500" />
        <p className="text-xs font-semibold uppercase tracking-wide text-rose-500">
          Platba potvrzena
        </p>
        <h1 className="text-3xl font-bold text-slate-900">
          Vaše vstupenky jsou připraveny k odbavení
        </h1>
        <p className="text-sm text-slate-600">
          Objednávka {order.data.orderNumber} ·{" "}
          {formatMoney(order.data.totalMinor, order.data.currency)}
        </p>
        <Button
          className="mt-4 flex items-center gap-2 rounded-full bg-rose-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-600"
          onClick={() => window.print()}
        >
          <Printer size={18} /> Vytisknout vstupenky
        </Button>
      </section>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {order.data.tickets.map((ticket) => (
          <Card
            key={ticket.id}
            className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm"
          >
            <div className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-400">
              <span>TUMBAO 2027</span>
              <Badge tone={ticket.status === "VALID" ? "success" : "warning"}>
                {ticket.status.replace("_", " ")}
              </Badge>
            </div>
            <h2 className="mt-2 text-xl font-semibold text-slate-900">
              {seatLabel(ticket.seat)}
            </h2>
            <p className="text-sm text-slate-500">
              29 May 2027 · GoJa Music Hall
            </p>
            <div className="my-2 rounded-xl border border-slate-200 p-3">
              <QRCodeSVG
                value={ticket.qrToken}
                size={180}
                level="M"
                title={`QR ticket ${ticket.ticketCode}`}
              />
            </div>
            <strong className="font-mono text-sm tracking-wide text-slate-900">
              {ticket.ticketCode}
            </strong>
            <small className="text-xs text-slate-500">
              Předložte tento kód při vstupu. Platí pro jedno odbavení.
            </small>
          </Card>
        ))}
      </div>
    </div>
  );
}
