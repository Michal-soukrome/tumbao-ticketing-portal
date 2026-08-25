import { corsHeaders } from './cors.ts'

export const json = (body: unknown, status = 200, extraHeaders: HeadersInit = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extraHeaders },
})

export const apiError = (code: string, message: string, status = 400, extra?: Record<string, unknown>) =>
  json({ code, message, ...extra }, status)

export function methodNotAllowed() {
  return apiError('METHOD_NOT_ALLOWED', 'Only POST is supported.', 405)
}
