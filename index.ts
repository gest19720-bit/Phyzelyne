// ==========================================================
// Phyzelyne AI Coach — Edge Function proxy
// Deploy: supabase functions deploy ai-coach
// Secret: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// ==========================================================
// Why this exists: the browser can never hold the Anthropic
// API key. This function sits between the coach UI and
// Anthropic, forwards the request server-side, and streams
// the SSE response straight back to the client. It also
// checks the caller has a valid Supabase session, so the
// key can't be hammered by anonymous traffic.
// ==========================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 16000;
const THINK_BUDGET = 10000;

const WEB_SEARCH_TOOL = [{ type: 'web_search_20250305', name: 'web_search' }];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // tighten to your domain in production
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'Server misconfigured: missing ANTHROPIC_API_KEY' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Auth check: reject anonymous callers ──────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Auth check failed' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Parse request ──────────────────────────────────────
  let payload: { messages?: unknown[]; system?: string; useTools?: boolean };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { messages, system, useTools } = payload;
  if (!Array.isArray(messages) || !messages.length || typeof system !== 'string') {
    return new Response(JSON.stringify({ error: 'Body must include messages[] and system (string)' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Forward to Anthropic, stream response straight through ──
  const anthropicHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
  };
  if (useTools) {
    anthropicHeaders['anthropic-beta'] = 'interleaved-thinking-2025-05-14';
  }

  const body: Record<string, unknown> = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    thinking: { type: 'enabled', budget_tokens: THINK_BUDGET },
    system,
    messages,
    stream: true,
  };
  if (useTools) body.tools = WEB_SEARCH_TOOL;

  let upstream: Response;
  try {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: anthropicHeaders,
      body: JSON.stringify(body),
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to reach Anthropic API' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => 'Unknown error');
    return new Response(JSON.stringify({ error: `Anthropic API error: ${errText}` }), {
      status: upstream.status || 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Pass the SSE stream straight through to the browser
  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
});
