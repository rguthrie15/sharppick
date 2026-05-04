/**
 * SharpPick — Server-Side Pick Settler
 * netlify/functions/settle-picks.js
 *
 * Runs on a schedule (every hour via Supabase pg_cron) OR can be triggered manually.
 * Fetches ESPN final scores and grades ALL users' pending picks server-side.
 * After settling, directly updates user_ratings with correct record and pending count
 * using a Postgres RPC function to avoid UUID/text type cast issues.
 *
 * Environment variables required:
 *   SUPABASE_URL              — your Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — service role key (bypasses RLS)
 *   SETTLE_SECRET             — shared secret to prevent unauthorized calls
 *
 * Required Supabase SQL function (run once):
 *   CREATE OR REPLACE FUNCTION update_user_record(
 *     p_user_id text,
 *     p_record text,
 *     p_pending int
 *   )
 *   RETURNS void
 *   LANGUAGE sql
 *   AS $$
 *     UPDATE user_ratings
 *     SET
 *       all_time_singles = p_record,
 *       pending_90 = p_pending,
 *       calculated_at = now()
 *     WHERE user_id = p_user_id::uuid;
 *   $$;
 */

const SUPABASE_URL              = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SETTLE_SECRET             = process.env.SETTLE_SECRET || '';

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';

const LEAGUES = [
  { sport: 'basketball', league: 'nba'                     },
  { sport: 'football',   league: 'nfl'                     },
  { sport: 'baseball',   league: 'mlb'                     },
  { sport: 'hockey',     league: 'nhl'                     },
  { sport: 'football',   league: 'college-football'        },
  { sport: 'basketball', league: 'mens-college-basketball' },
  { sport: 'soccer',     league: 'usa.1'                   },
  { sport: 'soccer',     league: 'eng.1'                   },
  { sport: 'soccer',     league: 'uefa.champions'          },
  { sport: 'soccer',     league: 'esp.1'                   },
  { sport: 'soccer',     league: 'ger.1'                   },
  { sport: 'soccer',     league: 'ita.1'                   },
];

const LABEL_TO_LEAGUE = {
  'nba':        'basketball/nba',
  'nfl':        'football/nfl',
  'mlb':        'baseball/mlb',
  'nhl':        'hockey/nhl',
  'ncaaf':      'football/college-football',
  'ncaab':      'basketball/mens-college-basketball',
  'mls':        'soccer/usa.1',
  'epl':        'soccer/eng.1',
  'ucl':        'soccer/uefa.champions',
  'la liga':    'soccer/esp.1',
  'bundesliga': 'soccer/ger.1',
  'serie a':    'soccer/ita.1',
};

// ── Helpers ────────────────────────────────────────────────────────────────

function supaHeaders() {
  return {
    apikey:         SUPABASE_SERVICE_ROLE_KEY,
    Authorization:  `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    Prefer:         'return=minimal',
  };
}

async function supaFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...opts,
    headers: { ...supaHeaders(), ...(opts.headers || {}) },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Supabase ${opts.method || 'GET'} ${path} → ${res.status}: ${txt}`);
  }
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

async function espnFetch(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function wbMatch(haystack, needle) {
  if (!haystack || !needle) return false;
  return new RegExp('\\b' + needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(haystack);
}

function normalizeResult(r) {
  if (!r) return 'pending';
  const s = String(r).toLowerCase().trim();
  if (s === 'won'  || s === 'win'  || s === 'w') return 'won';
  if (s === 'lost' || s === 'loss' || s === 'l') return 'lost';
  if (s === 'push' || s === 'tie'  || s === 'p') return 'push';
  return 'pending';
}

function leaguePriority(leagueLabel) {
  if (!leagueLabel) return LEAGUES;
  const raw = leagueLabel.replace(/\s*[🏀🏈⚾🏒⚽]/g, '').trim().toLowerCase();
  const path = LABEL_TO_LEAGUE[raw];
  if (path) {
    const [sport, league] = path.split('/');
    const match = LEAGUES.find(x => x.sport === sport && x.league === league);
    if (match) return [match, ...LEAGUES.filter(x => x !== match)];
  }
  return LEAGUES;
}

// ── Fetch a single game directly by ESPN event ID ─────────────────────────

async function fetchGameById(gameId, leagueLabel) {
  const orderedLeagues = leaguePriority(leagueLabel);

  for (const lg of orderedLeagues) {
    const url  = `${ESPN}/${lg.sport}/${lg.league}/summary?event=${gameId}`;
    const data = await espnFetch(url);
    if (!data) continue;

    const competition = data.header?.competitions?.[0];
    if (!competition) continue;

    const st = competition.status?.type;
    if (!st) continue;

    if (st.state !== 'post') return null;

    const home = competition.competitors?.find(c => c.homeAway === 'home') || {};
    const away = competition.competitors?.find(c => c.homeAway === 'away') || {};
    const hs   = parseInt(home.score);
    const as2  = parseInt(away.score);
    if (isNaN(hs) || isNaN(as2)) return null;

    return {
      hs,
      as2,
      homeName:    home.team?.shortDisplayName || home.team?.displayName || '',
      awayName:    away.team?.shortDisplayName || away.team?.displayName || '',
      homeAbbr:    (home.team?.abbreviation || '').toUpperCase(),
      awayAbbr:    (away.team?.abbreviation || '').toUpperCase(),
      sport:       lg.sport,
      league:      lg.league,
      oddsDetails: competition.odds?.[0]?.details || null,
    };
  }

  return null;
}

// ── Core settlement logic ──────────────────────────────────────────────────

function settleSpreadOrTotal(pick, hs, as2, homeName, awayName) {
  if (pick.type === 'total') {
    const total = parseFloat((pick.description || '').replace(/over |under /i, ''));
    if (isNaN(total)) return false;
    const combined = hs + as2;
    if (Math.abs(combined - total) < 0.01) pick.result = 'push';
    else if (pick.side === 'over')          pick.result = combined > total ? 'won' : 'lost';
    else                                    pick.result = combined < total ? 'won' : 'lost';
    return true;
  }

  if (pick.type === 'spread' || pick.type === 'moneyline') {
    let isHome;
    if (pick.isHomeTeam !== undefined && pick.isHomeTeam !== null) {
      isHome = !!pick.isHomeTeam;
    } else {
      isHome = (pick.side === homeName) || wbMatch(homeName, pick.side) || wbMatch(pick.side, homeName);
    }
    const pickedScore = isHome ? hs  : as2;
    const oppScore    = isHome ? as2 : hs;

    if (pick.type === 'moneyline') {
      if (pickedScore > oppScore)      pick.result = 'won';
      else if (pickedScore < oppScore) pick.result = 'lost';
      else                             pick.result = 'push';
      return true;
    }

    let line;
    if (pick.line !== undefined && pick.line !== null && !isNaN(Number(pick.line))) {
      line = Number(pick.line);
    } else {
      const parts = (pick.description || '').trim().split(/\s+/);
      line = parseFloat(parts[parts.length - 1]);
    }

    if (isNaN(line) || Math.abs(line) >= 50) {
      if (pickedScore > oppScore)      pick.result = 'won';
      else if (pickedScore < oppScore) pick.result = 'lost';
      else                             pick.result = 'push';
      return true;
    }

    const adj = pickedScore + line;
    if (Math.abs(adj - oppScore) < 0.01) pick.result = 'push';
    else                                  pick.result = adj > oppScore ? 'won' : 'lost';
    return true;
  }

  return false;
}

function settleParlay(pick, scoreMap) {
  if (pick.type !== 'parlay') return false;
  let legs;
  try {
    legs = Array.isArray(pick.parlay_legs)
      ? pick.parlay_legs
      : (pick.parlay_legs ? JSON.parse(pick.parlay_legs) : null);
  } catch { return false; }
  if (!legs || !legs.length) return false;

  let allSettled = true;
  let anyLost    = false;

  for (const leg of legs) {
    const sc = scoreMap[leg.gameId || leg.game_id];
    if (!sc) { allSettled = false; continue; }

    const fakePick = {
      type:        leg.type || 'spread',
      side:        leg.side,
      description: leg.description,
      line:        leg.line,
      isHomeTeam:  leg.isHomeTeam,
      result:      'pending',
    };
    settleSpreadOrTotal(fakePick, sc.hs, sc.as2, sc.homeName, sc.awayName);
    if (normalizeResult(fakePick.result) === 'pending') allSettled = false;
    if (normalizeResult(fakePick.result) === 'lost')    anyLost    = true;
  }

  if (!allSettled && !anyLost) return false;
  pick.result = anyLost ? 'lost' : 'won';
  return true;
}

async function settlePropPicks(propPicks, gameId, sport, league) {
  const lg = LEAGUES.find(x => x.league === league && x.sport === sport)
          || LEAGUES.find(x => x.sport  === sport);
  if (!lg) return 0;

  const data = await espnFetch(`${ESPN}/${lg.sport}/${lg.league}/summary?event=${gameId}`);
  if (!data) return 0;

  const athletes = [];
  (data.boxscore?.players || []).forEach(teamBlock => {
    (teamBlock.statistics || []).forEach(statGroup => {
      (statGroup.athletes || []).forEach(ath => {
        athletes.push({
          id:    String(ath.athlete?.id || ''),
          stats: ath.stats      || [],
          keys:  statGroup.keys || [],
        });
      });
    });
  });

  const STAT_ALIASES = {
    pts:   ['pts', 'points', 'PTS'],
    reb:   ['reb', 'rebounds', 'REB'],
    ast:   ['ast', 'assists', 'AST'],
    stl:   ['stl', 'steals', 'STL'],
    blk:   ['blk', 'blocks', 'BLK'],
    g:     ['g', 'goals', 'G'],
    a:     ['a', 'assists', 'A'],
    shots: ['shots', 'SOG', 'shotsOnGoal'],
    h:     ['h', 'hits', 'H'],
    hr:    ['hr', 'homeRuns', 'HR'],
    rbi:   ['rbi', 'RBI'],
  };

  function getStatVal(keys, stats, statKey) {
    const aliases = STAT_ALIASES[statKey] || [statKey];
    for (const alias of aliases) {
      const idx = keys.findIndex(k => k.toLowerCase() === alias.toLowerCase());
      if (idx >= 0 && stats[idx] !== undefined) {
        return parseFloat(String(stats[idx]).replace(/[^0-9.]/g, ''));
      }
    }
    return NaN;
  }

  let settled = 0;
  for (const pick of propPicks) {
    const playerId = String(pick.player_id || pick.playerId || '');
    if (!playerId) continue;
    const ath = athletes.find(a => a.id === playerId);
    if (!ath) continue;
    const finalVal = getStatVal(ath.keys, ath.stats, pick.stat_key || pick.statKey || '');
    if (isNaN(finalVal)) continue;
    const line = pick.line;
    if (Math.abs(finalVal - line) < 0.01) pick.result = 'push';
    else if (pick.side === 'over')         pick.result = finalVal > line ? 'won' : 'lost';
    else                                   pick.result = finalVal < line ? 'won' : 'lost';
    settled++;
  }
  return settled;
}

// ── Update user_ratings via RPC (avoids UUID/text cast issues) ─────────────

async function updateUserRatings(affectedUserIds) {
  for (const userId of affectedUserIds) {
    try {
      // Fetch all picks for this user
      const picks = await supaFetch(
        `/rest/v1/user_picks?user_id=eq.${userId}&select=result,type&limit=5000`
      );
      if (!picks || !picks.length) continue;

      const singles = picks.filter(p => p.type !== 'parlay');
      const wins    = singles.filter(p => normalizeResult(p.result) === 'won').length;
      const losses  = singles.filter(p => normalizeResult(p.result) === 'lost').length;
      const pushes  = singles.filter(p => normalizeResult(p.result) === 'push').length;
      const pending = picks.filter(p => normalizeResult(p.result) === 'pending').length;
      const record  = `${wins}-${losses}-${pushes}`;

      // Use RPC so Postgres handles the UUID cast internally
      await supaFetch(`/rest/v1/rpc/update_user_record`, {
        method: 'POST',
        body: JSON.stringify({
          p_user_id: userId,
          p_record:  record,
          p_pending: pending,
        }),
      });

      console.log(`[settle-picks] ✓ Updated ratings for ${userId}: ${record}, pending: ${pending}`);
    } catch (e) {
      console.warn(`[settle-picks] Failed to update ratings for ${userId}:`, e.message);
    }
  }
}

// ── Main settler ───────────────────────────────────────────────────────────

async function settleAllPendingPicks() {
  // 1. Fetch all pending picks
  const allPending = await supaFetch(
    `/rest/v1/user_picks?result=eq.pending&select=*&limit=5000`
  );
  if (!allPending || !allPending.length) {
    return { checked: 0, settled: 0, users: 0, message: 'No pending picks found' };
  }
  console.log(`[settle-picks] Found ${allPending.length} pending picks`);

  // 2. Collect all unique game IDs
  const uniqueGameIds = [...new Set(
    allPending.map(p => p.actual_game_id || p.game_id).filter(Boolean)
  )];
  console.log(`[settle-picks] Resolving ${uniqueGameIds.length} unique game IDs from ESPN`);

  // 3. Build a league hint map
  const gameLeagueHint = {};
  for (const pick of allPending) {
    const gid = pick.actual_game_id || pick.game_id;
    if (gid && !gameLeagueHint[gid]) {
      gameLeagueHint[gid] = pick.league || '';
    }
  }

  // 4. Fetch each game directly from ESPN by event ID
  const globalScoreMap = {};
  for (const gid of uniqueGameIds) {
    const sc = await fetchGameById(gid, gameLeagueHint[gid]);
    if (sc) {
      globalScoreMap[gid] = sc;
      console.log(`[settle-picks] ✓ ${gid}: ${sc.awayName} ${sc.as2} @ ${sc.homeName} ${sc.hs}`);
    } else {
      console.log(`[settle-picks] ✗ ${gid}: not final or not found`);
    }
  }
  console.log(`[settle-picks] ${Object.keys(globalScoreMap).length}/${uniqueGameIds.length} games are final`);

  // 5. Separate picks by type
  const spreadTotalPicks = allPending.filter(p => p.type !== 'prop' && p.type !== 'parlay');
  const propPicks        = allPending.filter(p => p.type === 'prop');
  const parlayPicks      = allPending.filter(p => p.type === 'parlay');

  const toUpdate = [];

  // 6. Settle spread / moneyline / total picks
  for (const pick of spreadTotalPicks) {
    const sc = globalScoreMap[pick.actual_game_id || pick.game_id];
    if (!sc) continue;

    const fakePick = {
      type:        pick.type,
      side:        pick.side,
      description: pick.description,
      line:        pick.line,
      isHomeTeam:  pick.is_home_team,
      result:      'pending',
    };

    if ((fakePick.line === undefined || fakePick.line === null) && sc.oddsDetails) {
      const parts     = sc.oddsDetails.trim().split(/\s+/);
      const token     = (parts[0] || '').toUpperCase();
      const oddsNum   = parseFloat(parts[parts.length - 1]);
      if (!isNaN(oddsNum)) {
        const sideStr   = fakePick.side || '';
        const isHome    = sideStr === sc.homeName || wbMatch(sc.homeName, sideStr) || wbMatch(sideStr, sc.homeName);
        const tokenHome = token === sc.homeAbbr || sc.homeName.toUpperCase().startsWith(token);
        const tokenAway = token === sc.awayAbbr || sc.awayName.toUpperCase().startsWith(token);
        fakePick.isHomeTeam = isHome;
        fakePick.line = isHome
          ? (tokenHome ? oddsNum : (tokenAway ? -oddsNum : oddsNum))
          : (tokenAway ? oddsNum : (tokenHome ? -oddsNum : oddsNum));
      }
    }

    const settled = settleSpreadOrTotal(fakePick, sc.hs, sc.as2, sc.homeName, sc.awayName);
    if (settled && normalizeResult(fakePick.result) !== 'pending') {
      toUpdate.push({
        id:          pick.id,
        result:      fakePick.result,
        settled_at:  Date.now(),
        final_score: `${sc.awayName} ${sc.as2} - ${sc.homeName} ${sc.hs}`,
        user_id:     pick.user_id,
      });
    }
  }

  // 7. Settle parlay picks
  for (const pick of parlayPicks) {
    let legs;
    try {
      legs = Array.isArray(pick.parlay_legs)
        ? pick.parlay_legs
        : JSON.parse(pick.parlay_legs || '[]');
    } catch { legs = []; }

    for (const leg of legs) {
      const lgid = leg.gameId || leg.game_id;
      if (lgid && !globalScoreMap[lgid]) {
        const sc = await fetchGameById(lgid, leg.league || '');
        if (sc) globalScoreMap[lgid] = sc;
      }
    }

    const settled = settleParlay(pick, globalScoreMap);
    if (settled && normalizeResult(pick.result) !== 'pending') {
      toUpdate.push({
        id:         pick.id,
        result:     pick.result,
        settled_at: Date.now(),
        user_id:    pick.user_id,
      });
    }
  }

  // 8. Settle prop picks grouped by game ID
  const propsByGame = {};
  for (const pick of propPicks) {
    const gid = String(pick.actual_game_id || pick.game_id || '');
    if (!gid) continue;
    const sc = globalScoreMap[gid];
    if (!sc) continue;
    if (!propsByGame[gid]) propsByGame[gid] = { picks: [], sport: sc.sport, league: sc.league };
    propsByGame[gid].picks.push(pick);
  }

  for (const [gid, { picks: gPicks, sport, league }] of Object.entries(propsByGame)) {
    await settlePropPicks(gPicks, gid, sport, league);
    for (const pick of gPicks) {
      if (normalizeResult(pick.result) !== 'pending') {
        toUpdate.push({
          id:         pick.id,
          result:     pick.result,
          settled_at: Date.now(),
          user_id:    pick.user_id,
        });
      }
    }
  }

  // 9. Write results to Supabase one pick at a time using PATCH
  let written = 0;
  for (const r of toUpdate) {
    try {
      await supaFetch(`/rest/v1/user_picks?id=eq.${r.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          result:      r.result,
          settled_at:  r.settled_at,
          ...(r.final_score ? { final_score: r.final_score } : {}),
        }),
      });
      written++;
      console.log(`[settle-picks] ✓ Settled pick ${r.id} → ${r.result}`);
    } catch (e) {
      console.error(`[settle-picks] Failed to update pick ${r.id}:`, e.message);
    }
  }

  // 10. Update user_ratings directly with correct record + pending count
  const affectedUsers = [...new Set(toUpdate.map(r => r.user_id))];
  if (affectedUsers.length > 0) {
    console.log(`[settle-picks] Updating ratings for ${affectedUsers.length} users...`);
    await updateUserRatings(affectedUsers);
  }

  // 11. Log to settlement_log
  try {
    await supaFetch(`/rest/v1/settlement_log`, {
      method: 'POST',
      body:   JSON.stringify([{
        run_at:        new Date().toISOString(),
        picks_checked: allPending.length,
        picks_settled: written,
        errors:        null,
      }]),
    });
  } catch (e) {
    console.warn('[settle-picks] Could not write to settlement_log:', e.message);
  }

  // 12. Trigger on-pick-settled for full rating recalc per user
  console.log(`[settle-picks] Triggering full rating recalc for ${affectedUsers.length} users`);
  for (const userId of affectedUsers) {
    try {
      await fetch('https://getsharppick.com/.netlify/functions/on-pick-settled', {
        method:  'POST',
        headers: {
          'Content-Type':     'application/json',
          'x-webhook-secret': process.env.WEBHOOK_SECRET || '',
        },
        body: JSON.stringify({
          type:   'UPDATE',
          table:  'user_picks',
          schema: 'public',
          record: { user_id: userId, result: 'won' },
        }),
      });
    } catch (e) {
      console.warn(`[settle-picks] Rating trigger failed for ${userId}:`, e.message);
    }
  }

  return {
    checked: allPending.length,
    settled: written,
    users:   affectedUsers.length,
    message: `Settled ${written} of ${allPending.length} pending picks for ${affectedUsers.length} users`,
  };
}

// ── Netlify handler ────────────────────────────────────────────────────────

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  if (SETTLE_SECRET) {
    const incoming = event.headers['x-settle-secret']
                  || event.headers['authorization']?.replace('Bearer ', '');
    if (incoming !== SETTLE_SECRET) {
      console.warn('[settle-picks] Rejected — bad secret');
      return { statusCode: 401, body: 'Unauthorized' };
    }
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { statusCode: 500, body: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' };
  }

  try {
    console.log('[settle-picks] Starting settlement run...');
    const result = await settleAllPendingPicks();
    console.log('[settle-picks] Done:', result.message);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };
  } catch (e) {
    console.error('[settle-picks] Fatal error:', e.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: e.message }),
    };
  }
};
