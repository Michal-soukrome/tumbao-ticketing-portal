import { z } from "npm:zod@4";
import { preflight } from "../_shared/cors.ts";
import { apiError, json, methodNotAllowed } from "../_shared/http.ts";
import { serviceClient, sha256 } from "../_shared/supabase.ts";

const requestSchema = z.object({
  order_id: z.uuid(),
  access_token: z.string().min(1),
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
        "The reservation request is invalid.",
        422,
      );

    const { error } = await serviceClient().rpc("cancel_pending_order", {
      p_order_id: parsed.data.order_id,
      p_access_token_hash: await sha256(parsed.data.access_token),
    });
    if (error) {
      if (error.message.includes("ORDER_NOT_FOUND"))
        return apiError(
          "ORDER_NOT_FOUND",
          "The reservation could not be found.",
          404,
        );
      if (error.message.includes("ORDER_NOT_CANCELLABLE"))
        return apiError(
          "ORDER_NOT_CANCELLABLE",
          "This reservation can no longer be changed.",
          409,
        );
      throw error;
    }

    return json({});
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "cancel-order-failed",
        message: error instanceof Error ? error.message : "unknown",
      }),
    );
    return apiError(
      "INTERNAL_ERROR",
      "The reservation could not be released.",
      500,
    );
  }
});
