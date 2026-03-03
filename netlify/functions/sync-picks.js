// Netlify Function: Sync picks server-side to Supabase (service role)
// - Verifies the caller via Supabase Auth access token
// - Upserts provided picks into user_picks table (forced user_id)
// - Recomputes user_ratings snapshot used by leaderboard/profile RPCs

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const json = (statusCode, body, extraHeaders = {}) => ({
  statusCode,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    // CORS (same-origin on Netlify, but keep permissive for safety)
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'POST, OPTIONS',
    ...extraHeaders,
  },
  body: JSON.stringify(body),
});

function toNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function profitFromOdds(risk, odds) {
  const o = toNum(odds, 0);
  const r = toNum(risk, 0);
  if (!o || !r) return 0;
  if (o > 0) return r * (o / 100);
  return r * (100 / Math.abs(o));
}

function pickMadeAt(p) {
  const t = p?.created_at || p?.madeAt || p?.createdAt || p?.ts;
  if (!t) return 0;
  if (typeof t === 'string') {
    const n = Date.parse(t);
    return Number.isFinite(n) ? n : 0;
  }
  return toNum(t, 0);
}

function pickResult(p) {
  return String(p?.result || p?.status || 'pending').toLowerCase();
}

function pickIsParlay(p) {
  return Boolean(p?.is_parlay) || p?.pick_type === 'parlay' || Array.isArray(p?.legs);
}

function computeStreak(settledDesc) {
  let dir = null;
  let n = 0;
  for (const p of settledDesc) {
    const r = pickResult(p);
    if (r === 'push' || r === 'canceled') continue;
    const d = r === 'won' ? 'W' : r === 'lost' ? 'L' : null;
    if (!d) continue;
    if (!dir) {
      dir = d;
      n = 1;
    } else if (d === dir) {
      n += 1;
    } else {
      break;
    }
  }
  return dir ? `${dir}${n}` : '—';
}

function computeRatingsFromRows(rows) {
  const all = (rows || []).slice().sort((a, b) => pickMadeAt(b) - pickMadeAt(a));
  const now = Date.now();
  const cutoff90 = now - 90 * 864e5;
  const is90 = (p) => pickMadeAt(p) >= cutoff90;

  function agg(list) {
    let w = 0,
      l = 0,
      push = 0,
      pend = 0,
      risk = 0,
      profit = 0,
      decided = 0;
    for (const pk of list) {
      const r = pickResult(pk);
      if (r === 'pending') {
        pend++;
        continue;
      }
      if (r === 'canceled') continue;
      const rk = toNum(pk?.risk ?? pk?.wager ?? 50, 50);
      const od = toNum(pk?.odds ?? -110, -110);
      if (r === 'won') {
        w++;
        decided++;
        risk += rk;
        profit += profitFromOdds(rk, od);
      } else if (r === 'lost') {
        l++;
        decided++;
        risk += rk;
        profit -= rk;
      } else if (r === 'push') {
        push++;
        decided++;
        risk += rk;
      }
    }
    const denom = w + l || 1;
    const winRate = (w / denom) * 100;
    const roi = risk ? (profit / risk) * 100 : 0;
    const units = profit / 50;
    return { w, l, push, pend, decided, risk, profit, winRate, roi, units };
  }

  const singlesAll = all.filter((p) => !pickIsParlay(p));
  const parlaysAll = all.filter((p) => pickIsParlay(p));
  const singles90 = singlesAll.filter(is90);
  const parlays90 = parlaysAll.filter(is90);

  const aSingles90 = agg(singles90);
  const aSinglesAll = agg(singlesAll);
  const aParlays90 = agg(parlays90);

  const last10 = singlesAll
    .filter((p) => {
      const r = pickResult(p);
      return r !== 'pending' && r !== 'canceled';
    })
    .slice(0, 10);
  const avgOddsLast10 = last10.length
    ? Math.round(last10.reduce((s, p) => s + toNum(p?.odds ?? -110, -110), 0) / last10.length)
    : null;

  const byLeague = {};
  for (const pk of singles90) {
    const r = pickResult(pk);
    if (r === 'pending' || r === 'canceled') continue;
    const lg = pk?.league || pk?.sport || 'other';
    byLeague[lg] = (byLeague[lg] || 0) + 1;
  }
  const topSport = Object.entries(byLeague).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const picks90 = aSingles90.decided + aParlays90.decided;
  const isProv = picks90 < 18;
  const provReason = isProv ? `${picks90} to unlock Verified leaderboard` : null;

  const rating = Math.max(
    0,
    Math.min(100, aSingles90.winRate * 0.7 + Math.max(-100, Math.min(100, aSingles90.roi)) * 0.3)
  );

  const settledSinglesDesc = singlesAll
    .filter((p) => {
      const r = pickResult(p);
      return r !== 'pending' && r !== 'canceled';
    })
    .sort((a, b) => pickMadeAt(b) - pickMadeAt(a));

  return {
    sharp_rating_90: Number(rating.toFixed(1)),
    is_provisional: isProv,
    provisional_reason: provReason,
    top_sport: topSport,
    top_sport_rating: topSport ? Number(rating.toFixed(1)) : null,
    cur_streak: computeStreak(settledSinglesDesc),
    avg_odds_last10: avgOddsLast10,
    singles_overall_90: Number(rating.toFixed(1)),
    win_rate_90: Number(aSingles90.winRate.toFixed(1)),
    roi_90: Number(aSingles90.roi.toFixed(1)),
    units_90: Number(aSingles90.units.toFixed(2)),
    all_time_singles: `${aSinglesAll.w}-${aSinglesAll.l}-${aSinglesAll.push}`,
    all_time_roi: Number((aSinglesAll.roi || 0).toFixed(1)),
    parlays_90: `${aParlays90.w}-${aParlays90.l}-${aParlays90.push}`,
    parlay_roi_90: Number((aParlays90.roi || 0).toFixed(1)),
    picks_90: picks90,
    pending_90: aSingles90.pend + aParlays90.pend,
  };
}

async function supa(path, { method = 'GET', headers = {}, body } = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  const url = `${SUPABASE_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      ...headers,
    },
    body,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = typeof data === 'string' ? data : data?.message || data?.error || res.statusText;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function verifyUser(accessToken) {
  // Verify via Supabase Auth API
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) return null;
  return await res.json();
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const auth = event.headers.authorization || event.headers.Authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return json(401, { error: 'Missing Bearer token' });

    const user = await verifyUser(token);
    if (!user?.id) return json(401, { error: 'Invalid session' });

    const payload = JSON.parse(event.body || '{}');
    const picks = Array.isArray(payload.picks) ? payload.picks : [];
    const name = String(payload.name || payload.displayName || payload.email || '').slice(0, 80);

    // Upsert picks (force user_id)
    if (picks.length) {
      const rows = picks
        .filter((r) => r && r.id)
        .map((r) => ({
          ...r,
          user_id: user.id,
        }));

      if (rows.length) {
        await supa(`/rest/v1/user_picks?on_conflict=id`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify(rows),
        });
      }
    }

    // Pull authoritative rows and recompute ratings
    const userRows = await supa(`/rest/v1/user_picks?select=*&user_id=eq.${user.id}&order=created_at.desc&limit=5000`);
    const stats = computeRatingsFromRows(userRows);
    const calculated_at = new Date().toISOString();

    // Upsert into user_ratings (snapshot)
    const ratingRow = { user_id: user.id, calculated_at, ...stats };
    await supa(`/rest/v1/user_ratings?on_conflict=user_id`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify([ratingRow]),
    });

    // Also keep a name map in leaderboard table (best-effort)
    if (name) {
      try {
        await supa(`/rest/v1/leaderboard?on_conflict=user_id`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify([{ user_id: user.id, name, updated_at: calculated_at }]),
        });
      } catch {
        // ignore if table/columns don't exist
      }
    }

    return json(200, { ok: true, user_id: user.id, stats });
  } catch (e) {
    return json(500, { error: e?.message || 'Server error' });
  }
};
