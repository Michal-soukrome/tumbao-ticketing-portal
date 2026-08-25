/**
 * TEST MODE ONLY.
 *
 * This module is loaded through a development-gated dynamic import. It must never
 * be imported by production services or route components directly.
 */
import seed from "./seed.json";
import {
  AppError,
  type AdminOrderDto,
  type AdminStatsDto,
  type CheckinResult,
  type CustomerDetails,
  type EventSummary,
  type OrderDto,
  type ReservationDto,
  type SeatDto,
  type TicketDto,
} from "../domain/models";
import type {
  OrderCredentials,
  ServiceRuntime,
  TicketingService,
} from "../services/ticketing-service";

const STORAGE_KEY = "tumbao:test-data:v5";
const HOLD_DURATION_MS = 10 * 60 * 1000;

interface StoredAllocation {
  orderId: string;
  status: "HELD" | "SOLD";
  holdExpiresAt?: string;
}

interface StoredOrder extends Omit<OrderDto, "seats" | "tickets"> {
  accessToken: string;
  seatIds: string[];
}

interface MockState {
  version: 1;
  event: EventSummary;
  seats: SeatDto[];
  allocations: Record<string, StoredAllocation>;
  orders: StoredOrder[];
  tickets: TicketDto[];
  sequence: number;
  admins: Array<{ id: string; name: string; role: "ADMIN" | "SCANNER" }>;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const randomToken = (prefix: string) => {
  const id =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${id.replaceAll("-", "")}`;
};

function createInitialState(now: () => number): MockState {
  const event = seed.event satisfies EventSummary;
  const seats: SeatDto[] = seed.seatLayouts.flatMap((layout) =>
    layout.rowSeatCounts
      .map((seatCount, rowIndex) =>
        Array.from({ length: seatCount }, (_, seatIndex) => {
          const rowXOffsets =
            "rowXOffsets" in layout ? layout.rowXOffsets : undefined;
          const displayNumber =
            layout.direction === "rtl"
              ? layout.numberStart + seatCount - seatIndex - 1
              : layout.numberStart + seatIndex;
          const category =
            seed.categories[layout.category as keyof typeof seed.categories];
          return {
            id: `seat-${"idPrefix" in layout ? layout.idPrefix : layout.section}-${rowIndex + 1}-${displayNumber}`,
            section: layout.section,
            rowLabel: String(rowIndex + 1),
            seatNumber: String(displayNumber),
            priceCategory: category.name,
            priceMinor: category.priceMinor,
            currency: event.currency,
            x:
              layout.x +
              (rowXOffsets?.[rowIndex] ?? rowIndex * layout.rowDx) +
              seatIndex * layout.seatDx,
            y: layout.y + rowIndex * layout.rowDy + seatIndex * layout.seatDy,
            rotation: layout.rotation,
            accessible: false,
            status: "AVAILABLE" as const,
          };
        }),
      )
      .flat(),
  );

  const sample = seed.samplePaidOrder;
  const sampleSeats = seats.filter((seat) => sample.seatIds.includes(seat.id));
  const createdAt = new Date(now() - 86_400_000).toISOString();
  const tickets: TicketDto[] = sampleSeats.map((seat, index) => ({
    id: `ticket-sample-${index + 1}`,
    ticketCode: sample.ticketCodes[index] ?? `TUM-DEMO-${index + 1}`,
    qrToken: sample.qrTokens[index] ?? `tumbao_demo_ticket_${index + 1}`,
    status: "VALID",
    seat: {
      id: seat.id,
      section: seat.section,
      rowLabel: seat.rowLabel,
      seatNumber: seat.seatNumber,
    },
  }));

  const allocations: Record<string, StoredAllocation> = {};
  for (const seatId of sample.seatIds)
    allocations[seatId] = { orderId: sample.id, status: "SOLD" };

  const heldOrderId = "order-sample-held";
  const heldExpiry = new Date(now() + 5 * 60_000).toISOString();
  for (const seatId of seed.initialHeldSeatIds) {
    allocations[seatId] = {
      orderId: heldOrderId,
      status: "HELD",
      holdExpiresAt: heldExpiry,
    };
  }

  const orders: StoredOrder[] = [
    {
      id: sample.id,
      orderNumber: sample.orderNumber,
      status: "PAID",
      customer: sample.customer,
      totalMinor: sampleSeats.reduce((sum, seat) => sum + seat.priceMinor, 0),
      currency: event.currency,
      createdAt,
      expiresAt: new Date(now() - 85_800_000).toISOString(),
      paidAt: new Date(now() - 85_900_000).toISOString(),
      accessToken: "sample-order-access-token",
      seatIds: sample.seatIds,
    },
    {
      id: heldOrderId,
      orderNumber: "TUM-2027-00002",
      status: "PENDING",
      totalMinor:
        seats.find((seat) => seat.id === seed.initialHeldSeatIds[0])
          ?.priceMinor ?? 0,
      currency: event.currency,
      createdAt: new Date(now()).toISOString(),
      expiresAt: heldExpiry,
      accessToken: "sample-held-access-token",
      seatIds: seed.initialHeldSeatIds,
    },
  ];

  return {
    version: 1,
    event,
    seats,
    allocations,
    orders,
    tickets,
    sequence: 3,
    admins: seed.admins as MockState["admins"],
  };
}

export class MockTicketingService implements TicketingService {
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly storage: StorageLike,
    private readonly now: () => number = Date.now,
  ) {}

  private read(): MockState {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = createInitialState(this.now);
      this.write(initial, false);
      return initial;
    }
    return JSON.parse(raw) as MockState;
  }

  private write(state: MockState, notify = true) {
    this.storage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (notify) this.listeners.forEach((listener) => listener());
  }

  private sweepExpired(state: MockState) {
    const now = this.now();
    let changed = false;
    for (const order of state.orders) {
      if (
        order.status !== "PENDING" ||
        new Date(order.expiresAt).getTime() > now
      )
        continue;
      order.status = "EXPIRED";
      for (const seatId of order.seatIds) {
        const allocation = state.allocations[seatId];
        if (allocation?.orderId === order.id && allocation.status === "HELD")
          delete state.allocations[seatId];
      }
      changed = true;
    }
    return changed;
  }

  private readCurrent(): MockState {
    const state = this.read();
    if (this.sweepExpired(state)) this.write(state);
    return state;
  }

  private seatsFor(state: MockState, seatIds: string[]): SeatDto[] {
    return state.seats
      .filter((seat) => seatIds.includes(seat.id))
      .map((seat) => {
        const allocation = state.allocations[seat.id];
        return {
          ...seat,
          status: allocation?.status ?? "AVAILABLE",
          holdExpiresAt: allocation?.holdExpiresAt,
        };
      });
  }

  private requireOrder(
    state: MockState,
    credentials: OrderCredentials,
  ): StoredOrder {
    const order = state.orders.find(
      (candidate) =>
        candidate.id === credentials.orderId &&
        candidate.accessToken === credentials.accessToken,
    );
    if (!order)
      throw new AppError("ORDER_NOT_FOUND", "The order could not be found.");
    return order;
  }

  private toOrder(state: MockState, order: StoredOrder): OrderDto {
    const { accessToken: _accessToken, seatIds, ...details } = order;
    void _accessToken;
    return {
      ...details,
      seats: this.seatsFor(state, seatIds),
      tickets: state.tickets.filter(
        (ticket) =>
          ticket.id.startsWith(`ticket-${order.id}-`) ||
          (order.id === seed.samplePaidOrder.id &&
            ticket.id.startsWith("ticket-sample-")),
      ),
    };
  }

  async getSeatMap() {
    const state = this.readCurrent();
    return {
      event: state.event,
      seats: this.seatsFor(
        state,
        state.seats.map((seat) => seat.id),
      ),
      serverTime: new Date(this.now()).toISOString(),
    };
  }

  async reserveSeats(
    eventId: string,
    seatIds: string[],
  ): Promise<ReservationDto> {
    const state = this.readCurrent();
    if (eventId !== state.event.id)
      throw new AppError("VALIDATION_ERROR", "The event is invalid.");
    const uniqueIds = [...new Set(seatIds)];
    if (
      uniqueIds.length !== seatIds.length ||
      uniqueIds.length < 1 ||
      uniqueIds.length > 10
    ) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Select between 1 and 10 unique seats.",
      );
    }
    const selected = state.seats.filter((seat) => uniqueIds.includes(seat.id));
    if (selected.length !== uniqueIds.length)
      throw new AppError("VALIDATION_ERROR", "One or more seats are invalid.");
    const unavailable = uniqueIds.filter((seatId) => state.allocations[seatId]);
    if (unavailable.length)
      throw new AppError(
        "SEAT_UNAVAILABLE",
        "One or more seats are no longer available.",
        unavailable,
      );

    const orderId = randomToken("order");
    const accessToken = randomToken("access");
    const expiresAt = new Date(this.now() + HOLD_DURATION_MS).toISOString();
    const order: StoredOrder = {
      id: orderId,
      orderNumber: `TUM-2027-${String(state.sequence).padStart(5, "0")}`,
      status: "PENDING",
      totalMinor: selected.reduce((sum, seat) => sum + seat.priceMinor, 0),
      currency: state.event.currency,
      createdAt: new Date(this.now()).toISOString(),
      expiresAt,
      accessToken,
      seatIds: uniqueIds,
    };
    state.sequence += 1;
    state.orders.push(order);
    for (const seatId of uniqueIds)
      state.allocations[seatId] = {
        orderId,
        status: "HELD",
        holdExpiresAt: expiresAt,
      };
    this.write(state);
    return { ...this.toOrder(state, order), orderId, accessToken };
  }

  async updateCustomer(
    credentials: OrderCredentials,
    customer: CustomerDetails,
  ) {
    const state = this.readCurrent();
    const order = this.requireOrder(state, credentials);
    if (order.status !== "PENDING")
      throw new AppError(
        "ORDER_NOT_PAYABLE",
        "This order can no longer be updated.",
      );
    order.customer = customer;
    this.write(state);
    return this.toOrder(state, order);
  }

  async getOrder(credentials: OrderCredentials) {
    const state = this.readCurrent();
    return this.toOrder(state, this.requireOrder(state, credentials));
  }

  async cancelOrder(credentials: OrderCredentials) {
    const state = this.readCurrent();
    const order = this.requireOrder(state, credentials);
    if (order.status !== "PENDING")
      throw new AppError(
        "ORDER_NOT_CANCELLABLE",
        "This reservation can no longer be changed.",
      );

    order.status = "CANCELLED";
    for (const seatId of order.seatIds) {
      const allocation = state.allocations[seatId];
      if (allocation?.orderId === order.id && allocation.status === "HELD")
        delete state.allocations[seatId];
    }
    this.write(state);
  }

  async startPayment(credentials: OrderCredentials) {
    const state = this.readCurrent();
    const order = this.requireOrder(state, credentials);
    if (order.status === "EXPIRED")
      throw new AppError("ORDER_EXPIRED", "The reservation has expired.");
    if (order.status !== "PENDING")
      throw new AppError("ORDER_NOT_PAYABLE", "This order is not payable.");
    if (!order.customer?.name || !order.customer.email)
      throw new AppError("VALIDATION_ERROR", "Customer details are required.");
    const ownsEverySeat = order.seatIds.every((seatId) => {
      const allocation = state.allocations[seatId];
      return allocation?.orderId === order.id && allocation.status === "HELD";
    });
    if (!ownsEverySeat)
      throw new AppError(
        "PAYMENT_RECONCILIATION_REQUIRED",
        "The reserved inventory no longer matches this order.",
      );

    order.status = "PAID";
    order.paidAt = new Date(this.now()).toISOString();
    for (const [index, seatId] of order.seatIds.entries()) {
      state.allocations[seatId] = { orderId: order.id, status: "SOLD" };
      const seat = state.seats.find((candidate) => candidate.id === seatId);
      if (!seat) continue;
      state.tickets.push({
        id: `ticket-${order.id}-${index + 1}`,
        ticketCode: `TUM-${order.orderNumber.slice(-5)}-${index + 1}`,
        qrToken: randomToken("tumbao_ticket"),
        status: "VALID",
        seat: {
          id: seat.id,
          section: seat.section,
          rowLabel: seat.rowLabel,
          seatNumber: seat.seatNumber,
        },
      });
    }
    this.write(state);
    return { kind: "paid" as const, order: this.toOrder(state, order) };
  }

  async getAdminStats(): Promise<AdminStatsDto> {
    const state = this.readCurrent();
    const allocations = Object.values(state.allocations);
    return {
      revenueMinor: state.orders
        .filter((order) => order.status === "PAID")
        .reduce((sum, order) => sum + order.totalMinor, 0),
      currency: state.event.currency,
      soldSeats: allocations.filter(
        (allocation) => allocation.status === "SOLD",
      ).length,
      heldSeats: allocations.filter(
        (allocation) => allocation.status === "HELD",
      ).length,
      availableSeats: state.seats.length - allocations.length,
      paidOrders: state.orders.filter((order) => order.status === "PAID")
        .length,
      pendingOrders: state.orders.filter((order) => order.status === "PENDING")
        .length,
      checkedInTickets: state.tickets.filter(
        (ticket) => ticket.status === "CHECKED_IN",
      ).length,
    };
  }

  async listOrders(): Promise<AdminOrderDto[]> {
    const state = this.readCurrent();
    return [...state.orders].reverse().map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      customerName: order.customer?.name,
      customerEmail: order.customer?.email,
      totalMinor: order.totalMinor,
      currency: order.currency,
      seatLabels: this.seatsFor(state, order.seatIds).map(
        (seat) => `${seat.section}-${seat.rowLabel}-${seat.seatNumber}`,
      ),
      createdAt: order.createdAt,
    }));
  }

  async checkinTicket(tokenOrCode: string): Promise<CheckinResult> {
    const state = this.readCurrent();
    const normalized = tokenOrCode.trim();
    const ticket = state.tickets.find(
      (candidate) =>
        candidate.qrToken === normalized ||
        candidate.ticketCode.toLowerCase() === normalized.toLowerCase(),
    );
    if (!ticket) return { result: "INVALID" };
    if (ticket.status === "VOID") return { result: "VOID", ticket };
    if (ticket.status === "CHECKED_IN")
      return { result: "ALREADY_USED", ticket };
    ticket.status = "CHECKED_IN";
    ticket.checkedInAt = new Date(this.now()).toISOString();
    this.write(state);
    return { result: "CHECKED_IN", ticket };
  }

  subscribeToSeatChanges(onChange: () => void) {
    this.listeners.add(onChange);
    const storageListener = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) onChange();
    };
    globalThis.addEventListener?.("storage", storageListener);
    return () => {
      this.listeners.delete(onChange);
      globalThis.removeEventListener?.("storage", storageListener);
    };
  }

  async reset() {
    this.storage.removeItem(STORAGE_KEY);
    this.write(createInitialState(this.now));
  }

  async expirePendingOrders() {
    const state = this.read();
    for (const order of state.orders)
      if (order.status === "PENDING")
        order.expiresAt = new Date(this.now() - 1).toISOString();
    this.sweepExpired(state);
    this.write(state);
  }
}

export function createMockRuntime(): ServiceRuntime {
  const service = new MockTicketingService(window.localStorage);
  return {
    service,
    testMode: true,
    testControls: {
      reset: () => service.reset(),
      expirePendingOrders: () => service.expirePendingOrders(),
    },
  };
}

export const createMemoryStorage = (): StorageLike => {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
};
