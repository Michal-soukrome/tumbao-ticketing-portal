import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { CreditCard, LockKeyhole } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { getOrderCredentials } from "../app/order-session";
import { useRuntime } from "../app/runtime-context";
import { HoldCountdown } from "../components/hold-countdown";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Notice,
} from "../components/ui";
import { AppError, formatMoney, seatLabel } from "../domain/models";

const customerSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name."),
  email: z.email("Enter a valid email address."),
  phone: z.string().trim().optional(),
  billingCompany: z.string().trim().optional(),
  billingTaxId: z.string().trim().optional(),
});
type CustomerForm = z.infer<typeof customerSchema>;

export function CheckoutPage({ orderId }: { orderId: string }) {
  const credentials = getOrderCredentials(orderId);
  const { service, testMode } = useRuntime();
  const navigate = useNavigate();
  const order = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => service.getOrder(credentials!),
    enabled: Boolean(credentials),
  });
  const form = useForm<CustomerForm>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      billingCompany: "",
      billingTaxId: "",
    },
  });
  const submit = useMutation({
    mutationFn: async (customer: CustomerForm) => {
      if (!credentials)
        throw new AppError("ORDER_NOT_FOUND", "Order access is missing.");
      await service.updateCustomer(credentials, customer);
      return service.startPayment(credentials);
    },
    onSuccess: async (result) => {
      if (result.kind === "redirect") window.location.assign(result.url);
      else await navigate({ to: "/order/$orderId", params: { orderId } });
    },
  });

  if (!credentials)
    return (
      <div className="page narrow">
        <EmptyState title="Order access is missing">
          <p>Return to the seating map and make a new reservation.</p>
          <Link to="/" className="text-link">
            Choose seats
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
        <Notice tone="danger">This order could not be loaded.</Notice>
      </div>
    );
  if (order.data.status !== "PENDING")
    return (
      <div className="page narrow">
        <EmptyState title={`Order ${order.data.status.toLowerCase()}`}>
          <Link to="/order/$orderId" params={{ orderId }} className="text-link">
            View order status
          </Link>
        </EmptyState>
      </div>
    );

  const error =
    submit.error instanceof AppError
      ? submit.error.message
      : submit.error
        ? "Payment could not be started."
        : null;
  return (
    <div className="page checkout-page">
      <div className="checkout-title">
        <div>
          <p className="eyebrow">Checkout · {order.data.orderNumber}</p>
          <h1>Your details</h1>
        </div>
        <HoldCountdown
          expiresAt={order.data.expiresAt}
          onExpired={() => void order.refetch()}
        />
      </div>
      <div className="checkout-layout">
        <Card>
          <form
            onSubmit={form.handleSubmit((values) => submit.mutate(values))}
            className="form-grid"
          >
            <Field
              label="Full name"
              error={form.formState.errors.name?.message}
            >
              <Input autoComplete="name" {...form.register("name")} />
            </Field>
            <Field label="Email" error={form.formState.errors.email?.message}>
              <Input
                type="email"
                autoComplete="email"
                {...form.register("email")}
              />
            </Field>
            <Field
              label="Phone (optional)"
              error={form.formState.errors.phone?.message}
            >
              <Input
                type="tel"
                autoComplete="tel"
                {...form.register("phone")}
              />
            </Field>
            <details className="billing-fields">
              <summary>Company billing details (optional)</summary>
              <div className="form-grid compact">
                <Field label="Company">
                  <Input {...form.register("billingCompany")} />
                </Field>
                <Field label="Tax ID">
                  <Input {...form.register("billingTaxId")} />
                </Field>
              </div>
            </details>
            {testMode ? (
              <Notice tone="warning">
                Test payment is local. The Pay button immediately finalizes this
                order and creates tickets.
              </Notice>
            ) : (
              <Notice>
                <LockKeyhole size={17} /> You will continue to the payment
                provider’s secure hosted page.
              </Notice>
            )}
            {error ? <Notice tone="danger">{error}</Notice> : null}
            <Button
              className="primary wide large"
              type="submit"
              disabled={submit.isPending}
            >
              <CreditCard size={19} />{" "}
              {submit.isPending
                ? "Processing…"
                : testMode
                  ? `Pay ${formatMoney(order.data.totalMinor, order.data.currency)}`
                  : "Continue to secure payment"}
            </Button>
          </form>
        </Card>
        <Card className="order-summary">
          <p className="eyebrow">Reserved seats</p>
          <h2>{order.data.seats.length} tickets</h2>
          <ul>
            {order.data.seats.map((seat) => (
              <li key={seat.id}>
                <span>{seatLabel(seat)}</span>
                <strong>{formatMoney(seat.priceMinor, seat.currency)}</strong>
              </li>
            ))}
          </ul>
          <div className="summary-total">
            <span>Total</span>
            <strong>
              {formatMoney(order.data.totalMinor, order.data.currency)}
            </strong>
          </div>
        </Card>
      </div>
    </div>
  );
}
