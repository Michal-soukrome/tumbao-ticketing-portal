export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export const preflight = (request: Request) => request.method === 'OPTIONS'
  ? new Response('ok', { headers: corsHeaders })
  : null
