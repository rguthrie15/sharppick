/**
 * SharpPick — Scheduled Rating Recalculator
 * netlify/functions/recalculate-ratings.js
 *
 * Runs every 4 hours via Netlify Scheduled Functions.
 * Pulls every user's settled picks from Supabase, recomputes their
 * Sharp Rating (same formula as the client), and upserts user_ratings.
 *
 * This means leaderboard records stay current for ALL users whether
 * or not they have the app open.
 *
 * Deploy requirement:
 *   Set SUPABASE_SERVICE_KEY in Netlify environment variables.
 *   (Settings → Environment variables → Add variable)
 *   Use the service_role key from your Supabase project settings —
 *   NOT the anon key. The service key bypasses RLS and can write
 *   to user_ratings on behalf of any user.
 */

// ── Cron schedule: every 4 hours ──────────────────────────────
export const config = {
  schedule: '0 */4 * * *',
};

// ── Config ────────────────────────────────────────────────────
const SUPA_URL     = 'https://uibdzjvoehhpmjniksyk.supabase.co';
const SUPA_REST    = `${SUPA_URL}/rest/v1`;
const BATCH_SIZE   = 50;   // users processed per batch
const CUTOFF_90    = 90 * 24 * 60 * 60 * 1000;
const MIN_PICKS    = 18;   // picks needed to be non-provisional

// ── Helpers (mirrors client-side logic exactly) ───────────────

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
  // settledDesc: sorted newest-first
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

/**
 * Compute Sharp Rating for a user given their array of picks.
 * Exactly mirrors _pushRatingsToSupabase() in app.js.
 */
function computeRatingRow(userId, picks) {
  const now      = Date.now();
  const cutoff90 = now - CUTOFF_90;

  const singles  = picks.filter(p => p.type !== 'parlay');
  const parlays  = picks.filter(p => p.type === 'parlay');

  // 90-day singles
  const s90 = singles.filter(p => {
    const ts = p.settled_at || p.settledAt || p.made_at || p.madeAt || 0;
    return +ts >= cutoff90 && normalizeResult(p.result) !== 'pending';
  });
  const s90pend = singles.filter(p => {
    const ts = p.settled_at || p.settledAt || p.made_at || p.madeAt || 0;
    return +ts >= cutoff90 && normalizeResult(p.result) === 'pending';
  });
  const p90 = parlays.filter(p => {
    const ts = p.settled_at || p.settledAt || p.made_at || p.madeAt || 0;
    return +ts >= cutoff90;
  });

  // Win/loss counts
  const w90  = s90.filter(p => normalizeResult(p.result) === 'won').length;
  const l90  = s90.filter(p => normalizeResult(p.result) === 'lost').length;
  const wAT  = singles.filter(p => normalizeResult(p.result) === 'won').length;
  const lAT  = singles.filter(p => normalizeResult(p.result) === 'lost').length;
  const puAT = singles.filter(p => normalizeResult(p.result) === 'push').length;

  const picks90count = s90.length + p90.filter(p => normalizeResult(p.result) !== 'pending').length;
  const pend90count  = s90pend.length + p90.filter(p => normalizeResult(p.result) === 'pending').length;

  // Win rate + ROI (90-day singles)
  const winRate90 = (w90 + l90) > 0
    ? Number((w90 / (w90 + l90) * 100).toFixed(1))
    : 0;

  const profit90 = s90.reduce((sum, p) => sum + pickPnL(p), 0);
  const stake90  = s90.reduce((sum, p) => sum + Math.max(0, +(p.wager || 50)), 0);
  const roi90    = stake90 > 0
    ? Number((profit90 / stake90 * 100).toFixed(1))
    : 0;

  // Sharp Rating = winRate*0.7 + clamp(roi,-100,100)*0.3
  const sharpRating = Number(
    Math.max(0, Math.min(100,
      winRate90 * 0.7 + Math.max(-100, Math.min(100, roi90)) * 0.3
    )).toFixed(1)
  );

  // Parlay ROI
  const parlayProfit = p90.filter(p => normalizeResult(p.result) !== 'pending')
    .reduce((sum, p) => sum + pickPnL(p), 0);
  const parlayStake  = p90.filter(p => normalizeResult(p.result) !== 'pending')
    .reduce((sum, p) => sum + Math.max(0, +(p.wager || 0)), 0);
  const parlayRoi90  = parlayStake > 0
    ? Number((parlayProfit / parlayStake * 100).toFixed(1))
    : 0;

  // All-time ROI
  const profitAT = singles.filter(p => normalizeResult(p.result) !== 'pending')
    .reduce((sum, p) => sum + pickPnL(p), 0);
  const stakeAT  = singles.filter(p => normalizeResult(p.result) !== 'pending')
    .reduce((sum, p) => sum + Math.max(0, +(p.wager || 50)), 0);
  const roiAT    = stakeAT > 0
    ? Number((profitAT / stakeAT * 100).toFixed(1))
    : 0;

  // Units (profit in 100-unit terms)
  const units90 = Number((profit90 / 100).toFixed(2));

  // Top sport (90-day)
  const byLeague = {};
  s90.forEach(p => {
    const lg = p.league || 'Other';
    byLeague[lg] = (byLeague[lg] || 0) + 1;
  });
  const topSport = Object.entries(byLeague).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // Current streak (newest first)
  const settledDesc = singles
    .filter(p => normalizeResult(p.result) !== 'pending')
    .sort((a, b) => {
      const ta = +(a.settled_at || a.settledAt || a.made_at || a.madeAt || 0);
      const tb = +(b.settled_at || b.settledAt || b.made_at || b.madeAt || 0);
      return tb - ta;
    });
  const streak = computeStreak(settledDesc);

  const isProv = picks90count < MIN_PICKS;

  return {
    user_id:             userId,
    sharp_rating_90:     sharpRating,
    singles_overall_90:  sharpRating,
    singles_picks_90:    picks90count,
    singles_verified_90: picks90count >= 18,
    win_rate_90:         winRate90,
    roi_90:              roi90,
    units_90:            units90,
    picks_90:            picks90count,
    pending_90:          pend90count,
    all_time_singles:    `${wAT}-${lAT}-${puAT}`,
    all_time_roi:        roiAT,
    top_sport:           topSport,
    top_sport_rating:    topSport ? sharpRating : null,
    cur_streak:          streak,
    is_provisional:      isProv,
    provisional_reason:  isProv ? `${picks90count} settled picks (need ${MIN_PICKS})` : null,
    parlay_roi_90:       parlayRoi90,
    calculated_at:       new Date().toISOString(),
    calculated_for_date: new Date().toISOString().slice(0, 10),
  };
}

// ── Supabase helpers ─────────────────────────────────────────

function serviceHeaders(serviceKey) {
  return {
    'apikey':        serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type':  'application/json',
    'Prefer':        'resolution=merge-duplicates,return=minimal',
  };
}

async function sbGet(serviceKey, path) {
  const resp = await fetch(`${SUPA_REST}${path}`, {
    headers: serviceHeaders(serviceKey),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`GET ${path} → ${resp.status}: ${txt}`);
  }
  return resp.json();
}

async function sbUpsertBatch(serviceKey, table, rows) {
  if (!rows.length) return;
  const resp = await fetch(`${SUPA_REST}/${table}`, {
    method:  'POST',
    headers: serviceHeaders(serviceKey),
    body:    JSON.stringify(rows),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`UPSERT ${table} → ${resp.status}: ${txt}`);
  }
}

// ── Main handler ──────────────────────────────────────────────

export default async function handler() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    console.error('[recalculate-ratings] SUPABASE_SERVICE_KEY not set — aborting');
    return new Response('Missing SUPABASE_SERVICE_KEY', { status: 500 });
  }

  console.log(`[recalculate-ratings] Starting at ${new Date().toISOString()}`);

  try {
    // ── Step 1: Get all distinct user IDs that have picks ──
    const userRows = await sbGet(
      serviceKey,
      '/user_picks?select=user_id&result=neq.pending&order=user_id'
    );
    // Deduplicate
    const userIds = [...new Set(userRows.map(r => r.user_id).filter(Boolean))];
    console.log(`[recalculate-ratings] Found ${userIds.length} users with settled picks`);

    let updated = 0;
    let failed  = 0;

    // ── Step 2: Process users in batches ──────────────────
    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
      const batch = userIds.slice(i, i + BATCH_SIZE);

      // Fetch all picks for these users in one query
      const userIdFilter = batch.map(id => `"${id}"`).join(',');
      let picks;
      try {
        picks = await sbGet(
          serviceKey,
          `/user_picks?user_id=in.(${batch.join(',')})&select=user_id,result,odds,wager,type,league,settled_at,made_at&order=user_id`
        );
      } catch (e) {
        console.warn(`[recalculate-ratings] Failed to fetch picks for batch ${i}: ${e.message}`);
        failed += batch.length;
        continue;
      }

      // Group picks by user_id
      const byUser = {};
      for (const pick of picks) {
        if (!byUser[pick.user_id]) byUser[pick.user_id] = [];
        byUser[pick.user_id].push(pick);
      }

      // Compute rating rows
      const ratingRows = [];
      for (const userId of batch) {
        const userPicks = byUser[userId] || [];
        if (!userPicks.length) continue;
        try {
          ratingRows.push(computeRatingRow(userId, userPicks));
        } catch (e) {
          console.warn(`[recalculate-ratings] computeRatingRow failed for ${userId}: ${e.message}`);
          failed++;
        }
      }

      // Upsert computed ratings
      if (ratingRows.length) {
        try {
          await sbUpsertBatch(serviceKey, 'user_ratings', ratingRows);
          updated += ratingRows.length;
          console.log(`[recalculate-ratings] Batch ${i}–${i + batch.length}: updated ${ratingRows.length} ratings`);
        } catch (e) {
          console.warn(`[recalculate-ratings] Upsert failed for batch ${i}: ${e.message}`);
          failed += ratingRows.length;
        }
      }
    }

    const summary = `Done — ${updated} updated, ${failed} failed out of ${userIds.length} users`;
    console.log(`[recalculate-ratings] ${summary}`);
    return new Response(summary, { status: 200 });

  } catch (e) {
    console.error('[recalculate-ratings] Fatal error:', e.message);
    return new Response(`Fatal: ${e.message}`, { status: 500 });
  }
}
