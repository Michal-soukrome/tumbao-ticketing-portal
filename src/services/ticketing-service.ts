import type {
  AdminOrderDto,
  AdminStatsDto,
  CheckinResult,
  CustomerDetails,
  OrderDto,
  ReservationDto,
  SeatMapDto,
} from "../domain/models";

export interface OrderCredentials {
  orderId: string;
  accessToken: string;
}

export interface TicketingService {
  getSeatMap(): Promise<SeatMapDto>;
  reserveSeats(eventId: string, seatIds: string[]): Promise<ReservationDto>;
  updateCustomer(
    credentials: OrderCredentials,
    customer: CustomerDetails,
  ): Promise<OrderDto>;
  getOrder(credentials: OrderCredentials): Promise<OrderDto>;
  cancelOrder(credentials: OrderCredentials): Promise<void>;
  startPayment(
    credentials: OrderCredentials,
  ): Promise<
    { kind: "redirect"; url: string } | { kind: "paid"; order: OrderDto }
  >;
  getAdminStats(): Promise<AdminStatsDto>;
  listOrders(): Promise<AdminOrderDto[]>;
  checkinTicket(tokenOrCode: string): Promise<CheckinResult>;
  subscribeToSeatChanges(onChange: () => void): () => void;
}

export interface TestModeControls {
  reset(): Promise<void>;
  expirePendingOrders(): Promise<void>;
}

export interface ServiceRuntime {
  service: TicketingService;
  testMode: boolean;
  testControls?: TestModeControls;
}
