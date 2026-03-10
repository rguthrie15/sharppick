/**
 * SharpPick — Instant Rating Updater (Supabase Webhook)
 * netlify/functions/on-pick-settled.js
 *
 * Triggered instantly by Supabase when a row in user_picks is
 * inserted or updated with a non-pending result.
 *
 * Setup in Supabase (one-time):
 *   Database → Webhooks → Create webhook
 *   Name:    on_pick_settled
 *   Table:   user_picks
 *   Events:  INSERT, UPDATE
 *   URL:     https://getsharppick.com/.netlify/functions/on-pick-settled
 *   Headers: { "x-webhook-secret": "<your secret string>" }
 *
 * Then add to Netlify environment variables:
 *   SUPABASE_SERVICE_KEY  = your service_role key
 *   WEBHOOK_SECRET        = the same secret string you set in Supabase
 */

const SUPA_URL  = 'https://uibdzjvoehhpmjniksyk.supabase.co';
const SUPA_REST = `${SUPA_URL}/rest/v1`;

// ── Helpers (same as recalculate-ratings.js) ─────────────────

function normalizeResult(r) {
  if (!r) return 'pending';
  const s = String(r).toLowerCase().trim();
  if (s === 'won' || s === 'win' || s === 'w') return 'won';
  if (s === 'lost' || s === 'loss' || s === 'l') return 'lost';
  if (s === 'push' || s === 'tie' || s === 'p') return 'push';
  return 'pending';
}

function americanProfit(risk, american) {
  const o = parseFloat(american);
  if (!isFinite(o)) return Math.round(risk * (100 / 110) * 100) / 100;
  if (o > 0) return Math.round(risk * (o / 100) * 100) / 100;
  return Math.round(risk * (100 / Math.abs(o)) * 100) / 100;
}

function pickPnL(p) {
  const risk = Math.max(0, +(p.wager || 0));
  const r = normalizeResult(p.result);
  if (r === 'won')  return americanProfit(risk, p.odds || -110);
  if (r === 'lost') return -risk;
  return 0;
}

function computeStreak(settledDesc) {
  if (!settledDesc.length) return 0;
  const first = normalizeResult(settledDesc[0].result);
  if (first === 'push') return 0;
  let streak = 0;
  for (const p of settledDesc) {
    if (normalizeResult(p.result) === first) streak++;
    else break;
  }
  return first === 'won' ? streak : -streak;
}

function computeRatingRow(userId, picks) {
  const cutoff90 = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const MIN_PICKS = 18;

  const singles = picks.filter(p => p.type !== 'parlay');
  const parlays  = picks.filter(p => p.type === 'parlay');

  const s90 = singles.filter(p => {
    const ts = +(p.settled_at || p.made_at || 0);
    return ts >= cutoff90 && normalizeResult(p.result) !== 'pending';
  });
  const s90pend = singles.filter(p => {
    const ts = +(p.settled_at || p.made_at || 0);
    return ts >= cutoff90 && normalizeResult(p.result) === 'pending';
  });
  const p90 = parlays.filter(p => {
    const ts = +(p.settled_at || p.made_at || 0);
    return ts >= cutoff90;
  });

  const w90  = s90.filter(p => normalizeResult(p.result) === 'won').length;
  const l90  = s90.filter(p => normalizeResult(p.result) === 'lost').length;
  const wAT  = singles.filter(p => normalizeResult(p.result) === 'won').length;
  const lAT  = singles.filter(p => normalizeResult(p.result) === 'lost').length;
  const puAT = singles.filter(p => normalizeResult(p.result) === 'push').length;

  const picks90count = s90.length + p90.filter(p => normalizeResult(p.result) !== 'pending').length;
  const pend90count  = s90pend.length + p90.filter(p => normalizeResult(p.result) === 'pending').length;

  const winRate90 = (w90 + l90) > 0 ? Number((w90 / (w90 + l90) * 100).toFixed(1)) : 0;

  const profit90 = s90.reduce((sum, p) => sum + pickPnL(p), 0);
  const stake90  = s90.reduce((sum, p) => sum + Math.max(0, +(p.wager || 50)), 0);
  const roi90    = stake90 > 0 ? Number((profit90 / stake90 * 100).toFixed(1)) : 0;

  const sharpRating = Number(
    Math.max(0, Math.min(100,
      winRate90 * 0.7 + Math.max(-100, Math.min(100, roi90)) * 0.3
    )).toFixed(1)
  );

  const parlayProfit = p90.filter(p => normalizeResult(p.result) !== 'pending').reduce((s, p) => s + pickPnL(p), 0);
  const parlayStake  = p90.filter(p => normalizeResult(p.result) !== 'pending').reduce((s, p) => s + Math.max(0, +(p.wager || 0)), 0);
  const parlayRoi90  = parlayStake > 0 ? Number((parlayProfit / parlayStake * 100).toFixed(1)) : 0;

  const profitAT = singles.filter(p => normalizeResult(p.result) !== 'pending').reduce((s, p) => s + pickPnL(p), 0);
  const stakeAT  = singles.filter(p => normalizeResult(p.result) !== 'pending').reduce((s, p) => s + Math.max(0, +(p.wager || 50)), 0);
  const roiAT    = stakeAT > 0 ? Number((profitAT / stakeAT * 100).toFixed(1)) : 0;

  const byLeague = {};
  s90.forEach(p => { const lg = p.league || 'Other'; byLeague[lg] = (byLeague[lg] || 0) + 1; });
  const topSport = Object.entries(byLeague).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const settledDesc = singles
    .filter(p => normalizeResult(p.result) !== 'pending')
    .sort((a, b) => +(b.settled_at || b.made_at || 0) - +(a.settled_at || a.made_at || 0));
  const streak = computeStreak(settledDesc);

  const isProv = picks90count < MIN_PICKS;

  return {
    user_id:             userId,
    sharp_rating_90:     sharpRating,
    singles_overall_90:  sharpRating,
    win_rate_90:         winRate90,
    roi_90:              roi90,
    units_90:            Number((profit90 / 100).toFixed(2)),
    picks_90:            picks90count,
    pending_90:          pend90count,
    all_time_singles:    `${wAT}-${lAT}-${puAT}`,
    all_time_roi:        roiAT,
    top_sport:           topSport,
    top_sport_rating:    topSport ? sharpRating : null,
    cur_streak:          streak,
    is_provisional:      isProv,
    provisional_reason:  isProv ? `${picks90count} settled picks (need 18)` : null,
    parlay_roi_90:       parlayRoi90,
    calculated_at:       new Date().toISOString(),
    calculated_for_date: new Date().toISOString().slice(0, 10),
  };
}

function serviceHeaders(key) {
  return {
    'apikey':        key,
    'Authorization': `Bearer ${key}`,
    'Content-Type':  'application/json',
    'Prefer':        'resolution=merge-duplicates,return=minimal',
  };
}

// ── Main handler ──────────────────────────────────────────────

export default async function handler(req) {
  // ── Auth: verify webhook secret ──────────────────────────
  const serviceKey    = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const webhookSecret = process.env.WEBHOOK_SECRET;

  if (!serviceKey) {
    console.error('[on-pick-settled] SUPABASE_SERVICE_KEY not set');
    return new Response('Misconfigured', { status: 500 });
  }

  // If a secret is configured, enforce it
  if (webhookSecret) {
    const incoming = req.headers.get('x-webhook-secret');
    if (incoming !== webhookSecret) {
      console.warn('[on-pick-settled] Rejected — bad webhook secret');
      return new Response('Unauthorized', { status: 401 });
    }
  }

  // ── Parse body ───────────────────────────────────────────
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  // Supabase sends { type, table, schema, record, old_record }
  const record = body?.record || body?.new || body;
  const userId = record?.user_id;

  if (!userId) {
    console.log('[on-pick-settled] No user_id in payload — skipping');
    return new Response('No user_id', { status: 200 });
  }

  // Only process if result is actually settled
  const result = normalizeResult(record?.result);
  if (result === 'pending') {
    console.log(`[on-pick-settled] Pick still pending for ${userId} — skipping`);
    return new Response('Pending pick — skipped', { status: 200 });
  }

  console.log(`[on-pick-settled] Recalculating rating for user ${userId} (result: ${result})`);

  try {
    // Fetch all picks for this user
    const resp = await fetch(
      `${SUPA_REST}/user_picks?user_id=eq.${userId}&select=user_id,result,odds,wager,type,league,settled_at,made_at`,
      { headers: serviceHeaders(serviceKey) }
    );

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`Fetch picks failed: ${resp.status} ${txt}`);
    }

    const picks = await resp.json();
    if (!picks.length) {
      return new Response('No picks found', { status: 200 });
    }

    // Compute and upsert rating
    const row = computeRatingRow(userId, picks);

    const upsert = await fetch(`${SUPA_REST}/user_ratings`, {
      method:  'POST',
      headers: serviceHeaders(serviceKey),
      body:    JSON.stringify([row]),
    });

    if (!upsert.ok) {
      const txt = await upsert.text().catch(() => '');
      throw new Error(`Upsert failed: ${upsert.status} ${txt}`);
    }

    console.log(`[on-pick-settled] ✓ Rating updated for ${userId} → SR: ${row.sharp_rating_90}, WR: ${row.win_rate_90}%, record: ${row.all_time_singles}`);
    return new Response('OK', { status: 200 });

  } catch (e) {
    console.error(`[on-pick-settled] Error for ${userId}:`, e.message);
    return new Response(`Error: ${e.message}`, { status: 500 });
  }
}
