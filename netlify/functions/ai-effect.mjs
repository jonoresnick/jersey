// Turns a sentence like "debossed stars on the main stripe" into settings for the
// stripe-effects controls (see js/effects.js). The browser validates the result again,
// so a bad answer can never break the page.
//
// Needs one environment variable in Netlify: ANTHROPIC_API_KEY.
// Without it (or if anything fails) the site falls back to its built-in helper.

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

const MODEL = 'claude-opus-5-5';
const MAX_PROMPT = 200;

// Must match FX in js/effects.js.
const PATTERNS = ['stars', 'dots', 'diamonds', 'chevrons', 'lines', 'checks', 'hexagons', 'crosses', 'triangles', 'waves'];
const TARGETS = ['stripe1', 'stripe2', 'pantsStripe1', 'pantsStripe2', 'sockStripe1', 'sockStripe2'];

const Effect = z.object({
  understood: z.boolean(),
  pattern: z.enum(PATTERNS),
  relief: z.enum(['flat', 'deboss', 'emboss']),
  scale: z.number(),
  spacing: z.number(),
  rotate: z.number(),
  color: z.string(),
  target: z.enum([...TARGETS, 'none']),
});

const SYSTEM = `You set up a pattern on one stripe of a hockey jersey. Read the request and fill in the settings.

pattern: one of ${PATTERNS.join(', ')}. Pick the closest match to what was asked.
relief: "deboss" (pressed into the fabric), "emboss" (raised) or "flat" (printed). Use "deboss" if unsure.
scale: size of each shape, 0.5 (tiny) to 2.5 (huge); 1 is normal.
spacing: gap between shapes, 1 (packed) to 2.5 (far apart); 1.4 is normal.
rotate: angle in degrees, 0 to 90. Use 45 for "diagonal".
color: "tone" (same colour as the stripe, a little lighter or darker) unless a colour is named. For a team colour use "p0" primary, "p1" secondary, "p2" accent, "p3" trim or "p4" extra. For any other named colour use a hex code like "#d4a62a" for gold.
target: "stripe1" main jersey stripe (also the hem and sleeve stripes), "stripe2" accent jersey stripe, "pantsStripe1" pants stripe, "pantsStripe2" pants accent stripe, "sockStripe1" sock stripe, "sockStripe2" sock accent stripe. Use "none" if the request doesn't say which stripe.
understood: false if the request is not about a pattern on a stripe; then fill the other fields with defaults.`;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Best-effort limit per visitor. Serverless instances restart, so also set a spend limit in the Anthropic console.
const hits = new Map();
function limited(ip) {
  const now = Date.now(), recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 12;
}

export default async (req, context) => {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: 'The AI helper is not set up.' }, 503);
  if (limited(context?.ip || req.headers.get('x-forwarded-for') || 'unknown')) return json({ error: 'Too many requests. Try again in a minute.' }, 429);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Bad request.' }, 400); }
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, MAX_PROMPT) : '';
  if (!prompt) return json({ error: 'Describe the effect.' }, 400);
  const current = TARGETS.includes(body.target) ? body.target : 'stripe1';

  try {
    const client = new Anthropic();
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: 'user', content: `The stripe being edited is "${current}".\nRequest: ${prompt}` }],
      output_config: { effort: 'low', format: zodOutputFormat(Effect) },
    });
    const out = response.parsed_output;
    if (response.stop_reason === 'refusal' || !out || !out.understood) return json({ error: 'Not understood.' }, 422);
    const { understood, target, ...effect } = out;
    return json(target === 'none' ? effect : { ...effect, target });
  } catch (err) {
    console.error('ai-effect failed', err && err.status, err && err.message);
    return json({ error: 'The AI helper is unavailable.' }, 502);
  }
};
