/**
 * SharpPick — Server-Side Pick Settler
 * netlify/functions/settle-picks.js
 *
 * Runs on a schedule (every hour via Supabase pg_cron) OR can be triggered manually.
 * Fetches ESPN final scores and grades ALL users' pending picks server-side.
 *
 * Settlement logic mirrors app.js: _settlePickAgainstScore, checkPropPickResults,
 * and _fetchAndResettleHistoricalPicksInner — ported to Node.js.
 *
 * Setup (one-time):
 *   1. Deploy this file to netlify/functions/settle-picks.js
 *   2. Update your Supabase cron job (job id=3) URL to:
 *      https://getsharppick.com/.netlify/functions/settle-picks
 *   3. Add SETTLE_SECRET to Netlify environment variables (any random string)
 *   4. Update the cron job headers to include: { "x-settle-secret": "<your secret>" }
 *
 * Environment variables required:
 *   SUPABASE_URL              — your Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — service role key (bypasses RLS)
 *   SETTLE_SECRET             — optional shared secret to prevent unauthorized calls
 */

const SUPABASE_URL             = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SETTLE_SECRET            = process.env.SETTLE_SECRET || '';

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';

const LEAGUES = [
  { sport: 'basketball', league: 'nba',                     label: 'NBA',        labelFull: 'NBA 🏀'        },
  { sport: 'football',   league: 'nfl',                     label: 'NFL',        labelFull: 'NFL 🏈'        },
  { sport: 'baseball',   league: 'mlb',                     label: 'MLB',        labelFull: 'MLB ⚾'        },
  { sport: 'hockey',     league: 'nhl',                     label: 'NHL',        labelFull: 'NHL 🏒'        },
  { sport: 'football',   league: 'college-football',        label: 'NCAAF',      labelFull: 'NCAAF 🏈'      },
  { sport: 'basketball', league: 'mens-college-basketball', label: 'NCAAB',      labelFull: 'NCAAB 🏀'      },
  { sport: 'soccer',     league: 'usa.1',                   label: 'MLS',        labelFull: 'MLS ⚽'        },
  { sport: 'soccer',     league: 'eng.1',                   label: 'EPL',        labelFull: 'EPL ⚽'        },
  { sport: 'soccer',     league: 'uefa.champions',          label: 'UCL',        labelFull: 'UCL ⚽'        },
  { sport: 'soccer',     league: 'esp.1',                   label: 'La Liga',    labelFull: 'La Liga ⚽'    },
  { sport: 'soccer',     league: 'ger.1',                   label: 'Bundesliga', labelFull: 'Bundesliga ⚽' },
  { sport: 'soccer',     league: 'ita.1',                   label: 'Serie A',    labelFull: 'Serie A ⚽'    },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function supaHeaders() {
  return {
    apikey:        SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    Prefer:        'return=minimal',
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

/** Fetch a URL from ESPN. No proxy needed server-side (no CORS restrictions). */
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
  if (s === 'won' || s === 'win' || s === 'w') return 'won';
  if (s === 'lost' || s === 'loss' || s === 'l') return 'lost';
  if (s === 'push' || s === 'tie' || s === 'p') return 'push';
  return 'pending';
}

function ymd(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/** Resolve league from pick's league/leagueLabel string */
function resolveLeague(pick) {
  const raw = (pick.league || pick.leagueLabel || '').replace(/\s*[🏀🏈⚾🏒⚽]/g, '').trim().toLowerCase();
  return LEAGUES.find(x =>
    x.label.toLowerCase() === raw ||
    x.labelFull.toLowerCase().replace(/\s*[🏀🏈⚾🏒⚽]/g, '').trim() === raw ||
    raw.includes(x.league.toLowerCase()) ||
    raw.includes(x.label.toLowerCase()) ||
    x.label.toLowerCase().includes(raw)
  ) || null;
}

// ── Core settlement logic (mirrors app.js _settlePickAgainstScore) ─────────

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

    // Spread
    let line;
    if (pick.line !== undefined && pick.line !== null && !isNaN(Number(pick.line))) {
      line = Number(pick.line);
    } else {
      const parts = (pick.description || '').trim().split(/\s+/);
      line = parseFloat(parts[parts.length - 1]);
    }

    if (isNaN(line) || Math.abs(line) >= 50) {
      // Treat as moneyline
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

// ── Settle parlay picks ────────────────────────────────────────────────────

function settleParlay(pick, scoreMap) {
  if (pick.type !== 'parlay') return false;
  let legs;
  try {
    legs = Array.isArray(pick.parlay_legs) ? pick.parlay_legs
      : (pick.parlay_legs ? JSON.parse(pick.parlay_legs) : null);
  } catch { return false; }
  if (!legs || !legs.length) return false;

  let allSettled = true;
  let anyLost = false;

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
    if (normalizeResult(fakePick.result) === 'pending') { allSettled = false; }
    if (normalizeResult(fakePick.result) === 'lost')    { anyLost = true; }
  }

  if (!allSettled && !anyLost) return false; // still waiting on games
  pick.result = anyLost ? 'lost' : 'won';
  return true;
}

// ── Settle prop picks via ESPN boxscore ────────────────────────────────────

async function settlePropPicks(propPicks, gameId, sport, league) {
  const lg = LEAGUES.find(x => x.league === league) ||
             LEAGUES.find(x => x.sport === sport);
  if (!lg) return 0;

  const data = await espnFetch(`${ESPN}/${lg.sport}/${lg.league}/summary?event=${gameId}`);
  if (!data) return 0;

  // Parse boxscore athletes
  const athletes = [];
  (data.boxscore?.players || []).forEach(teamBlock => {
    (teamBlock.statistics || []).forEach(statGroup => {
      (statGroup.athletes || []).forEach(ath => {
        athletes.push({ id: String(ath.athlete?.id || ''), stats: ath.stats || [], keys: statGroup.keys || [] });
      });
    });
  });

  // Stat key aliases matching app.js SPORT_STAT_CONFIGS
  const STAT_ALIASES = {
    pts: ['pts', 'points', 'PTS'],
    reb: ['reb', 'rebounds', 'REB'],
    ast: ['ast', 'assists', 'AST'],
    stl: ['stl', 'steals', 'STL'],
    blk: ['blk', 'blocks', 'BLK'],
    g:   ['g', 'goals', 'G'],
    a:   ['a', 'assists', 'A'],
    shots: ['shots', 'SOG', 'shotsOnGoal'],
    h:   ['h', 'hits', 'H'],
    hr:  ['hr', 'homeRuns', 'HR'],
    rbi: ['rbi', 'RBI'],
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

// ── Main settler ───────────────────────────────────────────────────────────

async function settleAllPendingPicks() {
  // 1. Fetch all pending picks across all users
  const allPending = await supaFetch(
    `/rest/v1/user_picks?result=eq.pending&select=*&limit=5000`
  );
  if (!allPending || !allPending.length) {
    return { checked: 0, settled: 0, message: 'No pending picks found' };
  }

  console.log(`[settle-picks] Found ${allPending.length} pending picks across all users`);

  // 2. Separate picks by type
  const spreadTotalPicks = allPending.filter(p => p.type !== 'prop' && p.type !== 'parlay');
  const propPicks        = allPending.filter(p => p.type === 'prop');
  const parlayPicks      = allPending.filter(p => p.type === 'parlay');

  // 3. Group spread/total picks by league + date window to minimize ESPN calls
  //    FIX: Use game_date (when the game is played) not made_at (when the pick was made)
  const groups = {};
  for (const pick of spreadTotalPicks) {
    const lg = resolveLeague(pick);
    if (!lg) continue;

    const raw = pick.game_date || pick.game_time || pick.event_date || pick.scheduled_at || pick.made_at || Date.now();
    const baseMs = typeof raw === 'number' && raw < 2e12 ? raw : parseInt(raw) || Date.now();
    const dates = [
      ymd(baseMs - 86400000),
      ymd(baseMs),
      ymd(baseMs + 86400000),
    ];
    for (const d of dates) {
      const key = `${lg.sport}|${lg.league}|${d}`;
      if (!groups[key]) groups[key] = { lg, date: d, picks: [] };
      if (!groups[key].picks.includes(pick)) groups[key].picks.push(pick);
    }
  }

  // Also group parlay picks the same way so we can build a shared scoreMap
  for (const pick of parlayPicks) {
    let legs;
    try { legs = Array.isArray(pick.parlay_legs) ? pick.parlay_legs : JSON.parse(pick.parlay_legs || '[]'); } catch { continue; }
    for (const leg of legs) {
      const legLeague = leg.league || '';
      const lg = LEAGUES.find(x => x.league === legLeague) || resolveLeague({ league: legLeague });
      if (!lg) continue;
      const ts = leg.gameDate ? parseInt(leg.gameDate) || Date.now() : Date.now();
      const d  = String(leg.gameDate || ymd(ts));
      const key = `${lg.sport}|${lg.league}|${d}`;
      if (!groups[key]) groups[key] = { lg, date: d, picks: [] };
    }
  }

  // 4. Fetch ESPN scoreboards and build a global scoreMap: gameId → scores
  const globalScoreMap = {};
  for (const [key, grp] of Object.entries(groups)) {
    const url = `${ESPN}/${grp.lg.sport}/${grp.lg.league}/scoreboard?dates=${grp.date}&limit=100`;
    const data = await espnFetch(url);
    if (!data?.events) continue;

    for (const ev of data.events) {
      const comp = ev?.competitions?.[0];
      if (!comp) continue;
      const st = comp.status?.type;
      if (st?.state !== 'post') continue; // only final games

      const home = comp.competitors?.find(c => c.homeAway === 'home') || {};
      const away = comp.competitors?.find(c => c.homeAway === 'away') || {};
      const hs   = parseInt(home.score);
      const as2  = parseInt(away.score);
      if (isNaN(hs) || isNaN(as2)) continue;

      globalScoreMap[ev.id] = {
        hs,
        as2,
        homeName: home.team?.shortDisplayName || home.team?.displayName || '',
        awayName: away.team?.shortDisplayName || away.team?.displayName || '',
        homeAbbr: (home.team?.abbreviation || '').toUpperCase(),
        awayAbbr: (away.team?.abbreviation || '').toUpperCase(),
        sport:    grp.lg.sport,
        league:   grp.lg.league,
        oddsDetails: comp.odds?.[0]?.details || null,
      };
    }
  }

  // 5. Settle spread/total picks
  const toUpdate = [];

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

    // Re-derive line from ESPN odds for legacy picks with no stored line
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
        id:           pick.id,
        result:       fakePick.result,
        settled_at:   Date.now(),
        final_score:  `${sc.awayName} ${sc.as2} - ${sc.homeName} ${sc.hs}`,
        user_id:      pick.user_id,
      });
    }
  }

  // 6. Settle parlay picks
  for (const pick of parlayPicks) {
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

  // 7. Settle prop picks (grouped by gameId)
  const propsByGame = {};
  for (const pick of propPicks) {
    const gid = String(pick.actual_game_id || pick.game_id || '');
    if (!gid) continue;
    const sc = globalScoreMap[gid];
    if (!sc) continue; // game not final yet
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

  // 8. Write results back to Supabase in batches of 50
  let written = 0;
  const BATCH = 50;
  for (let i = 0; i < toUpdate.length; i += BATCH) {
    const batch = toUpdate.slice(i, i + BATCH);
    try {
      await supaFetch(`/rest/v1/user_picks?on_conflict=id`, {
        method:  'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body:    JSON.stringify(batch.map(r => ({
          id:         r.id,
          result:     r.result,
          settled_at: r.settled_at,
          ...(r.final_score ? { final_score: r.final_score } : {}),
        }))),
      });
      written += batch.length;
      console.log(`[settle-picks] Wrote batch ${i / BATCH + 1}: ${batch.length} picks settled`);
    } catch (e) {
      console.error(`[settle-picks] Batch write failed:`, e.message);
    }
  }

  // 9. Log to settlement_log
  try {
    await supaFetch(`/rest/v1/settlement_log`, {
      method: 'POST',
      body:   JSON.stringify([{
        run_at:         new Date().toISOString(),
        picks_checked:  allPending.length,
        picks_settled:  written,
        errors:         null,
      }]),
    });
  } catch (e) {
    console.warn('[settle-picks] Could not write to settlement_log:', e.message);
  }

  // 10. Trigger on-pick-settled for each affected user so ratings update
  const affectedUsers = [...new Set(toUpdate.map(r => r.user_id))];
  console.log(`[settle-picks] Triggering rating recalc for ${affectedUsers.length} users`);
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
    checked:  allPending.length,
    settled:  written,
    users:    affectedUsers.length,
    message:  `Settled ${written} of ${allPending.length} pending picks for ${affectedUsers.length} users`,
  };
}

// ── Netlify handler ────────────────────────────────────────────────────────

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  if (SETTLE_SECRET) {
    const incoming = event.headers['x-settle-secret'] || event.headers['authorization']?.replace('Bearer ', '');
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
