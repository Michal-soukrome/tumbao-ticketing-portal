import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CalendarDays, MapPin, ShieldCheck } from "lucide-react";
import {
  clearActiveOrder,
  getActiveOrderCredentials,
  rememberOrder,
} from "../app/order-session";
import { useRuntime } from "../app/runtime-context";
import {
  AppError,
  formatMoney,
  seatLabel,
  type SeatDto,
} from "../domain/models";
import { HoldCountdown } from "../components/hold-countdown";
import { SeatMap } from "../components/seat-map";
import { Button, Card, Notice } from "../components/ui";

// NOTE: This file only converts the markup/classes that live directly in
// EventPage.tsx. `Button`, `Card`, `Notice`, `SeatMap`, and `HoldCountdown`
// are separate components I don't have the source for, so I'm assuming they
// forward a `className` prop onto their root element (e.g. via a `cn()`
// merge) and passing Tailwind classes into them the same way the original
// passed custom class names ("primary", "wide", tone props, etc). If those
// components render their own hard-coded classes internally, they'll need
// their own Tailwind pass too — happy to do that if you share their source.

function MobileBookingBar({
  seatCount,
  totalLabel,
  pending,
  held,
  onContinue,
  onChangeSeats,
  onClearSelection,
}: {
  seatCount: number;
  totalLabel: string;
  pending: boolean;
  held?: boolean;
  onContinue: () => void;
  onChangeSeats?: () => void;
  onClearSelection?: () => void;
}) {
  return (
    <div
      className="
  fixed bottom-5 left-1/2 z-40
  flex w-[calc(100%-2rem)] max-w-lg
  -translate-x-1/2
  items-center justify-between gap-4
  rounded-2xl border border-slate-200
  bg-white px-4 py-3 shadow-lg
  
"
    >
      <span className="flex flex-col leading-tight">
        <strong className="text-sm font-semibold text-slate-900">
          {seatCount} {held ? "držených" : "držené"}{" "}
          {seatCount === 1 ? "sedadlo" : "sedadel"}
        </strong>
        <small className="text-xs text-slate-500">{totalLabel}</small>
      </span>

      <div className="flex items-center gap-2">
        {held && onChangeSeats ? (
          <Button
            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
            disabled={pending}
            onClick={onChangeSeats}
          >
            Změnit nebo zrušit výběr sedadel
          </Button>
        ) : null}
        {held && onClearSelection ? (
          <Button
            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
            disabled={pending}
            onClick={onClearSelection}
          >
            Zrušit výběr sedadel
          </Button>
        ) : null}

        <Button
          className="rounded-full bg-rose-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-600 disabled:opacity-50"
          disabled={pending}
          onClick={onContinue}
        >
          {held ? "Pokračovat v rezervaci" : "Pokračovat"}
        </Button>
      </div>
    </div>
  );
}

export function EventPage() {
  const { service } = useRuntime();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeCredentials, setActiveCredentials] = useState(() =>
    getActiveOrderCredentials(),
  );
  const seatMap = useQuery({
    queryKey: ["seat-map"],
    queryFn: () => service.getSeatMap(),
  });
  const activeOrder = useQuery({
    queryKey: ["active-order", activeCredentials?.orderId],
    queryFn: () => service.getOrder(activeCredentials!),
    enabled: Boolean(activeCredentials),
    retry: false,
  });

  useEffect(
    () =>
      service.subscribeToSeatChanges(() => {
        void queryClient.invalidateQueries({ queryKey: ["seat-map"] });
        void queryClient.invalidateQueries({ queryKey: ["active-order"] });
      }),
    [queryClient, service],
  );

  useEffect(() => {
    if (!activeCredentials || activeOrder.isPending) return;
    if (activeOrder.isError || activeOrder.data?.status !== "PENDING") {
      clearActiveOrder(activeCredentials.orderId);
      setActiveCredentials(null);
      void queryClient.invalidateQueries({ queryKey: ["seat-map"] });
    }
  }, [
    activeCredentials,
    activeOrder.data?.status,
    activeOrder.isError,
    activeOrder.isPending,
    queryClient,
  ]);

  useEffect(() => {
    if (!seatMap.data) return;
    const available = new Set(
      seatMap.data.seats
        .filter((seat) => seat.status === "AVAILABLE")
        .map((seat) => seat.id),
    );
    setSelected(
      (current) =>
        new Set([...current].filter((seatId) => available.has(seatId))),
    );
  }, [seatMap.data]);

  const selectedSeats = useMemo(
    () => seatMap.data?.seats.filter((seat) => selected.has(seat.id)) ?? [],
    [seatMap.data, selected],
  );
  const heldOrder =
    activeOrder.data?.status === "PENDING" ? activeOrder.data : null;
  const ownedHeldIds = useMemo(
    () => new Set(heldOrder?.seats.map((seat) => seat.id) ?? []),
    [heldOrder],
  );

  const reserve = useMutation({
    mutationFn: () =>
      service.reserveSeats(seatMap.data!.event.id, [...selected]),
    onSuccess: async (reservation) => {
      rememberOrder({
        orderId: reservation.orderId,
        accessToken: reservation.accessToken,
      });
      await queryClient.invalidateQueries({ queryKey: ["seat-map"] });
      await navigate({
        to: "/checkout/$orderId",
        params: { orderId: reservation.orderId },
      });
    },
    onError: () =>
      void queryClient.invalidateQueries({ queryKey: ["seat-map"] }),
  });

  const changeSeats = useMutation({
    mutationFn: () => service.cancelOrder(activeCredentials!),
    onSuccess: async () => {
      setSelected(new Set(heldOrder?.seats.map((seat) => seat.id)));
      clearActiveOrder(activeCredentials!.orderId);
      setActiveCredentials(null);
      await queryClient.invalidateQueries({ queryKey: ["seat-map"] });
      await queryClient.removeQueries({ queryKey: ["active-order"] });
    },
  });

  const toggle = (seat: SeatDto) => {
    if (heldOrder) return;
    setSelected((current) => {
      const next = new Set(current);

      if (next.has(seat.id)) {
        next.delete(seat.id);
        return next;
      }

      if (next.size >= 10) {
        return current;
      }

      next.add(seat.id);
      return next;
    });
  };

  if (seatMap.isPending)
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="h-[520px] animate-pulse rounded-2xl bg-slate-200" />
      </div>
    );
  if (seatMap.isError || !seatMap.data)
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Notice className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load the seating map. Check the backend configuration and
          retry.
        </Notice>
      </div>
    );

  const { event, seats } = seatMap.data;
  const cartSeats = heldOrder?.seats ?? selectedSeats;
  const total =
    heldOrder?.totalMinor ??
    selectedSeats.reduce((sum, seat) => sum + seat.priceMinor, 0);
  const reserveError =
    reserve.error instanceof AppError
      ? reserve.error.message
      : reserve.error
        ? "Reservation failed. Please try again."
        : null;
  const clearSelection = () => {
    if (!selected.size) return;
    if (!window.confirm("Opravdu chcete zrušit výběr sedadel?")) return;
    setSelected(new Set());
  };

  const continueCheckout = () => {
    if (heldOrder && activeCredentials) {
      void navigate({
        to: "/checkout/$orderId",
        params: { orderId: activeCredentials.orderId },
      });
    } else {
      reserve.mutate();
    }
  };

  return (
    <div className="p-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
        <div className="min-w-0">
          {/* MAP */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">
            <div className=" bg-white px-5 py-3">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <span className="text-sm font-medium text-slate-700">
                  Vyberte svá místa
                  <span className="flex items-center gap-2 text-sm font-medium text-emerald-600">
                    <i className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                    {seats.filter((seat) => seat.status === "AVAILABLE").length}{" "}
                    dostupných míst
                  </span>
                </span>

                <span className="text-xs text-slate-400">
                  Klikněte na místo pro jeho výběr
                </span>
              </div>
            </div>

            {/* LEGEND */}
            <div
              className="border-b border-slate-200 px-5 py-3 flex flex-wrap items-center justify-start md:justify-center gap-x-6 gap-y-2 text-xs text-slate-500 bg-white sm:justify-start"
              aria-label="Seat map legend"
            >
              <span className="flex items-center gap-2">
                <i className="h-2.5 w-2.5 rounded-full border border-slate-300 bg-white" />
                Dostupné
              </span>

              <span className="flex items-center gap-2">
                <i className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                Vybrané
              </span>

              <span className="flex items-center gap-2">
                <i className="h-2.5 w-2.5 rounded-full bg-amber-400" />V držení
              </span>

              <span className="flex items-center gap-2">
                <i className="h-2.5 w-2.5 rounded-full bg-amber-600" />
                Vámi držené (čeká na dokončení nákupu)
              </span>

              <span className="flex items-center gap-2">
                <i className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                Obsazené
              </span>
            </div>

            <div className="min-h-auto p-3 sm:p-6 lg:min-h-[650px]">
              <SeatMap
                seats={seats}
                selected={selected}
                ownedHeld={ownedHeldIds}
                selectionLocked={Boolean(heldOrder)}
                onToggle={toggle}
              />
            </div>
          </div>
        </div>

        {/* BOOKING SUMMARY */}
        <Card className="sticky top-4 h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-500">
            {heldOrder ? "Vámi držená místa" : "Váš výběr"}
          </p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">
            {activeCredentials && activeOrder.isPending
              ? "Obnovuje se vaše držení..."
              : cartSeats.length
                ? `${cartSeats.length} ${heldOrder ? "held " : ""}seat${cartSeats.length === 1 ? "" : "s"}`
                : "Žádná místa vybrána"}
          </h2>
          {cartSeats.length ? (
            <ul className="mt-4 flex flex-col gap-2 text-sm">
              {cartSeats.map((seat) => (
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
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              Klikněte na libovolné dostupné místo v plánu. Můžete rezervovat až
              10 míst.
            </p>
          )}
          <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
            <span className="text-sm font-medium text-slate-600">Total</span>
            <strong className="text-lg font-semibold text-slate-900">
              {formatMoney(total, event.currency)}
            </strong>
          </div>
          {heldOrder ? (
            <Notice className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Tato místa jsou držena pro tuto relaci prohlížeče. Dokončete nákup
              před vypršením časovače.
            </Notice>
          ) : null}
          {heldOrder ? (
            <div className="mt-4">
              <HoldCountdown
                expiresAt={heldOrder.expiresAt}
                onExpired={() => {
                  void activeOrder.refetch();
                  void queryClient.invalidateQueries({
                    queryKey: ["seat-map"],
                  });
                }}
              />
            </div>
          ) : null}
          {heldOrder ? (
            <Button
              className="mt-4 w-full rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              disabled={changeSeats.isPending}
              onClick={() => changeSeats.mutate()}
            >
              {changeSeats.isPending ? "Uvolňuji sedadla…" : "Změnit sedadla"}
            </Button>
          ) : null}
          {!heldOrder && selected.size ? (
            <Button
              className="mt-4 w-full rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              disabled={reserve.isPending}
              onClick={clearSelection}
            >
              Zrušit výběr sedadel
            </Button>
          ) : null}
          {changeSeats.error ? (
            <Notice className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Držená místa nemohla být uvolněna. Zkuste to prosím znovu.
            </Notice>
          ) : null}
          {reserveError ? (
            <Notice className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {reserveError}
            </Notice>
          ) : null}
          <Button
            className="my-4 w-full rounded-full bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={heldOrder ? false : !selected.size || reserve.isPending}
            onClick={continueCheckout}
          >
            {heldOrder
              ? "Pokračovat k platbě"
              : reserve.isPending
                ? "Rezervuji..."
                : "Rezervovat a pokračovat"}
          </Button>
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck size={17} className="shrink-0 text-slate-400" />
            Místa jsou držena atomicky po dobu 10 minut.
          </p>
        </Card>
      </div>

      {cartSeats.length ? (
        <MobileBookingBar
          seatCount={cartSeats.length}
          totalLabel={formatMoney(total, event.currency)}
          pending={reserve.isPending || changeSeats.isPending}
          held={Boolean(heldOrder)}
          onContinue={continueCheckout}
          onChangeSeats={heldOrder ? () => changeSeats.mutate() : undefined}
          onClearSelection={
            !heldOrder && selected.size ? clearSelection : undefined
          }
        />
      ) : null}
    </div>
  );
}
