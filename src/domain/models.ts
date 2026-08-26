export type SeatStatus = "AVAILABLE" | "HELD" | "SOLD";
export type OrderStatus =
  | "PENDING"
  | "PAID"
  | "EXPIRED"
  | "CANCELLED"
  | "RECONCILIATION_REQUIRED";
export type TicketStatus = "VALID" | "CHECKED_IN" | "VOID";

export interface EventSummary {
  id: string;
  name: string;
  eventDate: string;
  venue: string;
  timezone: string;
  currency: string;
}

export interface SeatDto {
  id: string;
  section: string;
  rowLabel: string;
  seatNumber: string;
  priceCategory: string;
  priceMinor: number;
  currency: string;
  x: number;
  y: number;
  rotation: number;
  accessible: boolean;
  status: SeatStatus;
  holdExpiresAt?: string;
}

export interface SeatMapDto {
  event: EventSummary;
  seats: SeatDto[];
  serverTime: string;
}

export interface ReservationDto {
  orderId: string;
  orderNumber: string;
  accessToken: string;
  expiresAt: string;
  totalMinor: number;
  currency: string;
  seats: SeatDto[];
}

export interface CustomerDetails {
  name: string;
  email: string;
  phone?: string;
  billingCompany?: string;
  billingTaxId?: string;
}

export interface TicketDto {
  id: string;
  ticketCode: string;
  qrToken: string;
  status: TicketStatus;
  checkedInAt?: string;
  seat: Pick<SeatDto, "id" | "section" | "rowLabel" | "seatNumber">;
}

export interface OrderDto {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  customer?: CustomerDetails;
  totalMinor: number;
  currency: string;
  createdAt: string;
  expiresAt: string;
  paidAt?: string;
  seats: SeatDto[];
  tickets: TicketDto[];
}

export interface AdminStatsDto {
  revenueMinor: number;
  currency: string;
  soldSeats: number;
  heldSeats: number;
  availableSeats: number;
  paidOrders: number;
  pendingOrders: number;
  checkedInTickets: number;
}

export interface AdminOrderDto {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  customerName?: string;
  customerEmail?: string;
  totalMinor: number;
  currency: string;
  seatLabels: string[];
  createdAt: string;
}

export type CheckinResult =
  | { result: "CHECKED_IN"; ticket: TicketDto }
  | { result: "ALREADY_USED"; ticket: TicketDto }
  | { result: "VOID"; ticket: TicketDto }
  | { result: "INVALID" };

export interface AppErrorShape {
  code: string;
  message: string;
  seatIds?: string[];
}

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly seatIds?: string[],
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const formatMoney = (amountMinor: number, currency: string) =>
  new Intl.NumberFormat("cs-CZ", { style: "currency", currency }).format(
    amountMinor / 100,
  );

export const orderStatusLabel = (status: OrderStatus) => {
  switch (status) {
    case "PENDING":
      return "Probíhá platba";
    case "PAID":
      return "Zaplaceno";
    case "EXPIRED":
      return "Vypršelo";
    case "CANCELLED":
      return "Zrušeno";
    case "RECONCILIATION_REQUIRED":
      return "Nutná kontrola";
  }
};

export const ticketStatusLabel = (status: TicketStatus) => {
  switch (status) {
    case "VALID":
      return "Platný";
    case "CHECKED_IN":
      return "Odbaveno";
    case "VOID":
      return "Neplatný";
  }
};

export const seatLabel = (
  seat: Pick<SeatDto, "section" | "rowLabel" | "seatNumber">,
) =>
  `Sektor ${seat.section} · řada ${seat.rowLabel} · sedadlo ${seat.seatNumber}`;
