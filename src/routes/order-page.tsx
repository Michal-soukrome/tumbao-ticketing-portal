import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Clock3, Printer } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { getOrderCredentials } from "../app/order-session";
import { useRuntime } from "../app/runtime-context";
import { Badge, Button, Card, EmptyState, Notice } from "../components/ui";
import { formatMoney, seatLabel } from "../domain/models";

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
      <div className="page narrow">
        <EmptyState title="Secure order link required">
          <p>This browser does not have the access token for that order.</p>
          <Link to="/" className="text-link">
            Return to tickets
          </Link>
        </EmptyState>
      </div>
    );
  if (order.isPending)
    return (
      <div className="page narrow">
        <div className="skeleton tall" />
      </div>
    );
  if (order.isError || !order.data)
    return (
      <div className="page narrow">
        <Notice tone="danger">The order status could not be loaded.</Notice>
      </div>
    );

  if (order.data.status !== "PAID")
    return (
      <div className="page narrow status-page">
        <Clock3 size={48} />
        <h1>
          {order.data.status === "PENDING"
            ? "Processing payment…"
            : order.data.status === "EXPIRED"
              ? "Reservation expired"
              : "Order needs attention"}
        </h1>
        <p>Order {order.data.orderNumber}</p>
        <Badge tone="warning">{order.data.status}</Badge>
      </div>
    );

  return (
    <div className="page order-page">
      <section className="confirmation">
        <CheckCircle2 size={52} />
        <p className="eyebrow">Payment confirmed</p>
        <h1>Your tickets are ready</h1>
        <p>
          Order {order.data.orderNumber} ·{" "}
          {formatMoney(order.data.totalMinor, order.data.currency)}
        </p>
        <Button onClick={() => window.print()}>
          <Printer size={18} /> Print tickets
        </Button>
      </section>
      <div className="tickets-grid">
        {order.data.tickets.map((ticket) => (
          <Card key={ticket.id} className="ticket-card">
            <div className="ticket-top">
              <span>TUMBAO 2027</span>
              <Badge tone={ticket.status === "VALID" ? "success" : "warning"}>
                {ticket.status.replace("_", " ")}
              </Badge>
            </div>
            <h2>{seatLabel(ticket.seat)}</h2>
            <p>29 May 2027 · GoJa Music Hall</p>
            <div className="qr-wrap">
              <QRCodeSVG
                value={ticket.qrToken}
                size={180}
                level="M"
                title={`QR ticket ${ticket.ticketCode}`}
              />
            </div>
            <strong className="ticket-code">{ticket.ticketCode}</strong>
            <small>
              Present this code at the entrance. It is valid for one check-in.
            </small>
          </Card>
        ))}
      </div>
    </div>
  );
}
