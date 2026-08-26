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
import {
  AppError,
  formatMoney,
  orderStatusLabel,
  seatLabel,
} from "../domain/models";

// NOTE: same caveat as the other pages — `Button`, `Card`, `EmptyState`,
// `Field`, `Input`, and `Notice` come from "../components/ui" and I'm
// assuming they forward `className` onto their root element. `Field` and
// `Input` weren't given any custom classes in the original either, so I've
// left them as-is; if their internals need Tailwind too, send the source
// over.

const customerSchema = z.object({
  name: z.string().trim().min(2, "Zadejte své celé jméno."),
  email: z.email("Zadejte platnou e-mailovou adresu."),
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
        throw new AppError("ORDER_NOT_FOUND", "Přístup k objednávce chybí.");
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
      <div className="mx-auto max-w-6xl px-4 py-8">
        <EmptyState title="Přístup k objednávce chybí">
          <p className="text-sm text-slate-600">
            Vraťte se na mapu sedadel a vytvořte novou rezervaci.
          </p>
          <Link
            to="/"
            className="mt-2 inline-block text-sm font-medium text-rose-600 hover:text-rose-700 hover:underline"
          >
            Vybrat sedadla
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
          Tuto objednávku se nepodařilo načíst.
        </Notice>
      </div>
    );
  if (order.data.status !== "PENDING")
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <EmptyState title={orderStatusLabel(order.data.status)}>
          <Link
            to="/order/$orderId"
            params={{ orderId }}
            className="mt-2 inline-block text-sm font-medium text-rose-600 hover:text-rose-700 hover:underline"
          >
            Zobrazit stav objednávky
          </Link>
        </EmptyState>
      </div>
    );

  const error =
    submit.error instanceof AppError
      ? submit.error.message
      : submit.error
        ? "Platbu se nepodařilo zahájit."
        : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-500">
            Pokladna · {order.data.orderNumber}
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Vaše údaje</h1>
        </div>
        <HoldCountdown
          expiresAt={order.data.expiresAt}
          onExpired={() => void order.refetch()}
        />
      </div>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_340px]">
        <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <form
            onSubmit={form.handleSubmit((values) => submit.mutate(values))}
            className="flex flex-col gap-4"
          >
            <Field
              label="Celé jméno"
              error={form.formState.errors.name?.message}
            >
              <Input autoComplete="name" {...form.register("name")} />
            </Field>
            <Field label="E-mail" error={form.formState.errors.email?.message}>
              <Input
                type="email"
                autoComplete="email"
                {...form.register("email")}
              />
            </Field>
            <Field
              label="Telefon (volitelné)"
              error={form.formState.errors.phone?.message}
            >
              <Input
                type="tel"
                autoComplete="tel"
                {...form.register("phone")}
              />
            </Field>
            <details className="group rounded-xl border border-slate-200 px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-700 marker:content-none">
                Fakturační údaje společnosti (volitelné)
              </summary>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Společnost">
                  <Input {...form.register("billingCompany")} />
                </Field>
                <Field label="DIČ">
                  <Input {...form.register("billingTaxId")} />
                </Field>
              </div>
            </details>
            {testMode ? (
              <Notice className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Testovací platba je lokální. Tlačítko Zaplatit okamžitě dokončí
                tuto objednávku a vytvoří vstupenky.
              </Notice>
            ) : (
              <Notice className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <LockKeyhole size={17} className="shrink-0 text-slate-400" />{" "}
                Budete pokračovat na zabezpečenou stránku poskytovatele plateb.
              </Notice>
            )}
            {error ? (
              <Notice className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </Notice>
            ) : null}
            <Button
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-rose-500 px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
              type="submit"
              disabled={submit.isPending}
            >
              <CreditCard size={19} />{" "}
              {submit.isPending
                ? "Zpracovávám…"
                : testMode
                  ? `Zaplatit ${formatMoney(order.data.totalMinor, order.data.currency)}`
                  : "Pokračovat k platbě"}
            </Button>
          </form>
        </Card>
        <Card className="sticky top-4 h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-500">
            Rezervovaná místa
          </p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">
            {order.data.seats.length} vstupenky
          </h2>
          <ul className="mt-4 flex flex-col gap-2 text-sm">
            {order.data.seats.map((seat) => (
              <li
                key={seat.id}
                className="flex items-center justify-between text-slate-700"
              >
                <span>{seatLabel(seat)}</span>
                <strong className="font-semibold text-slate-900">
                  {formatMoney(seat.priceMinor, seat.currency)}
                </strong>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
            <span className="text-sm font-medium text-slate-600">Celkem</span>
            <strong className="text-lg font-semibold text-slate-900">
              {formatMoney(order.data.totalMinor, order.data.currency)}
            </strong>
          </div>
        </Card>
      </div>
    </div>
  );
}
