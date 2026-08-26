import { z } from "npm:zod@4";
import { preflight } from "../_shared/cors.ts";
import { apiError, json, methodNotAllowed } from "../_shared/http.ts";
import { secureToken, serviceClient, sha256 } from "../_shared/supabase.ts";

const requestSchema = z.object({
  event_id: z.uuid(),
  seat_ids: z
    .array(z.uuid())
    .min(1)
    .max(10)
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "ID sedadel musí být unikátní.",
    ),
});

Deno.serve(async (request) => {
  const optionsResponse = preflight(request);
  if (optionsResponse) return optionsResponse;
  if (request.method !== "POST") return methodNotAllowed();

  try {
    const parsed = requestSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success)
      return apiError(
        "VALIDATION_ERROR",
        "Neplatný požadavek na sedadla.",
        422,
      );

    const accessToken = secureToken();
    const sessionToken =
      request.headers.get("x-session-token") ?? secureToken();
    const { data, error } = await serviceClient().rpc("reserve_seats", {
      p_event_id: parsed.data.event_id,
      p_seat_ids: parsed.data.seat_ids,
      p_session_id_hash: await sha256(sessionToken),
      p_access_token_hash: await sha256(accessToken),
    });

    if (error) {
      if (error.message.includes("SEAT_UNAVAILABLE")) {
        const seatIds = error.details?.split(",").filter(Boolean) ?? [];
        return apiError(
          "SEAT_UNAVAILABLE",
          "Jedno nebo více sedadel již není k dispozici.",
          409,
          { seat_ids: seatIds },
        );
      }
      if (error.message.includes("EVENT_NOT_ON_SALE"))
        return apiError(
          "EVENT_NOT_ON_SALE",
          "Prodej vstupenek není otevřen.",
          409,
        );
      if (
        error.message.includes("VALIDATION") ||
        error.message.includes("INVALID_SEAT") ||
        error.message.includes("DUPLICATE")
      ) {
        return apiError(
          "VALIDATION_ERROR",
          "Požadavek na sedadlo je neplatný.",
          422,
        );
      }
      throw error;
    }

    return json(
      {
        orderId: data.order_id,
        orderNumber: data.order_number,
        accessToken,
        expiresAt: data.expires_at,
        totalMinor: data.total_minor,
        currency: data.currency,
        seats: data.seats.map((seat: Record<string, unknown>) => ({
          id: seat.seat_id,
          section: seat.section,
          rowLabel: seat.row_label,
          seatNumber: seat.seat_number,
          priceCategory: seat.price_category_name,
          priceMinor: seat.price_minor,
          currency: seat.currency,
          status: "HELD",
        })),
      },
      201,
      { "X-Anonymous-Session": sessionToken },
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "reserve-seats-failed",
        message: error instanceof Error ? error.message : "unknown",
      }),
    );
    return apiError("INTERNAL_ERROR", "Sedadla nemohla být rezervována.", 500);
  }
});
