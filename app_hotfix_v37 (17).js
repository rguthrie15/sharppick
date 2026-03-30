// ═══════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════
const PROXIES      = ['', 'https://corsproxy.io/?url=', 'https://api.allorigins.win/raw?url='];
const ESPN         = 'https://site.api.espn.com/apis/site/v2/sports';

const LEAGUES = [
  {sport:'basketball',league:'nba',                    label:'NBA 🏀',       dot:'nba',    oddsKey:'basketball_nba'},
  {sport:'football',  league:'nfl',                    label:'NFL 🏈',       dot:'nfl',    oddsKey:'americanfootball_nfl'},
  {sport:'baseball',  league:'mlb',                    label:'MLB ⚾',       dot:'mlb',    oddsKey:'baseball_mlb'},
  {sport:'hockey',    league:'nhl',                    label:'NHL 🏒',       dot:'nhl',    oddsKey:'icehockey_nhl'},
  {sport:'football',  league:'college-football',       label:'NCAAF 🏈',     dot:'ncaa',   oddsKey:null},
  {sport:'basketball',league:'mens-college-basketball',label:'NCAAB 🏀',     dot:'ncaa',   oddsKey:null},
  {sport:'soccer',    league:'usa.1',                  label:'MLS ⚽',       dot:'soccer', oddsKey:'soccer_usa_mls'},
  {sport:'soccer',    league:'eng.1',                  label:'EPL ⚽',       dot:'soccer', oddsKey:'soccer_epl'},
  {sport:'soccer',    league:'uefa.champions',         label:'UCL ⚽',       dot:'soccer', oddsKey:'soccer_uefa_champs_league'},
  {sport:'soccer',    league:'esp.1',                  label:'La Liga ⚽',   dot:'soccer', oddsKey:'soccer_spain_la_liga'},
  {sport:'soccer',    league:'ger.1',                  label:'Bundesliga ⚽',dot:'soccer', oddsKey:'soccer_germany_bundesliga'},
  {sport:'soccer',    league:'ita.1',                  label:'Serie A ⚽',   dot:'soccer', oddsKey:'soccer_italy_serie_a'},
];
// ═══════════════════════════════════════════════════════
// EARLY GLOBALS (must be defined before any init/timers)
// ═══════════════════════════════════════════════════════
var HERO_DISMISSED_KEY = 'sharppick_hero_dismissed';
var ONBOARDED_KEY = 'livescore_onboarded_v1';
var PUSH_DISMISSED_KEY = 'push_prompt_dismissed';
var pushPermission = (typeof Notification !== 'undefined' && Notification && Notification.permission) ? Notification.permission : 'default';

// History UI state (must exist to avoid ReferenceError)
var histSearch = '';
var histFilterType = 'all';
var histFilterResult = 'all';
var histFilterLeague = 'all';
var histSortBy = 'recent';

// Sync state — hoisted to avoid TDZ errors when savePicks() runs during early init
var syncInProgress = false;
var lastSyncAt = 0;
var _pendingPickSync = false;
var _initialSyncDone = false;


// Sport → which stats columns to show in the player stats table
const SPORT_STAT_CONFIGS = {
  basketball: {
    cols: ['min','pts','reb','ast','stl','blk','to','fg'],
    labels: {min:'MIN',pts:'PTS',reb:'REB',ast:'AST',stl:'STL',blk:'BLK',to:'TO',fg:'FG'},
    propStats: ['pts','reb','ast'],
    // ESPN stat key → {label, fallbackLine} — real lines fetched per-player from season avgs
    propDefs: {pts:{label:'PTS',fb:14.5}, reb:{label:'REB',fb:5.5}, ast:{label:'AST',fb:3.5}},
  },
  football: {
    cols: ['pasYds','pasTD','passInt','rushYds','rushTD','recYds','recTD','rec'],
    labels: {pasYds:'PASS YDS',pasTD:'TD',passInt:'INT',rushYds:'RUSH YDS',rushTD:'TD',recYds:'REC YDS',recTD:'TD',rec:'REC'},
    propStats: ['pasYds','rushYds','recYds'],
    propDefs: {pasYds:{label:'PASS YDS',fb:220.5}, rushYds:{label:'RUSH YDS',fb:55.5}, recYds:{label:'REC YDS',fb:35.5}},
  },
  baseball: {
    cols: ['ab','h','r','hr','rbi','bb','so','avg'],
    labels: {ab:'AB',h:'H',r:'R',hr:'HR',rbi:'RBI',bb:'BB',so:'SO',avg:'AVG'},
    propStats: ['h','hr','rbi'],
    propDefs: {h:{label:'HITS',fb:0.5}, hr:{label:'HR',fb:0.5}, rbi:{label:'RBI',fb:0.5}},
  },
  hockey: {
    cols: ['g','a','pts','plusMinus','pim','shots','toi'],
    labels: {g:'G',a:'A',pts:'PTS',plusMinus:'+/-',pim:'PIM',shots:'SOG',toi:'TOI'},
    propStats: ['g','a','pts','shots'],
    propDefs: {g:{label:'GOALS',fb:0.5}, a:{label:'ASSISTS',fb:0.5}, pts:{label:'POINTS',fb:0.5}, shots:{label:'SHOTS',fb:2.5}},
  },
  soccer: {
    cols: ['goals','assists','shots','shotsOnTarget','fouls','yellowCards'],
    labels: {goals:'G',assists:'A',shots:'SHOTS',shotsOnTarget:'SOT',fouls:'FOULS',yellowCards:'YC'},
    propStats: ['goals','shots','shotsOnTarget'],
    propDefs: {goals:{label:'GOALS',fb:0.5}, shots:{label:'SHOTS',fb:2.5}, shotsOnTarget:{label:'SOT',fb:1.5}},
  },
};

// ═══════════════════════════════════════════════════════
// STATIC ODDS FALLBACK
// Typical lines used when ESPN & external API return nothing
// spread = favourite's typical cover line, total = typical game total
// ═══════════════════════════════════════════════════════
const STATIC_ODDS = {
  nba:                    { spread: '-3.5',  total: 'O/U 224.5' },
  nfl:                    { spread: '-3.0',  total: 'O/U 44.5'  },
  mlb:                    { spread: '-1.5',  total: 'O/U 8.5'   },
  nhl:                    { spread: '-1.5',  total: 'O/U 5.5'   },
  'college-football':     { spread: '-7.0',  total: 'O/U 48.5'  },
  'mens-college-basketball':{ spread:'-4.5', total: 'O/U 142.5' },
  'usa.1':                { spread: '-0.5',  total: 'O/U 2.5'   },
  'eng.1':                { spread: '-0.5',  total: 'O/U 2.5'   },
  'uefa.champions':       { spread: '-0.5',  total: 'O/U 2.5'   },
  'esp.1':                { spread: '-0.5',  total: 'O/U 2.5'   },
  'ger.1':                { spread: '-0.5',  total: 'O/U 2.5'   },
  'ita.1':                { spread: '-0.5',  total: 'O/U 2.5'   },
};

// ═══════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════
const cache      = {};
const inFlight   = {};
let prevScores   = {};
let allGames     = [];
// Keep window.allGames in sync for consistent cross-module access and debugging
Object.defineProperty(window, 'allGames', {
  get() { return allGames; },
  set(v) { allGames = v; },
  configurable: true
});
let activeTab    = 'all';
let appMode      = 'scores';
let selDate      = todayStr();
let weekOff      = 0;
let calMonth     = new Date();
let pollTimer    = null;
let suppressFullRender = false; // set true during schedulePoll to prevent fetchDate triggering a redundant fullRender flash
let oddsTimer    = null;       // separate odds-refresh timer
let propLinesTimer = null;     // prop-lines refresh for open modal
let prevOdds     = {};         // gameId → {spread,total} for change detection
let oddsHistory  = {};         // gameId → [{spread,total,ts}] for line movement
let prefetchQ    = [];
let prefetchBusy = false;
let currentUser  = null; // {name, id} — set after name modal (must be before picks)
let picks        = [];   // loaded properly in initUser() once currentUser is set
let goodProxy    = 0;

// Modal state
let openGameId     = null;
let modalTabActive = 'stats';
let modalStatData  = null;       // parsed player stats for open game
let modalPollTimer = null;       // auto-refresh when game is live

const SS_PREFIX = 'ls2_';
try{
  for(let i=0;i<sessionStorage.length;i++){
    const k=sessionStorage.key(i);
    if(k.startsWith(SS_PREFIX)){
      const ds=k.slice(SS_PREFIX.length);
      cache[ds]=JSON.parse(sessionStorage.getItem(k));
    }
  }
}catch(e){}

// ═══════════════════════════════════════════════════════
// DATE UTILS
// ═══════════════════════════════════════════════════════
function todayStr(){return fmtD(new Date());}
function fmtD(d){return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;}
function pad(n){return String(n).padStart(2,'0');}
function parseD(s){return new Date(+s.slice(0,4),+s.slice(4,6)-1,+s.slice(6,8));}
function addDays(s,n){const d=parseD(s);d.setDate(d.getDate()+n);return fmtD(d);}

// ═══════════════════════════════════════════════════════
// HTTP
// ═══════════════════════════════════════════════════════
async function go(url,timeoutMs=8000){
  const order=[goodProxy,...PROXIES.map((_,i)=>i).filter(i=>i!==goodProxy)];
  for(const pi of order){
    const pfx=PROXIES[pi];
    try{
      const u=pfx?pfx+encodeURIComponent(url):url;
      const r=await Promise.race([fetch(u), timeoutPromise(timeoutMs)]);
      if(!r.ok) continue;
      const d=await r.json();
      if(d){goodProxy=pi;return d;}
    }catch{continue;}
  }
  return null;
}

// ═══════════════════════════════════════════════════════
// REQUEST CACHE / DEDUP LAYER
// Prevents duplicate in-flight requests and caches results with TTL.
// Includes a small localStorage-backed cache for "nice-to-have" data so repeat
// visits feel instant (injuries, weather, news, etc.).
// ═══════════════════════════════════════════════════════
const _reqCache = {};
const _LS_REQ_PREFIX = 'SP_REQCACHE:';
const _LS_MAX_BYTES = 250_000; // safeguard against blowing localStorage quota

function _lsGet(key){
  try{
    const raw = localStorage.getItem(_LS_REQ_PREFIX + key);
    if(!raw) return null;
    return JSON.parse(raw);
  }catch{ return null; }
}
function _lsSet(key, value){
  try{
    const raw = JSON.stringify(value);
    if(raw.length > _LS_MAX_BYTES) return; // too large, skip persistence
    localStorage.setItem(_LS_REQ_PREFIX + key, raw);
  }catch{ /* quota or serialization failure */ }
}
function _lsDel(key){
  try{ localStorage.removeItem(_LS_REQ_PREFIX + key); }catch{}
}

/**
 * cachedFetch(key, fetchFn, ttlMs, persist)
 * - In-memory cache + in-flight dedupe always on
 * - Optional localStorage persistence (persist=true) for small payloads
 */
async function cachedFetch(key, fetchFn, ttlMs=30000, persist=false) {
  const now = Date.now();

  // 1) Check in-memory cache
  if(_reqCache[key] && _reqCache[key].expiresAt > now && _reqCache[key].result !== undefined) {
    return _reqCache[key].result;
  }

  // 2) Check localStorage cache (if enabled)
  if(persist){
    const hit = _lsGet(key);
    if(hit && hit.expiresAt > now && hit.result !== undefined){
      _reqCache[key] = { result: hit.result, expiresAt: hit.expiresAt, promise: null };
      return hit.result;
    }
  }

  // 3) Return in-flight promise if one exists
  if(_reqCache[key] && _reqCache[key].promise) {
    return _reqCache[key].promise;
  }

  // 4) Start new request
  const promise = fetchFn().then(result => {
    const expiresAt = now + ttlMs;
    _reqCache[key] = { result, expiresAt, promise: null };
    if(persist) _lsSet(key, { result, expiresAt });
    return result;
  }).catch(err => {
    delete _reqCache[key];
    if(persist) _lsDel(key);
    throw err;
  });

  _reqCache[key] = { promise, expiresAt: 0, result: undefined };
  return promise;
}

function invalidateCache(keyPrefix) {
  Object.keys(_reqCache).forEach(k => { if(k.startsWith(keyPrefix)) delete _reqCache[k]; });
  try{
    Object.keys(localStorage).forEach(k=>{
      if(k.startsWith(_LS_REQ_PREFIX + keyPrefix)) localStorage.removeItem(k);
    });
  }catch{}
}

// ═══════════════════════════════════════════════════════
// ESPN PARSE — scoreboard
// ═══════════════════════════════════════════════════════
function parseGames(data,lg,sp,dot,label){
  return(data.events||[]).map(ev=>{
    const comp=ev?.competitions?.[0]; if(!comp) return null;
    const cs=comp.competitors||[];
    const home=cs.find(c=>c.homeAway==='home')||cs[0]||{};
    const away=cs.find(c=>c.homeAway==='away')||cs[1]||{};
    const st=comp.status?.type;
    const isLive=st?.state==='in',isFinal=st?.state==='post',isPre=st?.state==='pre';
    const hs=parseInt(home.score),as2=parseInt(away.score);
    const hw=isFinal&&hs>as2,aw=isFinal&&as2>hs;
    const eo=comp.odds?.[0]||{};
    return{
      id:ev.id,sport:sp,league:lg,dot,leagueLabel:label,
      isLive,isFinal,isPre,
      statusText:st?.shortDetail||st?.description||'',
      startTime:ev.date?new Date(ev.date).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'',
      rawDate:ev.date||null,
      home:{name:home.team?.shortDisplayName||home.team?.displayName||'Home',abbr:home.team?.abbreviation||'?',logo:home.team?.logo||null,id:home.team?.id||null,score:isNaN(hs)?'—':hs,record:home.records?.[0]?.summary||'',winner:hw,loser:isFinal&&!hw},
      away:{name:away.team?.shortDisplayName||away.team?.displayName||'Away',abbr:away.team?.abbreviation||'?',logo:away.team?.logo||null,id:away.team?.id||null,score:isNaN(as2)?'—':as2,record:away.records?.[0]?.summary||'',winner:aw,loser:isFinal&&!aw},
      odds:parseOdds(eo, sp, lg),
    };
  }).filter(Boolean);
}

// Parse ESPN odds object — handles spread, moneyline, run line, puck line, and totals
function parseOdds(eo, sport, league){
  if(!eo) return {spread:null,total:null,src:null};
  let spread=null, total=null, src=null;

  // Total / over-under
  if(eo.overUnder!=null) { total=`O/U ${eo.overUnder}`; src='espn'; }

  // Spread / details — ESPN uses 'details' for point spread string e.g. "LAD -1.5"
  if(eo.details) { spread=eo.details; src='espn'; }

  // Baseball run line / hockey puck line come through as 'homeTeamOdds.spreadOdds' etc.
  // Also try awayTeamOdds
  if(!spread){
    const hOdds=eo.homeTeamOdds||{}, aOdds=eo.awayTeamOdds||{};
    const hSpread=hOdds.spreadOdds||hOdds.spread||hOdds.moneyLine;
    const aSpread=aOdds.spreadOdds||aOdds.spread||aOdds.moneyLine;
    if(hSpread!=null||aSpread!=null){
      // show favourite's spread
      const favLine=hOdds.favorite ? (hSpread>0?`+${hSpread}`:String(hSpread))
                                   : (aSpread>0?`+${aSpread}`:String(aSpread));
      spread=favLine; src='espn';
    }
  }

  // Moneyline fallback (use awayTeamOdds.moneyLine / homeTeamOdds.moneyLine)
  // Don't override a real spread with a moneyline

  return {spread, total, src};
}


// ═══════════════════════════════════════════════════════
async function fetchGameStats(game){
  // Use cached/deduped fetch — 30s TTL for live, 5min for pre-game
  const ttl = game.isLive ? 30000 : 300000;
  return cachedFetch(`stats:${game.id}`, () => _fetchGameStatsImpl(game), ttl);
}
async function _fetchGameStatsImpl(game){
  const lg=LEAGUES.find(l=>l.league===game.league);
  if(!lg) return null;
  const cfg=SPORT_STAT_CONFIGS[game.sport]||SPORT_STAT_CONFIGS.basketball;

  // Always fetch summary endpoint first — it works, it's reliable, and for pre-game
  // it contains roster + season leaders. The per-athlete/statistics endpoint 404s.
  const summaryData = await go(`${ESPN}/${lg.sport}/${lg.league}/summary?event=${game.id}`, 10000);

  if(game.isPre){
    if(summaryData){
      // Extract roster + season avgs from summary's leaders and roster sections
      const teams = parsePreGameRosterFromSummary(summaryData, game, cfg);
      if(teams && teams.length) return {teams, cfg, preGame:true};
    }
    // Fallback to roster endpoint (gets names but no stats — still better than synthetic)
    const [awayRoster, homeRoster] = await Promise.all([
      fetchTeamRoster(lg.sport, lg.league, game.away.id, game.away.name, game.away.logo),
      fetchTeamRoster(lg.sport, lg.league, game.home.id, game.home.name, game.home.logo),
    ]);
    const teams=[];
    if(awayRoster) teams.push(awayRoster);
    if(homeRoster) teams.push(homeRoster);
    if(!teams.length){
      teams.push(makeSyntheticRoster(game.away.name, game.away.logo, cfg));
      teams.push(makeSyntheticRoster(game.home.name, game.home.logo, cfg));
    }
    return {teams, cfg, preGame:true};

  } else {
    // Live/Final: boxscore in summary
    if(summaryData){
      const parsed=parseSummaryStats(summaryData, game.sport, cfg);
      if(parsed) return parsed;
    }
    // Fallback
    const [awayRoster, homeRoster] = await Promise.all([
      fetchTeamRoster(lg.sport, lg.league, game.away.id, game.away.name, game.away.logo),
      fetchTeamRoster(lg.sport, lg.league, game.home.id, game.home.name, game.home.logo),
    ]);
    const teams=[];
    if(awayRoster) teams.push(awayRoster);
    if(homeRoster) teams.push(homeRoster);
    if(!teams.length){
      teams.push(makeSyntheticRoster(game.away.name, game.away.logo, cfg));
      teams.push(makeSyntheticRoster(game.home.name, game.home.logo, cfg));
    }
    return {teams, cfg, preGame:false};
  }
}

// Extract player roster + season averages from the game summary endpoint
// ESPN summary contains: rosters[]{team, athletes[]} AND leaders[]{leaders[]{athlete, statistics[]}}
function parsePreGameRosterFromSummary(data, game, cfg){
  const teams = [];

  // ── Path 1: summary.rosters[]{team, athletes[{athlete, statistics[]}]} ──
  const rosters = data.rosters || [];
  rosters.forEach(r=>{
    const tInfo = r.team || {};
    const players = [];
    (r.athletes || []).forEach(entry=>{
      const ath = entry.athlete || entry;
      const name = ath.displayName || ath.fullName || ath.shortName || '';
      if(!name || name.length < 2) return;
      // Extract season avgs directly from the athlete entry in rosters
      const seasonAvgs = {};
      // Try entry.statistics[] — ESPN sometimes embeds per-player stats here
      (entry.statistics || []).forEach(s=>{
        const key = (s.name||s.abbreviation||'').toLowerCase().replace(/[^a-z0-9]/g,'');
        const val = s.displayValue || s.value;
        if(key && val && val !== '--') seasonAvgs[key] = val;
      });
      players.push({
        id: String(ath.id || Math.random().toString(36).slice(2)),
        name,
        position: (ath.position?.abbreviation || ath.position?.name || '').slice(0,3).toUpperCase(),
        headshot: ath.headshot?.href || null,
        active: true,
        seasonAvgs,
      });
    });
    if(players.length){
      teams.push({
        name: tInfo.shortDisplayName || tInfo.displayName || tInfo.name || '',
        logo: tInfo.logo || null,
        players: players.slice(0, 12),
      });
    }
  });

  // ── Path 2: summary.leaders[] — top statistical leaders with season avgs ──
  // Use leaders to ENRICH players found in rosters, or build a standalone list
  const leaderMap = {}; // athleteId -> {pts, reb, ast, ...}
  (data.leaders || []).forEach(catLeader=>{
    const statName = (catLeader.name||catLeader.displayName||'').toLowerCase().replace(/[^a-z0-9]/g,'');
    (catLeader.leaders || []).forEach(l=>{
      const ath = l.athlete || {};
      const id = String(ath.id || '');
      if(!id) return;
      if(!leaderMap[id]) leaderMap[id] = { _name: ath.displayName||'', _pos: ath.position?.abbreviation||'', _logo: ath.headshot?.href||null, _team: ath.team?.displayName||'' };
      // Map ESPN stat category names to our keys
      const val = l.displayValue || l.value;
      leaderMap[id][statName] = val;
    });
  });

  // Enrich roster players with leader data
  teams.forEach(team=>{
    team.players.forEach(p=>{
      const ldata = leaderMap[p.id];
      if(ldata) Object.assign(p.seasonAvgs, ldata);
    });
  });

  // If rosters path gave nothing, build teams from leaders alone
  if(!teams.length && Object.keys(leaderMap).length){
    const byTeam = {};
    Object.entries(leaderMap).forEach(([id, ldata])=>{
      const teamName = ldata._team || 'Team';
      if(!byTeam[teamName]) byTeam[teamName] = [];
      byTeam[teamName].push({
        id, name: ldata._name, position: ldata._pos,
        headshot: ldata._logo, active:true, seasonAvgs: ldata,
      });
    });
    Object.entries(byTeam).forEach(([tName, players])=>{
      teams.push({name:tName, logo:null, players});
    });
  }

  // ── Path 3: summary.boxscore.players — pre-game sometimes has projected lineups ──
  if(!teams.length){
    const fromBoxscore = parseSummaryStats(data, game.sport, cfg);
    if(fromBoxscore && fromBoxscore.teams) return fromBoxscore.teams;
  }

  return teams;
}

// enrichTeamsWithSeasonStats: DISABLED — athletes/statistics endpoint returns 404
// Kept as no-op to avoid breaking any call sites
async function enrichTeamsWithSeasonStats(teams, sport, league, cfg){
  // No-op: per-athlete statistics endpoint (athletes/{id}/statistics) returns 404
  // Season avgs are now extracted directly from the summary endpoint
}

// Build a synthetic roster with generic player slots so the props tab always renders
function makeSyntheticRoster(teamName, teamLogo, cfg){
  const positions = {
    basketball:['PG','SG','SF','PF','C','PG','SG','SF'],
    football:  ['QB','RB','WR','WR','TE','RB','WR','OL'],
    baseball:  ['CF','SS','1B','DH','RF','3B','LF','2B','C','SP'],
    hockey:    ['LW','C','RW','D','D','G','LW','C'],
    soccer:    ['FW','FW','MF','MF','MF','DF','DF','GK'],
  };
  const sport = cfg === SPORT_STAT_CONFIGS.basketball ? 'basketball'
    : cfg === SPORT_STAT_CONFIGS.football ? 'football'
    : cfg === SPORT_STAT_CONFIGS.baseball ? 'baseball'
    : cfg === SPORT_STAT_CONFIGS.hockey   ? 'hockey'
    : 'soccer';
  const pos = positions[sport] || positions.basketball;
  const players = pos.map((p,i)=>({
    id: `syn_${teamName}_${i}`,
    name: `${teamName} #${i+1}`,
    position: p,
    headshot: null,
    stats: {},
    active: true,
  }));
  return {name:teamName, logo:teamLogo, players, synthetic:true};
}

async function fetchTeamRoster(sport, league, teamId, teamName, teamLogo){
  if(!teamId) return null;
  return cachedFetch(`roster:${teamId}`, () => _fetchTeamRosterImpl(sport, league, teamId, teamName, teamLogo), 300000);
}
async function _fetchTeamRosterImpl(sport, league, teamId, teamName, teamLogo){
  const rawPlayers=[];

  // Primary: team roster endpoint
  const rosterData = await go(`${ESPN}/${sport}/${league}/teams/${teamId}/roster`, 8000);
  if(rosterData){
    const groups = rosterData.athletes || [];
    groups.forEach(group=>{
      (group.items || group.athletes || [group]).forEach(ath=>{
        // Handle both grouped format and flat format
        const a = ath.athlete || ath;
        const name = a.displayName || a.fullName || a.shortName || ath.displayName || '';
        if(!name || name.length < 2) return;
        rawPlayers.push({
          id: String(a.id || ath.id || Math.random().toString(36).slice(2)),
          name,
          position: ((a.position||ath.position)?.abbreviation || (a.position||ath.position)?.name || '').slice(0,3).toUpperCase(),
          headshot: (a.headshot || ath.headshot)?.href || null,
          active: true,
          seasonAvgs: {},
        });
      });
    });
  }

  // Fallback: team athletes endpoint (different structure)
  if(!rawPlayers.length){
    const teamData = await go(`${ESPN}/${sport}/${league}/teams/${teamId}?enable=roster,stats`, 8000);
    if(teamData){
      const athletes = teamData.team?.athletes || teamData.athletes || [];
      athletes.forEach(ath=>{
        const name = ath.displayName || ath.fullName || '';
        if(!name) return;
        rawPlayers.push({
          id: String(ath.id || Math.random().toString(36).slice(2)),
          name,
          position: (ath.position?.abbreviation || '').slice(0,3).toUpperCase(),
          headshot: ath.headshot?.href || null,
          active: true,
          seasonAvgs: {},
        });
      });
    }
  }

  if(!rawPlayers.length) return null;

    const top = rawPlayers.slice(0, 10);
  // athletes/{id}/statistics returns 404 — avgs come from summary endpoint

  const tInfo = rosterData?.team || {};
  return {
    name: tInfo.shortDisplayName || tInfo.displayName || teamName,
    logo: tInfo.logo || teamLogo,
    players: top,
  };
}


// Parse ESPN athlete statistics endpoint to extract per-game season averages
function parseAthleteSeasonAvgs(data, sport){
  if(!data) return {};
  const avgs={};

  // ESPN athlete/statistics endpoint returns:
  // data.splits.categories[] — each category has names[] + averages[] + totals[]
  // We want averages (per-game), never totals (cumulative)
  const cats = (data.splits && data.splits.categories) || data.categories || [];
  cats.forEach(cat=>{
    const names = cat.names || cat.labels || [];
    // Try averages first, then displayValues, never totals
    const vals = cat.averages || cat.displayValues || cat.stats || [];
    if(!vals.length) return;
    names.forEach((nm,i)=>{
      const key = nm.toLowerCase().replace(/[^a-z0-9]/g,'');
      const raw = vals[i];
      if(raw!=null && raw!=='--' && raw!=='' && String(raw)!=='0') avgs[key]=raw;
    });
  });

  // Also check data.athlete.statistics[] flat list (alternate endpoint format)
  const flatStats = data.athlete?.statistics || data.statistics || [];
  flatStats.forEach(s=>{
    const key = (s.name||s.abbreviation||s.displayName||'').toLowerCase().replace(/[^a-z0-9]/g,'');
    const val = s.displayValue || s.value;
    if(key && val!=null && val!=='--' && val!=='') avgs[key]=val;
  });

  // Debug: log first player's avgs so we can verify keys (remove after confirming)

  return avgs;
}

// Convert season average to a sportsbook-style prop line
// Sportsbooks typically shade lines 0.5-1.5 below the true average to create action on both sides
function avgToLine(avg){
  const n=parseFloat(avg);
  if(isNaN(n)||n<=0) return null;
  // Shade 5% below average (books set lines under the true avg to juice the over)
  // then round to nearest 0.5
  const shaded = n * 0.95;
  return Math.round(shaded * 2) / 2;
}

// Get the real prop line for a player+stat. Uses season avg if available, else fallback.
function getPlayerPropLine(player, statKey, cfg){
  const propDef = (cfg.propDefs||{})[statKey];
  if(!propDef) return 0.5;
  const avgs = player.seasonAvgs||{};

  // ESPN stat abbreviation keys (after .toLowerCase().replace(/[^a-z0-9]/g,''))
  const espnKeys = {
    // Basketball — abbreviations (boxscore) + full names (leaders/rosters)
    pts:  ['pts','points','ppg','pointspergame','avgpoints','scoringaverage'],
    reb:  ['reb','rebounds','rpg','reboundspergame','avgrebounds','totalrebounds','trb'],
    ast:  ['ast','assists','apg','assistspergame','avgassists'],
    stl:  ['stl','steals','avgsteals'],
    blk:  ['blk','blocks','avgblocks'],
    // Football
    pasYds:  ['pyds','passingyards','passyards','passingyardspergame','yds'],
    rushYds: ['ryds','rushingyards','rushyards','rushingyardspergame'],
    recYds:  ['recyds','receivingyards','recyards','receivingyardspergame'],
    // Baseball
    h:   ['h','hits','avg','battingaverage','ba'],
    hr:  ['hr','homeruns','homerun'],
    rbi: ['rbi','runsbattedin'],
    // Hockey
    g:    ['g','goals','goalspergame','avggoals'],
    a:    ['a','assists','assistspergame','avgassists'],
    shots:['sog','shots','shotsperga','shotattempts'],
    // Soccer
    goals:         ['goals','g','goalspergame'],
    shotsOnTarget: ['sot','shotsontarget'],
  }

  const keyVariants = espnKeys[statKey]||[statKey.toLowerCase()];
  for(const k of keyVariants){
    if(avgs[k]!=null){
      const line=avgToLine(avgs[k]);
      if(line!==null) return line;
    }
  }

  // No ESPN data — use position-based realistic defaults
  const posDefaults = {
    basketball: {
      PG:{pts:18.5,reb:4.5,ast:7.5}, SG:{pts:17.5,reb:4.0,ast:4.0},
      SF:{pts:16.5,reb:6.0,ast:3.5}, PF:{pts:14.5,reb:8.0,ast:2.5},
      C: {pts:13.5,reb:9.5,ast:2.0}, G: {pts:16.5,reb:4.0,ast:5.0},
      F: {pts:15.0,reb:6.5,ast:3.0}, _: {pts:14.5,reb:5.5,ast:3.5},
    },
    football: {
      QB:{pasYds:242.5,rushYds:18.5,recYds:0}, RB:{pasYds:0,rushYds:62.5,recYds:28.5},
      WR:{pasYds:0,rushYds:2.5,recYds:58.5},   TE:{pasYds:0,rushYds:1.5,recYds:42.5},
      _: {pasYds:0,rushYds:38.5,recYds:42.5},
    },
    baseball: { _:{h:0.5,hr:0.5,rbi:0.5} },
    hockey: {
      LW:{g:0.5,a:0.5,shots:2.5}, C:{g:0.5,a:0.5,shots:2.5},
      RW:{g:0.5,a:0.5,shots:2.5}, D:{g:0.5,a:0.5,shots:1.5},
      _: {g:0.5,a:0.5,shots:2.5},
    },
  };
  const sport = cfg===SPORT_STAT_CONFIGS.basketball?'basketball'
    :cfg===SPORT_STAT_CONFIGS.football?'football'
    :cfg===SPORT_STAT_CONFIGS.baseball?'baseball'
    :cfg===SPORT_STAT_CONFIGS.hockey?'hockey':'basketball';
  const pd = posDefaults[sport]||posDefaults.basketball;
  const pos = (player.position||'').toUpperCase();
  const posLine = (pd[pos]||pd[pos.slice(0,1)]||pd['_']||{})[statKey];
  return posLine!=null ? posLine : propDef.fb;
}

function parseSummaryStats(data, sport, cfg){
  if(!cfg) cfg=SPORT_STAT_CONFIGS[sport]||SPORT_STAT_CONFIGS.basketball;
  const teams=[];

  // Try boxscore (live/final)
  const boxscore=data.boxscore||data.boxScore;
  if(boxscore?.players?.length){
    (boxscore.players||[]).forEach(teamData=>{
      const teamInfo=teamData.team||{};
      const players=[];
      (teamData.statistics||[]).forEach(statGroup=>{
        const cols=statGroup.labels||[];
        (statGroup.athletes||[]).forEach(athData=>{
          const ath=athData.athlete||{};
          const vals=athData.stats||[];
          if(!vals.length) return;
          const stats={};
          cols.forEach((col,i)=>{ stats[col.toLowerCase().replace(/\s+/g,'_')]=vals[i]??'—'; });
          players.push({
            id: String(ath.id||Math.random().toString(36).slice(2)),
            name: ath.displayName||ath.shortName||'Unknown',
            position: ath.position?.abbreviation||'',
            headshot: ath.headshot?.href||null,
            stats: normalizeStats(stats, sport),
            active: athData.active!==false,
          });
        });
      });
      if(players.length) teams.push({name:teamInfo.shortDisplayName||teamInfo.displayName||'',logo:teamInfo.logo||null,players});
    });
    if(teams.length) return {teams,cfg,preGame:false};
  }

  // Try rosters (pre-game summary fallback)
  if(data.rosters?.length){
    (data.rosters||[]).forEach(rosterData=>{
      const teamInfo=rosterData.team||{};
      const players=[];
      (rosterData.athletes||[]).forEach(group=>{
        const list=group.athletes||group.items||(Array.isArray(group)?group:[]);
        list.forEach(athData=>{
          const ath=athData.athlete||athData||{};
          const name=ath.displayName||ath.shortName||ath.fullName||'';
          if(!name||name==='Unknown') return;
          players.push({
            id: String(ath.id||Math.random().toString(36).slice(2)),
            name,
            position: (ath.position?.abbreviation||ath.position?.name||'').slice(0,3),
            headshot: ath.headshot?.href||null,
            stats: {},
            active: true,
          });
        });
      });
      if(players.length) teams.push({name:teamInfo.shortDisplayName||teamInfo.displayName||'',logo:teamInfo.logo||null,players});
    });
    if(teams.length) return {teams,cfg,preGame:true};
  }

  return null;
}

function normalizeStats(raw, sport){
  // ESPN column names vary — map common variants to our standard keys
  const maps = {
    basketball: {
      'min':'min','pts':'pts','reb':'reb','ast':'ast','stl':'stl','blk':'blk',
      'to':'to','turnover':'to','fg':'fg',
      'fg%':'fg','fgm-a':'fg','fg-fga':'fg',
      'rebounds':'reb','assists':'ast','steals':'stl','blocks':'blk','points':'pts',
    },
    football: {
      'yds':'pasYds','att-cmp':'fg','td':'pasTD','int':'passInt',
      'car':'rushAtt','rushing_yds':'rushYds','rushing_td':'rushTD',
      'rec':'rec','receiving_yds':'recYds','receiving_td':'recTD',
      'passing_yds':'pasYds','pass_yards':'pasYds','rush_yards':'rushYds','rec_yards':'recYds',
    },
    baseball: {
      'ab':'ab','h':'h','r':'r','hr':'hr','rbi':'rbi','bb':'bb','k':'so','so':'so','avg':'avg',
    },
    hockey: {
      'g':'g','a':'a','pts':'pts','+/-':'plusMinus','pim':'pim','sog':'shots','toi':'toi',
      'goals':'g','assists':'a','plus_minus':'plusMinus',
    },
    soccer: {
      'g':'goals','a':'assists','sh':'shots','sog':'shotsOnTarget','f':'fouls','yc':'yellowCards',
      'goals':'goals','assists':'assists','shots':'shots',
    },
  };
  const map = maps[sport] || maps.basketball;
  const out = {};
  Object.entries(raw).forEach(([k,v])=>{
    const mapped = map[k] || map[k.toLowerCase()] || k;
    out[mapped] = v;
    // Also keep original key
    out[k] = v;
  });
  return out;
}

function getStatVal(stats, key){
  const val = stats[key];
  if(val === undefined || val === null) return '—';
  return val;
}

// ═══════════════════════════════════════════════════════
// EXTERNAL ODDS
// ═══════════════════════════════════════════════════════
// ─── ODDS POLLING ───────────────────────────────────────
// Fetches external odds (The Odds API) and also re-reads ESPN scoreboard odds.
// Called once on init, then on a 3-min timer.  Surgically patches DOM so only
// changed pills flash — no full re-render needed.

function loadAllExternalOdds(){
  // Odds come from ESPN scoreboard directly — no external API needed
  // Just re-enrich games in case ESPN odds loaded after initial render
  if(cache[selDate]){
    const freshGames=enrichOdds(cache[selDate]);
    patchOddsDOM(freshGames);
    cache[selDate]=freshGames;
    allGames=freshGames;
  }
}

// Surgically update odds pills on score cards — only touches changed values
function patchOddsDOM(games){
  games.forEach(g=>{
    const prev=prevOdds[g.id]||{};
    const spreadChanged = g.odds.spread && g.odds.spread !== prev.spread;
    const totalChanged  = g.odds.total  && g.odds.total  !== prev.total;
    if(!spreadChanged && !totalChanged) return;

    const card=document.getElementById(`card-${g.id}`);
    if(!card) return;  // card not visible right now

    // Find or build the odds-bar
    let bar=card.querySelector('.odds-bar');
    if(!bar){
      // Card didn't have an odds bar — inject one before the pick section
      const pickSec=card.querySelector('.pick-section');
      const insertBefore=pickSec||null;
      bar=document.createElement('div');
      bar.className='odds-bar';
      card.insertBefore(bar, insertBefore);
    }

    // Rebuild bar HTML with flash classes on changed pills
    let html='';
    if(g.odds.spread){
      const cls=spreadChanged?'odds-updated':'';
      html+=`<div class="odds-pill ${cls}"><div class="odds-label">Spread</div><div class="odds-val ${cls}">${g.odds.spread}</div>${g.odds.src?`<div class="odds-src">${g.odds.src}</div>`:''}</div>`;
    }
    if(g.odds.total){
      const cls=totalChanged?'odds-updated':'';
      html+=`<div class="odds-pill ${cls}"><div class="odds-label">Total</div><div class="odds-val ${cls}">${g.odds.total}</div>${g.odds.src?`<div class="odds-src">${g.odds.src}</div>`:''}</div>`;
    }
    bar.innerHTML=html;

    // Remove flash classes after animation completes so they can re-trigger
    setTimeout(()=>{
      bar.querySelectorAll('.odds-updated').forEach(el=>el.classList.remove('odds-updated'));
    }, 2000);

    prevOdds[g.id]={spread:g.odds.spread, total:g.odds.total};
  });
}

// Snapshot current odds into prevOdds (called after first render so flashes only on real changes)
function snapshotOdds(){
  allGames.forEach(g=>{
    const prev=prevOdds[g.id]||{};
    // Record history if odds changed
    if(g.odds.spread&&g.odds.spread!==prev.spread){
      if(!oddsHistory[g.id]) oddsHistory[g.id]=[];
      oddsHistory[g.id].push({spread:g.odds.spread,total:g.odds.total,ts:Date.now()});
      if(oddsHistory[g.id].length>10) oddsHistory[g.id].shift(); // keep last 10
    }
    prevOdds[g.id]={spread:g.odds.spread, total:g.odds.total};
  });
}

// Schedule recurring odds refresh (every 3 minutes)
function scheduleOddsPoll(){
  clearTimeout(oddsTimer);
  oddsTimer=setTimeout(async()=>{
    await loadAllExternalOdds();
    scheduleOddsPoll();
  }, 3*60*1000); // 3 minutes
}

function enrichOdds(games){
  const norm=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
  return games.map(g=>{
    let spread=g.odds.spread, total=g.odds.total, src=g.odds.src;

    // Layer 2: (external odds API removed — ESPN provides odds directly)

    // Layer 3: Static per-league fallback — ONLY fills fields still missing after real sources
    // Never overwrites a real ESPN or external line with an estimate
    const fallback=STATIC_ODDS[g.league];
    if(fallback){
      if(!spread){ spread=fallback.spread; src=src||'est'; }
      if(!total){  total=fallback.total;   src=src||'est'; }
    }

    return {...g, odds:{spread,total,src}};
  });
}

// ═══════════════════════════════════════════════════════
// CORE FETCH — scoreboard (parallel, streaming)
// ═══════════════════════════════════════════════════════
function fetchDate(ds){
  if(cache[ds]) return Promise.resolve(cache[ds]);
  if(inFlight[ds]) return inFlight[ds];

  const promise=(async()=>{
    const isSel=()=>ds===selDate;
    if(isSel() && !suppressFullRender) setSpinner(true); // suppress during background polls — spinner causes CSS reflow that resets ticker animation

    const fetches=LEAGUES.map(l=>
      go(`${ESPN}/${l.sport}/${l.league}/scoreboard?dates=${ds}`,9000)
        .then(data=>{
          if(!data?.events) return[];
          const games=parseGames(data,l.league,l.sport,l.dot,l.label);
          if(isSel()&&games.length){
            allGames=enrichOdds([...allGames,...games.filter(g=>!allGames.find(x=>x.id===g.id))]);
            allGames.sort((a,b)=>(b.isLive-a.isLive)||(a.isPre-b.isPre));
            streamRender();
          }
          return games;
        }).catch(()=>[])
    );

    const results=await Promise.allSettled(fetches);
    let allFound=results.filter(r=>r.status==='fulfilled').flatMap(r=>r.value);
    allFound=enrichOdds(allFound);
    allFound.sort((a,b)=>(b.isLive-a.isLive)||(a.isPre-b.isPre));

    cache[ds]=allFound;
    try{sessionStorage.setItem(SS_PREFIX+ds,JSON.stringify(allFound));}catch(e){}
    delete inFlight[ds];

    if(isSel()){
      allGames=allFound;
      if(!suppressFullRender) setSpinner(false); // only update clock on non-poll renders
      // Only fullRender on initial load or date change — not on routine poll refreshes
      // suppressFullRender is set by schedulePoll to prevent a flash every 5s
      if(!suppressFullRender) fullRender();
    }else{
      buildDateStrip();
      if(appMode==='calendar') patchCalendarCell(ds);
    }
    drainPrefetchQueue();
    return allFound;
  })();

  inFlight[ds]=promise;
  return promise;
}

// ═══════════════════════════════════════════════════════
// RENDER HELPERS
// ═══════════════════════════════════════════════════════
let streamRenderTimer=null;

// ── Hoisted globals (originally declared in injected feature blocks) ──
const AUTH_COOLDOWN_MS = 4000; // 4s cooldown between auth attempts
const DEFAULT_WAGER = 50;      // default pick wager
const STARTING_BANKROLL = 1000; // starting bankroll balance
const CHALLENGE_KEY = 'daily_challenge_pick'; // daily challenge localStorage key
let serverSyncTimer = null;    // server sync interval
let authSession = null;       // Supabase auth session
let currentAuthTab = 'login'; // auth modal active tab
let _authLastAttempt = 0;     // rate-limit guard
let _authAttemptCount = 0;
let wsConnection = null;      // WebSocket (reserved)
let wsReconnectTimer = null;
let wsEnabled = false;
let wsGameIds = new Set();
let fastPollTimer = null;     // fast poll interval during live games
let searchOpen = false;       // global search panel state
function streamRender(){
  // During a background poll, suppressFullRender is true — skip intermediate per-league
  // stream renders entirely. The poll's patchScores() will update scores surgically instead.
  if(suppressFullRender) return;
  clearTimeout(streamRenderTimer);
  streamRenderTimer=setTimeout(()=>{const _sy=window.scrollY;clearSkeleton();buildTabs();renderScores();updateTicker();buildDateStrip();requestAnimationFrame(()=>{window.scrollTo(0,_sy);});},80);
}
function updateSlateSummary(){
  const el=document.getElementById('slateSummary');
  if(!el) return;
  const games=allGames;
  if(!games.length){el.innerHTML='';return;}

  const live=games.filter(g=>g.isLive);
  const pre=games.filter(g=>g.isPre);
  const fin=games.filter(g=>g.isFinal);

  // My action today
  const myPending=picks.filter(pk=>pk.result==='pending'&&games.find(g=>g.id===pk.gameId||g.id===pk.actualGameId));
  const myWon=picks.filter(pk=>pk.result==='won'&&games.find(g=>g.id===pk.gameId||g.id===pk.actualGameId));
  const myLost=picks.filter(pk=>pk.result==='lost'&&games.find(g=>g.id===pk.gameId||g.id===pk.actualGameId));

  const pills=[];

  if(live.length){
    pills.push(`<div class="slate-pill live-pill"><span class="slate-pill-dot"></span>LIVE <span class="slate-pill-val">${live.length}</span></div>`);
  }
  if(pre.length){
    pills.push(`<div class="slate-pill"><span>🕐</span>UPCOMING <span class="slate-pill-val">${pre.length}</span></div>`);
  }
  if(fin.length){
    pills.push(`<div class="slate-pill"><span>✅</span>FINAL <span class="slate-pill-val">${fin.length}</span></div>`);
  }
  pills.push(`<div class="slate-pill"><span>🎮</span>TOTAL <span class="slate-pill-val">${games.length} GAMES</span></div>`);

  if(myPending.length||myWon.length||myLost.length){
    const rec=myWon.length||myLost.length?` · ${myWon.length}-${myLost.length}`:'';
    pills.push(`<div class="slate-pill my-action"><span class="slate-pill-dot"></span>MY PICKS <span class="slate-pill-val">${myPending.length+myWon.length+myLost.length}${rec}</span></div>`);
  }

  const slateHtml=pills.join('');
  if(el.dataset.lastHtml!==slateHtml){el.dataset.lastHtml=slateHtml;el.innerHTML=slateHtml;}
}

function fullRender(){
  clearTimeout(streamRenderTimer);
  const _scrollY = window.scrollY;
  clearSkeleton();buildTabs();renderScores();updateTicker();buildDateStrip();updateRecordUI();checkPickResults();checkPropPickResults();checkParlayResults();updateSlateSummary();setTimeout(()=>fetchAndResettleHistoricalPicks().catch(()=>{}), 2000);
  renderBestBetCard();renderDailyChallenge();updateBankrollUI();
  if(typeof renderWeeklyRecap==='function') renderWeeklyRecap();
  if(typeof upgradePollIfLive==='function') upgradePollIfLive();
  snapshotOdds(); // baseline after re-render so next odds poll only flashes real changes
  if(appMode==='calendar') renderCalendar();
  requestAnimationFrame(() => { window.scrollTo(0, _scrollY); });
}
function clearSkeleton(){document.getElementById('skeletonGrid')?.remove();}

// ═══════════════════════════════════════════════════════
// PREFETCH
// ═══════════════════════════════════════════════════════
function enqueuePrefetch(dates){
  dates.forEach(ds=>{if(!cache[ds]&&!inFlight[ds]&&!prefetchQ.includes(ds)) prefetchQ.push(ds);});
  drainPrefetchQueue();
}
function drainPrefetchQueue(){
  if(prefetchBusy||!prefetchQ.length) return;
  if(inFlight[selDate]){setTimeout(drainPrefetchQueue,500);return;}
  const ds=prefetchQ.shift();
  if(!ds||cache[ds]){drainPrefetchQueue();return;}
  prefetchBusy=true;
  fetchDate(ds).finally(()=>{prefetchBusy=false;drainPrefetchQueue();});
}
function prefetchNeighbors(){
  const neighbors=[-3,-2,-1,1,2,3,4,5].map(n=>addDays(selDate,n));
  enqueuePrefetch(neighbors);
}
function patchCalendarCell(ds){
  const cell=document.querySelector(`[data-ds="${ds}"]`);
  if(!cell) return;
  const games=cache[ds]||[];
  const dm={};games.forEach(g=>{dm[g.dot]=true;});
  const dots=Object.keys(dm).map(c=>`<div class="cal-dot dot-${c}"></div>`).join('');
  cell.querySelector('.cal-dots').innerHTML=dots;
  const gcnt=cell.querySelector('.cal-gcnt');
  if(games.length){if(gcnt)gcnt.textContent=`${games.length} games`;else cell.insertAdjacentHTML('beforeend',`<div class="cal-gcnt">${games.length} games</div>`);}
}

function setSpinner(on){
  // Guard all DOM writes — classList.toggle and textContent changes on header elements
  // cause browser style recalculations that interrupt the ticker CSS scroll animation
  const ring = document.getElementById('refreshRing');
  if(ring){
    const parent = ring.parentElement;
    const isRefreshing = parent.classList.contains('refreshing');
    if(!!on !== isRefreshing) parent.classList.toggle('refreshing', on);
  }
  if(!on){
    const lu = document.getElementById('lastUpdate');
    if(lu){
      const newTime = new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
      if(lu.textContent !== newTime) lu.textContent = newTime;
    }
  }
}

// ═══════════════════════════════════════════════════════
// POLLING
// ═══════════════════════════════════════════════════════
// Track consecutive polls with no score changes to back off frequency
let _pollNoChanges = 0;

function schedulePoll(){
  clearTimeout(pollTimer);
  const liveGames = allGames.filter(g=>g.isLive);
  const live = liveGames.length;
  const pi=document.getElementById('pollInd');
  if(pi){
    const newTxt=live?'●●●':'●○○'; const newCls='poll-indicator'+(live?' fast':'');
    if(pi.textContent!==newTxt) pi.textContent=newTxt;
    if(pi.className!==newCls) pi.className=newCls;
  }

  // Smart interval: back off to 15s if 3+ consecutive polls had no score changes
  // This reduces unnecessary API hits during blowouts or slow periods
  let interval;
  if(!live){
    interval = 30000; // no live games — 30s
  } else if(_pollNoChanges >= 3){
    interval = 15000; // live but stale — 15s backoff
  } else {
    interval = 5000;  // live and changing — 5s
  }

  pollTimer=setTimeout(async()=>{
    const prevScoreSnap = allGames.filter(g=>g.isLive).map(g=>g.id+':'+g.home.score+'-'+g.away.score).join('|');
    const prevCount = allGames.length;
    const prevIds = new Set(allGames.map(g=>g.id));
    delete cache[selDate];
    try{sessionStorage.removeItem(SS_PREFIX+selDate);}catch(e){}
    suppressFullRender = true;
    await fetchDate(selDate);
    suppressFullRender = false;

    // Check if any live scores actually changed
    const newScoreSnap = allGames.filter(g=>g.isLive).map(g=>g.id+':'+g.home.score+'-'+g.away.score).join('|');
    if(live && newScoreSnap === prevScoreSnap){
      _pollNoChanges++;
      if(_pollNoChanges === 3) console.log('⏸ Scores unchanged — backing off poll to 15s');
    } else {
      if(_pollNoChanges >= 3) console.log('▶ Score change detected — resuming 5s poll');
      _pollNoChanges = 0;
    }

    checkPickResults();
    checkParlayResults();
    checkPropPickResults();
    try{
      const _dId = getDailyContestId(), _wId = getWeeklyContestId();
      settlePickemContest(_dId).catch(()=>{});
      settlePickemContest(_wId).catch(()=>{});
    }catch{}
    if(openGameId){
      const g=allGames.find(x=>x.id===openGameId);
      if(g){updateModalScoreboard(g);}
    }
    const newIds = new Set(allGames.map(g=>g.id));
    const sameGames = prevCount===allGames.length && [...prevIds].every(id=>newIds.has(id));
    if(sameGames && appMode==='scores'){
      patchScores();
      updateSlateSummary();
      updateRecordUI();
      updateBankrollUI();
      renderLivePickBar();
    }
    schedulePoll();
  }, interval);
}
function patchScores(){
  allGames.forEach(g=>{
    const prev=prevScores[g.id]; if(!prev) return;
    const hs=g.home.score,as2=g.away.score;
    if(prev.hs!==hs){const el=document.getElementById(`hs-${g.id}`);if(el){el.textContent=hs;el.classList.remove('score-changed');requestAnimationFrame(()=>requestAnimationFrame(()=>el.classList.add('score-changed')));}}
    if(prev.as!==as2){const el=document.getElementById(`as-${g.id}`);if(el){el.textContent=as2;el.classList.remove('score-changed');requestAnimationFrame(()=>requestAnimationFrame(()=>el.classList.add('score-changed')));}}
    const stEl=document.getElementById(`st-${g.id}`);
    if(stEl&&g.isLive) stEl.textContent=g.statusText;
    prevScores[g.id]={hs,as:as2};
  });
}

// ═══════════════════════════════════════════════════════
// MODE
// ═══════════════════════════════════════════════════════
function setMode(m){
  appMode=m;
  // Desktop nav buttons — only show core tabs, rest accessed via More
  const dBtns={scores:'btnScores',contests:'btnContests',analysis:'btnAnalysis',
    history:'btnHistory',leaderboard:'btnLeaderboard'};
  // Also handle secondary nav buttons if they exist
  const dBtnsAll={...dBtns,calendar:'btnCalendar',news:'btnNews',
    trends:'btnTrends',feed:'btnFeed',battles:'btnBattles',picks:'btnPicks'};
  Object.entries(dBtnsAll).forEach(([k,id])=>{const el=document.getElementById(id);if(el)el.classList.toggle('active',k===m);});
  // Hide non-core desktop nav buttons
  ['btnCalendar','btnNews','btnFeed','btnBattles','btnTrends'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.style.display='none';
  });
  // Inject desktop "More ▾" button if not present
  injectDesktopMoreBtn();
  // Highlight desktop More button when a secondary view is active
  const desktopMoreViews=['calendar','news','feed','battles','trends','myaction'];
  const dMoreBtn=document.getElementById('btnDesktopMore');
  if(dMoreBtn) dMoreBtn.classList.toggle('active', desktopMoreViews.includes(m));
  // Mobile nav buttons
  const mBtns={scores:'mobBtnScores',myaction:'mobBtnMyaction',leaderboard:'mobBtnLeaderboard',picks:'mobBtnPicks',news:'mobBtnNews',contests:'mobBtnContests',trends:'mobBtnTrends',feed:'mobBtnFeed'};
  Object.entries(mBtns).forEach(([k,id])=>{const el=document.getElementById(id);if(el)el.classList.toggle('active',k===m);});
  // Secondary views highlight the More button
  const moreViews=['history','trends','battles','analysis','contests','calendar','news','feed','myaction'];
  const moreBtn=document.getElementById('mobBtnMore');
  if(moreBtn) moreBtn.classList.toggle('active',moreViews.includes(m));
  // Show/hide views
  const views=['scoresView','calendarView','historyView','leaderboardView','newsView','analysisView','contestsView','trendsView','feedView','battlesView','myactionView'];
  const viewMap={scores:'scoresView',calendar:'calendarView',history:'historyView',
    leaderboard:'leaderboardView',news:'newsView',analysis:'analysisView',contests:'contestsView',trends:'trendsView',feed:'feedView',battles:'battlesView',myaction:'myactionView'};
  views.forEach(v=>{const el=document.getElementById(v);if(el)el.style.display='none';});
  const active=document.getElementById(viewMap[m]);
  if(active) active.style.display='';
  document.getElementById('tabsWrap').style.display=m==='scores'?'':'none';
  // Render as needed
  if(m==='scores') { buildTabs(); renderScores(); updateTicker(); buildDateStrip(); }
  if(m==='calendar') renderCalendar();
  if(m==='history') renderHistoryView();
  if(m==='leaderboard') renderLeaderboardPro();
  if(m==='news') renderNewsView();
  if(m==='analysis') renderAnalysisView();
  if(m==='contests') renderContestsView();
  if(m==='trends') renderTrendsDashboard();
  if(m==='feed') renderPickFeed();
  if(m==='battles') renderBattlesView();
  if(m==='myaction') renderMyActionView();
}

// ═══════════════════════════════════════════════════════
// DATE STRIP
// ═══════════════════════════════════════════════════════
function buildDateStrip(){
  const strip=document.getElementById('dateStrip');
  const today=todayStr();
  const anchor=addDays(today,weekOff*7);
  const days=Array.from({length:14},(_,i)=>addDays(anchor,i-3));
  const newHtml=days.map(ds=>{
    const d=parseD(ds);
    const isSel=ds===selDate,isToday=ds===today;
    const cnt=cache[ds]?.length;
    const loading=!cache[ds]&&inFlight[ds];
    return `<div class="date-pill${isToday?' tod':''}${isSel?' sel':''}" onclick="selectDate('${ds}')">
      <span class="dp-dow">${d.toLocaleDateString([],{weekday:'short'}).slice(0,3).toUpperCase()}</span>
      <span class="dp-num">${d.getDate()}</span>
      <span class="dp-cnt">${loading?'…':cnt!=null?cnt:''}</span>
    </div>`;
  }).join('');
  // Only update DOM if content changed — prevents scroll position reset on every poll
  if(strip.dataset.lastHtml !== newHtml){
    strip.dataset.lastHtml=newHtml; strip.innerHTML=newHtml;
    // Only scroll into view when strip actually changed — scrollIntoView forces layout
    requestAnimationFrame(()=>{strip.querySelector('.date-pill.sel')?.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});});
  }
}
function selectDate(ds){
  if(ds===selDate) return;
  clearTimeout(pollTimer);
  selDate=ds; activeTab='all';
  buildDateStrip();
  if(cache[ds]){allGames=cache[ds];clearSkeleton();fullRender();schedulePoll();prefetchNeighbors();}
  else{showSkeleton();fetchDate(ds).then(()=>{schedulePoll();prefetchNeighbors();});}
}
function shiftWeek(dir){
  weekOff+=dir; buildDateStrip();
  const today=todayStr(),anchor=addDays(today,weekOff*7);
  const days=Array.from({length:14},(_,i)=>addDays(anchor,i-3));
  enqueuePrefetch(days.filter(d=>d!==selDate));
}
function showSkeleton(){
  const skel='<div style="background:var(--card);border:1px solid var(--border);border-radius:8px;padding:14px;height:120px"><div class="sk" style="width:38%;height:9px;margin-bottom:12px"></div><div style="display:flex;gap:9px;align-items:center;margin-bottom:9px"><div class="sk" style="width:28px;height:28px;border-radius:50%;flex-shrink:0"></div><div style="flex:1"><div class="sk" style="width:55%;height:9px"></div></div><div class="sk" style="width:34px;height:20px"></div></div><div style="height:1px;background:var(--border);margin:5px 0"></div><div style="display:flex;gap:9px;align-items:center"><div class="sk" style="width:28px;height:28px;border-radius:50%;flex-shrink:0"></div><div style="flex:1"><div class="sk" style="width:50%;height:9px"></div></div><div class="sk" style="width:34px;height:20px"></div></div></div>';
  document.getElementById('scoresGrid').innerHTML=`<div class="score-grid">${skel.repeat(4)}</div>`;
}

// ═══════════════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════════════
function buildTabs(){
  const groups={};
  allGames.forEach(g=>{if(!groups[g.leagueLabel])groups[g.leagueLabel]={total:0,live:0};groups[g.leagueLabel].total++;if(g.isLive)groups[g.leagueLabel].live++;});
  const totalLive=allGames.filter(g=>g.isLive).length;
  const tabs=[{key:'all',label:'All',total:allGames.length,live:totalLive},...Object.entries(groups).map(([k,v])=>({key:k,label:k,...v}))];
  const tabsHtml=tabs.map(t=>`<button class="tab ${activeTab===t.key?'active':''}" onclick="setTab('${t.key}')">${t.label}<span class="cnt${t.live>0?' lc':''}">${t.live>0?'● '+t.live:t.total}</span></button>`).join('');
  const tabsCont=document.getElementById('tabsCont');
  // Only rebuild tabs DOM if content changed — prevents tab scroll reset on every poll
  if(tabsCont && tabsCont.dataset.lastHtml !== tabsHtml){
    tabsCont.dataset.lastHtml=tabsHtml; tabsCont.innerHTML=tabsHtml;
    // Only auto-scroll when tabs actually changed — getBoundingClientRect forces layout reflow
    requestAnimationFrame(()=>{
      const wrap=document.getElementById('tabsWrap');
      const activeEl=document.querySelector('.tab.active');
      if(wrap && activeEl){
        if(activeTab==='all'){
          wrap.scrollLeft=0;
        } else {
          const wrapRect=wrap.getBoundingClientRect();
          const tabRect=activeEl.getBoundingClientRect();
          if(tabRect.left < wrapRect.left || tabRect.right > wrapRect.right){
            wrap.scrollLeft += (tabRect.left - wrapRect.left) - (wrapRect.width/2) + (tabRect.width/2);
          }
        }
      }
    });
  }
}
function setTab(k){activeTab=k;buildTabs();renderScores();}

// ═══════════════════════════════════════════════════════
// RENDER SCORES
// ═══════════════════════════════════════════════════════
function renderScores(){
  clearSkeleton();
  const el=document.getElementById('scoresGrid');
  if(!el) return;
  // Guard: ensure allGames is always an array
  if(!Array.isArray(allGames)) allGames = [];
  const fil=activeTab==='all'?allGames:allGames.filter(g=>g.leagueLabel===activeTab);
  if(!fil.length){
    el.innerHTML=inFlight[selDate]
      ?`<div class="empty-state" style="border-color:var(--dim)"><span style="color:var(--accent)">Loading games…</span><small>Fetching schedules from all leagues</small></div>`
      :`<div class="empty-state">NO GAMES SCHEDULED<small>Try a different date or check back later</small></div>`;
    return;
  }
  const grps={};
  fil.forEach(g=>{if(!grps[g.leagueLabel])grps[g.leagueLabel]=[];grps[g.leagueLabel].push(g);});
  el.innerHTML=Object.entries(grps).map(([label,games])=>`
    <div class="sec-hdr"><span class="sec-title">${label}</span><div class="sec-line"></div><span class="sec-cnt">${games.length} GAME${games.length!==1?'S':''}</span></div>
    <div class="score-grid">${games.map(cardHTML).join('')}</div>
  `).join('');
  allGames.forEach(g=>{prevScores[g.id]={hs:g.home.score,as:g.away.score};});
}

// Returns line movement indicator HTML for a game's spread
function lineMovementHTML(g){
  const hist = oddsHistory[g.id];
  if(!hist||hist.length<2||!g.odds.spread) return '';
  // Parse spread numbers
  const parseSpreadNum = s => {
    if(!s) return null;
    const m = s.match(/([+-]?\d+\.?\d*)\s*$/);
    return m ? parseFloat(m[1]) : null;
  };
  const current = parseSpreadNum(g.odds.spread);
  const opening = parseSpreadNum(hist[0].spread);
  if(current===null||opening===null||current===opening) return '';
  const diff = current - opening;
  const dir = diff > 0 ? 'up' : 'down';
  const arrow = diff > 0 ? '▲' : '▼';
  const absDiff = Math.abs(diff).toFixed(1).replace('.0','');
  return `<span class="line-move ${dir}"><span class="line-move-arrow">${arrow}</span>${absDiff}</span>`;
}

function logoEl(t,size=28){
  return t.logo
    ?`<img class="team-logo" style="width:${size}px;height:${size}px" src="${t.logo}" alt="${t.abbr}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="team-logo-ph" style="display:none;width:${size}px;height:${size}px">${t.abbr}</div>`
    :`<div class="team-logo-ph" style="width:${size}px;height:${size}px">${t.abbr}</div>`;
}

// Return compact injury flag HTML for a team abbreviation
function injuryFlagsHTML(abbr){
  if(!abbr || !window._injuryByTeam) return '';
  const injuries = window._injuryByTeam[abbr.toUpperCase()] || [];
  const notable = injuries.filter(i=>i.status==='out'||i.status==='questionable').slice(0,2);
  if(!notable.length) return '';
  return notable.map(inj=>{
    const color = inj.status==='out' ? '#ff4757' : '#ffa502';
    const label = inj.status==='out' ? 'OUT' : 'Q';
    return `<span style="font-family:'DM Mono',monospace;font-size:8px;padding:1px 4px;border-radius:3px;background:${inj.status==='out'?'rgba(255,71,87,.15)':'rgba(255,165,2,.12)'};color:${color};margin-left:3px;font-weight:700" title="${inj.name} - ${inj.statusLabel}">${label}</span>`;
  }).join('');
}

function cardHTML(g){
  const stat=g.isLive
    ?`<span class="game-status s-live"><span id="st-${g.id}">${g.statusText}</span></span>`
    :g.isFinal?`<span class="game-status s-final">FINAL</span>`
    :`<span class="game-status s-pre">${g.startTime}</span>`;
  const _steam = g.isPre ? steamBadgeHTML(g.id) : '';
  const _pubSharp = g.isPre && g.odds && g.odds.spread ? pubSharpHTML(g) : '';
  const sc=t=>g.isPre?'ts-pre':g.isLive?'':t.winner?'ts-win':t.loser?'ts-loss':'';
  const aS=g.isPre?'—':g.away.score,hS=g.isPre?'—':g.home.score;
  let odds='';
  if(g.odds.spread||g.odds.total){
    // If odds.src is null, these are static fallback lines — label them as estimates
    const isEst = !g.odds.src;
    const estTag = isEst ? `<span title="Estimated line — live odds unavailable" style="font-family:'DM Mono',monospace;font-size:8px;color:var(--muted);opacity:.7;margin-left:3px">EST</span>` : '';
    odds=`<div class="odds-bar"${isEst?' title="Estimated lines — ESPN odds unavailable for this game"':''}>
      ${g.odds.spread?`<div class="odds-pill${isEst?' odds-estimated':''}"><div class="odds-label">Spread</div><div class="odds-val-wrap"><div class="odds-val">${g.odds.spread}</div>${estTag}${lineMovementHTML(g)}</div></div>`:''}
      ${g.odds.total?`<div class="odds-pill${isEst?' odds-estimated':''}"><div class="odds-label">Total</div><div class="odds-val">${g.odds.total}${estTag}</div></div>`:''}
    </div>`;
  }
  // Show start time prominently for pre-game cards so users know when the game is
  const startLabel = g.isPre && g.startTime
    ? `<span style="font-family:'DM Mono',monospace;font-size:10px;color:var(--accent);font-weight:600;letter-spacing:.5px">${g.startTime}</span>`
    : '';
  return `<div class="score-card ${g.isLive?'live':''}" id="card-${g.id}" onclick="openGame('${g.id}')">
    <div class="card-top">${stat}${startLabel}${_steam}<span class="view-stats-hint">TAP FOR STATS ›</span></div>
    <div class="team-row"><div class="team-info">${logoEl(g.away)}
      <div class="team-name-wrap"><div class="team-name">${g.away.name}${injuryFlagsHTML(g.away.abbr)}</div>${g.away.record?`<div class="team-rec">${g.away.record}</div>`:''}</div>
    </div><div class="team-score ${sc(g.away)}" id="as-${g.id}">${aS}</div></div>
    <div class="divider"></div>
    <div class="team-row"><div class="team-info">${logoEl(g.home)}
      <div class="team-name-wrap"><div class="team-name">${g.home.name}${injuryFlagsHTML(g.home.abbr)}</div>${g.home.record?`<div class="team-rec">${g.home.record}</div>`:''}</div>
    </div><div class="team-score ${sc(g.home)}" id="hs-${g.id}">${hS}</div></div>
    ${odds}${_pubSharp}${buildPickHTML(g)}
  </div>`;
}

// ═══════════════════════════════════════════════════════
// GAME DETAIL MODAL
// ═══════════════════════════════════════════════════════
async function openGame(gameId){
  const g=allGames.find(x=>x.id===gameId);
  if(!g) return;
  openGameId=gameId;
  // Default to props tab for pre-game (no live stats yet), stats for in-progress/final
  modalTabActive = g.isPre ? 'props' : 'stats';
  modalStatData=null;

  // Render scoreboard header immediately
  populateModalHeader(g);

  // Show modal
  document.getElementById('modalOverlay').classList.add('open');
  document.body.style.overflow='hidden';
  document.body.style.position='fixed';
  document.body.style.top=`-${window.scrollY}px`;
  document.body.style.left='0';
  document.body.style.right='0';
  document.body.dataset.modalScrollY=window.scrollY;

  // Set tabs
  renderModalTabs(g);

  // Show loading, then fetch stats
  document.getElementById('modalBody').innerHTML=`<div class="stats-loading"><div class="stats-loading-ring"></div>LOADING PLAYER STATS…</div>`;

  const statsData=await fetchGameStats(g);
  modalStatData=statsData;

  if(openGameId===gameId){ // still same game open
    renderModalTab(g, modalTabActive);
  }

  // Auto-refresh: live games every 30s, pre-game every 5min for prop line updates
  clearTimeout(modalPollTimer);
  if(g.isLive||g.isPre){
    scheduleModalPoll(gameId);
  }
}

function scheduleModalPoll(gameId){
  clearTimeout(modalPollTimer);
  const g0=allGames.find(x=>x.id===gameId);
  const delay=g0?.isLive ? 30000 : 5*60*1000; // 30s live, 5min pre-game
  modalPollTimer=setTimeout(async()=>{
    if(openGameId!==gameId) return;
    const g=allGames.find(x=>x.id===gameId);
    if(!g) return;
    if(g.isLive){
      // Live: refresh full box-score stats
      const fresh=await fetchGameStats(g);
      if(fresh&&openGameId===gameId){
        modalStatData=fresh;
        if(modalTabActive==='stats'||modalTabActive==='props') renderModalTab(g,modalTabActive);
      }
      scheduleModalPoll(gameId);
    } else if(g.isPre){
      // Pre-game: re-fetch season stats → recompute prop lines, patch DOM if changed
      const fresh=await fetchGameStats(g);
      if(fresh&&openGameId===gameId){
        const prevData=modalStatData;
        modalStatData=fresh;
        if(modalTabActive==='props'){
          patchPropLines(g, prevData, fresh);
        }
      }
      scheduleModalPoll(gameId);
    }
  }, delay);
}

// Surgically update prop line numbers in the open modal when they change
function patchPropLines(g, prevData, freshData){
  if(!prevData||!freshData) return;
  const cfg=SPORT_STAT_CONFIGS[g.sport]||SPORT_STAT_CONFIGS.basketball;
  const propStats=cfg.propStats||[];

  // Build a map of playerId+statKey → old line from prevData
  const oldLines={};
  (prevData.teams||[]).forEach(team=>{
    (team.players||[]).forEach(p=>{
      propStats.forEach(sk=>{
        const line=getPlayerPropLine(p,sk,cfg);
        oldLines[`${p.id}_${sk}`]=line;
      });
    });
  });

  // For each player in fresh data, check if their prop line changed
  (freshData.teams||[]).forEach(team=>{
    (team.players||[]).forEach(p=>{
      propStats.forEach(sk=>{
        const newLine=getPlayerPropLine(p,sk,cfg);
        const oldLine=oldLines[`${p.id}_${sk}`];
        if(oldLine==null||newLine===oldLine) return;

        // Find prop-btn rows for this player+stat by data attributes
        // Buttons are inside a .prop-pick-row; match by scanning onclick for gameId+playerId+statKey
        const safeId=p.id.replace(/['"\\]/g,'');
        document.querySelectorAll('.prop-btn').forEach(btn=>{
          const oc=btn.getAttribute('onclick')||'';
          if(oc.includes(g.id)&&oc.includes(safeId)&&oc.includes(sk)){
            // Update line display
            const lineEl=btn.querySelector('.prop-line-num');
            if(lineEl){
              lineEl.textContent=newLine;
              lineEl.classList.add('prop-line-updated');
              setTimeout(()=>lineEl.classList.remove('prop-line-updated'),2500);
            }
            // Update onclick to use new line value
            const updated=oc.replace(/,(\d+\.?\d*),'(over|under)'/,`,${newLine},'$2'`);
            btn.setAttribute('onclick',updated);
          }
        });
      });
    });
  });
}

function closeModal(){
  document.getElementById('modalOverlay').classList.remove('open');
  const sy = parseInt(document.body.dataset.modalScrollY || '0');
  document.body.style.overflow = '';
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  window.scrollTo(0, sy);
  openGameId=null;
  clearTimeout(modalPollTimer);
}

function handleModalOverlayClick(e){
  if(e.target===document.getElementById('modalOverlay')) closeModal();
}

function populateModalHeader(g){
  document.getElementById('modalLeague').textContent=g.leagueLabel;

  // Away team
  const away=document.getElementById('modalAwayTeam');
  away.innerHTML=`${logoEl(g.away,52)}<div class="modal-team-name">${g.away.name}</div>${g.away.record?`<div class="modal-team-rec">${g.away.record}</div>`:''}`;

  // Home team
  const home=document.getElementById('modalHomeTeam');
  home.innerHTML=`${logoEl(g.home,52)}<div class="modal-team-name">${g.home.name}</div>${g.home.record?`<div class="modal-team-rec">${g.home.record}</div>`:''}`;

  updateModalScoreboard(g);
}

function updateModalScoreboard(g){
  const aScoreEl=document.getElementById('modalAwayScore');
  const hScoreEl=document.getElementById('modalHomeScore');
  const statusEl=document.getElementById('modalStatus');

  if(g.isPre){
    aScoreEl.textContent='—'; hScoreEl.textContent='—';
    aScoreEl.className='modal-score-num'; hScoreEl.className='modal-score-num';
    statusEl.className='modal-status pre'; statusEl.textContent=g.startTime;
  } else {
    aScoreEl.textContent=g.away.score; hScoreEl.textContent=g.home.score;
    if(g.isFinal){
      aScoreEl.className='modal-score-num '+(g.away.winner?'winner':'loser');
      hScoreEl.className='modal-score-num '+(g.home.winner?'winner':'loser');
      statusEl.className='modal-status final'; statusEl.textContent='FINAL';
    } else {
      aScoreEl.className='modal-score-num'; hScoreEl.className='modal-score-num';
      statusEl.className='modal-status live'; statusEl.textContent=g.statusText;
    }
  }
}

function renderModalTabs(g){
  const tabs=[
    {id:'stats', label:'Player Stats'},
    {id:'props', label:'Player Props'},
    {id:'picks', label:'Game Picks'},
  ];
  // Prop builder button (injected separately, not as a tab)
  const builderBtn = g.isPre ? `<button class="modal-tab" onclick="openPropBuilder('${g.id}')" style="margin-left:auto;color:var(--accent)">🎯 Builder</button>` : '';
  setTimeout(()=>{
    const wrap = document.getElementById('modalTabs');
    if(wrap && !wrap.querySelector('.prop-builder-injected') && g.isPre){
      const btn = document.createElement('button');
      btn.className = 'modal-tab prop-builder-injected';
      btn.style.marginLeft = 'auto';
      btn.style.color = 'var(--accent)';
      btn.textContent = '🎯 Builder';
      btn.onclick = ()=>openPropBuilder(g.id);
      wrap.appendChild(btn);
    }
  }, 50);
  document.getElementById('modalTabs').innerHTML=tabs.map(t=>
    `<button class="modal-tab ${modalTabActive===t.id?'active':''}" data-tab="${t.id}" onclick="switchModalTab('${t.id}')">${t.label}</button>`
  ).join('');
}

function switchModalTab(tab){
  modalTabActive=tab;
  document.getElementById('modalTabs').querySelectorAll('.modal-tab').forEach(el=>{
    el.classList.toggle('active', el.dataset.tab===tab);
  });
  const g=allGames.find(x=>x.id===openGameId);
  if(g) renderModalTab(g,tab);
}

function renderModalTab(g, tab){
  const body=document.getElementById('modalBody');
  if(tab==='stats'){
    if(!modalStatData){
      body.innerHTML=g.isPre
        ?`<div class="stats-no-data">Game hasn't started yet — stats will appear once it begins.</div>`
        :`<div class="stats-no-data">No player stats available for this game.</div>`;
      return;
    }
    body.innerHTML=renderStatsTable(g, modalStatData);
  } else if(tab==='props'){
    // Props work pre-game too — use roster from statsData or show default roster
    body.innerHTML=renderPropsTable(g, modalStatData);
  } else if(tab==='picks'){
    body.innerHTML=renderGamePicksInModal(g);
  }
}

// ═══════════════════════════════════════════════════════
// STATS TABLE RENDERER
// ═══════════════════════════════════════════════════════
function renderStatsTable(g, statsData){
  const cfg=statsData.cfg || SPORT_STAT_CONFIGS[g.sport] || SPORT_STAT_CONFIGS.basketball;
  const cols=cfg.cols || [];

  return statsData.teams.map(team=>`
    <div class="stats-team-hdr">
      ${team.logo?`<img class="stats-team-logo" src="${team.logo}" alt="">`:''}<span class="stats-team-name">${team.name}</span>
    </div>
    <table class="stats-table">
      <thead><tr>
        <th>Player</th>
        ${cols.map(c=>`<th>${cfg.labels[c]||c.toUpperCase()}</th>`).join('')}
      </tr></thead>
      <tbody>
        ${team.players.filter(p=>p.active).map(p=>{
          // Find the leader for each stat column in this team for gold highlight
          return `<tr>
            <td>${p.name}${p.position?` <span style="color:var(--muted);font-size:9px">${p.position}</span>`:''}</td>
            ${cols.map(c=>{
              const val=getStatVal(p.stats,c);
              // Highlight top value per column
              const numVal=parseFloat(String(val).replace(/[^0-9.]/g,''));
              const isLeader=!isNaN(numVal)&&numVal>0&&isTeamLeader(team.players,c,p.id);
              return `<td class="${isLeader?'stat-leader':'stat-val'}">${val}</td>`;
            }).join('')}
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `).join('');
}

function isTeamLeader(players, col, playerId){
  let maxVal=-Infinity, leaderId=null;
  players.filter(p=>p.active).forEach(p=>{
    const v=parseFloat(String(getStatVal(p.stats,col)).replace(/[^0-9.]/g,''));
    if(!isNaN(v)&&v>maxVal){maxVal=v;leaderId=p.id;}
  });
  return leaderId===playerId && maxVal>0;
}

// ═══════════════════════════════════════════════════════
// PLAYER PROPS RENDERER
// ═══════════════════════════════════════════════════════
function renderPropsTable(g, statsData){
  const cfg = SPORT_STAT_CONFIGS[g.sport] || SPORT_STAT_CONFIGS.basketball;
  const propStats = cfg.propStats || [];
  const isPreGame = g.isPre || (statsData && statsData.preGame);
  const fin = (!g.isPre) ? 'disabled' : ''; // lock props once game starts

  if(!propStats.length) return `<div class="stats-no-data">Player props not available for this sport.</div>`;
  if(!statsData || !statsData.teams || !statsData.teams.length){
    return `<div class="stats-loading"><div class="stats-loading-ring"></div>LOADING ROSTER…</div>`;
  }

  let html = '';

  propStats.forEach(statKey=>{
    const propDef = (cfg.propDefs||{})[statKey] || {label:statKey.toUpperCase(), fb:0.5};
    const statLabel = propDef.label;

    html += `<div class="prop-stat-section">
      <div class="prop-stat-hdr">
        <span class="prop-stat-title">${statLabel}</span>
        <span class="prop-stat-line-badge" style="font-size:9px;color:var(--muted)">Season avg line per player</span>
      </div>`;

    statsData.teams.forEach(team=>{
      const isSynthetic = !!team.synthetic;
      const players = isPreGame
        ? team.players.slice(0, isSynthetic ? 6 : 12)
        : team.players.filter(p=>p.active).slice(0, 12);
      if(!players.length) return;

      html += `<div class="prop-team-block">
        <div class="prop-team-label">
          ${team.logo ? `<img src="${team.logo}" alt="" style="width:14px;height:14px;object-fit:contain;margin-right:5px">` : ''}
          <span>${team.name}</span>
        </div>`;

      players.forEach(p=>{
        // Get real line: season avg for this player/stat (rounded to .5), else fallback
        const line = isSynthetic ? propDef.fb : getPlayerPropLine(p, statKey, cfg);
        const currentVal = (!isPreGame && !isSynthetic) ? getStatVal(p.stats, statKey) : null;
        const numCurrent = currentVal ? parseFloat(String(currentVal).replace(/[^0-9.]/g,'')) : NaN;
        const pickKey = `prop_${g.id}_${p.id}_${statKey}`;
        const existingPick = picks.find(pk=>pk.gameId===pickKey);
        const resultClass = existingPick?.result && existingPick.result!=='pending' ? existingPick.result : '';
        const isHot = !isPreGame && !isSynthetic && !isNaN(numCurrent) && numCurrent >= line;
        const showCurrent = currentVal && currentVal !== '—' && !isSynthetic;
        // Mark if line is from season avg vs pure fallback
        const hasRealLine = !isSynthetic && (p.seasonAvgs && Object.keys(p.seasonAvgs).length>0);

        const safeId = p.id.replace(/['"\\]/g,'');
        const safeName = p.name.replace(/'/g,"\\'");
        const safeSL = statLabel.replace(/'/g,"\\'");
        const safeAway = g.away.name.replace(/'/g,"\\'");
        const safeHome = g.home.name.replace(/'/g,"\\'");

        html += `<div class="prop-pick-row">
          <div class="prop-player-info">
            <span class="prop-player-name">${isSynthetic ? '<span style="color:var(--dim)">Pending lineup</span>' : p.name}</span>
            ${p.position ? `<span class="prop-pos-badge">${p.position}</span>` : ''}
          </div>
          ${showCurrent ? `<div class="prop-cur-wrap">
            <div class="prop-current ${isHot?'hot':''}">${currentVal}</div>
            <div class="prop-cur-label">NOW</div>
          </div>` : `<div style="min-width:8px"></div>`}
          <div class="prop-btns">
            <button class="prop-btn over ${existingPick?.side==='over'?'active':''} ${existingPick?.side==='over'?resultClass:''} ${fin||isSynthetic?'disabled':''}"
              onclick="makePropPick('${g.id}','${safeId}','${safeName}','${statKey}','${safeSL}',${line},'over','${safeAway} vs ${safeHome}')">
              <span class="prop-dir">OVER</span><span class="prop-line-num">${line}${hasRealLine?'':''}</span>
            </button>
            <button class="prop-btn under ${existingPick?.side==='under'?'active':''} ${existingPick?.side==='under'?resultClass:''} ${fin||isSynthetic?'disabled':''}"
              onclick="makePropPick('${g.id}','${safeId}','${safeName}','${statKey}','${safeSL}',${line},'under','${safeAway} vs ${safeHome}')">
              <span class="prop-dir">UNDER</span><span class="prop-line-num">${line}</span>
            </button>
          </div>
        </div>`;
      });

      html += `</div>`;
    });

    html += `</div>`;
  });

  return html || `<div class="stats-no-data">No player data available.</div>`;
}

// ═══════════════════════════════════════════════════════
// GAME PICKS IN MODAL (spread / total)
// ═══════════════════════════════════════════════════════
function renderGamePicksInModal(g){
  const html=buildPickHTML(g);
  if(!html) return `<div class="stats-no-data">No odds available for game picks on this game.</div>`;
  return `<div style="padding:8px 0">${html}</div>`;
}

// ═══════════════════════════════════════════════════════
// PLAYER PROP PICKS LOGIC
// ═══════════════════════════════════════════════════════
function makePropPick(gameId, playerId, playerName, statKey, statLabel, line, side, gameStr){
  if(!currentUser){ alert('Enter your name to make picks.'); return; }
  const g=allGames.find(x=>x.id===gameId);
  if(g&&!g.isPre) return; // block once game starts
  // Use a composite key so prop picks are distinct from game picks
  const pickKey=`prop_${gameId}_${playerId}_${statKey}`;

  // Toggle off if same side
  const idx=picks.findIndex(p=>p.gameId===pickKey&&p.side===side);
  if(idx!==-1){
    picks.splice(idx,1);
    savePicks();updateRecordUI();renderPicksPanel();
    // Re-render props tab
    if(g && openGameId===gameId) renderModalTab(g,'props');
    return;
  }

  // Remove opposite pick for same player/stat
  picks=picks.filter(p=>!(p.gameId===pickKey));

  picks.push({
    gameId:pickKey, type:'prop', side,
    description:`${playerName} ${statLabel} ${side==='over'?'O':'U'} ${line}`,
    gameStr,
    result:'pending',
    playerId, statKey, line,
    playerName, statLabel,
    homeTeam:g?.home.name||'',awayTeam:g?.away.name||'',
    league:g?.leagueLabel||'',madeAt:Date.now(),
    // Store the actual game id separately for result checking
    actualGameId: gameId,
  });
  savePicks();updateRecordUI();renderPicksPanel();
  // Subtle flash on the game card
  requestAnimationFrame(()=>{
    const card=document.getElementById('card-'+gameId);
    if(card){card.classList.remove('pick-flash');requestAnimationFrame(()=>requestAnimationFrame(()=>card.classList.add('pick-flash')));}
  });

  // Re-render props tab to reflect selection (works even pre-game)
  if(g && openGameId===gameId) renderModalTab(g,'props');
}

async function checkPropPickResults(){
  // Group pending prop picks by game so we fetch each boxscore at most once
  const pendingProps=picks.filter(pk=>pk.type==='prop'&&pk.result==='pending');
  if(!pendingProps.length) return;

  const gameIds=[...new Set(pendingProps.map(pk=>pk.actualGameId||pk.gameId))];
  let changed=false;

  await Promise.allSettled(gameIds.map(async gid=>{
    const g=allGames.find(x=>x.id===gid);
    if(!g||!g.isFinal) return;

    // Use cached modal data if this game is open, otherwise fetch boxscore fresh
    let statsData=null;
    if(openGameId===gid && modalStatData){
      statsData=modalStatData;
    } else {
      const lg=LEAGUES.find(l=>l.league===g.league);
      if(!lg) return;
      const data=await go(`${ESPN}/${lg.sport}/${lg.league}/summary?event=${gid}`,10000);
      if(data) statsData=parseSummaryStats(data, g.sport);
    }
    if(!statsData) return;

    picks.forEach(pick=>{
      if(pick.type!=='prop'||pick.result!=='pending') return;
      if((pick.actualGameId||pick.gameId)!==gid) return;
      let finalVal=null;
      (statsData.teams||[]).forEach(team=>{
        const pl=team.players.find(p=>p.id===pick.playerId);
        if(pl){
          const v=parseFloat(String(getStatVal(pl.stats,pick.statKey)).replace(/[^0-9.]/g,''));
          if(!isNaN(v)) finalVal=v;
        }
      });
      if(finalVal===null) return;
      const line=pick.line;
      if(Math.abs(finalVal-line)<0.01) pick.result='push';
      else if(pick.side==='over') pick.result=finalVal>line?'won':'lost';
      else pick.result=finalVal<line?'won':'lost';
      changed=true;
    });
  }));

  if(changed){ savePicks(); checkAchievements(); updateRecordUI(); renderPicksPanel(); }
}

// ═══════════════════════════════════════════════════════
// GAME PICKS (spread / total)
// ═══════════════════════════════════════════════════════
// ─── USER IDENTITY ──────────────────────────────────────────────
function loadUser(){
  try{ return JSON.parse(localStorage.getItem('ls_user')||'null'); }catch{ return null; }
}
function saveUser(u){ localStorage.setItem('ls_user',JSON.stringify(u)); }

function initUser(){
  const u=loadUser();
  if(u&&u.name){
    currentUser=u;
    picks=loadPicks(); // load picks now that currentUser is set
    try{ normalizeAllPicksInPlace(); }catch{}
    try{ syncPicksToServer(); }catch(e){ console.warn('[SharpPick] syncPicksToServer failed:', e?.message); }
    applyUser();
    document.getElementById('nameModalOverlay').classList.add('hidden');
  } else {
    // Modal is visible by default; just focus the input
    setTimeout(()=>{ const inp=document.getElementById('nameInput'); if(inp) inp.focus(); },100);
  }
}

function applyUser(){
  if(!currentUser) return;
  const chip=document.getElementById('userChip');
  const av=document.getElementById('userChipAvatar');
  const nm=document.getElementById('userChipName');
  if(chip){ chip.style.display='flex'; }
  if(av)  { av.textContent=currentUser.name[0].toUpperCase(); }
  if(nm)  { nm.textContent=currentUser.name; }
  picks=loadPicks();
  // Clean up stale daily challenge picks that used the broken 'challenge_' gameId prefix.
  const hadStaleChallenges = picks.some(p => typeof p.gameId === 'string' && p.gameId.startsWith('challenge_'));
  if(hadStaleChallenges){
    picks = picks.filter(p => !(typeof p.gameId === 'string' && p.gameId.startsWith('challenge_')));
    try{ localStorage.setItem(picksKey(), JSON.stringify(picks)); }catch{}
    console.log('[SharpPick] Cleaned up stale challenge_ picks');
  }

  // Auto-clear stuck prop picks with no playerId that are more than 48 hours old.
  // These are picks from the old daily challenge system that can never settle because
  // checkPropPickResults needs a playerId to match against the boxscore.
  const twoDaysAgo = Date.now() - 48 * 60 * 60 * 1000;
  const stuckProps = picks.filter(p =>
    p.type === 'prop' &&
    normalizeResult(p.result) === 'pending' &&
    !p.playerId &&
    (p.madeAt || 0) < twoDaysAgo
  );
  if(stuckProps.length){
    // Delete from server first, then remove locally
    stuckProps.forEach(p => {
      const pid = p._syncId || p.id;
      if(pid && currentUser?.id && supaOnline){
        sbDelete('user_picks', `id=eq.${pid}&user_id=eq.${currentUser.id}`).catch(()=>{});
      }
    });
    picks = picks.filter(p => !stuckProps.includes(p));
    try{ localStorage.setItem(picksKey(), JSON.stringify(picks)); }catch{}
    console.log(`[SharpPick] Auto-cleared ${stuckProps.length} stuck prop pick(s) with no playerId`);
  }
  try{ computeRatingsDaily(); }catch{}
  updateRecordUI();
  setTimeout(updateBankrollUI, 100);
  if(typeof startServerSync==='function') startServerSync();
  if(typeof checkOnboarding==='function') setTimeout(checkOnboarding, 1200);
  if(typeof scheduleDailyDigest==='function') setTimeout(scheduleDailyDigest, 5000);
  // Schedule pre-game reminders for existing picks
  setTimeout(()=>{ try{ schedulePreGameReminders(); }catch(e){ console.warn('[Push] pregame reminder err:', e?.message); } }, 3000);
  if(typeof scheduleWeeklyRecapPush==='function') setTimeout(scheduleWeeklyRecapPush, 3000);
  setTimeout(()=>{
    if(!localStorage.getItem('push_prompt_shown')){
      localStorage.setItem('push_prompt_shown','1');
      if(typeof renderPushPrompt==='function') renderPushPrompt();
    }
  }, 4000);
  // Sync rebuy count early so bankroll figure is accurate on first render
  // Runs in background — updates bankroll UI when server responds
  setTimeout(async () => {
    try {
      await syncRebuyCountFromServer();
      updateBankrollUI?.();
    } catch(e) { console.warn('[Bankroll] rebuy sync in applyUser failed:', e?.message); }
  }, 800);
}

// Ensure a public profile row exists (for leaderboard display names)
async function ensureProfile(){
  try{
    if(!currentUser?.id || !supaOnline) return;

    const displayName = (currentUser?.name || currentUser?.email || '').toString().trim();
    if(!displayName) return;

    // Try PATCH first (update existing row) — this is more reliable than upsert
    const patchR = await fetch(
      `${SUPA_REST}/profiles?user_id=eq.${currentUser.id}`,
      {
        method: 'PATCH',
        headers: {...SUPA_HDR, 'Prefer': 'return=minimal'},
        body: JSON.stringify({ display_name: displayName, updated_at: new Date().toISOString() })
      }
    );

    if(patchR.ok) {
      markSupaOk();
      console.log('✅ Profile name updated:', displayName);
      return;
    }

    // If PATCH failed (row doesn't exist yet), try POST to insert
    const postR = await fetch(`${SUPA_REST}/profiles`, {
      method: 'POST',
      headers: {...SUPA_HDR, 'Prefer': 'resolution=merge-duplicates,return=minimal'},
      body: JSON.stringify({ user_id: currentUser.id, display_name: displayName })
    });
    if(postR.ok) {
      markSupaOk();
      console.log('✅ Profile created:', displayName);
    }
    else console.warn('ensureProfile: HTTP', postR.status);

  }catch(e){
    console.warn('ensureProfile failed:', e?.message || e);
  }
}


// submitName is now replaced by submitGuest/submitLogin/submitSignup
// Kept as no-op for any legacy references
function submitName(){ submitGuest(); }

function promptRename(){
  const newName=prompt('Change your display name:',currentUser?.name||'');
  if(!newName||!newName.trim()) return;
  const name=newName.trim().slice(0,24);
  currentUser={...currentUser, name};
  saveUser(currentUser);
  applyUser();
  publishToLeaderboard();
  ensureProfile(); // sync new name to Supabase for leaderboard
}

// Auth keyboard shortcuts (nameInput/nameSubmitBtn removed — now handled inline)
// Enter key handled via onkeydown attributes on each auth input

// ─── PICKS STORAGE (user-scoped) ─────────────────────────────────
function picksKey(){ return `ls_picks_${currentUser?.id||'anon'}`; }
function loadPicks(){
  try{
    const key = picksKey();
    const main = JSON.parse(localStorage.getItem(key)||'[]') || [];
    // One-time migration: if a user previously made picks while "anon",
    // merge them into the logged-in key so records don't appear to reset.
    const uid = currentUser?.id;
    if(uid){
      const migKey = `ls_picks_migrated_${uid}`;
      if(!localStorage.getItem(migKey)){
        let anon = [];
        try{ anon = JSON.parse(localStorage.getItem('ls_picks_anon')||'[]') || []; }catch{}
        if(Array.isArray(anon) && anon.length){
          // de-dup by id when possible, otherwise by composite signature
          const seen = new Set(main.map(p=>p.id||`${p.madeAt||''}|${p.description||''}|${p.type||''}`));
          for(const p of anon){
            const sig = p.id||`${p.madeAt||''}|${p.description||''}|${p.type||''}`;
            if(!seen.has(sig)){ main.push(p); seen.add(sig); }
          }
          localStorage.setItem(key, JSON.stringify(main));
          localStorage.removeItem('ls_picks_anon');
        }
        localStorage.setItem(migKey,'1');
      }
    }
    return main;
  }catch{ return []; }
}
function savePicks(){
  try{ normalizeAllPicksInPlace(); }catch{}
  localStorage.setItem(picksKey(),JSON.stringify(picks));
  try{ if(typeof computeRatingsDaily==="function") computeRatingsDaily(); }catch{}
  try{ if(typeof syncPicksToServer==="function") syncPicksToServer(); }catch(e){ console.warn('[SharpPick] savePicks sync failed:', e?.message); }
  publishPickTrends();      // async, fire-and-forget
  checkAchievements();
  updateMobileBadge();
  // Reschedule pre-game reminders whenever picks change
  setTimeout(()=>{ try{ schedulePreGameReminders(); }catch{} }, 500);
}
// ═══════════════════════════════════════════════════════
// SHARP RATING (PROPRIETARY) — Daily Recalculation (Client)
// NOTE: In a production setup, move this to a server job.
// This implementation recalculates once per local day and caches results.
// ═══════════════════════════════════════════════════════
const RATINGS_KEY = () => `ls_ratings_${currentUser?.id||'anon'}`;

function todayKey(ts=Date.now()){
  const d=new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }

function americanProfit(risk, american){
  const o = parseFloat(american);
  if(!isFinite(o)) return Math.round(risk*(100/110)*100)/100;
  if(o>0) return Math.round(risk*(o/100)*100)/100;
  return Math.round(risk*(100/Math.abs(o))*100)/100;
}
function pickPnL(p){
  const risk = Math.max(0, +p.wager||0);
  if(p.result==='won') return americanProfit(risk, p.odds||-110);
  if(p.result==='lost') return -risk;
  return 0; // push/void
}

function weekKeyFromTs(ts){
  // ISO week key: YYYY-WW
  const d=new Date(ts);
  // Thursday in current week decides the year.
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() + 3 - ((d.getDay()+6)%7));
  const week1=new Date(d.getFullYear(),0,4);
  const weekNo=1+Math.round(((d-week1)/86400000 - 3 + ((week1.getDay()+6)%7))/7);
  return `${d.getFullYear()}-${String(weekNo).padStart(2,'0')}`;
}

function computeConsistencyScore(picksArr){
  // Consistency: penalize weeks with ROI < -5%
  const byWeek={};
  picksArr.forEach(p=>{
    const ts = p.settledAt || p.madeAt || Date.now();
    const wk = weekKeyFromTs(ts);
    if(!byWeek[wk]) byWeek[wk]={risk:0,pnl:0};
    const risk=Math.max(0, +p.wager||0);
    byWeek[wk].risk += risk;
    byWeek[wk].pnl  += pickPnL(p);
  });
  const weeks=Object.keys(byWeek);
  if(!weeks.length) return 0;
  let bad=0;
  weeks.forEach(w=>{
    const r=byWeek[w].risk||0;
    const roi = r>0 ? (byWeek[w].pnl||0)/r : 0;
    if(roi < -0.05) bad++;
  });
  return clamp(100 - (bad/weeks.length)*120, 0, 100);
}

function computeSinglesRating(picksArr, isAllTime){
  // NOTE: Sharp Rating computation is intentionally server-side.
  // Frontend only derives *display* metrics like Win% / ROI from picks.
  const n = (picksArr||[]).length;
  if(n<=0) return {rating:null, tier:'—', n:0, winRate:0, roi:0, subs:null};

  const wins=(picksArr||[]).filter(p=>p.result==='won').length;
  const losses=(picksArr||[]).filter(p=>p.result==='lost').length;
  const risk=(picksArr||[]).reduce((a,p)=>a+Math.max(0, Number(p.wager||0)),0);
  const pnl=(picksArr||[]).reduce((a,p)=>a+pickPnL(p),0);

  const winRate = (wins+losses)>0 ? wins/(wins+losses) : 0;
  const roi = risk>0 ? pnl/risk : 0;

  // rating/tier are provided by Supabase (user_ratings) when available
  return { rating:null, tier:'—', n, winRate, roi, subs:null };
}

function tierForSingles(r, n){
  if(!isFinite(r)) return '—';
  // 0–1000 scale tiers
  // Elite: 750+ with 50+ picks (proven edge at scale)
  // Pro:   600+ 
  // Sharp: 500+ (above average)
  // Solid: 400+
  // Rookie: below 400
  if(r>=750 && n>=50) return 'Elite';
  if(r>=600) return 'Pro';
  if(r>=500) return 'Sharp';
  if(r>=400) return 'Solid';
  return 'Rookie';
}

function computeParlayRating(parlaysArr, isAllTime){
  const n = parlaysArr.length;
  if(n<=0) return {rating:null, tier:'—', n:0, roi:0, avgLegs:0, subs:null};

  const risk=parlaysArr.reduce((a,p)=>a+Math.max(0,+p.wager||0),0);
  const pnl=parlaysArr.reduce((a,p)=>a+pickPnL(p),0);
  const roi = risk>0 ? pnl/risk : 0;
  const avgLegs = parlaysArr.length ? (parlaysArr.reduce((a,p)=>a+((p.parlayLegs||[]).length||0),0)/parlaysArr.length) : 0;

  const efficiencyScore = clamp(((roi - (-0.10))/0.40)*100, 0, 100);
  const riskScore = clamp(100 - Math.abs(avgLegs - 3)*15, 0, 100);
  const confidenceScore = clamp((Math.sqrt(n)/15)*100, 0, 100);

  const rating = 0.50*efficiencyScore + 0.25*riskScore + 0.25*confidenceScore;

  return {
    rating: Math.round(rating),
    tier: tierForParlay(rating, n),
    n, roi, avgLegs,
    subs:{efficiencyScore, riskScore, confidenceScore}
  };
}

function tierForParlay(r, n){
  if(!isFinite(r)) return '—';
  if(r>=85 && n>=50) return 'Sniper';
  if(r>=70) return 'Strategic';
  if(r>=55) return 'Calculated';
  if(r>=40) return 'Aggressive';
  return 'Reckless';
}

function computeSharpRatingsSnapshot(nowTs=Date.now()){
  const MS_90D = 90*24*60*60*1000;
  const since90 = nowTs - MS_90D;

  const settled = picks.filter(p=>p.result && normalizeResult(p.result)!=='pending');
  const settledSingles = settled.filter(p=>p.type!=='parlay' && p.type!=='prop' ? true : true).filter(p=>p.type!=='parlay'); // singles includes spread/total/prop
  const settledParlays = settled.filter(p=>p.type==='parlay');

  // Odds guardrails (singles only)
  function inOddsRange(p){
    const o = parseFloat(p.odds);
    if(!isFinite(o)) return true;
    return o>=-250 && o<=250;
  }

  const singles90 = settledSingles.filter(p=>(p.settledAt||p.madeAt||0) >= since90).filter(inOddsRange);
  const singlesAT = settledSingles.filter(inOddsRange);

  const parlays90 = settledParlays.filter(p=>(p.settledAt||p.madeAt||0) >= since90);
  const parlaysAT = settledParlays;

  // Per-sport buckets for singles
  function sportKey(p){
    return (p.league||'Other').toUpperCase();
  }
  const sportBuckets90 = {};
  const sportBucketsAT = {};
  singles90.forEach(p=>{
    const k=sportKey(p);
    (sportBuckets90[k]=sportBuckets90[k]||[]).push(p);
  });
  singlesAT.forEach(p=>{
    const k=sportKey(p);
    (sportBucketsAT[k]=sportBucketsAT[k]||[]).push(p);
  });

  // Compute per-sport ratings (gate display by n thresholds)
  const sports90 = {};
  const sportsAT = {};
  Object.keys(sportBuckets90).forEach(k=>{
    if((sportBuckets90[k]||[]).length>=20){
      sports90[k]=computeSinglesRating(sportBuckets90[k], false);
    }
  });
  Object.keys(sportBucketsAT).forEach(k=>{
    if((sportBucketsAT[k]||[]).length>=50){
      sportsAT[k]=computeSinglesRating(sportBucketsAT[k], true);
    }
  });

  // Overall: pick-count weighted across eligible sports
  function weightedOverall(sportsObj){
    const items = Object.entries(sportsObj).filter(([,v])=>v && isFinite(v.rating));
    const denom = items.reduce((a,[,v])=>a+(v.n||0),0);
    if(!denom) return {rating:null, tier:'—', n:0};
    const num = items.reduce((a,[,v])=>a+(v.rating*(v.n||0)),0);
    const r = num/denom;
    return {rating: Math.round(r), tier: tierForSingles(r, denom), n: denom};
  }

  const overall90 = weightedOverall(sports90);
  const overallAT = weightedOverall(sportsAT);

  const parlay90 = computeParlayRating(parlays90,false);
  const parlayAT = computeParlayRating(parlaysAT,true);

  // Inactivity decay (90D only): if no singles pick made in last 14 days
  const lastSingleTs = (picks.filter(p=>p.type!=='parlay').map(p=>p.madeAt||0).sort((a,b)=>b-a)[0]) || 0;
  const daysInactive = lastSingleTs ? Math.floor((nowTs - lastSingleTs)/86400000) : 999;
  if(overall90.rating!==null && daysInactive>=14){
    const weeksInactive = Math.min(5, Math.floor((daysInactive-14)/7)+1);
    // Decay scaled to 0-1000: deduct 10 pts per inactive week (was 1 pt on 0-100)
    overall90.rating = clamp(overall90.rating - weeksInactive * 10, 0, 1000);
    overall90.tier = tierForSingles(overall90.rating, overall90.n||0);
    overall90.decay = weeksInactive;
  } else {
    overall90.decay = 0;
  }

  return {
    asOf: nowTs,
    dayKey: todayKey(nowTs),
    overall90, overallAT,
    sports90, sportsAT,
    parlay90, parlayAT
  };
}

function computeRatingsDaily(force=false){
  if(!currentUser) return null;
  const key = RATINGS_KEY();
  let cached=null;
  try{ cached = JSON.parse(localStorage.getItem(key)||'null'); }catch{}
  const today = todayKey();
  if(!force && cached && cached.dayKey===today) return cached;
  const snap = computeSharpRatingsSnapshot(Date.now());
  try{ localStorage.setItem(key, JSON.stringify(snap)); }catch{}
  return snap;
}


// ─── SUPABASE REST API (plain fetch — no library, no workers) ──────
const SUPA_URL = 'https://uibdzjvoehhpmjniksyk.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpYmR6anZvZWhocG1qbmlrc3lrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzMzgwMDUsImV4cCI6MjA4NzkxNDAwNX0.6-d8KmqsKBRfP5IZEJnm-Mhd3eAwFVFIRk2NM3xAAS4';
const SUPA_HDR = {'apikey':SUPA_KEY,'Authorization':'Bearer '+SUPA_KEY,'Content-Type':'application/json'};

// Returns the logged-in user's JWT — never returns the anon key
function _getUserToken() {
  // 1. In-memory session
  if (typeof authSession !== 'undefined' && authSession?.access_token) {
    return authSession.access_token;
  }
  // 2. Scan ALL localStorage keys for any JWT (anything that looks like a Supabase token)
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    console.log('[SharpPick] localStorage keys:', keys.join(', '));

    // Try known key first
    const direct = localStorage.getItem('sb_token');
    if (direct && direct.length > 20) {
      console.log('[SharpPick] Token found under sb_token, length:', direct.length);
      return direct;
    }

    // Scan all keys for JWT tokens (they start with 'eyJ')
    for (const k of keys) {
      const v = localStorage.getItem(k);
      if (v && v.startsWith('eyJ') && v.length > 100) {
        console.log('[SharpPick] JWT found under key:', k);
        return v;
      }
      // Could be JSON object with access_token
      if (v && v.includes('access_token')) {
        try {
          const parsed = JSON.parse(v);
          const t = parsed?.access_token || parsed?.session?.access_token;
          if (t && t.length > 20) {
            console.log('[SharpPick] Token found in JSON under key:', k);
            return t;
          }
        } catch {}
      }
    }
  } catch(e) {
    console.warn('[SharpPick] localStorage scan error:', e.message);
  }
  // 3. SUPA_HDR only if updated to a user token
  try {
    const h = (typeof SUPA_HDR !== 'undefined') ? SUPA_HDR?.Authorization : null;
    if (h && h.startsWith('Bearer ') && h.slice(7) !== SUPA_KEY) return h.slice(7);
  } catch {}
  console.warn('[SharpPick] _getUserToken: no token found anywhere');
  return null;
}
const SUPA_REST = SUPA_URL+'/rest/v1';
const SUPA_AUTH = SUPA_URL + '/auth/v1';
const SUPA_AUTH_HDR = { 'apikey': SUPA_KEY, 'Content-Type': 'application/json' };

// ── Supabase connectivity state ────────────────────────────────────
let supaOnline = true;          // flips false after repeated failures
let supaFailCount = 0;
const SUPA_MAX_FAILS = 3;       // stop retrying after 3 consecutive failures
const SUPA_RETRY_AFTER = 60000; // re-test after 60s if offline

function markSupaFail(label, err){
  const msg = err?.message || String(err);

  // HTTP 400/404/409 = server is UP but query is wrong (schema mismatch, bad column, etc.)
  // These should NOT count toward the offline threshold — only network/5xx errors should
  const is4xx = /HTTP 4\d\d/.test(msg);
  if(is4xx) {
    console.warn(`[${label}] client error (server is up):`, msg);
    return; // don't increment fail count — server is reachable
  }

  supaFailCount++;
  if(msg.includes('Failed to fetch')){
    if(supaFailCount===1) console.warn(`⚠️ Supabase unreachable — check if project is paused at supabase.com/dashboard (free tier pauses after 7 days of inactivity). Will retry.`);
  } else {
    console.warn(`[${label}]`, msg);
  }
  if(supaFailCount >= SUPA_MAX_FAILS){
    if(supaOnline){
      supaOnline = false;
      console.warn('⚠️ Supabase offline — falling back to localStorage only. Will retry in 60s.');
      // Show user-visible offline banner
      showOfflineBanner(true);
      setTimeout(retrySupaConnection, SUPA_RETRY_AFTER);
    }
  }
}

function markSupaOk(){
  if(!supaOnline || supaFailCount > 0){
    console.log('✅ Supabase reconnected');
    showOfflineBanner(false);
  }
  supaOnline = true;
  supaFailCount = 0;
}

async function retrySupaConnection(){
  try{
    const r = await Promise.race([
      fetch(`${SUPA_REST}/user_ratings?select=user_id&limit=1`,{headers:{...SUPA_HDR,'Accept':'application/json'}}),
      timeoutPromise(5000)
    ]);
    if(r.ok){ markSupaOk(); publishToLeaderboard(); }
    else throw new Error(`HTTP ${r.status}`);
  }catch(e){
    supaFailCount = SUPA_MAX_FAILS - 1; // allow one more fail before suppressing
    markSupaFail('retry', e);
    setTimeout(retrySupaConnection, SUPA_RETRY_AFTER);
  }
}

function timeoutPromise(ms){ return new Promise((_,rej)=>setTimeout(()=>rej(new Error('Request timed out')),ms)); }

async function sbFetch(url, opts={}){
  if(!supaOnline) throw new Error('Supabase offline');
  // Use Promise.race instead of AbortSignal to avoid structured-clone errors
  return Promise.race([
    fetch(url, opts),
    timeoutPromise(8000)
  ]);
}

async function sbSelect(table, params=''){
  try{
    // Use user token when available so RLS lets us read all rows we're allowed to see
    const userToken = _getUserToken();
    const authHeaders = userToken
      ? { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + userToken, 'Content-Type': 'application/json' }
      : { ...SUPA_HDR };
    const r = await fetch(`${SUPA_REST}/${table}?${params}`, {
      headers:{...authHeaders,'Accept':'application/json'}
    });
    if(!r.ok){
      const txt = await r.text();
      throw new Error(`HTTP ${r.status}: ${txt}`);
    }
    markSupaOk();
    return r.json();
  }catch(e){
    markSupaFail(table, e);
    throw new Error(`[${table}] ${e.message}`);
  }
}

// Expose minimal helpers for debugging in DevTools (optional)
try{
  if(typeof window !== 'undefined'){
    window.sbSelect = sbSelect;
    window.sbRpc = window.sbRpc || sbRpc;
    window.SUPA_REST = SUPA_REST;
  }
}catch{}



async function sbRpc(fn, args={}){
  try{
    const r = await sbFetch(`${SUPA_REST}/rpc/${fn}`, {
      method:'POST',
      headers:{...SUPA_HDR,'Accept':'application/json'},
      body: JSON.stringify(args||{})
    });
    if(!r.ok){
      const t = await r.text();
      throw new Error(`HTTP ${r.status}: ${t}`);
    }
    markSupaOk();
    return r.json();
  }catch(e){
    markSupaFail('rpc:'+fn, e);
    throw new Error(`[rpc:${fn}] ${e.message}`);
  }
}


async function sbDelete(table, params=''){
  if(!supaOnline) return;
  try{
    const r = await fetch(`${SUPA_REST}/${table}?${params}`, {
      method: 'DELETE',
      headers: {...SUPA_HDR, 'Prefer': 'return=minimal'}
    });
    if(!r.ok && r.status !== 404){
      const txt = await r.text().catch(()=>'');
      markSupaFail(table+' DELETE', new Error('HTTP '+r.status+' '+txt));
    } else {
      markSupaOk();
    }
  }catch(e){ markSupaFail(table+' DELETE', e); }
}

async function sbUpsert(table, row){
  try{
    // Always use the user JWT for writes — anon key is rejected by RLS
    // on user-scoped tables (pickem_picks, pickem_records, user_achievements, etc.)
    const userToken = _getUserToken();
    const authHeaders = userToken
      ? { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + userToken, 'Content-Type': 'application/json' }
      : { ...SUPA_HDR };
    const r = await fetch(`${SUPA_REST}/${table}`, {
      method:'POST',
      headers:{...authHeaders,'Prefer':'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify(row)
    });
    if(!r.ok){
      const txt = await r.text();
      throw new Error(`HTTP ${r.status}: ${txt}`);
    }
    markSupaOk();
  }catch(e){
    markSupaFail(table, e);
    throw new Error(`[${table}] ${e.message}`);
  }
}

// Upsert with an explicit ON CONFLICT target — needed when the table has a
// composite primary key (no single 'id' column) so Supabase knows which columns
// to match on. conflictCols is a comma-separated string e.g. 'user_id,contest_id,game_id'
async function sbUpsertOnConflict(table, row, conflictCols){
  try{
    const userToken = _getUserToken();
    const authHeaders = userToken
      ? { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + userToken, 'Content-Type': 'application/json' }
      : { ...SUPA_HDR };
    const r = await fetch(`${SUPA_REST}/${table}`, {
      method:'POST',
      headers:{...authHeaders, 'Prefer': `resolution=merge-duplicates,return=minimal`},
      body:JSON.stringify(row)
    });
    if(!r.ok){
      const txt = await r.text();
      throw new Error(`HTTP ${r.status}: ${txt}`);
    }
    markSupaOk();
  }catch(e){
    markSupaFail(table, e);
    throw new Error(`[${table}] ${e.message}`);
  }
}

// ─── LEGACY LEADERBOARD (deprecated) ────────────
// SharpPick now uses the Sharp Rating leaderboards (RPC: get_leaderboard_90 / get_leaderboard_90_provisional).
// Keep this as a no-op to avoid any writes to the legacy public.leaderboard table.
async function publishToLeaderboard(){
  if (!currentUser?.id || !supaOnline) return;

  const token = _getUserToken();
  if (!token) return;

  try {
    // Compute fresh ratings from local settled picks
    const snap = computeSharpRatingsSnapshot(Date.now());
    const s90  = snap.overall90  || {};
    const sAT  = snap.overallAT  || {};
    const p90  = snap.parlay90   || {};
    const pAT  = snap.parlayAT   || {};

    // Build the settled counts for record string
    const ps = Array.isArray(picks) ? picks : [];
    const singles = ps.filter(p => p.type !== 'parlay');
    const singles90cutoff = Date.now() - 90*24*60*60*1000;
    const s90picks = singles.filter(p => (p.settledAt||p.madeAt||0) >= singles90cutoff && normalizeResult(p.result) !== 'pending');
    const s90pend  = singles.filter(p => (p.settledAt||p.madeAt||0) >= singles90cutoff && normalizeResult(p.result) === 'pending');
    const parlays90picks = ps.filter(p => p.type==='parlay' && (p.settledAt||p.madeAt||0) >= singles90cutoff);

    const w90 = s90picks.filter(p=>normalizeResult(p.result)==='won').length;
    const l90 = s90picks.filter(p=>normalizeResult(p.result)==='lost').length;
    const push90 = s90picks.filter(p=>normalizeResult(p.result)==='push').length;
    const wAT = singles.filter(p=>normalizeResult(p.result)==='won').length;
    const lAT = singles.filter(p=>normalizeResult(p.result)==='lost').length;
    const pushAT = singles.filter(p=>normalizeResult(p.result)==='push').length;

    const picks90count = s90picks.length + parlays90picks.filter(p=>normalizeResult(p.result)!=='pending').length;
    const pend90count  = s90pend.length  + parlays90picks.filter(p=>normalizeResult(p.result)==='pending').length;
    const isProv = picks90count < 18;

    // Top sport
    const byLeague = {};
    s90picks.forEach(pk => {
      const lg = pk.league || 'Other';
      byLeague[lg] = (byLeague[lg]||0)+1;
    });
    const topSport = Object.entries(byLeague).sort((a,b)=>b[1]-a[1])[0]?.[0] || null;

    // Calculate roi90 first — needed for Sharp Rating formula below
    const _roi90profit = s90picks.reduce((sum,p)=>{
      const o=Number(p.odds||-110); const w=Number(p.wager||50);
      const r=normalizeResult(p.result);
      if(r==='won') return sum+(o>0 ? o/100*w : w/Math.abs(o)*100);
      if(r==='lost') return sum-w;
      return sum;
    }, 0);
    const _roi90stake = s90picks.reduce((s,p)=>s+Number(p.wager||50), 0);
    const roi90 = _roi90stake > 0 ? Number((_roi90profit/_roi90stake*100).toFixed(1)) : 0;
    const winRate90 = (w90+l90) > 0 ? Number((w90/(w90+l90)*100).toFixed(1)) : 0;

    // Sharp Rating formula (0–1000 scale) — matches _pushRatingsToSupabase
    const winRate90_lb = (w90+l90) > 0 ? w90/(w90+l90)*100 : 0;
    const _winRateScore_lb = clamp((winRate90_lb - 52.4) * 20 + 500, 0, 1000);
    const _roiScore_lb     = clamp(roi90 * 25 + 500, 0, 1000);
    const _conScore_lb     = clamp((s90picks.length >= 5 ? computeConsistencyScore(s90picks) : 50) * 10, 0, 1000);
    const _volMult_lb      = clamp(0.7 + (Math.min(s90picks.length, 50) / 50) * 0.3, 0.7, 1.0);
    // Always recalculate from picks — never use cached s90.rating which may be stale/wrong scale
    const sharpRating = Math.round(clamp((_winRateScore_lb*0.5 + _roiScore_lb*0.3 + _conScore_lb*0.2) * _volMult_lb, 0, 1000) * 10) / 10;


    const isVerified_lb = picks90count >= 20;
    const row = {
      user_id:                   currentUser.id,
      sharp_rating_90:           sharpRating,
      singles_overall_90:        sharpRating,
      singles_overall_all_time:  sharpRating,
      singles_picks_90:          picks90count,
      singles_picks_all_time:    picks90count,
      singles_verified_90:       isVerified_lb,
      singles_verified_all_time: isVerified_lb,
      singles_by_sport_90:       {},
      win_rate_90:               winRate90,
      roi_90:                    roi90,
      units_90:                  Number((s90.units||0).toFixed(2)),
      picks_90:                  picks90count,
      pending_90:                pend90count,
      all_time_singles:          `${wAT}-${lAT}-${pushAT}`,
      all_time_roi:              Number((sAT.roi||0).toFixed(1)),
      top_sport:                 topSport,
      top_sport_rating:          topSport ? sharpRating : null,
      cur_streak:                snap.overall90?.streak || _sp_computeStreak(
                                   singles.filter(p=>normalizeResult(p.result)!=='pending')
                                          .sort((a,b)=>(b.settledAt||b.madeAt||0)-(a.settledAt||a.madeAt||0))
                                 ),
      is_provisional:            !isVerified_lb,
      provisional_reason:        !isVerified_lb ? `${picks90count} settled picks (need 20)` : null,
      parlay_roi_90:             Number((p90.roi||0).toFixed(1)),
      parlays_90:                '0-0-0',
      parlays_picks_90:          0,
      parlays_verified_90:       false,
      calculated_at:             new Date().toISOString(),
      calculated_for_date:       new Date().toISOString().slice(0,10),
    };

    const resp = await fetch(`${SUPA_REST}/user_ratings`, {
      method: 'POST',
      headers: {
        ...SUPA_HDR,
        'Authorization': `Bearer ${token}`,   // use user token, not anon key
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(row)
    });

    if (resp.ok) {
      markSupaOk();
      console.log('[SharpPick] Leaderboard rating published: SR=' + sharpRating + ' picks=' + s90picks.length + ' w=' + w90 + ' l=' + l90 + ' wr=' + winRate90_lb.toFixed(1) + ' roi=' + roi90 + ' wrScore=' + _winRateScore_lb.toFixed(0) + ' roiScore=' + _roiScore_lb.toFixed(0) + ' vol=' + _volMult_lb.toFixed(2));
    } else {
      const txt = await resp.text().catch(()=>'');
      console.warn('[SharpPick] publishToLeaderboard failed: HTTP ' + resp.status + ' ' + txt.slice(0,200));
    }
  } catch(e) {
    console.warn('[SharpPick] publishToLeaderboard error:', e?.message || e);
  }
}

// Admin-only: bulk upsert ALL settled picks directly to user_picks,
// bypassing the Netlify function which does INSERT-ignore (no updates).
// Only called by the RECALCULATE button, never automatically.
async function _adminForceUpsertPicks(){
  if (!currentUser?.id) return false;

  const token = _getUserToken();
  if (!token) {
    console.warn('[SharpPick] _adminForceUpsertPicks: no auth token');
    return false;
  }

  const settled = picks.filter(p => {
    const r = normalizeResult(p.result);
    return (r === 'won' || r === 'lost' || r === 'push') && (p._syncId || p.id);
  });

  if (!settled.length) { console.log('[SharpPick] No settled picks to upsert'); return true; }

  // Build rows — only columns we KNOW exist in user_picks
  const rows = settled.map(p => {
    const r = pickToRow(p);
    if (!r) return null;
    // Remove any columns that might not exist
    delete r.final_score;
    delete r.game_str;
    return r;
  }).filter(Boolean);

  console.log(`[SharpPick] Force-upserting ${rows.length} settled picks directly to Supabase...`);

  // Send in batches of 20 to avoid request size limits
  const BATCH = 20;
  let ok = 0, fail = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    try {
      const resp = await fetch(`${SUPA_REST}/user_picks`, {
        method: 'POST',
        headers: {
          'apikey':        SUPA_KEY,
          'Authorization': `Bearer ${token}`,
          'Content-Type':  'application/json',
          'Prefer':        'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify(batch)
      });
      if (resp.ok) {
        ok += batch.length;
      } else {
        const txt = await resp.text().catch(()=>'');
        console.warn(`[SharpPick] Batch ${i}-${i+BATCH} failed:`, resp.status, txt);
        fail += batch.length;
      }
    } catch(e) {
      console.warn('[SharpPick] Batch upsert error:', e?.message);
      fail += batch.length;
    }
  }

  console.log(`[SharpPick] Force upsert done: ${ok} ok, ${fail} failed`);
  return fail === 0;
}

// Compute ratings locally and upsert directly into user_ratings.
// Called by the admin RECALCULATE button.
async function _pushRatingsToSupabase(){
  if (!currentUser?.id || !supaOnline) return false;

  const token = _getUserToken();
  if (!token) { console.warn('[SharpPick] _pushRatingsToSupabase: no auth token — are you logged in?'); return false; }

  try {
    const ps = Array.isArray(picks) ? picks : [];
    const singles = ps.filter(p => p.type !== 'parlay');
    const cutoff90 = Date.now() - 90*24*60*60*1000;

    const s90 = singles.filter(p => {
      const r = normalizeResult(p.result);
      return (p.settledAt||p.madeAt||0) >= cutoff90 && r !== 'pending';
    });
    const s90pend = singles.filter(p => {
      return (p.settledAt||p.madeAt||0) >= cutoff90 && normalizeResult(p.result) === 'pending';
    });
    const parl90 = ps.filter(p => p.type==='parlay' && (p.settledAt||p.madeAt||0) >= cutoff90);

    const w90  = s90.filter(p => normalizeResult(p.result)==='won').length;
    const l90  = s90.filter(p => normalizeResult(p.result)==='lost').length;
    const pu90 = s90.filter(p => normalizeResult(p.result)==='push').length;
    const wAT  = singles.filter(p => normalizeResult(p.result)==='won').length;
    const lAT  = singles.filter(p => normalizeResult(p.result)==='lost').length;
    const puAT = singles.filter(p => normalizeResult(p.result)==='push').length;

    const picks90count = s90.length + parl90.filter(p=>normalizeResult(p.result)!=='pending').length;
    const pend90count  = s90pend.length + parl90.filter(p=>normalizeResult(p.result)==='pending').length;

    const profit90 = s90.reduce((sum,p) => {
      const o=Number(p.odds||-110), w=Number(p.wager||50), r=normalizeResult(p.result);
      if(r==='won') return sum + (o>0 ? o/100*w : w/Math.abs(o)*100);
      if(r==='lost') return sum - w;
      return sum;
    }, 0);
    const stake90 = s90.reduce((s,p) => s + Number(p.wager||50), 0);

    const winRate90   = (w90+l90) > 0 ? w90/(w90+l90)*100 : 0;
    const roi90       = stake90 > 0 ? profit90/stake90*100 : 0;

    // ── NEW Sharp Rating Formula (0–1000 scale) ──────────────────
    // Win Rate Score: breakeven (52.4%) = 500, 60% = 750, 65% = 1000
    // Scaled so that 52.4% maps to 500 and every 1% above breakeven = ~20 pts
    const winRateScore = clamp((winRate90 - 52.4) * 20 + 500, 0, 1000);

    // ROI Score: 0% ROI = 500, +10% = 750, -10% = 250
    // Each 1% of ROI = 25 pts
    const roiScore = clamp(roi90 * 25 + 500, 0, 1000);

    // Consistency Score: uses existing computeConsistencyScore (0–100) scaled to 0–1000
    const rawConsistency = s90.length >= 5 ? computeConsistencyScore(s90) : 50;
    const consistencyScore = clamp(rawConsistency * 10, 0, 1000);

    // Volume multiplier: scales 0.7→1.0 between 5 and 50 settled picks
    // Rewards users who have proven their edge over more picks
    const volumeMult = clamp(0.7 + (Math.min(s90.length, 50) / 50) * 0.3, 0.7, 1.0);

    // Weighted blend: 50% win rate, 30% ROI, 20% consistency — then volume-adjusted
    const rawRating = (winRateScore * 0.5 + roiScore * 0.3 + consistencyScore * 0.2) * volumeMult;
    const sharpRating = Math.round(clamp(rawRating, 0, 1000) * 10) / 10;
    // ─────────────────────────────────────────────────────────────

    const byLeague = {};
    s90.forEach(pk => { const lg=pk.league||'Other'; byLeague[lg]=(byLeague[lg]||0)+1; });
    const topSport = Object.entries(byLeague).sort((a,b)=>b[1]-a[1])[0]?.[0] || null;

    const settledDesc = singles
      .filter(p => normalizeResult(p.result)!=='pending')
      .sort((a,b) => (b.settledAt||b.madeAt||0)-(a.settledAt||a.madeAt||0));

    // Build sport breakdown for specialist leaderboard
    const bySport90 = {};
    s90.forEach(p => {
      const lg = (p.league||'Other').replace(/\s*[🏀🏈⚾🏒⚽]/g,'').trim();
      if(!bySport90[lg]) bySport90[lg] = {w:0,l:0,rating:0};
      if(normalizeResult(p.result)==='won') bySport90[lg].w++;
      if(normalizeResult(p.result)==='lost') bySport90[lg].l++;
    });
    // Give each sport its own mini-rating
    Object.keys(bySport90).forEach(lg => {
      const {w,l} = bySport90[lg];
      const wr = (w+l)>0 ? w/(w+l)*100 : 0;
      bySport90[lg] = Math.round(clamp((wr-52.4)*20+500,0,1000)*10)/10;
    });

    const isVerified = picks90count >= 20;

    const row = {
      user_id:                  currentUser.id,
      sharp_rating_90:          Number(sharpRating.toFixed(1)),
      singles_overall_90:       Number(sharpRating.toFixed(1)),
      singles_overall_all_time: Number(sharpRating.toFixed(1)),
      singles_picks_90:         picks90count,
      singles_picks_all_time:   picks90count,
      singles_verified_90:      isVerified,
      singles_verified_all_time:isVerified,
      singles_by_sport_90:      bySport90,
      win_rate_90:              Number(winRate90.toFixed(1)),
      roi_90:                   Number(roi90.toFixed(1)),
      units_90:                 Number((profit90/100).toFixed(2)),
      picks_90:                 picks90count,
      pending_90:               pend90count,
      all_time_singles:         `${wAT}-${lAT}-${puAT}`,
      all_time_roi:             Number(roi90.toFixed(1)),
      top_sport:                topSport,
      top_sport_rating:         topSport ? Number(sharpRating.toFixed(1)) : null,
      cur_streak:               (typeof _sp_computeStreak === 'function') ? _sp_computeStreak(settledDesc) : null,
      is_provisional:           !isVerified,
      provisional_reason:       !isVerified ? `${picks90count} settled picks (need 20)` : null,
      parlay_roi_90:            0,
      parlays_90:               '0-0-0',
      parlays_picks_90:         0,
      parlays_verified_90:      false,
      calculated_at:            new Date().toISOString(),
      calculated_for_date:      new Date().toISOString().slice(0,10),
    };

    console.log('[SharpPick] Pushing ratings:', `SR=${Number(sharpRating.toFixed(1))} WR=${Number(winRate90.toFixed(1))}% W/L=${w90}-${l90}`);

    // Try POST with user auth token (merge-duplicates = upsert)
    const authHeader = `Bearer ${token}`;
    const resp = await fetch(`${SUPA_REST}/user_ratings`, {
      method: 'POST',
      headers: {
        'apikey':        SUPA_KEY,
        'Authorization': authHeader,
        'Content-Type':  'application/json',
        'Prefer':        'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(row)
    });

    if (resp.ok) {
      console.log('[SharpPick] ✅ Ratings pushed to user_ratings — SR:', Number(sharpRating.toFixed(1)));
      // Force leaderboard to re-read directly from user_ratings table,
      // bypassing any RPC that might return a cached/stale value
      _lbSkipRpc = true;
      setTimeout(async () => {
        try { await renderLeaderboardPro(); } catch(e) {}
        _lbSkipRpc = false;
      }, 1000);
      return true;
    }

    const errText = await resp.text().catch(()=>'');
    console.warn('[SharpPick] user_ratings POST failed HTTP', resp.status, ':', errText);

    // If 401 — token problem. If 404/405 — user_ratings is a VIEW (not writable).
    // Either way, fall back to publishToLeaderboard() which uses the same pipeline
    // that already works for normal daily updates.
    try {
      await publishToLeaderboard();
      console.log('[SharpPick] publishToLeaderboard fallback triggered');
      return true;
    } catch(fbErr) {
      console.warn('[SharpPick] publishToLeaderboard fallback failed:', fbErr?.message);
    }
    return false;

  } catch(e) {
    console.warn('[SharpPick] _pushRatingsToSupabase error:', e?.message||e);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// Leaderboard helpers (pro leaderboard)
// ─────────────────────────────────────────────────────────────
function _num(v, d=0){
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function _tierFromRating(rating, picks){
  const sr = _num(rating, 0);
  const n  = _num(picks, 0);
  if(sr >= 750 && n >= 50) return 'Elite';
  if(sr >= 600) return 'Pro';
  if(sr >= 500) return 'Sharp';
  if(sr >= 400) return 'Solid';
  return 'Rookie';
}

function _tierIcon(tier){
  const t = String(tier||'').toLowerCase();
  if(t==='elite') return '🔥';
  if(t==='pro') return '💎';
  if(t==='sharp') return '🥇';
  if(t==='solid') return '🥈';
  return '🥉';
}

function _getDisplayNameForUserId(uid){
  // Prefer current user name/email
  try{
    if(currentUser?.id && uid === currentUser.id){
      const nm = (currentUser?.name || '').toString().trim();
      if(nm) return nm;
      const em = (currentUser?.email || '').toString().trim();
      if(em) return em.split('@')[0];
    }
  }catch{}
  // If we have a global nameMap, use it
  try{
    if(typeof nameMap !== 'undefined' && nameMap && nameMap[uid]) return nameMap[uid];
  }catch{}
  return `User ${String(uid||'').slice(0,6)}`;
}


// Live (client) record for current user so it reflects immediately (server ratings update daily)
function _getLocalRecord(){
  try{
    const ps = Array.isArray(picks) ? picks : [];
    let w=0,l=0,p=0;
    ps.forEach(x=>{
      const r = String(x?.result||'').toLowerCase();
      if(r==='won' || r==='win' || r==='w') w++;
      else if(r==='lost' || r==='loss' || r==='l') l++;
      else if(r==='push' || r==='p') p++;
    });
    return {w,l,p, total: w+l+p};
  }catch{
    return {w:0,l:0,p:0,total:0};
  }
}


async function fetchLeaderboard(){
  try{
    const limit = 250;

    // user_ratings actual columns: user_id, sharp_rating_90, win_rate_90, roi_90,
    // units_90, picks_90, pending_90, all_time_singles, all_time_roi, top_sport,
    // top_sport_rating, cur_streak, avg_odds_last10, is_provisional, provisional_reason,
    // singles_overall_90, calculated_for_date, calculated_at, parlay_roi_90

    let rows = null;

    try{
      rows = await sbSelect('user_ratings', `select=*&order=sharp_rating_90.desc.nullslast&limit=${limit}`);
    }catch(e1){
      try{
        rows = await sbSelect('user_ratings', `select=*&limit=${limit}`);
      }catch(e2){
        console.warn('All leaderboard queries failed');
      }
    }

    if(!rows || !rows.length) return [];

    // Fetch display names from profiles table
    const ids = Array.from(new Set(rows.map(r=>r.user_id).filter(Boolean)));
    const nameById = new Map();

    if(ids.length){
      try{
        const inList = ids.map(id=>`"${id}"`).join(',');
        const profs = await sbSelect('profiles', `select=user_id,display_name&user_id=in.(${inList})`);
        if(Array.isArray(profs)){
          profs.forEach(p=> nameById.set(p.user_id, (p.display_name||'').trim()));
        }
      }catch(e){
        console.warn('profiles fetch failed:', e?.message || e);
      }
    }

    return rows.map(r=>{
      // Parse the all_time_singles record string like "6-10-0"
      const atsStr = String(r.all_time_singles || '0-0-0');
      const atsParts = atsStr.split('-').map(Number);
      const w = _num(atsParts[0], 0);
      const l = _num(atsParts[1], 0);
      const p = atsParts.length >= 3 ? _num(atsParts[2], 0) : 0;

      const sharp = _num(r.sharp_rating_90, _num(r.singles_overall_90, 0));
      const winRate = _num(r.win_rate_90, 0);
      const roi = _num(r.roi_90, _num(r.all_time_roi, 0));
      const units = _num(r.units_90, 0);
      const picks90 = _num(r.picks_90, 0);
      const pending = _num(r.pending_90, 0);
      const settled = Math.max(0, picks90 - pending);

      const name =
        (nameById.get(r.user_id) || '').trim() ||
        ('user-' + String(r.user_id||'').slice(0,6));

      return {
        id: r.user_id,
        name,

        sharp,
        tier: (typeof _tierFromRating === 'function')
          ? _tierFromRating(sharp, picks90)
          : '—',

        winRate,
        roi,
        units,

        picks: picks90,
        pending,
        settled,

        record: w + '-' + l + '-' + p,

        topSport: r.top_sport || '',
        sportRating: _num(r.top_sport_rating, 0),

        streak: r.cur_streak || '',
        avgOdds: r.avg_odds_last10 != null ? String(r.avg_odds_last10) : '',

        provisional: !!r.is_provisional,
        provisionalReason: r.provisional_reason || '',

        bankroll: 0,
        recentPicks: []
      };
    });

  }catch(e){
    console.warn('fetchLeaderboard failed:', e?.message || e);
    return [];
  }
}



let LB_TAB = 'provisional';  // provisional | verified | specialists
let LB_SORT = 'sharp';       // sharp | roi | win | units | picks

function _sortRows(rows){
  const copy = [...(rows||[])];
  const dir = -1; // descending

  const keyFn = (r)=>{
    if(LB_SORT==='sharp') return _num(r.sharp,0);
    if(LB_SORT==='roi') return _num(r.roi,0);
    if(LB_SORT==='win') return _num(r.winRate,0);
    if(LB_SORT==='units') return _num(r.units,0);
    if(LB_SORT==='picks') return _num(r.picks,0);
    return _num(r.sharp,0);
  };

  copy.sort((a,b)=> dir*(keyFn(a)-keyFn(b)));
  return copy;
}

function _filterRows(rows){
  const uid = currentUser?.id;
  const arr = rows || [];

  if(LB_TAB==='weekly'){
    // 7-day leaderboard: users who have settled picks in last 7 days, sorted by win rate
    const weekCutoff = Date.now() - 7*24*60*60*1000;
    return (rows||[]).filter(r=>{
      if(r.picks90 < 2) return false;
      return !r.calculatedAt || Number(r.calculatedAt) > weekCutoff;
    }).sort((a,b)=>(_num(b.winRate)-_num(a.winRate))||(_num(b.picks90)-_num(a.picks90)));
  }
  if(LB_TAB==='verified'){
    // Verified leaderboard stays strict, but always show current user
    const verified = arr.filter(r=>!r.provisional || r.id===uid);
    // If empty, fall back to provisional so app never looks dead
    if(!verified.length) return arr.filter(r=>r.provisional || r.id===uid);
    return verified;
  }

  if(LB_TAB==='provisional'){
    return arr.filter(r=>r.provisional || r.id===uid);
  }

  if(LB_TAB==='specialists'){
    return arr.filter(r=>String(r.topSport||'').trim().length>0 || r.id===uid);
  }

  return arr;
}


function _pill(text){
  return `<span style="
    display:inline-flex;align-items:center;gap:6px;
    padding:4px 10px;border-radius:999px;
    background:rgba(255,255,255,.06);
    border:1px solid rgba(255,255,255,.10);
    font-size:12px;color:rgba(255,255,255,.85);">${text}</span>`;
}

async function renderLeaderboardPro(opts={}){
  const el = document.getElementById('leaderboardContent');
  if(!el) return;

  // Only show loading spinner on explicit user-triggered renders (not background syncs).
  // Background calls (from doPoll / syncPicksFromServer) pass {silent:true} to skip the flash.
  if(!opts.silent){
    el.innerHTML = `<div class="lb-empty"><div style="font-size:28px;margin-bottom:12px">⏳</div>LOADING LEADERBOARD…</div>`;
  }

  const rowsRaw = await fetchLeaderboard();

  // If the user is provisional, default them to the Provisional tab
  try{
    const me = (rowsRaw||[]).find(r=>r.id===currentUser?.id);
    if(me?.provisional && LB_TAB==='verified') LB_TAB='provisional';
  }catch{}

  const rows = _sortRows(_filterRows(rowsRaw));

  const tabBtn = (key,label)=>`
    <button class="lb-tab ${LB_TAB===key?'on':''}"
      onclick="LB_TAB='${key}';renderLeaderboardPro()">${label}</button>`;

  // Weekly leaderboard: filter rowsRaw to picks made in last 7 days
  // We approximate by using win_rate and picks count on a 7-day slice
  // The real filter happens server-side via the calculated_for_date field
  const weekAgo = Date.now() - 7*24*60*60*1000;
  const weeklyRows = (rowsRaw||[]).filter(r=>{
    if(!r.calculatedAt) return true;
    return Number(r.calculatedAt) > weekAgo;
  });

  const sortBtn = (key,label)=>`
    <button class="lb-tab ${LB_SORT===key?'on':''}"
      onclick="LB_SORT='${key}';renderLeaderboardPro()">${label}</button>`;

  const header = `
    <div class="lb-header">
      <div>
        <div style="font-weight:800;font-size:18px;letter-spacing:.4px">Sharp Leaderboard</div>
        <div style="color:var(--dim);font-size:12px;margin-top:2px">90-day performance • <span onclick="openSharpRatingExplainer()" style="color:var(--accent);cursor:pointer;text-decoration:underline;text-underline-offset:2px">What is Sharp Rating?</span></div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
          ${tabBtn('verified','Verified')}
          ${tabBtn('provisional','Provisional')}
          ${tabBtn('specialists','Specialists')}
          ${tabBtn('weekly','This Week 🔥')}
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
          ${sortBtn('sharp','Sharp Rating')}
          ${sortBtn('roi','ROI')}
          ${sortBtn('win','Win %')}
          ${sortBtn('units','Units')}
          ${sortBtn('picks','Volume')}
        </div>
      </div>
      <button class="lb-refresh" onclick="renderLeaderboardPro()">↻ REFRESH</button>
      ${currentUser?.id === '0071fd52-32a2-4c0a-940b-97e8eea7885a' ? `<button class="lb-refresh" style="background:rgba(0,229,255,.08);border-color:rgba(0,229,255,.2);color:#00e5ff;margin-left:6px" onclick="(async()=>{const btn=this;btn.textContent='\u23f3 Settling...';btn.disabled=true;try{await fetchAndResettleHistoricalPicks();btn.textContent='\u23f3 Syncing...';await _adminForceUpsertPicks();btn.textContent='\u23f3 Pushing rating...';await new Promise(r=>setTimeout(r,1500));const ok=await _pushRatingsToSupabase();btn.textContent='\u23f3 Refreshing...';await new Promise(r=>setTimeout(r,2000));_lbSkipRpc=true;await renderLeaderboardPro();_lbSkipRpc=false;btn.textContent=ok?'\u2713 Done':'\u26a0\ufe0f Check console';}catch(e){btn.textContent='\u274c Error';console.error('RECALCULATE failed:',e);}setTimeout(()=>{btn.textContent='\u26a1 RECALCULATE';btn.disabled=false;},3000);})()">\u26a1 RECALCULATE</button>` : ''}
    </div>
  `;

  const rowHTML = (r, i)=>{
    // Always use the freshest name for the current user (may have just renamed)
    const isMe = r.id === currentUser?.id;
    const nm = isMe && currentUser?.name
      ? currentUser.name
      : ((r?.name && String(r.name).trim()) ? String(r.name).trim() : _getDisplayNameForUserId(r.id));
    const tier = r.tier || 'Rookie';

    const prov = r.provisional
      ? (()=> {
          const need = 20;
          const have = _num(r.picks, 0);
          const remain = Math.max(0, need - have);
          const progress = `${have}/${need} picks`;
          const msg = remain>0 ? `${remain} to Verified` : `Eligible for Verified`;
          return `<div style="margin-top:6px;color:rgba(255,255,255,.65);font-size:12px">
            ${_pill('Provisional')}
            <span title="${(r.provisionalReason||'').replace(/"/g,'&quot;')}">ⓘ</span>
            <div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
              ${_pill(`Verified unlock: ${progress}`)}
              ${_pill(msg)}
            </div>
          </div>`;
        })()
      : '';

    return `
      <tr>
        <td style="white-space:nowrap;">
          <div style="display:flex;align-items:center;gap:10px">
            <div class="lb-avatar" style="width:34px;height:34px;border-radius:14px">${String(nm||'U')[0].toUpperCase()}</div>
            <div style="min-width:0">
              <div style="font-weight:800;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${nm}</div>
              <div style="color:var(--dim);font-size:12px;margin-top:2px">${_pill(`${_tierIcon(tier)} ${tier}`)} ${r.topSport? _pill(r.topSport):''}${isMe && getRebuyCount()>0 ? ' '+_pill('🔄 '+getRebuyCount()+' rebuy'+(getRebuyCount()>1?'s':'')) : ''}</div>
              ${prov}
            </div>
          </div>
        </td>

        <td style="text-align:right;font-weight:900">${_num(r.sharp,0).toFixed(1)}</td>
        <td style="text-align:right">${_num(r.winRate,0).toFixed(0)}%</td>
        <td style="text-align:right">${_num(r.roi,0).toFixed(1)}%</td>
        <td style="text-align:right">${_num(r.units,0).toFixed(2)}</td>
        <td style="text-align:right">${_num(r.picks,0)}</td>
        <td style="text-align:right">${_num(r.pending,0)}</td>
        <td style="text-align:right;white-space:nowrap">${(r.record||'0-0-0')}</td>
      </tr>
    `;
  };

  const table = `
    <div class="lb-table-wrap">
      <table class="lb-table">
        <thead class="lb-head">
          <tr>
            <th>User</th>
            <th style="text-align:right">SR</th>
            <th style="text-align:right">Win%</th>
            <th style="text-align:right">ROI</th>
            <th style="text-align:right">Units</th>
            <th style="text-align:right">Picks</th>
            <th style="text-align:right">Pending</th>
            <th style="text-align:right">Record</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(rowHTML).join('')}
        </tbody>
      </table>
      ${rows.length ? '' : `<div class="lb-empty" style="margin-top:14px">No users to show for this tab yet.</div>`}
    </div>
  `;

  // For silent background calls, only repaint if row data actually changed
  // Use a hash of just the row IDs + scores to detect real changes
  const dataHash = rows.map(r=>r.id+'|'+r.sharp+'|'+r.winRate+'|'+r.picks).join(',');
  if(opts.silent && el.dataset.lbDataHash === dataHash) return; // nothing changed, skip repaint
  el.dataset.lbDataHash = dataHash;
  el.innerHTML = header + table;
}

function buildPickHTML(g){
  const hasPick=picks.find(p=>p.gameId===g.id&&p.type!=='prop');
  if(!g.odds.spread&&!g.odds.total&&!hasPick) return '';
  const locked=!g.isPre;
  const fin=locked?'disabled':'';
  const lockTip=locked?' title="Picks locked — game has started"':'';
  let html=`<div class="pick-section" onclick="event.stopPropagation()">`;
  if(locked){
    html+=`<div class="pick-label" style="color:var(--muted)">🔒 Picks Closed</div>`;
  } else {
    html+=`<div class="pick-label">Game Picks</div>`;
  }
  if(g.odds.spread){
    // ESPN 'details' format: "TEAM_ABBR LINE" e.g. "ORL -15.5" or "HOU -15.5"
    // The TEAM_ABBR indicates which side the line belongs to (home or away).
    const parts=g.odds.spread.trim().split(/\s+/);
    const rawLine=parts[parts.length-1];
    const rawNum=parseFloat(rawLine);

    const fmt = n => (n>0?`+${n}`:String(n));
    const hasTeamPrefix = parts.length > 1 && isNaN(parseFloat(parts[0]));
    let awayLine, homeLine;

    if(hasTeamPrefix && !isNaN(rawNum)){
      const token = String(parts[0]).toUpperCase();
      const awayAbbr = String(g.away.abbr||'').toUpperCase();
      const homeAbbr = String(g.home.abbr||'').toUpperCase();

      if(token && token===awayAbbr){
        awayLine = fmt(rawNum);
        homeLine = fmt(-rawNum);
      } else if(token && token===homeAbbr){
        homeLine = fmt(rawNum);
        awayLine = fmt(-rawNum);
      } else {
        // Unknown prefix — fall back to showing the line on home and the opposite on away
        homeLine = fmt(rawNum);
        awayLine = fmt(-rawNum);
      }
    } else if(!isNaN(rawNum)) {
      // Bare number — treat as home line and derive away as opposite
      homeLine = fmt(rawNum);
      awayLine = fmt(-rawNum);
    } else {
      homeLine = '—';
      awayLine = '—';
    }
    const pA=picks.find(p=>p.gameId===g.id&&p.type==='spread'&&p.side===g.away.name);
    const pH=picks.find(p=>p.gameId===g.id&&p.type==='spread'&&p.side===g.home.name);
    const spreadPick=pA||pH;
    html+=`<div class="pick-row">
      ${(()=>{
        // Inline consensus % on pick buttons — shows public split before user picks
        const _t = cachedTrends[g.id]?.spread||{};
        const _tot = Object.values(_t).reduce((a,b)=>a+b,0);
        const _awayPct = _tot>1 ? Math.round((_t[g.away.name]||0)/_tot*100) : null;
        const _homePct = _awayPct!==null ? 100-_awayPct : null;
        const _pctTag = (pct) => pct!==null ? `<span style="font-family:'DM Mono',monospace;font-size:9px;opacity:.7;margin-left:3px">${pct}%</span>` : '';
        return `<button class="pick-btn ${pA?'picked-spread':''} ${pA?.result||''} ${fin}" data-gid="${g.id}" data-type="spread" data-side="${g.away.name}" data-desc="${g.away.name} ${awayLine}" data-line="${awayLine}" data-ishome="0" data-game="${g.away.name} ${g.away.score} @ ${g.home.name} ${g.home.score}" onclick="pickFromBtn(this,event)"${lockTip}>${g.away.name}${_pctTag(_awayPct)}<br><span style="color:var(--gold);font-size:11px">${awayLine}</span></button>
        <button class="pick-btn ${pH?'picked-spread':''} ${pH?.result||''} ${fin}" data-gid="${g.id}" data-type="spread" data-side="${g.home.name}" data-desc="${g.home.name} ${homeLine}" data-line="${homeLine}" data-ishome="1" data-game="${g.away.name} ${g.away.score} @ ${g.home.name} ${g.home.score}" onclick="pickFromBtn(this,event)"${lockTip}>${g.home.name}${_pctTag(_homePct)}<br><span style="color:var(--gold);font-size:11px">${homeLine}</span></button>`;
      })()}
    </div>`;
    if(!locked && spreadPick){
      html += wagerSelectorHTML(g.id,'spread');
    }
  }
  if(g.odds.total){
    const ouLine=g.odds.total.replace('O/U ','').trim();
    const pO=picks.find(p=>p.gameId===g.id&&p.type==='total'&&p.side==='over');
    const pU=picks.find(p=>p.gameId===g.id&&p.type==='total'&&p.side==='under');
    const totalPick=pO||pU;
    html+=`<div class="pick-row">
      <button class="pick-btn ${pO?'picked-over':''} ${pO?.result||''} ${fin}" data-gid="${g.id}" data-type="total" data-side="over" data-desc="Over ${ouLine}" data-game="${g.away.name} @ ${g.home.name}" onclick="pickFromBtn(this,event)"${lockTip}>OVER<br><span style="color:var(--gold);font-size:11px">${ouLine}</span></button>
      <button class="pick-btn ${pU?'picked-under':''} ${pU?.result||''} ${fin}" data-gid="${g.id}" data-type="total" data-side="under" data-desc="Under ${ouLine}" data-game="${g.away.name} @ ${g.home.name}" onclick="pickFromBtn(this,event)"${lockTip}>UNDER<br><span style="color:var(--gold);font-size:11px">${ouLine}</span></button>
    </div>`;
    if(!locked && totalPick){
      html += wagerSelectorHTML(g.id,'total');
    }
  }
  return html+'</div>';
}
// pendingPickSel: tracks a highlighted-but-not-yet-placed selection per game+type
// key: `${gameId}_${type}`, value: {btn, gid, type, side, desc, game}
// pendingPickSel: tracks a highlighted-but-not-yet-placed selection per game+type
const pendingPickSel = {};

function pickFromBtn(btn, evt){
  (evt||window.event||{}).stopPropagation?.();
  const gid  = btn.dataset.gid;
  const type = btn.dataset.type;
  const selKey = gid + '_' + type;

  // If this exact button is already the pending selection -> deselect
  if(pendingPickSel[selKey] && pendingPickSel[selKey].btn === btn){
    btn.classList.remove('selecting');
    delete pendingPickSel[selKey];
    const wrap = btn.closest('.pick-section');
    const panel = wrap && wrap.querySelector('.prepick-panel[data-sel-key="'+selKey+'"]');
    if(panel) panel.remove();
    return;
  }

  // If there's already a placed pick for this game+type, toggle it off
  const alreadyPicked = picks.find(p=>p.gameId===gid&&p.type===type&&p.side===btn.dataset.side);
  if(alreadyPicked){
    makePick(gid, type, btn.dataset.side, btn.dataset.desc, btn.dataset.game, {line: btn.dataset.line, isHomeTeam: btn.dataset.ishome==='1'});
    return;
  }

  // Clear any prior pending selection for same game+type
  if(pendingPickSel[selKey]){
    pendingPickSel[selKey].btn.classList.remove('selecting');
    const wrap2 = pendingPickSel[selKey].btn.closest('.pick-section');
    const old2 = wrap2 && wrap2.querySelector('.prepick-panel[data-sel-key="'+selKey+'"]');
    if(old2) old2.remove();
  }

  // Mark this button as selected
  btn.classList.add('selecting');
  const wager = DEFAULT_WAGER;
  const profit = calcPayout(wager, -110);
  const bankData = computeBankroll();
  const bal = typeof bankData === 'object' ? (bankData.balance||STARTING_BANKROLL) : (bankData||STARTING_BANKROLL);
  const maxBet = Math.floor(bal);
  const presets = [25, 50, 100, 250];

  pendingPickSel[selKey] = {btn, gid, type, side:btn.dataset.side, desc:btn.dataset.desc, game:btn.dataset.game, line:btn.dataset.line, isHomeTeam:btn.dataset.ishome==='1', wager};

  // Build pre-pick panel with wager + parlay + place button
  const row = btn.closest('.pick-row');
  if(row){
    const panel = document.createElement('div');
    panel.className = 'prepick-panel';
    panel.dataset.selKey = selKey;
    panel.onclick = (e) => e.stopPropagation();
    panel.innerHTML = '<div class="wager-row">'
      + '<span class="wager-label">WAGER</span>'
      + '<div class="wager-presets">'
      + presets.map(amt =>
          '<div class="wager-preset '+(wager===amt?'active':'')+'" onclick="updatePendingWager(\''+selKey+'\','+amt+')">$'+amt+'</div>'
        ).join('')
      + '</div>'
      + '<input class="wager-custom" type="number" min="1" max="'+maxBet+'" value="'+wager+'" onchange="updatePendingWager(\''+selKey+'\',+this.value)" onclick="event.stopPropagation()">'
      + '</div>'
      + '<div class="wager-payout" id="prepick-payout-'+selKey+'">Win: <span class="win-amt">+$'+profit+'</span> &middot; Risk: $'+wager+'</div>'
      + '<div style="display:flex;gap:6px;margin-top:6px">'
      + '<button class="place-pick-btn" style="flex:2" onclick="placePendingPick(\''+selKey+'\')">&#10003;  PLACE PICK</button>'
      + '<button class="parlay-add-btn" style="flex:1;margin:0;width:auto" onclick="addPendingToParlay(\''+selKey+'\')">+ PARLAY</button>'
      + '</div>';
    row.insertAdjacentElement('afterend', panel);
  }
}

function updatePendingWager(selKey, amount){
  const sel = pendingPickSel[selKey];
  if(!sel) return;
  const bankData = computeBankroll();
  const bal = typeof bankData === 'object' ? (bankData.balance||STARTING_BANKROLL) : (bankData||STARTING_BANKROLL);
  const maxBet = Math.floor(bal);
  sel.wager = Math.max(1, Math.min(Math.round(amount), maxBet));
  const profit = calcPayout(sel.wager, -110);
  const panel = document.querySelector('.prepick-panel[data-sel-key="'+selKey+'"]');
  if(panel){
    panel.querySelectorAll('.wager-preset').forEach(function(el){
      el.classList.toggle('active', parseInt(el.textContent.replace('$',''))===sel.wager);
    });
    var input = panel.querySelector('.wager-custom');
    if(input) input.value = sel.wager;
    var payout = panel.querySelector('.wager-payout');
    if(payout) payout.innerHTML = 'Win: <span class="win-amt">+$'+profit+'</span> &middot; Risk: $'+sel.wager;
  }
}

function placePendingPick(selKey){
  const sel = pendingPickSel[selKey];
  if(!sel) return;
  sel.btn.classList.remove('selecting');
  const panel = document.querySelector('.prepick-panel[data-sel-key="'+selKey+'"]');
  if(panel) panel.remove();
  delete pendingPickSel[selKey];
  _pendingWager = sel.wager;
  makePick(sel.gid, sel.type, sel.side, sel.desc, sel.game, {line: sel.line, isHomeTeam: sel.isHomeTeam});
  _pendingWager = null;
}
let _pendingWager = null;

function addPendingToParlay(selKey){
  const sel = pendingPickSel[selKey];
  if(!sel) return;
  addToParlay(sel.gid, sel.type, sel.side, sel.desc);
  // Update the parlay button to show it's been added
  const panel = document.querySelector('.prepick-panel[data-sel-key="'+selKey+'"]');
  if(panel){
    const pBtn = panel.querySelector('.parlay-add-btn');
    if(pBtn){ pBtn.textContent = '✓ IN PARLAY'; pBtn.style.borderColor='var(--green)'; pBtn.style.color='var(--green)'; pBtn.disabled=true; }
  }
}
function makePick(gameId,type,side,description,gameStr,extraData){
  if(!currentUser){ alert('Enter your name to make picks.'); return; }
  const g=allGames.find(x=>x.id===gameId);
  if(g&&!g.isPre) return; // silently block — UI already shows lock
  const idx=picks.findIndex(p=>p.gameId===gameId&&p.type===type&&p.side===side);
  if(idx!==-1){picks.splice(idx,1);savePicks();renderScores();updateRecordUI();renderPicksPanel();return;}
  picks=picks.filter(p=>!(p.gameId===gameId&&p.type===type));
  // Parse the numeric line cleanly and store it — never rely on description parsing at settlement
  const _rawLineStr = (extraData?.line || description.split(' ').pop() || '');
  const _line = parseFloat(_rawLineStr);
  const _isHomeTeam = extraData?.isHomeTeam !== undefined ? !!extraData.isHomeTeam : (side === g?.home.name);

  // Detect MLB moneylines: if the stored type is 'spread' but the line has no decimal
  // (e.g. -110, +158, -145) it is a moneyline, not a run line. Run lines always have .5
  // (e.g. -1.5, +1.5). Store type='moneyline' so settlement works correctly.
  const _leagueKey = (g?.league || '').toLowerCase();
  const _isMLBMoneyline = type === 'spread'
    && !isNaN(_line)
    && (Math.abs(_line) >= 50 || (_leagueKey === 'mlb' && !_rawLineStr.includes('.')));
  const _resolvedType = _isMLBMoneyline ? 'moneyline' : type;

  picks.push({
    gameId, type:_resolvedType, side, description, gameStr,
    line: isNaN(_line) ? null : _line,          // clean numeric line for this team
    isHomeTeam: _isHomeTeam,                     // which side of the game they picked
    result:'pending',
    homeTeam:g?.home.name||'', awayTeam:g?.away.name||'',
    league:g?.leagueLabel||'',
    madeAt:Date.now(),
    wager:_pendingWager||DEFAULT_WAGER,
    odds: _isMLBMoneyline ? _line : -110
  });
  savePicks();renderScores();updateRecordUI();renderPicksPanel();updateBankrollUI();
  // Subtle pick-made flash on the card
  requestAnimationFrame(()=>{
    const card=document.getElementById('card-'+gameId);
    if(card){card.classList.remove('pick-flash');requestAnimationFrame(()=>requestAnimationFrame(()=>card.classList.add('pick-flash')));}
  });
  // Guest conversion nudge — show after 3rd pick
  if(currentUser?.isGuest) maybeShowGuestConvertNudge();
}

function checkPickResults(){
  let changed=false;
  picks.forEach(pick=>{
    if(pick.result!=='pending') return;
    if(pick.type==='prop') return; // props settled separately by checkPropPickResults() below
    const g=allGames.find(x=>x.id===pick.gameId);
    if(!g||!g.isFinal) return;
    const hs=parseFloat(g.home.score), as2=parseFloat(g.away.score);
    if(isNaN(hs)||isNaN(as2)) return;

    // Store final score on the pick for history display
    pick.finalScore = `${g.away.name} ${as2} - ${g.home.name} ${hs}`;
    // Update gameStr to reflect final score
    pick.gameStr = `${g.away.name} ${as2} @ ${g.home.name} ${hs}`;

    if(pick.type==='moneyline'){
      // Pure moneyline — team just needs to win outright
      const isHome = pick.side === g.home.name ||
                     (g.home.name && pick.side && g.home.name.toLowerCase().includes(pick.side.toLowerCase())) ||
                     (pick.side && g.home.name && pick.side.toLowerCase().includes(g.home.name.toLowerCase()));
      const pickedScore = isHome ? hs : as2;
      const oppScore    = isHome ? as2 : hs;
      if(pickedScore > oppScore)       pick.result = 'won';
      else if(pickedScore < oppScore)  pick.result = 'lost';
      else                             pick.result = 'push';
    } else if(pick.type==='spread'){
      // Extract the numeric spread line from description
      // Description format: "TeamName LINE" e.g. "Senators -1.5" or "Capitals +1.5"
      // Guard: if |line| > 50 it is a stray MONEYLINE number — settle as outright win.
      const parts = (pick.description||'').trim().split(/\s+/);
      const rawLine = pick.line != null ? pick.line : parseFloat(parts[parts.length - 1]);
      const isHome = pick.side === g.home.name ||
                     (g.home.name && pick.side && g.home.name.toLowerCase().includes(pick.side.toLowerCase())) ||
                     (pick.side && g.home.name && pick.side.toLowerCase().includes(g.home.name.toLowerCase()));
      const pickedScore = isHome ? hs : as2;
      const oppScore    = isHome ? as2 : hs;

      if(isNaN(rawLine) || Math.abs(rawLine) >= 50) {
        // Fallback moneyline settlement
        if(pickedScore > oppScore)       pick.result = 'won';
        else if(pickedScore < oppScore)  pick.result = 'lost';
        else                             pick.result = 'push';
      } else {
        // Standard point-spread settlement
        const adj = pickedScore + rawLine;
        if(Math.abs(adj - oppScore) < 0.01)  pick.result = 'push';
        else                                  pick.result = adj > oppScore ? 'won' : 'lost';
      }
    } else {
      // Over/Under settlement
      const total = parseFloat((pick.description||'').replace(/over |under /i,''));
      const combined = hs + as2;
      if(Math.abs(combined - total) < 0.01)       pick.result = 'push';
      else if(pick.side === 'over')                pick.result = combined > total ? 'won' : 'lost';
      else                                         pick.result = combined < total ? 'won' : 'lost';
    }
    changed=true;
  });
  if(changed){ savePicks(); checkAchievements(); }
}

let activePickCat = 'all'; // 'all' | 'spread' | 'total' | 'prop'
function setPickCat(cat){
  activePickCat=cat;
  document.querySelectorAll('.pick-cat-tab').forEach(el=>el.classList.toggle('active',el.dataset.cat===cat));
  updateRecordUI();
  renderPicksPanel();
}

function filteredPicks(){
  if(activePickCat==='all') return picks;
  return picks.filter(p=>p.type===activePickCat);
}

function recordFor(type){
  const p = type==='all' ? picks : picks.filter(x=>x.type===type);
  let w=0,l=0,pu=0,n=0;
  for(const x of p){
    const r = normalizeResult(x.result);
    if(r==='won') w++;
    else if(r==='lost') l++;
    else if(r==='push') pu++;
    else n++; // pending / unknown treated as pending
  }
  return { w, l, p: pu, n, total: p.length };
}

function unitsFor(type){
  const p = type==='all' ? picks : picks.filter(x=>x.type===type);
  // Units are "virtual" for transparency: 1 unit = $100 risk.
  const UNIT = 100;
  let net = 0;
  for(const pick of p){
    const res = normalizeResult(pick.result);
    if(res==='pending') continue;
    const risk = Math.max(0, Number(pick.wager||0));
    if(res==='won'){
      net += calcPayout(risk, pick.odds||-110);
    } else if(res==='lost'){
      net -= risk;
    } else if(res==='push'){
      // no-op
    }
  }
  return net/UNIT;
}



// ── Debounce utility ─────────────────────────────────────────────
// Collapses rapid sequential calls into a single execution.
// Prevents jank when multiple sources call render functions back-to-back.
function _debounce(fn, ms=60){
  let timer;
  return function(...args){
    clearTimeout(timer);
    timer = setTimeout(()=>fn.apply(this,args), ms);
  };
}

function updateRecordUI(){
  // Header pill — overall W-L-Push
  const all = recordFor('all');
  const safe=(id,v)=>{const el=document.getElementById(id);if(el&&el.textContent!==String(v))el.textContent=v;};
  safe('hdrW',all.w); safe('hdrL',all.l); safe('hdrP',all.p);

  // Render the always-visible 3-row breakdown table
  const bd = document.getElementById('recordBreakdown');
  if(!bd) return;

  const cats = [
    {type:'all',    label:'ALL'},
    {type:'spread', label:'SPREAD'},
    {type:'total',  label:'O/U'},
    {type:'prop',   label:'PROPS'},
  ];

  const bdHtml_cats = cats.map(c=>{
    const r = recordFor(c.type);
    const isActive = activePickCat===c.type;
    if(r.total===0 && c.type!=='all') return ''; // hide empty rows
    return `<div class="rb-row" style="${isActive?'border-color:rgba(0,229,255,.4)':''}">
      <div class="rb-label${isActive?' active':''}">${c.label}</div>
      <div class="rb-cells">
        <div class="rb-cell"><div class="rb-cell-lbl">W</div><div class="rb-cell-val w">${r.w}</div></div>
        <div class="rb-cell"><div class="rb-cell-lbl">L</div><div class="rb-cell-val l">${r.l}</div></div>
        <div class="rb-cell"><div class="rb-cell-lbl">PUSH</div><div class="rb-cell-val p">${r.p}</div></div>
        <div class="rb-cell"><div class="rb-cell-lbl">PEND</div><div class="rb-cell-val n">${r.n}</div></div>
      </div>
    </div>`;
  }).join('');
  // Diff guard: only update DOM if record values changed — prevents flicker on every poll
  if(bd.dataset.lastHtml === bdHtml_cats){ /* nothing changed, skip DOM write */ } else {
  bd.innerHTML = bdHtml_cats; bd.dataset.lastHtml = bdHtml_cats;

  // Add Lock of the Day row if user has any locks
  const lockRec = getLockRecord();
  const todaysLock = getTodaysLock();
  if(lockRec.total > 0 || todaysLock) {
    const lockPending = picks.filter(p=>p.isLock && p.result==='pending').length;
    bd.innerHTML += `<div class="rb-row" style="border-color:rgba(255,165,2,.3);background:rgba(255,165,2,.03)">
      <div class="rb-label" style="color:var(--gold)">🔒 LOCK</div>
      <div class="rb-cells">
        <div class="rb-cell"><div class="rb-cell-lbl">W</div><div class="rb-cell-val w">${lockRec.w}</div></div>
        <div class="rb-cell"><div class="rb-cell-lbl">L</div><div class="rb-cell-val l">${lockRec.l}</div></div>
        <div class="rb-cell"><div class="rb-cell-lbl">PUSH</div><div class="rb-cell-val p">${lockRec.p}</div></div>
        <div class="rb-cell"><div class="rb-cell-lbl">PEND</div><div class="rb-cell-val n">${lockPending}</div></div>
      </div>
    </div>`;
  }
  } // end diff guard
}

function typeLabel(type){
  if(type==='spread') return 'SPREAD';
  if(type==='total')  return 'O/U';
  if(type==='prop')   return 'PROP';
  return type.toUpperCase();
}
function pickStableId(p){
  // Prefer server id if available, else local id, else a fallback signature.
  return p?._syncId || p?.id || `${p?.gameId||''}|${p?.type||''}|${p?.side||''}|${p?.madeAt||''}|${p?.description||''}`;
}

function renderPicksPanel(){
  const el = document.getElementById('panelPicksList');
  if(!el) return;
  // Update the peek strip count whenever panel re-renders
  try{ updatePicksPeek(); }catch{}

  // IMPORTANT: Use the real local picks array as the source of truth
  const all = Array.isArray(picks) ? picks.slice() : [];

  // Apply the same category filter your UI expects (but do NOT cap to 10)
  const fp = all.filter(p=>{
    if(activePickCat === 'all') return true;
    // activePickCat seems to be category/type like 'spread', 'ou', 'parlay', etc.
    return (p?.type || '') === activePickCat;
  });

  const pending = fp.filter(p => normalizeResult(p.result) === 'pending');
  const settled = fp.filter(p => normalizeResult(p.result) !== 'pending');

  if(!fp.length){
    const msg = activePickCat === 'all'
      ? `<div style="font-size:28px;margin-bottom:12px">🎯</div>READY TO MAKE YOUR FIRST PICK?<br><br><span style="color:var(--dim);font-size:11px;line-height:1.6">Tap any game on the Scores tab to pick spreads, totals, or props.<br>Track your record and compete on the leaderboard!</span>`
      : `NO ${typeLabel(activePickCat)} PICKS YET`;
    el.innerHTML = `<div class="no-picks">${msg}</div>`;
    return;
  }

  // Build a fast lookup from stable id -> index in the master picks array
  const idxById = new Map();
  for(let i=0;i<all.length;i++){
    idxById.set(pickStableId(all[i]), i);
  }

  let html = '';

  // ── Active / pending picks — can delete ──
  if(pending.length){
    html += `<div class="picks-section-hdr">
      <span class="picks-section-title">Active</span>
      <div class="picks-section-line"></div>
      <span class="picks-section-cnt">${pending.length}</span>
    </div>`;

    html += pending
      .sort((a,b)=>(Number(b.madeAt)||0)-(Number(a.madeAt)||0))
      .map(p=>{
        const sid = pickStableId(p);
        const idx = idxById.get(sid);

        // Use stable key for confidence/comments so multiple similar picks don’t collide
        const pKey = sid;

        const safeIdx = Number.isInteger(idx) ? idx : -1;

        return `<div class="pick-item">
          <div class="pi-top">
            <div style="display:flex;align-items:center;gap:6px">
              <span class="pi-type-tag">${typeLabel(p.type)}</span>
              <span class="pi-league">${p.league||''}</span>
              ${p.type==='parlay'?`<span class="parlay-tag">PARLAY</span>`:''}
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <span class="pi-badge pending">PENDING</span>
              ${lockBadgeHTML(p)}
              ${p.type==='parlay' && safeIdx>=0 ? `<button class="pi-share-btn" onclick="manualSettleParlay(${safeIdx})" title="Force settle this parlay" style="font-size:9px;padding:2px 5px">🔄</button>` : ''}
              ${safeIdx>=0 ? `<button class="pi-share-btn" onclick="sharePickCard({...picks[${safeIdx}],name:currentUser?.name})" title="Share pick">📤</button>` : ''}
              ${safeIdx>=0 ? `<button class="pi-del" onclick="deletePick(${safeIdx})" title="Remove pick">✕</button>` : ''}
            </div>
          </div>
          <div class="pi-pick">${p.description || ''}</div>
          ${p.wager ? `<div class="pi-wager">💰 $${p.wager} to win +$${calcPayout(p.wager,p.odds||-110)}</div>` : ''}
          <div class="pi-score">${p.finalScore ? '📊 Final: '+p.finalScore : (p.gameStr||'')}</div>
          ${p.type!=='parlay' ? confidenceHTML(pKey, p.confidence||0) : ''}
          ${p.type!=='parlay' ? lockBtnHTML(p) : ''}
          ${p.type!=='parlay' ? pickCommentHTML(p) : ''}
        </div>`;
      })
      .join('');
  }

  // ── Settled picks — locked, no delete, result shown ──
  if (settled.length) {
    html += `<div class="picks-section-hdr" style="margin-top:${pending.length ? '6px' : '0'}">
      <span class="picks-section-title">Settled</span>
      <div class="picks-section-line"></div>
      <span class="picks-section-cnt">${settled.length}</span>
    </div>`;

    html += settled
      .sort((a,b)=>(Number(b.madeAt)||0)-(Number(a.madeAt)||0))
      .map(p=>{
        const res = normalizeResult(p.result);
        return `<div class="pick-item pick-item-settled pick-settled-${res}">
          <div class="pi-top">
            <div style="display:flex;align-items:center;gap:6px">
              <span class="pi-type-tag">${typeLabel(p.type)}</span>
              <span class="pi-league">${p.league||''}</span>
              ${p.type==='parlay'?`<span class="parlay-tag">PARLAY</span>`:''}
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <span class="pi-badge ${res}">${String(res).toUpperCase()}</span>
              ${lockBadgeHTML(p)}
              <button class="pi-share-btn" style="margin-left:4px"
                onclick="sharePickCard(${JSON.stringify({...p,name:currentUser?.name}).replace(/"/g,'&quot;')})"
                title="Share pick">📤</button>
            </div>
          </div>

          <div class="pi-pick">${p.description || ''}</div>

          ${p.wager ? (() => {
            const profit = calcPayout(p.wager, p.odds||-110);
            if(res==='won') return `<div class="pi-pnl pos">+$${profit}</div>`;
            if(res==='lost') return `<div class="pi-pnl neg">-$${p.wager}</div>`;
            return `<div class="pi-wager">💰 $${p.wager}</div>`;
          })() : ''}

          <div class="pi-score">${p.finalScore ? '📊 Final: '+p.finalScore : (p.gameStr||'')}</div>

          ${(p.confidence!=null) ? (() => {
            const raw = Number(p.confidence) || 0;
            const stars = (raw > 5) ? Math.round(raw / 20) : raw;
            const s = Math.max(0, Math.min(5, stars));
            return `<div style="font-size:11px;color:var(--gold)">${'★'.repeat(s)}${'☆'.repeat(5-s)}</div>`;
          })() : ''}

          ${p.gameStr ? `<div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--dim);margin-top:2px">${escapeHtml(p.gameStr)}</div>` : ''}
          ${p.comment ? `<div class="pick-comment-display">${escapeHtml(p.comment)}</div>` : ''}

          <div class="pi-locked-note">🔒 Settled — view full history in History tab</div>
        </div>`;
      })
      .join('');
  }
  el.innerHTML = html;
}

function deletePick(idx){
  const pick = picks?.[idx];
  if(!pick) return;

  // Allow deleting any pick — user explicitly chose to remove it
  picks.splice(idx, 1);
  savePicks();
  renderPicksPanel();
  updateRecordUI();
  renderScores();

  // Remove from Supabase so it does not sync back on next poll
  const pickId = pick._syncId || pick.id;
  if(pickId && currentUser?.id && supaOnline){
    sbDelete('user_picks', 'id=eq.'+pickId+'&user_id=eq.'+currentUser.id)
      .catch(e => console.warn('[SharpPick] pick server delete failed:', e?.message));
  }
}

function clearAllPicks(){
  // Only clears pending picks; completed are preserved in history
  const hadPending = Array.isArray(picks) && picks.some(p => normalizeResult(p.result) === 'pending');
  if(!hadPending) return;

  showConfirm(
    'Remove pending picks?',
    'Settled picks stay in History — only pending picks will be removed.',
    () => {
      const toDelete = picks.filter(p => normalizeResult(p.result) === 'pending');
      picks = picks.filter(p => normalizeResult(p.result) !== 'pending');
      savePicks();
      renderPicksPanel();
      updateRecordUI();
      renderScores();
      // Remove pending picks from Supabase so they don't sync back
      if(currentUser?.id && supaOnline){
        toDelete.forEach(p => {
          const pid = p._syncId || p.id;
          if(pid) sbDelete('user_picks', `id=eq.${pid}&user_id=eq.${currentUser.id}`).catch(()=>{});
        });
      }
    }
  );
}
function renderHistoryView(){
  const el = document.getElementById('historyView');
  if(!el) return;

  // Pull settled picks from local picks array
  const allP = Array.isArray(picks) ? picks : [];
  const allSettled = allP.filter(p => normalizeResult(p?.result) !== 'pending');

  // Ensure globals exist (older builds)
  if(typeof histSearch === 'undefined') window.histSearch = '';
  if(typeof histFilterType === 'undefined') window.histFilterType = 'all';
  if(typeof histFilterResult === 'undefined') window.histFilterResult = 'all';
  if(typeof histFilterLeague === 'undefined') window.histFilterLeague = 'all';
  if(typeof histSortBy === 'undefined') window.histSortBy = 'date';

  const leagues = Array.from(new Set(allSettled.map(p=> (p.league||p.leagueLabel||'').toString().trim()).filter(Boolean))).sort();

  const filterBar = `<div class="hist-filter-bar">
    <input class="hist-search" type="text" placeholder="🔍 Search picks…" value="${(histSearch||'').replace(/"/g,'&quot;')}"
      oninput="histSearch=this.value;renderHistoryView()" />
    <div class="hist-filter-row">
      <select class="hist-filter-sel" onchange="histFilterType=this.value;renderHistoryView()">
        <option value="all" ${histFilterType==='all'?'selected':''}>All Types</option>
        <option value="spread" ${histFilterType==='spread'?'selected':''}>Spread</option>
        <option value="total" ${histFilterType==='total'?'selected':''}>O/U</option>
        <option value="prop" ${histFilterType==='prop'?'selected':''}>Props</option>
        <option value="parlay" ${histFilterType==='parlay'?'selected':''}>Parlay</option>
      </select>
      <select class="hist-filter-sel" onchange="histFilterResult=this.value;renderHistoryView()">
        <option value="all" ${histFilterResult==='all'?'selected':''}>All Results</option>
        <option value="won" ${histFilterResult==='won'?'selected':''}>Wins</option>
        <option value="lost" ${histFilterResult==='lost'?'selected':''}>Losses</option>
        <option value="push" ${histFilterResult==='push'?'selected':''}>Push</option>
      </select>
      <select class="hist-filter-sel" onchange="histFilterLeague=this.value;renderHistoryView()">
        <option value="all" ${histFilterLeague==='all'?'selected':''}>All Leagues</option>
        ${leagues.map(l=>`<option value="${l.replace(/"/g,'&quot;')}" ${histFilterLeague===l?'selected':''}>${l}</option>`).join('')}
      </select>
      <select class="hist-filter-sel" onchange="histSortBy=this.value;renderHistoryView()">
        <option value="date" ${histSortBy==='date'?'selected':''}>By Date</option>
        <option value="pnl" ${histSortBy==='pnl'?'selected':''}>By P&L</option>
      </select>
    </div>
  </div>`;

  // Apply filters
  const q = (histSearch||'').toLowerCase().trim();
  let rows = allSettled.filter(p=>{
    const t = (p.type||'').toLowerCase();
    const r = normalizeResult(p.result);
    const lg = (p.league||p.leagueLabel||'').toString().trim();

    if(histFilterType!=='all' && t!==histFilterType) return false;
    if(histFilterResult!=='all' && r!==histFilterResult) return false;
    if(histFilterLeague!=='all' && lg!==histFilterLeague) return false;

    if(q){
      const hay = [
        p.description, p.gameStr, p.team, p.player, p.market, p.side, p.league, p.leagueLabel
      ].filter(Boolean).join(' ').toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });

  // Sort
  rows = rows.slice().sort((a,b)=>{
    if(histSortBy==='pnl'){
      // Compute actual P&L from wager/odds since picks don't store a pnl field
      const getPnl = p => {
        const r = normalizeResult(p.result);
        const w = Number(p.wager) || 0;
        if(r==='won')  return calcPayout(w, p.odds||-110);
        if(r==='lost') return -w;
        return 0;
      };
      const ap = getPnl(a), bp = getPnl(b);
      if(bp!==ap) return bp-ap;
    }
    return (Number(b.madeAt)||0) - (Number(a.madeAt)||0);
  });

  if(!rows.length){
    el.innerHTML = filterBar + `<div class="hist-empty">
      <div style="font-size:32px;margin-bottom:16px">${allSettled.length?'🔍':'📋'}</div>
      ${allSettled.length?'NO PICKS MATCH YOUR FILTERS':'NO PICK HISTORY YET'}
      <small>${allSettled.length?'Try changing or clearing your filters':'Make picks on games — once they go final they’ll appear here'}</small>
    </div>`;
    return;
  }

  const itemHTML = (p)=>{
    const res = normalizeResult(p.result);
    const badge = res==='won'?'WON':res==='lost'?'LOST':res==='push'?'PUSH':res.toUpperCase();
    const wager = p.wager ? Number(p.wager)||0 : 0;
    const pnl = (p.pnl!=null) ? Number(p.pnl)||0 : (res==='won' ? calcPayout(wager,p.odds||-110) : res==='lost' ? -wager : 0);

    const dateStr = (()=>{ try{ return new Date(Number(p.madeAt)||Date.now()).toLocaleString(); }catch{ return ''; } })();

    const finalScoreStr = p.finalScore || (p.result !== 'pending' && p.gameStr && /[0-9]/.test(p.gameStr) ? p.gameStr : null);
    const settledLine = finalScoreStr
      ? `<div style="font-family:'DM Mono',monospace;font-size:11px;color:var(--accent);margin-top:3px;opacity:0.8">📊 Final: ${finalScoreStr}</div>`
      : (p.result !== 'pending' && p.gameStr ? `<div style="font-family:'DM Mono',monospace;font-size:10px;color:var(--muted);margin-top:2px">${p.gameStr}</div>` : '');

    return `<div class="hist-item hist-${res}">
      <div class="hist-top">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="pi-type-tag">${typeLabel(p.type)}</span>
          <span class="pi-league">${(p.league||p.leagueLabel||'')}</span>
          <span class="pi-badge ${res}">${badge}</span>
        </div>
        <div style="font-family:'DM Mono',monospace;font-size:10px;color:var(--muted)">${dateStr}</div>
      </div>
      <div class="hist-desc">${p.description||''}</div>
      ${settledLine}
      ${wager?`<div class="hist-wager">💰 $${wager}${(res!=='pending')?` <span class="hist-pnl ${(pnl>=0)?'pos':'neg'}">${pnl>=0?'+':''}${pnl}</span>`:''}</div>`:''}
      ${p.comment?`<div class="pick-comment-display">${escapeHtml(p.comment)}</div>`:''}
    </div>`;
  };

  el.innerHTML = filterBar + `<div class="hist-list">${rows.map(itemHTML).join('')}</div>`;
}

// ═══════════════════════════════════════════════════════
// HISTORICAL RE-SETTLEMENT ENGINE
// Fetches past ESPN scoreboard data to correctly settle
// picks whose games are no longer in the live feed.
// ═══════════════════════════════════════════════════════

function _settlePickAgainstScore(pick, hs, as2, homeName, awayName) {
  // Record final score
  pick.finalScore = `${awayName} ${as2} - ${homeName} ${hs}`;
  pick.gameStr    = `${awayName} ${as2} @ ${homeName} ${hs}`;

  if (pick.type === 'total') {
    const total = parseFloat((pick.description || '').replace(/over |under /i, ''));
    if (isNaN(total)) return false;
    const combined = hs + as2;
    if (Math.abs(combined - total) < 0.01) pick.result = 'push';
    else if (pick.side === 'over')          pick.result = combined > total ? 'won' : 'lost';
    else                                    pick.result = combined < total ? 'won' : 'lost';
    return true;
  }

  if (pick.type === 'spread') {
    // ── Determine which score belongs to the picked team ──────────────────
    // Priority: use stored pick.isHomeTeam if available (set at pick-creation time).
    // Fallback: name-matching (can fail on partial matches).
    let isHome;
    if (pick.isHomeTeam !== undefined && pick.isHomeTeam !== null) {
      isHome = !!pick.isHomeTeam;
    } else {
      const sideLC = (pick.side || '').toLowerCase();
      const homeLC = (homeName || '').toLowerCase();
      isHome = homeLC.includes(sideLC) || sideLC.includes(homeLC);
    }
    const pickedScore = isHome ? hs  : as2;
    const oppScore    = isHome ? as2 : hs;

    // ── Get the spread line ────────────────────────────────────────────────
    // Priority: use stored pick.line (set at pick-creation time, always correct).
    // Fallback: parse from description (can have wrong sign due to ESPN abbr mismatch).
    let line;
    if (pick.line !== undefined && pick.line !== null && !isNaN(Number(pick.line))) {
      line = Number(pick.line);
    } else {
      const parts = (pick.description || '').trim().split(/\s+/);
      line = parseFloat(parts[parts.length - 1]);
    }

    // ── Moneyline detection (|line| >= 50 means it's not a point spread) ──
    // Spreads never exceed ±50 in any sport. Moneylines are always ±100+.
    if (isNaN(line) || Math.abs(line) >= 50) {
      if (pickedScore > oppScore)       pick.result = 'won';
      else if (pickedScore < oppScore)  pick.result = 'lost';
      else                              pick.result = 'push';
      return true;
    }

    // ── Standard point-spread settlement ──────────────────────────────────
    const adj = pickedScore + line;
    if (Math.abs(adj - oppScore) < 0.01) pick.result = 'push';
    else                                  pick.result = adj > oppScore ? 'won' : 'lost';
    return true;
  }
  return false;
}

let _resettleInProgress = false;
let _resettleLastRun = 0;
async function fetchAndResettleHistoricalPicks(force = false) {
  // Guard: never run concurrently, and throttle to once every 60 seconds max
  // Pass force=true to bypass the throttle (e.g. when new pending picks just synced in)
  if (_resettleInProgress) return 0;
  const now = Date.now();
  if (!force && now - _resettleLastRun < 60_000) return 0;
  _resettleInProgress = true;
  _resettleLastRun = now;
  try {
    return await _fetchAndResettleHistoricalPicksInner();
  } finally {
    _resettleInProgress = false;
  }
}
async function _fetchAndResettleHistoricalPicksInner() {
  // Collect ALL settled and pending picks that aren't in allGames (game is gone from live feed)
  const liveIds = new Set(allGames.map(g => g.id));

  // Picks to fix = any pick where game is NOT in live feed
  const toFix = picks.filter(p =>
    p.type !== 'prop' &&
    p.type !== 'parlay' &&
    !liveIds.has(p.gameId)
  );

  if (!toFix.length) {
    console.log('[SharpPick] No historical picks to re-settle');
    return 0;
  }

  // Group by date + league so we make one API call per day/league combo
  const groups = {};
  toFix.forEach(p => {
    const ts   = p.madeAt || Date.now();
    const date = new Date(ts);
    // Check yesterday and the day before too — picks are made before the game starts
    // Use the game date (madeAt may be pre-game), so check ±1 day window
    const ymd  = d => `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    const dates = [
      ymd(new Date(ts - 86400000*2)),
      ymd(new Date(ts - 86400000)),
      ymd(date),
      ymd(new Date(ts + 86400000)),
    ];
    const leagueLabel = (p.league || p.leagueLabel || '').replace(/\s*[🏀🏈⚾🏒⚽]/g,'').trim().toLowerCase();
    const lg = LEAGUES.find(x =>
      x.label.toLowerCase().includes(leagueLabel) ||
      leagueLabel.includes(x.league.toLowerCase()) ||
      leagueLabel.includes(x.label.toLowerCase().replace(/\s*[🏀🏈⚾🏒⚽]/g,'').trim())
    );
    if (!lg) return;
    dates.forEach(d => {
      const key = `${lg.sport}|${lg.league}|${d}`;
      if (!groups[key]) groups[key] = { lg, date: d, picks: [] };
      // Only add pick once
      if (!groups[key].picks.find(x => x === p)) groups[key].picks.push(p);
    });
  });

  let totalFixed = 0;
  const PROXY = ['https://corsproxy.io/?', 'https://api.allorigins.win/raw?url='];

  for (const [key, grp] of Object.entries(groups)) {
    const url = `${ESPN}/${grp.lg.sport}/${grp.lg.league}/scoreboard?dates=${grp.date}&limit=100`;
    let data = null;
    // Try direct first, then proxies
    for (const prefix of ['', ...PROXY]) {
      try {
        const res = await fetch(prefix ? prefix + encodeURIComponent(url) : url, { signal: AbortSignal.timeout(6000) });
        if (res.ok) { data = await res.json(); break; }
      } catch {}
    }
    if (!data?.events) continue;

    // Build a lookup: gameId → { hs, as2, homeName, awayName, homeAbbr, awayAbbr, oddsDetails }
    const scoreMap = {};
    (data.events || []).forEach(ev => {
      const comp = ev?.competitions?.[0];
      if (!comp) return;
      const home = comp.competitors?.find(c => c.homeAway === 'home') || {};
      const away = comp.competitors?.find(c => c.homeAway === 'away') || {};
      const st   = comp.status?.type;
      if (st?.state !== 'post') return; // only final games
      // Re-parse the odds details so we can fix legacy picks with wrong-sign lines
      const eo = comp.odds?.[0] || {};
      scoreMap[ev.id] = {
        hs:         parseInt(home.score),
        as2:        parseInt(away.score),
        homeName:   home.team?.shortDisplayName || home.team?.displayName || '',
        awayName:   away.team?.shortDisplayName || away.team?.displayName || '',
        homeAbbr:   (home.team?.abbreviation || '').toUpperCase(),
        awayAbbr:   (away.team?.abbreviation || '').toUpperCase(),
        oddsDetails: eo.details || null,   // e.g. "PUR -11.5"
      };
    });

    grp.picks.forEach(pick => {
      const sc = scoreMap[pick.gameId];
      if (!sc || isNaN(sc.hs) || isNaN(sc.as2)) return;

      // ── Re-derive pick.line and pick.isHomeTeam from ESPN odds for legacy picks ──
      if ((pick.line === undefined || pick.line === null) && sc.oddsDetails) {
        const oddsP = sc.oddsDetails.trim().split(/\s+/);
        const oddsToken = (oddsP[0] || '').toUpperCase();
        const oddsNum   = parseFloat(oddsP[oddsP.length - 1]);
        if (!isNaN(oddsNum)) {
          const sideLC   = (pick.side || '').toLowerCase();
          const homeLC   = sc.homeName.toLowerCase();
          const awayLC   = sc.awayName.toLowerCase();
          // isHome based on name match
          const isHome = homeLC.includes(sideLC) || sideLC.includes(homeLC);
          pick.isHomeTeam = isHome;
          // Determine if ESPN odds token refers to home or away team
          const tokenIsHome = (oddsToken === sc.homeAbbr) ||
                              sc.homeName.toUpperCase().startsWith(oddsToken);
          const tokenIsAway = (oddsToken === sc.awayAbbr) ||
                              sc.awayName.toUpperCase().startsWith(oddsToken);
          if (isHome) {
            // Picked home: line = oddsNum if token is home, else -oddsNum
            pick.line = tokenIsHome ? oddsNum : (tokenIsAway ? -oddsNum : oddsNum);
          } else {
            // Picked away: line = oddsNum if token is away, else -oddsNum
            pick.line = tokenIsAway ? oddsNum : (tokenIsHome ? -oddsNum : oddsNum);
          }
        }
      }

      const oldResult = pick.result;
      pick.result = 'pending'; // reset so _settlePickAgainstScore can write
      const settled = _settlePickAgainstScore(pick, sc.hs, sc.as2, sc.homeName, sc.awayName);
      if (settled) {
        pick.settledAt    = pick.settledAt || Date.now();
        pick.settleMethod = 'historical-fetch';
        totalFixed++;
        console.log(`[SharpPick] Re-settled: ${pick.description} → ${pick.result} (was ${oldResult}) · ${sc.awayName} ${sc.as2} @ ${sc.homeName} ${sc.hs}`);
      } else {
        pick.result = oldResult; // restore if we couldn't settle
      }
    });
  }

  if (totalFixed > 0) {
    savePicks();
    checkAchievements();
    renderPicksPanel();
    updateRecordUI();
    updateBankrollUI();
    console.log(`[SharpPick] Historical re-settlement complete: ${totalFixed} picks corrected`);

    // Push corrected results to server immediately (bypass throttle)
    // so user_ratings view recalculates with correct data
    try {
      await syncPicksToServerForced();
      console.log('[SharpPick] Corrected picks synced to server');
      // Auto-push Sharp Rating so leaderboard updates without admin RECALCULATE
      try { await _pushRatingsToSupabase(); console.log('[SharpPick] Sharp Rating auto-updated after settlement'); } catch(re) { console.warn('[SharpPick] Auto rating push failed:', re?.message); }
      // Wait a moment for Supabase to process, then refresh leaderboard
      setTimeout(async () => {
        try {
          if (typeof renderLeaderboardPro === 'function') await renderLeaderboardPro();
          else if (typeof renderLeaderboardView === 'function') await renderLeaderboardView();
        } catch(e) { console.warn('Leaderboard refresh after re-settlement failed:', e); }
      }, 2500);
    } catch(e) {
      console.warn('[SharpPick] Post-settlement server sync failed:', e);
    }
  }
  return totalFixed;
}

// Lightweight in-memory resettle for picks whose game IS still in allGames
function resettleAllPicks(){
  let resetCount = 0;
  picks.forEach(pick => {
    if (pick.type === 'prop' || pick.type === 'parlay') return;
    const g = allGames.find(x => x.id === pick.gameId);
    if (!g || !g.isFinal) return;
    const hs  = parseFloat(g.home.score);
    const as2 = parseFloat(g.away.score);
    if (isNaN(hs) || isNaN(as2)) return;
    const oldResult = pick.result;
    pick.result = 'pending';
    _settlePickAgainstScore(pick, hs, as2, g.home.name, g.away.name);
    if (pick.result !== oldResult) {
      pick.settledAt    = Date.now();
      pick.settleMethod = 'client';
      resetCount++;
    }
  });
  if (resetCount > 0) {
    savePicks(); checkAchievements();
    console.log(`[SharpPick] Live re-settlement: ${resetCount} picks updated`);
    // Force immediate server sync + rating push so leaderboard reflects corrected results
    setTimeout(async () => { try { await syncPicksToServerForced(); await _pushRatingsToSupabase(); } catch(e){} }, 500);
  }
  return resetCount;
}

// Ensure the picks panel peek strip exists and is updated
function updatePicksPeek(){
  let peek = document.getElementById('picksPeekStrip');
  if(!peek){
    peek = document.createElement('div');
    peek.id = 'picksPeekStrip';
    peek.className = 'picks-panel-peek';
    peek.title = 'Open Picks';
    peek.onclick = openPanel;
    document.body.appendChild(peek);
  }
  const pendingCount = (Array.isArray(picks)?picks:[]).filter(p=>normalizeResult(p.result)==='pending').length;
  peek.textContent = pendingCount > 0 ? `${pendingCount} PICKS` : 'PICKS';
  // Hide peek when panel is open
  const panelOpen = document.getElementById('picksPanel')?.classList.contains('open');
  peek.style.display = panelOpen ? 'none' : '';
}

function openPanel(){
  checkPickResults();
  checkPropPickResults();
  checkParlayResults();
  resettleAllPicks();
  renderPicksPanel();
  updateRecordUI();
  document.getElementById('picksPanel').classList.add('open');
  document.getElementById('panelOverlay').classList.add('open');
  // Historical re-settlement runs on page load only (not on every panel open)
  // to avoid flooding the ESPN API and causing performance issues.
}
function closePanel(){
  document.getElementById('picksPanel').classList.remove('open');
  document.getElementById('panelOverlay').classList.remove('open');
  try{ updatePicksPeek(); }catch{}
}

// ═══════════════════════════════════════════════════════
// KEYBOARD — close modal on Escape
// ═══════════════════════════════════════════════════════
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    if(openGameId) closeModal();
    else closePanel();
  }
});

// ═══════════════════════════════════════════════════════
// CALENDAR
// ═══════════════════════════════════════════════════════

function renderCalendar(){
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  const dateLabel = calMonth.toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric', year:'numeric' });
  document.getElementById('monthTitle').textContent = dateLabel;

  const firstDow = new Date(y,m,1).getDay(),
        daysInM  = new Date(y,m+1,0).getDate(),
        today    = todayStr();

  let html = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    .map(d=>`<div class="cal-dow">${d}</div>`)
    .join('');

  for(let i=0;i<firstDow;i++) html += `<div class="cal-cell empty"></div>`;

  for(let day=1; day<=daysInM; day++){
    const ds = `${y}${pad(m+1)}${pad(day)}`;
    const isToday = ds === today, isSel = ds === selDate;
    const games = cache[ds] || [], cnt = games.length;

    const dm = {};
    games.forEach(g => { dm[g.dot] = true; });

    const dots = Object.keys(dm)
      .map(c=>`<div class="cal-dot dot-${c}"></div>`)
      .join('');

    html += `<div class="cal-cell${isToday?' tod':''}${isSel?' sel':''}" data-ds="${ds}" onclick="calClick('${ds}')">
      <div class="cal-num">${day}</div>
      <div class="cal-dots">${dots}</div>
      ${cnt>0 ? `<div class="cal-gcnt">${cnt} games</div>` : ''}
    </div>`;
  }

  document.getElementById('calGrid').innerHTML = html;

  const uncached = [];
  for(let day=1; day<=daysInM; day++){
    const ds = `${y}${pad(m+1)}${pad(day)}`;
    if(!cache[ds]) uncached.push(ds);
  }

  uncached.sort((a,b)=>Math.abs(a.localeCompare(today))-Math.abs(b.localeCompare(today)));
  enqueuePrefetch(uncached);
}

function calClick(ds){selDate=ds;document.querySelectorAll('.cal-cell.sel').forEach(c=>c.classList.remove('sel'));document.querySelector(`[data-ds="${ds}"]`)?.classList.add('sel');setMode('scores');selectDate(ds);}
function shiftMonth(dir){calMonth.setMonth(calMonth.getMonth()+dir);renderCalendar();}
function goToday(){calMonth=new Date();renderCalendar();}

// ═══════════════════════════════════════════════════════
// LEADERBOARD
// ═══════════════════════════════════════════════════════
async function renderLegacyLeaderboardView(){
  const el=document.getElementById('leaderboardContent');
  el.innerHTML=`<div class="lb-empty"><div style="font-size:28px;margin-bottom:12px">⏳</div>LOADING LEADERBOARD…</div>`;

  const entries=await fetchLeaderboard();

  if(!entries.length){
    el.innerHTML=`<div class="lb-empty">
      <div style="font-size:32px;margin-bottom:16px">🏆</div>
      NO PICKS YET
      <small>Be the first! Make some picks on today's games.</small>
    </div>`;
    return;
  }

  // Sort: by win % (min 1 decided pick), then total picks
  entries.sort((a,b)=>{
    const aPct=(a.w+a.l)>0?a.w/(a.w+a.l):0;
    const bPct=(b.w+b.l)>0?b.w/(b.w+b.l):0;
    if(Math.abs(aPct-bPct)>0.001) return bPct-aPct;
    return (b.w+b.l+b.p)-(a.w+a.l+a.p); // tiebreak: more picks
  });

  const rankIcon=(i)=>i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}`;
  const rankClass=(i)=>i===0?'gold':i===1?'silver':i===2?'bronze':'';
  const meId=currentUser?.id;

  // Compute streaks from recentPicks
  function getStreak(entry){
    const rp=(entry.recentPicks||[]).filter(p=>p.result!=='push').reverse();
    if(!rp.length) return null;
    const last=rp[0].result;
    let count=0;
    for(const p of rp){ if(p.result===last) count++; else break; }
    return {type:last,count};
  }

  let html=`<div class="lb-hdr">
    <div>
      <div class="lb-title" style="display:flex;align-items:center;gap:8px"><img src="assets/sharppick-mark.png" alt="SharpPick" width="20" height="20" style="border-radius:6px;box-shadow:0 0 0 1px rgba(0,229,255,.14)"/>Leaderboard</div>
      <div class="lb-subtitle">${entries.length} PICKER${entries.length!==1?'S':''} · RANKED BY WIN %</div>
    </div>
    <button class="lb-refresh" onclick="renderLeaderboardView()">↻ REFRESH</button>
  </div>
  <div class="lb-table-wrap">
  <table class="lb-table">
    <thead class="lb-head">
      <tr>
        <th style="width:40px">#</th>
        <th>PICKER</th>
        <th class="num">W</th>
        <th class="num">L</th>
        <th class="num">P</th>
        <th class="num">WIN %</th>
        <th class="num" title="Weighted by confidence stars">★ WTD</th>
        <th class="num" title="Fake money bankroll">💰</th>
        <th class="num" title="Lock of the Day record">🔒</th>
        <th class="lb-bar-cell"></th>
        <th class="num">STREAK</th>
      </tr>
    </thead>
    <tbody>`;

  entries.forEach((entry,i)=>{
    const isMe=entry.id===meId;
    const decided=entry.w+entry.l;
    const pct=decided>0?Math.round(entry.w/decided*100):0;
    const barW=decided>0?Math.round(entry.w/decided*100):0;
    const streak=getStreak(entry);
    const streakHtml=streak&&streak.count>=2
      ?`<span class="lb-streak ${streak.type==='won'?'hot':'cold'}">${streak.type==='won'?'🔥':'🥶'} ${streak.count}</span>`
      :'<span style="color:var(--dim)">—</span>';
    const rowClass=`lb-row ${isMe?'me':''} ${i<3?'rank-'+(i+1):''}`.trim();

    html+=`<tr class="${rowClass}" onclick="openProfile(${JSON.stringify(entry).replace(/"/g,'&quot;').replace(/'/g,'&#39;')})">
      <td class="lb-cell lb-rank ${rankClass(i)}">${rankIcon(i)}</td>
      <td class="lb-cell">
        <div class="lb-name-cell">
          <div class="lb-avatar ${isMe?'me':''}">${(isMe&&currentUser?.name?currentUser.name:entry.name)[0].toUpperCase()}</div>
          <div>
            <div class="lb-username">${isMe&&currentUser?.name?currentUser.name:entry.name}${isMe?'<span class="lb-you"> YOU</span>':''}</div>
            <div class="lb-last-pick">${entry.total||0} pick${(entry.total||0)!==1?'s':''}</div>
          </div>
        </div>
      </td>
      <td class="lb-cell num lb-w">${entry.w||0}</td>
      <td class="lb-cell num lb-l">${entry.l||0}</td>
      <td class="lb-cell num lb-p">${entry.p||0}</td>
      <td class="lb-cell num"><span class="lb-pct">${decided>0?pct+'%':'—'}</span></td>
      <td class="lb-cell num" style="color:var(--gold);font-size:11px;font-family:'DM Mono',monospace">
        ${isMe && decided>0 ? Math.round(weightedWinPct(picks)*100)+'%' : decided>0 ? pct+'%' : '—'}
      </td>
      <td class="lb-cell num">
        ${(()=>{
          const b=isMe?computeBankroll():(entry.bankroll||1000);
          const d=b-1000;
          const cls=d>0?'pos':d<0?'neg':'even';
          return `<span class="lb-money ${cls}">$${b.toLocaleString()}</span>`;
        })()}
      </td>
      <td class="lb-cell lb-lock-col">
        ${(()=>{
          const lw = isMe ? getLockRecord().w : (entry.lockW||0);
          const ll = isMe ? getLockRecord().l : (entry.lockL||0);
          return (lw+ll) > 0 ? `${lw}-${ll}` : '<span style="color:var(--dim)">—</span>';
        })()}
      </td>
      <td class="lb-cell lb-bar-cell">
        <div class="lb-bar-wrap"><div class="lb-bar" style="width:${barW}%"></div></div>
      </td>
      <td class="lb-cell num">${streakHtml}</td>
    </tr>`;
  });

  html+=`</tbody></table></div>`;
  el.innerHTML=html;

  // Load head-to-head records after rendering
  if(currentUser){
    computeH2H(currentUser.id).then(h2hData=>{
      renderH2HSection(h2hData);
    });
  }
}

// ═══════════════════════════════════════════════════════
// SHARP RATING LEADERBOARD (Verified / Provisional / Specialists)
// ═══════════════════════════════════════════════════════
let LB_SHARP_TAB = 'verified'; // 'verified' | 'provisional' | 'specialists'
let LB_SPECIALIST_SPORT = 'ALL';

function tierLabelFromRating(r, verified){
  if(r==null || !isFinite(r)) return '—';
  const v = Number(r);
  if(!verified) return 'PROVISIONAL';
  if(v>=750) return 'ELITE';
  if(v>=600) return 'PRO';
  if(v>=500) return 'SHARP';
  if(v>=400) return 'SOLID';
  return 'ROOKIE';
}

function fmt1(x){
  if(x==null || !isFinite(x)) return '—';
  return (Math.round(Number(x)*10)/10).toFixed(1);
}

async function fetchNameMap(){
  try{
    const rows = await sbSelect('leaderboard','select=user_id,name&limit=1000');
    const m = {};
    (rows||[]).forEach(r=>{ if(r?.user_id) m[r.user_id]=r.name||('User '+String(r.user_id).slice(0,6)); });
    return m;
  }catch(e){
    // Fallback: try user_ratings table or profiles
    try{
      const rows = await sbSelect('user_ratings','select=user_id,name&limit=1000');
      const m = {};
      (rows||[]).forEach(r=>{ if(r?.user_id) m[r.user_id]=r.name||('User '+String(r.user_id).slice(0,6)); });
      return m;
    }catch{ return {}; }
  }
}

let _lbSkipRpc = false; // kept for compatibility

async function fetchSharpLeaderboard(tab){
  const limit_n = 100;

  // Always read directly from user_ratings — bypasses RPCs which can return
  // stale cached values after a rating recalculation.
  // The RPCs (get_leaderboard_90 / get_leaderboard_90_provisional) just SELECT
  // from user_ratings anyway, so this is equivalent but always fresh.
  try{
    if(tab==='verified'){
      const rows = await sbSelect('user_ratings',
        `select=*&singles_verified_90=eq.true&order=sharp_rating_90.desc.nullslast&limit=${limit_n}`);
      if(rows && rows.length) return rows;
    } else {
      const rows = await sbSelect('user_ratings',
        `select=*&picks_90=gte.1&order=sharp_rating_90.desc.nullslast&limit=${limit_n}`);
      if(rows && rows.length) return rows;
    }
  }catch(e){}

  // Fallback unordered
  try{
    const rows = await sbSelect('user_ratings', `select=*&limit=${limit_n}`);
    return rows || [];
  }catch(e){}

  // Fallback 2: user_ratings unordered
  try{
    const rows = await sbSelect('user_ratings', `select=*&limit=${limit_n}`);
    return rows || [];
  }catch(e){}

  // Fallback 3: try the legacy 'leaderboard' table
  try{
    const rows = await sbSelect('leaderboard', `select=*&order=pnl.desc.nullslast&limit=${limit_n}`);
    return rows || [];
  }catch(e){}

  // Fallback 4: empty (UI will show guidance)
  return [];
}

async function fetchMyRatings(){
  if(!currentUser) return null;
  try{
    const rows = await sbSelect('user_ratings', `select=*&user_id=eq.${currentUser.id}&order=calculated_at.desc&limit=1`);
    return rows && rows[0] ? rows[0] : null;
  }catch(e){
    // Fallback without order if calculated_at doesn't exist
    try{
      const rows = await sbSelect('user_ratings', `select=*&user_id=eq.${currentUser.id}&limit=1`);
      return rows && rows[0] ? rows[0] : null;
    }catch{ return null; }
  }
}

// ─────────────────────────────────────────────────────────────
// SHARP RATING: Movers, Public Profiles, Rating History
// ─────────────────────────────────────────────────────────────
function escapeAttr(s){
  return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function fetchTopMoversToday(){
  try{
    const limit_n = 6;
    return await sbRpc('get_top_movers_today', { limit_n });
  }catch(e){
    return [];
  }
}

async function fetchRatingHistory(userId, days=30){
  try{
    return await sbRpc('get_rating_history', { p_user_id: userId, days });
  }catch(e){
    return [];
  }
}


// --- Local profile stats fallback (when Supabase does not contain all picks yet) ---
function _sp_toNum(v, d=0){
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}
function _sp_profitFromOdds(risk, odds){
  const o = _sp_toNum(odds, 0);
  if(!o || !risk) return 0;
  if(o > 0) return risk * (o/100);
  return risk * (100/Math.abs(o));
}
function _sp_pickRisk(p){
  return _sp_toNum(p.wager ?? p.risk ?? p.stake ?? DEFAULT_WAGER, DEFAULT_WAGER);
}
function _sp_pickOdds(p){
  return _sp_toNum(p.odds, p.lineOdds ?? p.price ?? -110);
}
function _sp_pickIsParlay(p){
  return (p.type === 'parlay') || Array.isArray(p.legs);
}
function _sp_pickMadeAt(p){
  const t = p.madeAt ?? p.createdAt ?? p.ts;
  const n = (typeof t === 'string') ? Date.parse(t) : _sp_toNum(t, 0);
  return n || 0;
}
function _sp_pickResult(p){
  return (p.result || p.status || 'pending').toLowerCase();
}
function _sp_localUserPicks(userId){
  // Some legacy picks may be missing userId; treat them as belonging to current user.
  const me = currentUser?.id;
  return (picks||[]).filter(p => {
    const uid = p.userId || (me && !p.userId ? me : null);
    return uid === userId;
  });
}
function _sp_computeStreak(settled){
  // settled already sorted desc by madeAt
  let dir = null; let n = 0;
  for(const p of settled){
    const r = _sp_pickResult(p);
    if(r === 'push' || r === 'canceled') continue;
    const d = (r === 'won') ? 'W' : (r === 'lost') ? 'L' : null;
    if(!d) continue;
    if(!dir){ dir = d; n = 1; }
    else if(d === dir) n += 1;
    else break;
  }
  return dir ? `${dir}${n}` : '—';
}
function _sp_computeLocalUserStats(userId){
  const all = _sp_localUserPicks(userId).slice().sort((a,b)=>_sp_pickMadeAt(b)-_sp_pickMadeAt(a));
  const now = Date.now();
  const cutoff90 = now - 90*864e5;
  const is90 = p => _sp_pickMadeAt(p) >= cutoff90;

  function agg(list, pred){
    let w=0,l=0,push=0,pend=0, risk=0, profit=0, decided=0;
    for(const pk of list){
      if(pred && !pred(pk)) continue;
      const r = _sp_pickResult(pk);
      if(r === 'pending') { pend++; continue; }
      if(r === 'canceled') continue;
      const rk = _sp_pickRisk(pk);
      const od = _sp_pickOdds(pk);
      if(r === 'won') { w++; decided++; risk += rk; profit += _sp_profitFromOdds(rk, od); }
      else if(r === 'lost') { l++; decided++; risk += rk; profit -= rk; }
      else if(r === 'push') { push++; decided++; risk += rk; }
    }
    const denom = (w+l) || 1;
    const winRate = (w/denom)*100;
    const roi = risk ? (profit/risk)*100 : 0;
    const units = profit/(_sp_toNum(DEFAULT_WAGER, 50) || 50);
    return { w,l,push,pend,decided, risk, profit, winRate, roi, units };
  }

  const singlesAll = all.filter(p => !_sp_pickIsParlay(p));
  const parlaysAll = all.filter(p => _sp_pickIsParlay(p));

  const singles90 = singlesAll.filter(is90);
  const parlays90 = parlaysAll.filter(is90);

  const aSingles90 = agg(singles90);
  const aSinglesAll = agg(singlesAll);
  const aParlays90 = agg(parlays90);

  // Avg odds last 10 settled singles
  const last10 = singlesAll.filter(p=>{const r=_sp_pickResult(p);return r!=='pending'&&r!=='canceled';}).slice(0,10);
  const avgOddsLast10 = last10.length ? Math.round(last10.reduce((sum,p)=>sum+_sp_pickOdds(p),0)/last10.length) : null;

  // Top sport by decided count in last 90
  const byLeague = {};
  for(const pk of singles90){
    const r=_sp_pickResult(pk); if(r==='pending'||r==='canceled') continue;
    const lg = (pk.league || pk.sport || 'other');
    byLeague[lg] = (byLeague[lg]||0)+1;
  }
  const topSport = Object.entries(byLeague).sort((a,b)=>b[1]-a[1])[0]?.[0] || null;

  // Provisional logic
  const picks90 = aSingles90.decided + aParlays90.decided;
  const isProv = picks90 < 18;
  const provReason = isProv ? `${picks90} to unlock Verified leaderboard` : null;

  // Rating proxy using new 0–1000 formula
  const _wrScore  = Math.max(0, Math.min(1000, (aSingles90.winRate - 52.4) * 20 + 500));
  const _roiScore = Math.max(0, Math.min(1000, aSingles90.roi * 25 + 500));
  const _volMult  = Math.max(0.7, Math.min(1.0, 0.7 + (Math.min(picks90, 50) / 50) * 0.3));
  const rating    = Math.round(Math.max(0, Math.min(1000, (_wrScore*0.5 + _roiScore*0.3 + 500*0.2) * _volMult)) * 10) / 10;

  const settledSinglesDesc = singlesAll.filter(p=>{const r=_sp_pickResult(p);return r!=='pending'&&r!=='canceled';}).sort((a,b)=>_sp_pickMadeAt(b)-_sp_pickMadeAt(a));

  return {
    sharp_rating_90: Number(rating.toFixed(1)),
    is_provisional: isProv,
    provisional_reason: provReason,
    top_sport: topSport,
    top_sport_rating: topSport ? Number(rating.toFixed(1)) : null,
    cur_streak: _sp_computeStreak(settledSinglesDesc),
    avg_odds_last10: avgOddsLast10,

    singles_overall_90: Number(rating.toFixed(1)),
    win_rate_90: Number(aSingles90.winRate.toFixed(1)),
    roi_90: Number(aSingles90.roi.toFixed(1)),
    units_90: Number(aSingles90.units.toFixed(2)),

    all_time_singles: `${aSinglesAll.w}-${aSinglesAll.l}-${aSinglesAll.push}`,
    all_time_roi: Number((aSinglesAll.roi||0).toFixed(1)),

    parlays_90: `${aParlays90.w}-${aParlays90.l}-${aParlays90.push}`,
    parlay_roi_90: Number((aParlays90.roi||0).toFixed(1)),

    picks_90: picks90,

    // also expose counts so UI can show pending in chips if needed
    pending_90: aSingles90.pend + aParlays90.pend,
  };
}
function _sp_computeLocalRecentPicks(userId, limit){
  const all = _sp_localUserPicks(userId).slice().sort((a,b)=>_sp_pickMadeAt(b)-_sp_pickMadeAt(a));
  const out = [];
  for(const pk of all){
    const r = _sp_pickResult(pk);
    // match RPC shape used by render
    out.push({
      pick_id: pk.id || null,
      created_at: new Date(_sp_pickMadeAt(pk) || Date.now()).toISOString(),
      league: pk.league || pk.sport || null,
      pick_type: pk.type || (pk.prop ? 'prop' : 'spread'),
      title: pk.title || pk.label || pk.market || pk.team || pk.pick || 'Pick',
      odds: _sp_pickOdds(pk),
      result: r,
      is_parlay: _sp_pickIsParlay(pk),
      legs: pk.legs || null,
      risk: _sp_pickRisk(pk),
      to_win: pk.toWin ?? pk.win ?? null,
      hot_take: pk.hotTake || pk.note || '',
    });
    if(out.length >= (limit||3)) break;
  }
  return out;
}

async function fetchPublicUserStats(userId){
  try{
    const rows = await sbRpc('get_public_user_stats', { p_user_id: userId });
    // Supabase RPC may return object or array depending on helper; normalize to first row
    if(Array.isArray(rows)) return rows[0]||null;
    return rows||null;
  }catch(e){
    return null;
  }
}

async function fetchRecentPicks(userId, limit_n=10){
  try{
    return await sbRpc('get_public_recent_picks', { p_user_id: userId, limit_n });
  }catch(e){
    return [];
  }
}

function sparklineSVG(points, w=220, h=46){
  const vals = (points||[]).map(p=>Number(p.singles_overall_90)).filter(v=>isFinite(v));
  if(vals.length<2){
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
      <rect x="0" y="0" width="${w}" height="${h}" rx="10" fill="rgba(255,255,255,.04)"></rect>
      <text x="${w/2}" y="${h/2+4}" text-anchor="middle" font-size="11" fill="rgba(255,255,255,.35)">No history yet</text>
    </svg>`;
  }
  const min=Math.min(...vals), max=Math.max(...vals);
  const pad=8;
  const nx = (i)=> pad + (i*(w-2*pad)/(vals.length-1));
  const ny = (v)=> {
    const t = (max===min)?0.5:((v-min)/(max-min));
    return (h-pad) - t*(h-2*pad);
  };
  const d = vals.map((v,i)=> `${i===0?'M':'L'} ${nx(i).toFixed(2)} ${ny(v).toFixed(2)}`).join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
    <rect x="0" y="0" width="${w}" height="${h}" rx="10" fill="rgba(255,255,255,.04)"></rect>
    <path d="${d}" fill="none" stroke="rgba(0,229,255,.9)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path>
  </svg>`;
}

function miniStat(label, value){
  return `<div class="sp-stat">
    <div class="sp-stat-label">${label}</div>
    <div class="sp-stat-val">${value}</div>
  </div>`;
}

function formatPct(x){
  if(x==null || !isFinite(x)) return '—';
  return `${(Number(x)*100).toFixed(1)}%`;
}
function formatUnits(x){
  if(x==null || !isFinite(x)) return '—';
  const v = Number(x);
  const s = (Math.round(v*100)/100).toFixed(2);
  return (v>0?'+':'')+s;
}

function leaguePill(league){
  const lg = String(league||'').toUpperCase().trim();
  if(!lg) return '';
  const cls = 'sp-pill sp-pill-'+lg.replace(/[^A-Z0-9]+/g,'');
  return `<span class="${cls}">${lg}</span>`;
}

function bestSportsBadges(bySport, topN=3){
  try{
    const pairs = Object.entries(bySport||{}).map(([k,v])=>[k,Number(v)]).filter(([,v])=>isFinite(v));
    pairs.sort((a,b)=>b[1]-a[1]);
    return pairs.slice(0,topN).map(([k,v])=>`<span class="sp-pill sp-pill-sport">${escapeAttr(k)} <span class="sp-pill-sub">${fmt1(v)}</span></span>`).join(' ');
  }catch(e){ return ''; }
}

function currentStreakFromRecent(recent){
  const settled = (recent||[]).filter(r=>r && r.result && ['win','loss'].includes(String(r.result).toLowerCase()));
  if(!settled.length) return {label:'—', kind:'none'};
  const first = String(settled[0].result).toLowerCase();
  let n=0;
  for(const r of settled){
    const rr = String(r.result).toLowerCase();
    if(rr===first) n++; else break;
  }
  return {label: (first==='win'?'W':'L')+n, kind:first};
}

function avgOddsFromRecent(recent){
  const nums = (recent||[]).map(r=>Number(r?.odds)).filter(v=>isFinite(v) && v!==0);
  if(!nums.length) return null;
  return Math.round(nums.reduce((a,b)=>a+b,0)/nums.length);
}


async function openPublicProfile(userId, name){
  const overlay = document.createElement('div');
  overlay.className='modal-overlay open';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.66);z-index:9999;display:flex;align-items:flex-end;justify-content:center;padding:18px;overflow:hidden;';
  overlay.onclick=(e)=>{ if(e.target===overlay) overlay.remove(); };

  const card = document.createElement('div');
  card.style.cssText='width:min(760px,100%);background:var(--panel);border:1px solid rgba(255,255,255,.10);border-radius:18px;padding:14px 14px 12px;box-shadow:0 18px 60px rgba(0,0,0,.55);';

  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
      <div style="display:flex;align-items:center;gap:12px">
        <div class="lb-avatar" style="width:40px;height:40px;border-radius:14px;font-weight:900">${String(name||'U')[0].toUpperCase()}</div>
        <div>
          <div style="font-weight:900;font-size:16px;letter-spacing:.2px">${escapeAttr(name||'User')}</div>
          <div style="color:var(--dim);font-size:11px;letter-spacing:2px;text-transform:uppercase">Public Profile</div>
        </div>
      </div>
      <button class="lb-refresh" onclick="this.closest('.modal-overlay').remove()">✕</button>
    </div>

    <div id="spProfileBody" style="margin-top:12px">
      <div class="lb-empty" style="padding:22px 14px"><div style="font-size:26px;margin-bottom:10px">⏳</div>LOADING STATS…</div>
    </div>
  `;
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const [stats, history, recent] = await Promise.all([
    fetchPublicUserStats(userId),
    fetchRatingHistory(userId, 30),
    fetchRecentPicks(userId, 10)
  ]);

  const body = card.querySelector('#spProfileBody');

  if(!stats){
    body.innerHTML = `<div class="lb-empty" style="padding:22px 14px"><div style="font-size:26px;margin-bottom:10px">⚠️</div>PROFILE NOT AVAILABLE<small>This user may not have public stats yet.</small></div>`;
    return;
  }

  const tier = tierLabelFromRating(stats.singles_overall_90, stats.singles_verified_90);
  const spark = sparklineSVG(history||[], 240, 52);

  const topSport = (()=>{
    try{
      const by = stats.singles_by_sport_90 || {};
      const pairs = Object.entries(by).map(([k,v])=>[k,Number(v)]).filter(([,v])=>isFinite(v)).sort((a,b)=>b[1]-a[1]);
      return pairs.length ? `${pairs[0][0]} ${fmt1(pairs[0][1])}` : '—';
    }catch{return '—'}
  })();

  const settled90 = stats.singles_picks_90 || 0;
  const progPct = Math.max(0, Math.min(100, (settled90/20)*100));

  const bestSports = bestSportsBadges(stats.singles_by_sport_90, 3);
  const streak = currentStreakFromRecent(recent||[]);
  const avgOdds = avgOddsFromRecent(recent||[]);

  body.innerHTML = `
    <div class="sp-card" style="margin-top:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
        <div>
          <div style="color:var(--dim);font-size:11px;letter-spacing:2px;text-transform:uppercase">Sharp Rating (90D)</div>
          <div style="margin-top:6px;display:flex;align-items:baseline;gap:10px">
            <div style="font-size:30px;font-weight:1000;color:var(--cyan)">${fmt1(stats.singles_overall_90)}</div>
            <span style="font-size:11px;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10)">${stats.singles_verified_90?'VERIFIED':'PROVISIONAL'}</span>
            <span style="color:var(--dim);font-size:11px">${tier}</span>
          </div>
          <div style="margin-top:8px;color:var(--dim);font-size:11px">Top sport: <span style="color:var(--gold)">${escapeAttr(topSport)}</span></div>
          ${bestSports?`<div class="sp-badges-row" style="margin-top:10px">${bestSports}</div>`:''}
          <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
            <span class="sp-pill sp-pill-metric">Streak <span class="sp-pill-sub">${escapeAttr(streak.label)}</span></span>
            <span class="sp-pill sp-pill-metric">Avg Odds <span class="sp-pill-sub">${avgOdds==null?'—':(avgOdds>0?`+${avgOdds}`:`${avgOdds}`)}</span></span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end">
          ${spark}
          <div style="color:var(--dim);font-size:11px">30-day trend</div>
        </div>
      </div>

      <div style="margin-top:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="color:var(--dim);font-size:11px;letter-spacing:2px;text-transform:uppercase">Unlock Verified</div>
          <div style="color:var(--text);font-size:12px;font-weight:800">${settled90}/20</div>
        </div>
        <div style="height:10px;border-radius:999px;background:rgba(255,255,255,.06);overflow:hidden;border:1px solid rgba(255,255,255,.08)">
          <div style="height:100%;width:${progPct}%;background:rgba(0,229,255,.75)"></div>
        </div>
        <div style="margin-top:6px;color:var(--dim);font-size:11px">${Math.max(0,20-settled90)} to unlock Verified leaderboard</div>
      </div>
    </div>

    <div class="sp-grid">
      ${miniStat('Current Streak', escapeAttr(streak.label))}
      ${miniStat('Avg Odds (Last 10)', avgOdds==null?'—':(avgOdds>0?`+${avgOdds}`:`${avgOdds}`))}
      ${miniStat('90D Singles', `${stats.singles_wins_90||0}-${stats.singles_losses_90||0}-${stats.singles_pushes_90||0}`)}
      ${miniStat('90D Win Rate', formatPct(stats.singles_win_rate_90))}
      ${miniStat('90D ROI', formatPct(stats.singles_roi_90))}
      ${miniStat('90D Units', formatUnits(stats.singles_units_90))}
      ${miniStat('All-time Singles', `${stats.singles_wins_all_time||0}-${stats.singles_losses_all_time||0}-${stats.singles_pushes_all_time||0}`)}
      ${miniStat('All-time ROI', formatPct(stats.singles_roi_all_time))}
      ${miniStat('90D Parlays', `${stats.parlays_wins_90||0}-${stats.parlays_losses_90||0}-${stats.parlays_pushes_90||0}`)}
      ${miniStat('90D Parlay ROI', formatPct(stats.parlays_roi_90))}
    </div>

    <div class="sp-card" style="margin-top:12px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="color:var(--dim);font-size:11px;letter-spacing:2px;text-transform:uppercase">Recent Picks</div>
        <div style="color:var(--dim);font-size:11px">Public · last ${Math.min(10,(recent||[]).length)}</div>
      </div>
      <div style="margin-top:10px;display:flex;flex-direction:column;gap:10px">
        ${(recent||[]).map(r=>{
          const res = (r.result||'pending').toUpperCase();
          const pill = res==='WIN'?'rgba(46,213,115,.16)':res==='LOSS'?'rgba(255,71,87,.16)':res==='PUSH'?'rgba(255,209,102,.14)':'rgba(255,255,255,.06)';
          const brd = res==='WIN'?'rgba(46,213,115,.22)':res==='LOSS'?'rgba(255,71,87,.22)':res==='PUSH'?'rgba(255,209,102,.18)':'rgba(255,255,255,.10)';
          return `<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
            <div style="min-width:0">
              <div style="font-weight:800;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeAttr(r.description||'Pick')}</div>
              <div style="color:var(--dim);font-size:11px;margin-top:3px">${escapeAttr(r.league||'')} · Odds ${r.odds==null?'—':r.odds}</div>
            </div>
            <div style="text-align:right">
              <div style="display:inline-block;font-size:11px;padding:6px 10px;border-radius:999px;background:${pill};border:1px solid ${brd}">${res}</div>
            </div>
          </div>`;
        }).join('') || `<div style="color:var(--dim);font-size:12px">No public picks yet.</div>`}
      </div>
    </div>
  `;
}

function breakdownFromLocalSingles90(){
  const now = Date.now();
  const since = now - 90*86400000;
  const settled = (picks||[]).filter(p=>p.result && normalizeResult(p.result)!=='pending');
  const singles = settled.filter(p=>p.type!=='parlay' && (p.settledAt||p.madeAt||0) >= since);
  const n = singles.length;
  const wins = singles.filter(p=>p.result==='win' || p.result==='won').length;
  const losses = singles.filter(p=>p.result==='loss' || p.result==='lost').length;
  const decided = wins+losses;
  const winRate = decided? wins/decided : 0;

  function profitForPick(p){
    const stake = Number(p.wager||p.stake||0) || 0;
    const odds = Number(p.odds||p.odds_american||-110) || -110;
    const res = (p.result||'').toLowerCase();
    if(!stake) return 0;
    if(res==='push') return 0;
    if(res==='loss' || res==='lost') return -stake;
    if(res==='win' || res==='won'){
      if(odds>0) return stake*(odds/100);
      if(odds<0) return stake*(100/Math.abs(odds));
      return 0;
    }
    return 0;
  }
  const stakeSum = singles.reduce((a,p)=>a+(Number(p.wager||p.stake||0)||0),0);
  const profitSum = singles.reduce((a,p)=>a+profitForPick(p),0);
  const roi = stakeSum? (profitSum/stakeSum) : 0;

  // Consistency: weekly ROI volatility (last 6 weeks)
  const weeks = {};
  singles.forEach(p=>{
    const ts = (p.settledAt||p.madeAt||0);
    const wk = Math.floor(ts/604800000);
    (weeks[wk]=weeks[wk]||[]).push(p);
  });
  const wkKeys = Object.keys(weeks).map(Number).sort((a,b)=>b-a).slice(0,6);
  const wkRois = wkKeys.map(k=>{
    const arr=weeks[k];
    const st=arr.reduce((a,p)=>a+(Number(p.wager||p.stake||0)||0),0);
    const pr=arr.reduce((a,p)=>a+profitForPick(p),0);
    return st? pr/st : 0;
  });
  const mean = wkRois.length? wkRois.reduce((a,b)=>a+b,0)/wkRois.length : 0;
  const varr = wkRois.length? wkRois.reduce((a,x)=>a+(x-mean)*(x-mean),0)/wkRois.length : 0;
  const sd = Math.sqrt(varr); // higher = less consistent

  function band(val, cuts){
    if(val>=cuts[2]) return 'HIGH';
    if(val>=cuts[1]) return 'MEDIUM';
    if(val>=cuts[0]) return 'LOW';
    return 'VERY LOW';
  }

  const accuracyBand = band(winRate, [0.48, 0.52, 0.56]);
  const roiBand = band(roi, [-0.02, 0.02, 0.06]);
  const consistencyBand = sd<=0.05?'HIGH':sd<=0.10?'MEDIUM':sd<=0.18?'LOW':'VERY LOW';
  const sampleBand = n>=50?'HIGH':n>=20?'MEDIUM':n>=10?'LOW':n>=1?'VERY LOW':'—';

  return {n,wins,losses,winRate,roi,sd, accuracyBand, roiBand, consistencyBand, sampleBand};
}

function openBreakdownModal(){
  const b = breakdownFromLocalSingles90();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.62);z-index:9999;display:flex;align-items:flex-end;justify-content:center;padding:18px;overflow:hidden;';
  overlay.onclick = (e)=>{ if(e.target===overlay) overlay.remove(); };
  const card = document.createElement('div');
  card.style.cssText = 'width:min(520px,100%);background:var(--panel);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:16px 16px 14px;box-shadow:0 20px 60px rgba(0,0,0,.55);';
  const row = (label, band, detail)=>`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-top:1px solid rgba(255,255,255,.06)">
      <div>
        <div style="font-weight:800;letter-spacing:.6px">${label}</div>
        <div style="color:var(--dim);font-size:12px;margin-top:2px">${detail}</div>
      </div>
      <div style="font-family:DM Mono,monospace;font-size:12px;padding:6px 10px;border-radius:999px;background:rgba(0,229,255,.10);border:1px solid rgba(0,229,255,.20);color:var(--cyan)">${band}</div>
    </div>`;
  card.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
      <div>
        <div style="font-size:12px;letter-spacing:3px;color:var(--dim);text-transform:uppercase">Sharp Rating Breakdown</div>
        <div style="font-size:18px;font-weight:900;margin-top:4px">Last 90 Days · Singles</div>
      </div>
      <button class="btn" style="padding:8px 10px;border-radius:12px" onclick="this.closest('.modal-overlay').remove()">✕</button>
    </div>
    ${row('Accuracy', b.accuracyBand, b.n?`${Math.round(b.winRate*100)}% win rate (${b.wins}-${b.losses})`:'No settled picks yet')}
    ${row('ROI', b.roiBand, b.n?`${(Math.round(b.roi*1000)/10)}% ROI (${Math.round(b.n)} picks)`:'—')}
    ${row('Consistency', b.consistencyBand, b.n?`Weekly volatility: ${(Math.round(b.sd*1000)/10)}%`:'—')}
    ${row('Sample Size', b.sampleBand, b.n?`${b.n} settled singles (Verified at 20)`:'0 settled')}
    <div style="margin-top:10px;color:var(--dim);font-size:12px;line-height:1.4">
      Ratings are skill-based and update daily. Pending games don’t affect your score until they settle.
    </div>
  `;
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

function ratingCardHTML(r){
  const rating = r?.singles_overall_90;
  const picks90 = r?.singles_picks_90||0;
  const verified = !!r?.singles_verified_90;
  const tier = tierLabelFromRating(rating, verified);
  const pct = Math.min(100, Math.round((picks90/20)*100));
  return `
    <div class="sharp-card" style="background:linear-gradient(135deg, rgba(0,229,255,.10), rgba(0,229,255,.02));border:1px solid rgba(0,229,255,.22);border-radius:18px;padding:14px 14px 12px;margin-bottom:14px;cursor:pointer" onclick="openBreakdownModal()">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
        <div>
          <div style="font-size:11px;letter-spacing:3px;color:var(--dim);text-transform:uppercase">Sharp Rating · 90D</div>
          <div style="display:flex;align-items:baseline;gap:10px;margin-top:6px">
            <div style="font-size:34px;font-weight:950;line-height:1;color:var(--cyan)">${fmt1(rating)}</div>
            <div style="font-family:DM Mono,monospace;font-size:12px;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08)">${tier}</div>
          </div>
          <div style="margin-top:8px;color:var(--dim);font-size:12px">
            ${picks90} settled singles · ${verified?'Verified':'Provisional'} · Updates daily
          </div>
        </div>
        <div style="min-width:120px;text-align:right">
          <div style="color:var(--dim);font-size:11px;letter-spacing:2px;text-transform:uppercase">Verified</div>
          <div style="margin-top:6px">
            <div style="height:8px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden">
              <div style="height:100%;width:${pct}%;background:rgba(0,229,255,.65)"></div>
            </div>
            <div style="margin-top:6px;color:var(--dim);font-size:11px">${Math.max(0,20-picks90)} to unlock</div>
          </div>
        </div>
      </div>
    </div>`;
}

async function renderLeaderboardView(){
  // Legacy entrypoint (some UI buttons still call renderLeaderboardView)
  return renderLeaderboardPro();
  const el=document.getElementById('leaderboardContent');
  el.innerHTML=`<div class="lb-empty"><div style="font-size:28px;margin-bottom:12px">⏳</div>LOADING SHARP LEADERBOARD…</div>`;
  const nameMap = await fetchNameMap();
  const rows = await fetchSharpLeaderboard(LB_SHARP_TAB);

  // Build header + tabs
  const tabBtn = (key,label)=>`<button class="lb-tab ${LB_SHARP_TAB===key?'on':''}" onclick="LB_SHARP_TAB='${key}';renderLeaderboardView()">${label}</button>`;
  const tabs = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
      ${tabBtn('verified','Verified')}
      ${tabBtn('provisional','Provisional')}
      ${tabBtn('specialists','Specialists')}
    </div>`;

  // My rating card (if signed in)
  const myRatings = await fetchMyRatings();
  const myCard = myRatings ? ratingCardHTML(myRatings) : '';
  const movers = await fetchTopMoversToday();
  const moversSection = (movers && movers.length) ? `
    <div class="sp-card" style="margin-top:12px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="color:var(--dim);font-size:11px;letter-spacing:2px;text-transform:uppercase">Top Movers Today</div>
        <div style="color:var(--dim);font-size:11px">Δ since last update</div>
      </div>
      <div class="movers-row">
        ${movers.map(m=>{
          const nm = nameMap[m.user_id] || ('User '+String(m.user_id).slice(0,6));
          const delta = Number(m.delta||0);
          const sign = delta>0?'+':'';
          const pillBg = delta>0?'rgba(46,213,115,.14)':delta<0?'rgba(255,71,87,.14)':'rgba(255,255,255,.06)';
          const pillBr = delta>0?'rgba(46,213,115,.22)':delta<0?'rgba(255,71,87,.22)':'rgba(255,255,255,.10)';
          return `<div class="mover" data-uid="${m.user_id}" data-name="${escapeAttr(nm)}">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
              <div style="display:flex;align-items:center;gap:10px;min-width:0">
                <div class="lb-avatar" style="width:34px;height:34px;border-radius:14px">${String(nm||'U')[0].toUpperCase()}</div>
                <div style="min-width:0">
                  <div style="font-weight:900;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeAttr(nm)}</div>
                  <div style="color:var(--dim);font-size:11px">Now ${fmt1(m.current_rating)}</div>
                </div>
              </div>
              <div style="text-align:right">
                <div style="display:inline-block;font-size:11px;padding:6px 10px;border-radius:999px;background:${pillBg};border:1px solid ${pillBr}">${sign}${fmt1(delta)}</div>
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>
      <div style="margin-top:10px;color:var(--dim);font-size:11px">Tap a mover to view full stats</div>
    </div>` : '';

  if(!rows || !rows.length){
    // Empty state guidance
    el.innerHTML = `
      <div class="lb-hdr">
        <div>
          <div class="lb-title" style="display:flex;align-items:center;gap:8px"><img src="assets/sharppick-mark.png" alt="SharpPick" width="20" height="20" style="border-radius:6px;box-shadow:0 0 0 1px rgba(0,229,255,.14)"/>Sharp Rating Leaderboard</div>
          <div class="lb-subtitle">90-DAY · SKILL-BASED · NO GAMBLING</div>
          ${tabs}
        </div>
        <button class="lb-refresh" onclick="renderLeaderboardView()">↻ REFRESH</button>
      </div>
      ${myCard}
      ${moversSection}
      <div class="lb-empty">
        <div style="font-size:32px;margin-bottom:16px">🏆</div>
        ${LB_SHARP_TAB==='verified'?'NO VERIFIED SHARPS YET':'NO RATINGS YET'}
        <small>${LB_SHARP_TAB==='verified'?'Settle 20 singles to enter the Verified leaderboard.':'Make picks and come back after games settle.'}</small>
      </div>`;
    return;
  }

  // Specialists: choose sport + sort by that sport rating
  let entries = (rows||[]).map(r=>{
    const uid = r.user_id;
    return {
      user_id: uid,
      name: nameMap[uid] || ('User '+String(uid).slice(0,6)),
      rating: Number(r.singles_overall_90),
      picks: Number(r.singles_picks_90||0),
      verified: !!r.singles_verified_90,
      bySport: r.singles_by_sport_90 || {}
    };
  });

  let sportKeys = ['ALL'];
  if(LB_SHARP_TAB==='specialists'){
    const set = new Set();
    entries.forEach(e=>{ try{ Object.keys(e.bySport||{}).forEach(k=>set.add(k)); }catch{} });
    sportKeys = ['ALL', ...Array.from(set).sort()];
    if(!sportKeys.includes(LB_SPECIALIST_SPORT)) LB_SPECIALIST_SPORT='ALL';
    if(LB_SPECIALIST_SPORT!=='ALL'){
      entries = entries
        .filter(e=>e.bySport && e.bySport[LB_SPECIALIST_SPORT]!=null)
        .sort((a,b)=>Number(b.bySport[LB_SPECIALIST_SPORT])-Number(a.bySport[LB_SPECIALIST_SPORT]));
    } else {
      entries.sort((a,b)=>b.rating-a.rating);
    }
  } else {
    entries.sort((a,b)=>b.rating-a.rating);
  }

  const sportSelect = (LB_SHARP_TAB==='specialists') ? `
    <div style="margin-top:10px;display:flex;align-items:center;gap:10px">
      <div style="font-size:11px;letter-spacing:2px;color:var(--dim);text-transform:uppercase">Sport</div>
      <select class="lb-sel" onchange="LB_SPECIALIST_SPORT=this.value;renderLeaderboardView()" style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);color:var(--text);padding:8px 10px;border-radius:12px">
        ${sportKeys.map(k=>`<option value="${k}" ${k===LB_SPECIALIST_SPORT?'selected':''}>${k}</option>`).join('')}
      </select>
    </div>` : '';

  let html = `
    <div class="lb-hdr">
      <div>
        <div class="lb-title" style="display:flex;align-items:center;gap:8px"><img src="assets/sharppick-mark.png" alt="SharpPick" width="20" height="20" style="border-radius:6px;box-shadow:0 0 0 1px rgba(0,229,255,.14)"/>Sharp Rating Leaderboard</div>
        <div class="lb-subtitle">90-DAY · ${LB_SHARP_TAB==='verified'?'VERIFIED ONLY':'ALL USERS'} · UPDATED DAILY</div>
        ${tabs}
        ${sportSelect}
      </div>
      <button class="lb-refresh" onclick="renderLeaderboardView()">↻ REFRESH</button>
    </div>
    ${myCard}
    ${moversSection}
    <div class="lb-table-wrap">
      <table class="lb-table">
        <thead class="lb-head">
          <tr>
            <th style="width:40px">#</th>
            <th>PICKER</th>
            <th class="num">RATING</th>
            <th class="num">PICKS</th>
            <th class="num">STATUS</th>
            <th class="num">${LB_SHARP_TAB==='specialists' && LB_SPECIALIST_SPORT!=='ALL' ? LB_SPECIALIST_SPORT : 'TOP SPORT'}</th>
          </tr>
        </thead>
        <tbody>
  `;

  entries.slice(0,100).forEach((e,i)=>{
    const tier = tierLabelFromRating(e.rating, e.verified);
    const topSport = (()=>{
      try{
        const pairs = Object.entries(e.bySport||{}).map(([k,v])=>[k,Number(v)]).filter(([,v])=>isFinite(v));
        pairs.sort((a,b)=>b[1]-a[1]);
        if(LB_SHARP_TAB==='specialists' && LB_SPECIALIST_SPORT!=='ALL'){
          const v = e.bySport[LB_SPECIALIST_SPORT];
          return `${LB_SPECIALIST_SPORT} ${fmt1(v)}`;
        }
        return pairs.length? `${pairs[0][0]} ${fmt1(pairs[0][1])}` : '—';
      }catch{return '—'}
    })();
    html += `
      <tr class="lb-row ${e.user_id===currentUser?.id?'me':''}" data-uid="${e.user_id}" data-name="${escapeAttr(e.name)}">
        <td class="lb-cell lb-rank">${i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1)}</td>
        <td class="lb-cell">
          <div class="lb-name-cell">
            <div class="lb-avatar ${e.user_id===currentUser?.id?'me':''}">${String(e.name||'U')[0].toUpperCase()}</div>
            <div>
              <div class="lb-username">${e.name}${e.user_id===currentUser?.id?'<span class="lb-you"> YOU</span>':''}</div>
              <div class="lb-last-pick" style="color:var(--dim)">${tier}</div>
            </div>
          </div>
        </td>
        <td class="lb-cell num" style="color:var(--cyan);font-family:DM Mono,monospace">${fmt1(e.rating)}</td>
        <td class="lb-cell num">${e.picks}</td>
        <td class="lb-cell num"><span style="font-size:11px;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08)">${e.verified?'VERIFIED':'PROVISIONAL'}</span></td>
        <td class="lb-cell num" style="color:var(--gold)">${topSport}</td>
      </tr>
    `;
  });

  html += `</tbody></table></div>`;
  el.innerHTML = html;

  // Click-through to public profile
  try{
    el.querySelectorAll('.lb-row[data-uid]').forEach(row=>{
      row.style.cursor='pointer';
      row.addEventListener('click', ()=>{
        const uid=row.dataset.uid;
        const nm=row.dataset.name;
        if(uid) openPublicProfile(uid, nm);
      });
    });
    el.querySelectorAll('.mover[data-uid]').forEach(card=>{
      card.style.cursor='pointer';
      card.addEventListener('click', ()=>{
        const uid=card.dataset.uid;
        const nm=card.dataset.name;
        if(uid) openPublicProfile(uid, nm);
      });
    });
  }catch(e){}
}



// ═══════════════════════════════════════════════════════
// TICKER
// ═══════════════════════════════════════════════════════
function updateTicker(){
  const items=allGames.filter(g=>g.isLive||g.isFinal).slice(0,30);
  if(!items.length) return;
  const html=items.map(g=>`<span class="ti">${g.isLive?`<span class="lv">● </span>`:''}${g.away.name} <span class="sc">${g.away.score}</span> — ${g.home.name} <span class="sc">${g.home.score}</span>${g.isLive?` · ${g.statusText}`:' · FINAL'}</span>`).join('');
  const track=document.getElementById('tickerTrack'); if(!track) return; const newFull=html+html; if(track.dataset.lastHtml===newFull) return; track.dataset.lastHtml=newFull; track.innerHTML=newFull;
}


// ═══════════════════════════════════════════════════════
// PUBLIC PICK TRENDS
// Each pick is stored shared so all users can see %
// ═══════════════════════════════════════════════════════
async function publishPickTrends(){
  if(!currentUser) return;
  const map={};
  picks.forEach(p=>{
    const gid=p.actualGameId||p.gameId;
    if(p.type==='prop') return;
    if(!map[gid]) map[gid]={spread:{},total:{}};
    if(p.type==='spread') map[gid].spread[p.side]=(map[gid].spread[p.side]||0)+1;
    if(p.type==='total')  map[gid].total[p.side]=(map[gid].total[p.side]||0)+1;
  });
  // Local fallback
  try{ localStorage.setItem('trends:'+currentUser.id, JSON.stringify(map)); }catch{}
  try{
    await sbUpsert('pick_trends',{user_id:currentUser.id, trends:map});
  }catch(e){
    // Don't let trend publish failures cascade to Supabase offline state
    // — these are non-critical writes
    if(supaOnline!==false) console.warn('Trends publish failed:',e?.message);
    // Undo the supaFailCount increment from sbUpsert so reads still work
    if(supaFailCount > 0 && supaOnline) supaFailCount = Math.max(0, supaFailCount - 1);
  }
}

async function fetchPickTrends(){
  const merged={};
  try{
    const data=await sbSelect('pick_trends','select=trends');
    if(data){
      data.forEach(row=>{
        const t=row.trends||{};
        Object.entries(t).forEach(([gid,v])=>{
          if(!merged[gid]) merged[gid]={spread:{},total:{}};
          Object.entries(v.spread||{}).forEach(([side,cnt])=>{merged[gid].spread[side]=(merged[gid].spread[side]||0)+cnt;});
          Object.entries(v.total||{}).forEach(([side,cnt])=>{merged[gid].total[side]=(merged[gid].total[side]||0)+cnt;});
        });
      });
      return merged;
    }
  }catch(e){ if(supaOnline!==false) console.warn('Trends fetch failed:',e?.message); }
  // Fallback: localStorage
  try{
    lsKeysWithPrefix('trends:').forEach(k=>{
      let data; try{data=JSON.parse(localStorage.getItem(k)||'{}');}catch{return;}
      Object.entries(data).forEach(([gid,v])=>{
        if(!merged[gid]) merged[gid]={spread:{},total:{}};
        Object.entries(v.spread||{}).forEach(([side,cnt])=>{merged[gid].spread[side]=(merged[gid].spread[side]||0)+cnt;});
        Object.entries(v.total||{}).forEach(([side,cnt])=>{merged[gid].total[side]=(merged[gid].total[side]||0)+cnt;});
      });
    });
  }catch{}
  return merged;
}


// ── localStorage key index helper ─────────────────────────────────
// Iterating localStorage.length in a loop is O(n) and blocks the main thread.
// This helper builds a once-per-call snapshot of keys filtered by prefix,
// replacing the 4 separate iteration loops throughout the app.
function lsKeysWithPrefix(prefix){
  const keys = [];
  try{
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(k && k.startsWith(prefix)) keys.push(k);
    }
  }catch{}
  return keys;
}

let cachedTrends={};
function trendHTML(g){
  const t=cachedTrends[g.id];
  if(!t) return '';
  const sp=t.spread||{}, tot=t.total||{};
  const spTotal=Object.values(sp).reduce((a,b)=>a+b,0);
  const totTotal=Object.values(tot).reduce((a,b)=>a+b,0);
  if(spTotal===0&&totTotal===0) return '';
  let html='<div class="trend-bar-wrap">';
  if(spTotal>0){
    const keys=Object.keys(sp);
    const a=keys[0],b=keys[1]||null;
    const aPct=Math.round((sp[a]||0)/spTotal*100);
    const bPct=b?100-aPct:0;
    html+=`<div class="trend-label-row"><span>${a.split(' ').slice(-1)[0]}</span><span>${b||'—'}</span></div>
    <div class="trend-bar-track"><div class="trend-away" style="width:${aPct}%"></div><div class="trend-home" style="width:${bPct}%"></div></div>
    <div class="trend-counts"><span class="trend-count-away">${sp[a]||0} pick${(sp[a]||0)!==1?'s':''} (${aPct}%)</span>${b?`<span class="trend-count-home">${sp[b]||0} picks (${bPct}%)</span>`:''}
    </div>`;
  }
  if(totTotal>0){
    const oPct=Math.round((tot.over||0)/totTotal*100);
    html+=`<div class="trend-label-row" style="margin-top:6px"><span>OVER</span><span>UNDER</span></div>
    <div class="trend-bar-track"><div class="trend-away" style="width:${oPct}%"></div><div class="trend-home" style="width:${100-oPct}%"></div></div>
    <div class="trend-counts"><span class="trend-count-away">${tot.over||0} (${oPct}%)</span><span class="trend-count-home">${tot.under||0} (${100-oPct}%)</span></div>`;
  }
  return html+'</div>';
}

async function refreshTrends(){
  cachedTrends=await fetchPickTrends();
  renderScores();
}

// ═══════════════════════════════════════════════════════
// ACHIEVEMENTS
// ═══════════════════════════════════════════════════════
const ACHIEVEMENTS=[
  {id:'first_pick',  icon:'🎯', name:'First Blood',    desc:'Make your first pick',             check:p=>p.length>=1},
  {id:'win_3',       icon:'🔥', name:'On a Roll',       desc:'Win 3 picks',                      check:(p,s)=>s.w>=3},
  {id:'win_10',      icon:'💎', name:'Diamond Hands',   desc:'Win 10 picks',                     check:(p,s)=>s.w>=10},
  {id:'win_50',      icon:'👑', name:'The King',        desc:'Win 50 picks',                     check:(p,s)=>s.w>=50},
  {id:'streak_3',    icon:'⚡', name:'Hat Trick',       desc:'Win 3 in a row',                   check:(p,s)=>s.curStreak>=3},
  {id:'streak_5',    icon:'🌋', name:'Eruption',        desc:'Win 5 in a row',                   check:(p,s)=>s.curStreak>=5},
  {id:'streak_10',   icon:'🚀', name:'To The Moon',     desc:'Win 10 in a row',                  check:(p,s)=>s.curStreak>=10},
  {id:'over_hunter', icon:'📈', name:'Over Hunter',     desc:'10 winning over picks',            check:(p)=>p.filter(x=>x.type==='total'&&x.side==='over'&&x.result==='won').length>=10},
  {id:'prop_master', icon:'🔬', name:'Prop Master',     desc:'Win 10 prop bets',                 check:(p)=>p.filter(x=>x.type==='prop'&&x.result==='won').length>=10},
  {id:'upset_king',  icon:'💥', name:'Upset King',      desc:'Win 5 underdog spread picks',      check:(p)=>p.filter(x=>x.type==='spread'&&x.result==='won'&&parseFloat((x.description||'').match(/[+-][\d.]+/)?.[0]||'0')>0).length>=5},
  {id:'pct_60',      icon:'📊', name:'Sharp',           desc:'60%+ win rate (min 20 picks)',      check:(p,s)=>s.decided>=20&&s.w/s.decided>=0.60},
  {id:'pct_70',      icon:'🧠', name:'The Algorithm',  desc:'70%+ win rate (min 30 picks)',      check:(p,s)=>s.decided>=30&&s.w/s.decided>=0.70},
  {id:'multi_sport', icon:'🌍', name:'All-Star',        desc:'Win picks in 3 different sports',  check:(p)=>new Set(p.filter(x=>x.result==='won').map(x=>x.league)).size>=3},
  {id:'perfect_day', icon:'✨', name:'Perfect Day',     desc:'Go 5-0 on a single day',           check:(p)=>{const byDay={};p.forEach(x=>{if(x.result==='won'){const d=new Date(x.madeAt).toDateString();byDay[d]=(byDay[d]||0)+1;}});const byDayL={};p.forEach(x=>{if(x.result==='lost'){const d=new Date(x.madeAt).toDateString();byDayL[d]=(byDayL[d]||0)+1;}});return Object.keys(byDay).some(d=>byDay[d]>=5&&!byDayL[d]);}},
];

function calcPickStats(p){
  const settled=p.filter(x=>x.result!=='pending');
  const w=settled.filter(x=>x.result==='won').length;
  const l=settled.filter(x=>x.result==='lost').length;
  const decided=w+l;
  // current win streak
  const ordered=[...settled].sort((a,b)=>b.madeAt-a.madeAt).filter(x=>x.result!=='push');
  let curStreak=0;
  if(ordered.length&&ordered[0].result==='won'){for(const x of ordered){if(x.result==='won')curStreak++;else break;}}
  return{w,l,decided,curStreak};
}

let unlockedAchs=new Set(JSON.parse(localStorage.getItem('ls_achs')||'[]'));

// Sync achievements to Supabase so they persist across devices
async function syncAchievementsToServer(){
  try{
    if(!currentUser?.id || !supaOnline) return;
    await sbUpsert('user_achievements', {
      user_id: currentUser.id,
      unlocked: JSON.stringify([...unlockedAchs]),
      updated_at: Date.now(),
    });
  }catch(e){ console.warn('[Ach] sync to server failed:', e?.message); }
}

async function syncAchievementsFromServer(){
  try{
    if(!currentUser?.id || !supaOnline) return;
    const rows = await sbSelect('user_achievements', `user_id=eq.${currentUser.id}&select=unlocked`);
    if(!rows?.[0]?.unlocked) return;
    const serverAchs = JSON.parse(rows[0].unlocked || '[]');
    let added = false;
    serverAchs.forEach(id => { if(!unlockedAchs.has(id)){ unlockedAchs.add(id); added = true; } });
    if(added){
      localStorage.setItem('ls_achs', JSON.stringify([...unlockedAchs]));
      console.log('[Ach] Synced achievements from server');
    }
  }catch(e){ console.warn('[Ach] sync from server failed:', e?.message); }
}
function updateMobileBadge(){
  const pending=picks.filter(p=>p.result==='pending').length;
  const badge=document.getElementById('mobPicksBadge');
  if(badge){badge.style.display=pending>0?'flex':'none';badge.textContent=String(pending);}
}

function checkAchievements(){
  const stats=calcPickStats(picks);
  ACHIEVEMENTS.forEach(a=>{
    if(unlockedAchs.has(a.id)) return;
    try{ if(a.check(picks,stats)){
      unlockedAchs.add(a.id);
      localStorage.setItem('ls_achs',JSON.stringify([...unlockedAchs]));
      showAchToast(a);
      // Persist to server so achievements survive device switches
      syncAchievementsToServer().catch(()=>{});
    }}catch(e){}
  });
}
function showAchToast(a){
  const t=document.getElementById('achToast');
  const n=document.getElementById('achToastName');
  const i=document.getElementById('achToastIcon');
  if(!t) return;
  i.textContent=a.icon; n.textContent=a.name;
  t.classList.add('show');
  // Auto-dismiss after 2.5s, and allow tap to dismiss
  clearTimeout(t._timer);
  t._timer=setTimeout(()=>t.classList.remove('show'),2500);
  t.onclick=()=>{t.classList.remove('show');clearTimeout(t._timer);};
}

// ═══════════════════════════════════════════════════════
// ANALYSIS VIEW
// ═══════════════════════════════════════════════════════
function renderAnalysisView(){ renderAnalyticsView(); }
function renderAnalyticsView(){
  const el=document.getElementById('analysisContent');
  if(!el) return;
  const settled=picks.filter(p=>normalizeResult(p.result)!=='pending');
  const stats=calcPickStats(picks);
  const pct=stats.decided>0?Math.round(stats.w/stats.decided*100):0;

  // By sport/league
  const sports={};
  settled.forEach(p=>{
    const s=p.league||'Other';
    if(!sports[s]) sports[s]={w:0,l:0,p:0};
    const _r=normalizeResult(p.result); sports[s][_r==='won'?'w':_r==='lost'?'l':'p']++;
  });
  const sportRows=Object.entries(sports).sort((a,b)=>{
    const aD=a[1].w+a[1].l, bD=b[1].w+b[1].l;
    const aP=aD>0?a[1].w/aD:0, bP=bD>0?b[1].w/bD:0;
    return bP-aP;
  });

  // By type
  const byType={spread:{w:0,l:0,p:0},total:{w:0,l:0,p:0},prop:{w:0,l:0,p:0}};
  settled.forEach(p=>{if(byType[p.type]){const _r=normalizeResult(p.result);byType[p.type][_r==='won'?'w':_r==='lost'?'l':'p']++;}});

  // By day of week
  const byDay={};
  settled.forEach(p=>{
    const d=new Date(p.madeAt).getDay();
    if(!byDay[d]) byDay[d]={w:0,l:0};
    const _dr=normalizeResult(p.result); if(_dr==='won') byDay[d].w++; else if(_dr==='lost') byDay[d].l++;
  });
  const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dayEntries=Object.entries(byDay).filter(([,v])=>v.w+v.l>=1);
  const bestDay=dayEntries.length?dayEntries.sort(([,a],[,b])=>{const ap=a.w/(a.w+a.l),bp=b.w/(b.w+b.l);return bp-ap;})[0]:null;

  // ROI
  let totalWagered=0, totalProfit=0;
  settled.forEach(p=>{
    if(p.wager){
      totalWagered+=p.wager;
      const _pr=normalizeResult(p.result); if(_pr==='won') totalProfit+=calcPayout(p.wager,p.odds||-110);
      else if(_pr==='lost') totalProfit-=p.wager;
    }
  });
  const roiPct=totalWagered>0?Math.round(totalProfit/totalWagered*100):0;

  // Streak history
  const streakHistory=settled.filter(p=>normalizeResult(p.result)!=='push').sort((a,b)=>a.madeAt-b.madeAt).map(p=>normalizeResult(p.result)==='won'?1:-1);
  const dotCount=Math.min(streakHistory.length,40);
  const dots=streakHistory.slice(-dotCount).map(v=>`<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${v===1?'var(--green)':'var(--red)'};margin:1px;"></span>`).join('');

  // Lock record
  const lockRec=getLockRecord();

  // Achievements
  const achUnlocked=ACHIEVEMENTS.filter(a=>unlockedAchs.has(a.id)).length;

  // Helper
  const p2=(w,l)=>w+l>0?Math.round(w/(w+l)*100)+'%':'—';
  const pc=(w,l)=>{const v=w+l>0?Math.round(w/(w+l)*100):50;return v>=55?'var(--green)':v>=45?'var(--gold)':'var(--red)';};

  if(!settled.length){
    el.innerHTML=`<div class="section-hdr-row"><div><div class="section-title">📊 Analytics</div><div class="section-sub">PERFORMANCE · EDGES · ACHIEVEMENTS</div></div></div>
    <div style="padding:60px 20px;text-align:center;font-family:'DM Mono',monospace;font-size:12px;color:var(--muted);letter-spacing:2px">No settled picks yet<br><small style="font-size:10px;color:var(--dim)">Make some picks to unlock your analytics</small></div>`;
    return;
  }

  el.innerHTML=`
  <div class="section-hdr-row">
    <div><div class="section-title">📊 Analytics</div><div class="section-sub">PERFORMANCE · EDGES · ACHIEVEMENTS</div></div>
    <button class="lb-refresh" onclick="setMode('analysis')">↻</button>
  </div>

  <!-- OVERVIEW CARDS -->
  <div class="analysis-grid">
    <div class="analysis-card">
      <div class="analysis-card-title">Overall Record</div>
      <div class="analysis-big-num" style="color:${pct>=55?'var(--green)':pct>=45?'var(--gold)':'var(--red)'}">${pct}%</div>
      <div class="analysis-sub">${stats.w}W — ${stats.l}L${settled.filter(p=>p.result==='push').length?' — '+settled.filter(p=>p.result==='push').length+'P':''}</div>
      <div style="margin-top:12px;height:6px;background:var(--dim);border-radius:3px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${pct>=55?'var(--green)':pct>=45?'var(--gold)':'var(--red)'};border-radius:3px;transition:width .6s ease"></div>
      </div>
    </div>
    <div class="analysis-card">
      <div class="analysis-card-title">Current Streak</div>
      <div class="streak-display">
        <div class="streak-fire">${stats.curStreak>=5?'🔥':stats.curStreak>=3?'⚡':'🎯'}</div>
        <div class="streak-num" style="color:${stats.curStreak>=3?'var(--green)':'var(--text)'}">${stats.curStreak}</div>
        <div class="streak-label">${stats.curStreak===1?'WIN IN A ROW':stats.curStreak>1?'WINS IN A ROW':'NO ACTIVE STREAK'}</div>
      </div>
      <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:1px">${dots}</div>
    </div>
    <div class="analysis-card">
      <div class="analysis-card-title">Bankroll & ROI</div>
      <div class="analysis-big-num" style="color:${totalProfit>=0?'var(--green)':'var(--red)'}">${totalProfit>=0?'+':''}$${Math.abs(Math.round(totalProfit))}</div>
      <div class="analysis-sub">$${totalWagered} wagered · ${roiPct>=0?'+':''}${roiPct}% ROI</div>
      <div style="margin-top:8px">${renderMiniSparkline()}</div>
    </div>
    ${lockRec.total>0?`<div class="analysis-card">
      <div class="analysis-card-title">🔒 Lock Record</div>
      <div class="analysis-big-num" style="color:${lockRec.w>=lockRec.l?'var(--gold)':'var(--red)'}">${lockRec.w}-${lockRec.l}</div>
      <div class="analysis-sub">${lockRec.total} lock${lockRec.total!==1?'s':''} placed${lockRec.w+lockRec.l>0?' · '+Math.round(lockRec.w/(lockRec.w+lockRec.l)*100)+'%':''}</div>
    </div>`:''}
  </div>

  <!-- EDGE FINDER -->
  <div class="section-hdr-row" style="margin-top:16px">
    <div><div class="section-title">🎯 Edge Finder</div><div class="section-sub">WHERE YOU WIN & WHERE TO IMPROVE</div></div>
  </div>
  <div style="margin-bottom:16px">${renderEdgeFinder()}</div>

  <!-- BY DAY OF WEEK -->
  <div class="analysis-grid">
    <div class="analysis-card" style="grid-column:span 2">
      <div class="analysis-card-title">By Day of Week</div>
      <div style="display:flex;gap:4px;align-items:flex-end;height:60px;margin-bottom:8px">
        ${dayNames.map((d,i)=>{
          const {w=0,l=0}=byDay[i]||{};
          const dp=w+l>0?Math.round(w/(w+l)*100):0;
          const h=Math.max(dp,4);
          const c=dp>=55?'#2ed573':dp<=40&&w+l>0?'#ff4757':'var(--accent)';
          return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px">
            <div style="font-family:'DM Mono',monospace;font-size:8px;color:var(--dim)">${w+l>0?dp+'%':''}</div>
            <div style="width:100%;background:${c};border-radius:3px 3px 0 0;height:${h}%;min-height:3px;opacity:${w+l>0?1:.15}"></div>
            <div style="font-family:'DM Mono',monospace;font-size:8px;color:var(--muted)">${d.slice(0,2)}</div>
          </div>`;
        }).join('')}
      </div>
      ${bestDay?`<div style="font-family:'DM Mono',monospace;font-size:10px;color:var(--green);margin-top:4px">🔥 Best: ${dayNames[bestDay[0]]} (${p2(bestDay[1].w,bestDay[1].l)})</div>`:''}
    </div>
  </div>

  <!-- BY TYPE + BY LEAGUE -->
  <div class="analysis-grid" style="margin-top:8px">
    <div class="analysis-card">
      <div class="analysis-card-title">By Pick Type</div>
      ${['spread','total','prop'].map(t=>{
        const r=byType[t]; const d=r.w+r.l; const p=d>0?Math.round(r.w/d*100):0;
        return `<div class="analysis-sport-row">
          <div class="analysis-sport-name" style="text-transform:uppercase">${t==='total'?'O/U':t}</div>
          <div class="analysis-sport-bar-wrap"><div class="analysis-sport-bar" style="width:${p}%"></div></div>
          <div class="analysis-sport-pct" style="color:${p>=55?'var(--green)':p>=45?'var(--gold)':'var(--red)'}">${d?p+'%':'—'}</div>
          <div class="analysis-sport-rec">${r.w}-${r.l}</div>
        </div>`;
      }).join('')}
    </div>
    <div class="analysis-card">
      <div class="analysis-card-title">By League</div>
      ${sportRows.slice(0,8).map(([s,r])=>{
        const d=r.w+r.l; const p=d>0?Math.round(r.w/d*100):0;
        return `<div class="analysis-sport-row">
          <div class="analysis-sport-name">${s.replace(/\s🏀|🏈|⚾|🏒|⚽/g,'').trim().toUpperCase()}</div>
          <div class="analysis-sport-bar-wrap"><div class="analysis-sport-bar" style="width:${p}%"></div></div>
          <div class="analysis-sport-pct" style="color:${p>=55?'var(--green)':p>=45?'var(--gold)':'var(--red)'}">${d?p+'%':'—'}</div>
          <div class="analysis-sport-rec">${r.w}-${r.l}</div>
        </div>`;
      }).join('')}
    </div>
  </div>

  <!-- ADVANCED ANALYTICS ROW -->
  ${(()=>{
    // Average odds
    const withOdds = settled.filter(p=>p.odds);
    const avgOdds = withOdds.length ? Math.round(withOdds.reduce((s,p)=>s+(p.odds||0),0)/withOdds.length) : null;
    const avgOddsStr = avgOdds !== null ? (avgOdds>0?'+':'')+avgOdds : '—';

    // Over/Under split
    const overs = settled.filter(p=>p.type==='total'&&p.pick&&p.pick.toLowerCase().includes('over'));
    const unders = settled.filter(p=>p.type==='total'&&p.pick&&p.pick.toLowerCase().includes('under'));
    const overPct = overs.length>0?Math.round(overs.filter(p=>p.result==='won').length/overs.length*100):null;
    const underPct = unders.length>0?Math.round(unders.filter(p=>p.result==='won').length/unders.length*100):null;

    // Best month
    const byMonth={};
    settled.forEach(p=>{
      const mk=new Date(p.madeAt).toLocaleDateString([],{month:'short',year:'2-digit'});
      if(!byMonth[mk]) byMonth[mk]={w:0,l:0};
      const _mr=normalizeResult(p.result); if(_mr==='won') byMonth[mk].w++; else if(_mr==='lost') byMonth[mk].l++;
    });
    const monthEntries=Object.entries(byMonth).filter(([,v])=>v.w+v.l>=3);
    const bestMonth=monthEntries.length?monthEntries.sort(([,a],[,b])=>(b.w/(b.w+b.l))-(a.w/(a.w+a.l)))[0]:null;

    // Time of day
    const byHour={morning:{w:0,l:0},afternoon:{w:0,l:0},evening:{w:0,l:0},night:{w:0,l:0}};
    settled.forEach(p=>{
      const h=new Date(p.madeAt).getHours();
      const slot=h<12?'morning':h<17?'afternoon':h<21?'evening':'night';
      const _hr=normalizeResult(p.result); if(_hr==='won') byHour[slot].w++; else if(_hr==='lost') byHour[slot].l++;
    });
    const timeLabels={morning:'🌅 Morning',afternoon:'☀️ Afternoon',evening:'🌆 Evening',night:'🌙 Night'};
    const bestTime=Object.entries(byHour).filter(([,v])=>v.w+v.l>=3).sort(([,a],[,b])=>(b.w/(b.w+b.l))-(a.w/(a.w+a.l)))[0];

    // 30-day vs all-time trend
    const now30 = Date.now() - 30*24*60*60*1000;
    const last30 = settled.filter(p=>p.madeAt>=now30);
    const older   = settled.filter(p=>p.madeAt<now30);
    const w30=last30.filter(p=>p.result==='won').length, l30=last30.filter(p=>p.result==='lost').length;
    const wOld=older.filter(p=>p.result==='won').length, lOld=older.filter(p=>p.result==='lost').length;
    const pct30  = w30+l30>0   ? Math.round(w30/(w30+l30)*100)   : null;
    const pctOld = wOld+lOld>0 ? Math.round(wOld/(wOld+lOld)*100): null;
    const trendDelta = pct30!==null && pctOld!==null ? pct30-pctOld : null;
    const trendDir   = trendDelta===null?'new':trendDelta>3?'up':trendDelta<-3?'down':'flat';
    const trendIcon  = trendDir==='up'?'📈':trendDir==='down'?'📉':trendDir==='flat'?'➡️':'🆕';
    const trendColor = trendDir==='up'?'var(--green)':trendDir==='down'?'var(--red)':'var(--gold)';
    const trendMsg   = trendDir==='up'  ? `Up ${trendDelta} pts vs your all-time average — you're improving.`
                     : trendDir==='down'? `Down ${Math.abs(trendDelta)} pts vs your all-time average — recent form is dipping.`
                     : trendDir==='flat'? `Consistent with your all-time average — steady as she goes.`
                     : `Not enough history yet to compare. Keep picking.`;
    // ROI last 30
    let profit30=0, wagered30=0;
    last30.forEach(p=>{
      if(p.wager){ wagered30+=p.wager;
        const _p30r=normalizeResult(p.result); if(_p30r==='won') profit30+=calcPayout(p.wager,p.odds||-110);
        else if(_p30r==='lost') profit30-=p.wager;
      }
    });
    const roi30 = wagered30>0 ? Math.round(profit30/wagered30*100) : null;
    // Win% rolling sparkline (7-pick rolling windows)
    const WINDOW=7;
    const rollingPoints = settled.length>=WINDOW ? settled.slice(-(Math.min(settled.length,35))).map((_,i,arr)=>{
      if(i<WINDOW-1) return null;
      const slice=arr.slice(i-WINDOW+1,i+1);
      const w=slice.filter(p=>p.result==='won').length;
      return Math.round(w/WINDOW*100);
    }).filter(v=>v!==null) : [];
    const rpMin=rollingPoints.length?Math.min(...rollingPoints,35):0;
    const rpMax=rollingPoints.length?Math.max(...rollingPoints,65):100;
    const rpRange=rpMax-rpMin||1;
    const RW=340,RH=56,RPAD=4;
    const rpCoords=rollingPoints.map((v,i)=>({
      x:RPAD+(i/(Math.max(rollingPoints.length-1,1)))*(RW-RPAD*2),
      y:RPAD+(1-(v-rpMin)/rpRange)*(RH-RPAD*2)
    }));
    const rpPath=rpCoords.map((c,i)=>i===0?`M${c.x},${c.y}`:`L${c.x},${c.y}`).join(' ');
    const rpFill=rpPath+` L${rpCoords[rpCoords.length-1]?.x||RPAD},${RH} L${RPAD},${RH} Z`;
    const rpColor=trendDir==='up'?'#2ed573':trendDir==='down'?'#ff4757':'#00e5ff';
    // 50% baseline Y
    const base50Y=RPAD+(1-(50-rpMin)/rpRange)*(RH-RPAD*2);
    const baseLine50=base50Y>RPAD&&base50Y<RH?`<line x1="${RPAD}" y1="${base50Y}" x2="${RW-RPAD}" y2="${base50Y}" stroke="rgba(255,255,255,.08)" stroke-width="1" stroke-dasharray="3,3"/>`:'';

    return `
  <div class="analysis-grid" style="margin-top:8px">
    <div class="analysis-card" style="grid-column:span 2">
      <div class="analysis-card-title">📅 Last 30 Days vs All-Time</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:14px">
        <div style="text-align:center">
          <div style="font-family:'DM Mono',monospace;font-size:8px;letter-spacing:1.5px;color:var(--muted);margin-bottom:4px">LAST 30 DAYS</div>
          <div style="font-family:'Syne',sans-serif;font-size:26px;font-weight:800;color:${pct30!==null?(pct30>=55?'var(--green)':pct30>=45?'var(--gold)':'var(--red)'):'var(--dim)'};line-height:1">${pct30!==null?pct30+'%':'—'}</div>
          <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);margin-top:2px">${w30}-${l30} record</div>
        </div>
        <div style="text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center">
          <div style="font-size:22px">${trendIcon}</div>
          <div style="font-family:'DM Mono',monospace;font-size:9px;color:${trendColor};margin-top:4px;letter-spacing:1px">${trendDelta!==null?(trendDelta>0?'+':'')+trendDelta+' pts':'NEW'}</div>
        </div>
        <div style="text-align:center">
          <div style="font-family:'DM Mono',monospace;font-size:8px;letter-spacing:1.5px;color:var(--muted);margin-bottom:4px">ALL-TIME</div>
          <div style="font-family:'Syne',sans-serif;font-size:26px;font-weight:800;color:${pct>=55?'var(--green)':pct>=45?'var(--gold)':'var(--red)'};line-height:1">${pct}%</div>
          <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);margin-top:2px">${stats.w}-${stats.l} record</div>
        </div>
      </div>
      ${rollingPoints.length>=3?`
      <div style="font-family:'DM Mono',monospace;font-size:8px;color:var(--muted);letter-spacing:1px;margin-bottom:6px">7-PICK ROLLING WIN RATE</div>
      <svg viewBox="0 0 ${RW} ${RH}" style="width:100%;height:${RH}px;overflow:hidden;display:block;border-radius:4px">
        <defs><linearGradient id="rpGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${rpColor}" stop-opacity=".2"/><stop offset="100%" stop-color="${rpColor}" stop-opacity="0"/></linearGradient></defs>
        ${baseLine50}
        <path d="${rpFill}" fill="url(#rpGrad)"/>
        <path d="${rpPath}" fill="none" stroke="${rpColor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        ${rpCoords.length?`<circle cx="${rpCoords[rpCoords.length-1].x}" cy="${rpCoords[rpCoords.length-1].y}" r="3.5" fill="${rpColor}" stroke="var(--card)" stroke-width="1.5"/>`:''}
      </svg>
      <div style="display:flex;justify-content:space-between;font-family:'DM Mono',monospace;font-size:8px;color:var(--dim);margin-top:4px">
        <span>← EARLIER</span><span style="color:${trendColor}">${trendMsg}</span><span>NOW →</span>
      </div>`:`<div style="font-family:'DM Mono',monospace;font-size:10px;color:var(--dim);text-align:center;padding:8px 0">${trendMsg}</div>`}
      ${roi30!==null?`<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px">30-DAY ROI</div>
        <div style="font-family:'Syne',sans-serif;font-size:16px;font-weight:800;color:${roi30>=0?'var(--green)':'var(--red)'}">${roi30>=0?'+':''}${roi30}%<span style="font-family:'DM Mono',monospace;font-size:9px;font-weight:400;color:var(--muted);margin-left:8px">${profit30>=0?'+':''}$${Math.abs(Math.round(profit30))} on $${Math.round(wagered30)} wagered</span></div>
      </div>`:''}
    </div>
  </div>

  <div class="analysis-grid" style="margin-top:8px">
    <div class="analysis-card">
      <div class="analysis-card-title">⏰ Best Time to Pick</div>
      ${Object.entries(byHour).map(([slot,v])=>{
        const d=v.w+v.l; const p=d>0?Math.round(v.w/d*100):0;
        const isBest=bestTime&&bestTime[0]===slot;
        return `<div class="analysis-sport-row" style="${isBest?'background:rgba(46,213,115,.06);border-radius:6px;padding:2px 4px;margin:1px -4px':''}">
          <div class="analysis-sport-name" style="font-size:10px">${timeLabels[slot]}</div>
          <div class="analysis-sport-bar-wrap"><div class="analysis-sport-bar" style="width:${p}%;background:${isBest?'var(--green)':'var(--accent)'}"></div></div>
          <div class="analysis-sport-pct" style="color:${p>=55?'var(--green)':p>=45?'var(--gold)':'var(--red)'}">${d?p+'%':'—'}</div>
          <div class="analysis-sport-rec">${d?v.w+'-'+v.l:''}</div>
        </div>`;
      }).join('')}
    </div>
    <div class="analysis-card">
      <div class="analysis-card-title">📊 Key Stats</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px">AVG ODDS</div>
          <div style="font-family:'Syne',sans-serif;font-size:16px;font-weight:800;color:var(--text)">${avgOddsStr}</div>
        </div>
        <div style="height:1px;background:var(--border)"></div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px">OVER PICKS</div>
          <div style="font-family:'Syne',sans-serif;font-size:16px;font-weight:800;color:${overPct!==null&&overPct>=55?'var(--green)':overPct!==null&&overPct<45?'var(--red)':'var(--text)'}">${overPct!==null?overPct+'%':'—'}<span style="font-size:10px;font-weight:400;color:var(--muted);margin-left:4px">${overs.length?overs.filter(p=>p.result==='won').length+'-'+(overs.length-overs.filter(p=>p.result==='won').length):''}</span></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px">UNDER PICKS</div>
          <div style="font-family:'Syne',sans-serif;font-size:16px;font-weight:800;color:${underPct!==null&&underPct>=55?'var(--green)':underPct!==null&&underPct<45?'var(--red)':'var(--text)'}">${underPct!==null?underPct+'%':'—'}<span style="font-size:10px;font-weight:400;color:var(--muted);margin-left:4px">${unders.length?unders.filter(p=>p.result==='won').length+'-'+(unders.length-unders.filter(p=>p.result==='won').length):''}</span></div>
        </div>
        <div style="height:1px;background:var(--border)"></div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px">BEST MONTH</div>
          <div style="font-family:'Syne',sans-serif;font-size:14px;font-weight:800;color:var(--green)">${bestMonth?bestMonth[0]+' ('+Math.round(bestMonth[1].w/(bestMonth[1].w+bestMonth[1].l)*100)+'%)':'—'}</div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px">TOTAL PICKS</div>
          <div style="font-family:'Syne',sans-serif;font-size:16px;font-weight:800;color:var(--text)">${settled.length}</div>
        </div>
      </div>
    </div>
  </div>

  <div class="analysis-grid" style="margin-top:8px">
    <div class="analysis-card" style="grid-column:span 2">
      <div class="analysis-card-title">📈 Wager Size Analysis</div>
      ${(()=>{
        const buckets=[
          {label:'Small ($1–$49)',min:1,max:49},
          {label:'Medium ($50–$99)',min:50,max:99},
          {label:'Large ($100–$199)',min:100,max:199},
          {label:'Max ($200+)',min:200,max:Infinity}
        ];
        const rows=buckets.map(b=>{
          const ps=settled.filter(p=>p.wager&&p.wager>=b.min&&p.wager<=b.max);
          const w=ps.filter(p=>p.result==='won').length;
          const l=ps.filter(p=>p.result==='lost').length;
          const d=w+l;
          const p=d>0?Math.round(w/d*100):0;
          const profit=ps.reduce((sum,p)=>{
            const _wr=normalizeResult(p.result); if(_wr==='won') return sum+calcPayout(p.wager,p.odds||-110);
            if(_wr==='lost') return sum-p.wager;
            return sum;
          },0);
          return {label:b.label,w,l,d,p,profit};
        }).filter(r=>r.d>0);
        if(!rows.length) return '<div style="color:var(--dim);font-family:\'DM Mono\',monospace;font-size:10px;text-align:center;padding:12px">Make picks with wagers to see sizing analysis</div>';
        return rows.map(r=>`
          <div class="analysis-sport-row" style="margin-bottom:4px">
            <div class="analysis-sport-name" style="font-size:9px;min-width:110px">${r.label}</div>
            <div class="analysis-sport-bar-wrap"><div class="analysis-sport-bar" style="width:${r.p}%;background:${r.p>=55?'var(--green)':r.p>=45?'var(--accent)':'var(--red)'}"></div></div>
            <div class="analysis-sport-pct" style="color:${r.p>=55?'var(--green)':r.p>=45?'var(--gold)':'var(--red)'}">${r.p}%</div>
            <div class="analysis-sport-rec">${r.w}-${r.l}</div>
            <div style="font-family:'DM Mono',monospace;font-size:9px;color:${r.profit>=0?'var(--green)':'var(--red)'};min-width:52px;text-align:right">${r.profit>=0?'+':''}$${Math.abs(Math.round(r.profit))}</div>
          </div>`).join('');
      })()}
    </div>
  </div>`;
  })()}

  <!-- HOME vs AWAY + FAV vs DOG BREAKDOWN -->
  <div class="analysis-grid" style="margin-top:8px">
    ${(()=>{
      // Home vs Away
      const homeP = settled.filter(p=>p.isHomeTeam===true||p._isHomeTeam===true);
      const awayP = settled.filter(p=>p.isHomeTeam===false||p._isHomeTeam===false);
      const hW=homeP.filter(p=>normalizeResult(p.result)==='won').length;
      const hL=homeP.filter(p=>normalizeResult(p.result)==='lost').length;
      const aW=awayP.filter(p=>normalizeResult(p.result)==='won').length;
      const aL=awayP.filter(p=>normalizeResult(p.result)==='lost').length;
      const hPct=hW+hL>0?Math.round(hW/(hW+hL)*100):null;
      const aPct=aW+aL>0?Math.round(aW/(aW+aL)*100):null;

      // Favorite vs Underdog (negative spread = fav, positive = dog)
      const spreadPicks = settled.filter(p=>p.type==='spread'&&p.line!=null);
      const favPicks = spreadPicks.filter(p=>Number(p.line)<0);
      const dogPicks = spreadPicks.filter(p=>Number(p.line)>0);
      const fW=favPicks.filter(p=>normalizeResult(p.result)==='won').length;
      const fL=favPicks.filter(p=>normalizeResult(p.result)==='lost').length;
      const dW=dogPicks.filter(p=>normalizeResult(p.result)==='won').length;
      const dL=dogPicks.filter(p=>normalizeResult(p.result)==='lost').length;
      const fPct=fW+fL>0?Math.round(fW/(fW+fL)*100):null;
      const dPct=dW+dL>0?Math.round(dW/(dW+dL)*100):null;

      const statRow=(label,pct,w,l,color)=>`
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <div style="font-family:'DM Mono',monospace;font-size:10px;color:var(--muted);min-width:70px">${label}</div>
          <div style="flex:1;height:6px;background:var(--dim);border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${pct||0}%;background:${color};border-radius:3px;transition:width .5s ease"></div>
          </div>
          <div style="font-family:'DM Mono',monospace;font-size:10px;color:${color};min-width:36px;text-align:right">${pct!==null?pct+'%':'—'}</div>
          <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--dim);min-width:40px">${w}-${l}</div>
        </div>`;

      return `
      <div class="analysis-card">
        <div class="analysis-card-title">Home vs Away</div>
        ${statRow('Home',hPct,hW,hL,hPct>=50?'var(--green)':'var(--red)')}
        ${statRow('Away',aPct,aW,aL,aPct>=50?'var(--green)':'var(--red)')}
        ${hPct!==null&&aPct!==null?`<div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--dim);margin-top:4px">
          ${hPct>aPct?'🏠 You edge home teams':'✈️ You edge away teams'}
        </div>`:''}
      </div>
      <div class="analysis-card">
        <div class="analysis-card-title">Fav vs Underdog</div>
        ${statRow('Favorite',fPct,fW,fL,fPct>=50?'var(--green)':'var(--red)')}
        ${statRow('Underdog',dPct,dW,dL,dPct>=50?'var(--green)':'var(--red)')}
        ${fPct!==null&&dPct!==null?`<div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--dim);margin-top:4px">
          ${dPct>fPct?'🐶 You find dog value':'👑 You back winners'}
        </div>`:''}
      </div>`;
    })()}
  </div>

  <!-- RECENT FORM (last 10 picks) -->
  <div class="analysis-card" style="margin-top:8px">
    <div class="analysis-card-title">Recent Form — Last 10 Picks</div>
    ${(()=>{
      const last10 = settled.slice(-10);
      if(last10.length < 3) return '<div style="font-family:\'DM Mono\',monospace;font-size:10px;color:var(--dim)">Need at least 3 settled picks</div>';
      const w10 = last10.filter(p=>normalizeResult(p.result)==='won').length;
      const l10 = last10.filter(p=>normalizeResult(p.result)==='lost').length;
      const pct10 = w10+l10>0 ? Math.round(w10/(w10+l10)*100) : 0;
      const formColor = pct10>=60?'var(--green)':pct10>=40?'var(--gold)':'var(--red)';
      const dots10 = last10.map(p=>{
        const r = normalizeResult(p.result);
        const c = r==='won'?'#2ed573':r==='lost'?'#ff4757':'#ffa502';
        const label = r==='won'?'W':r==='lost'?'L':'P';
        return `<div style="width:28px;height:28px;border-radius:50%;background:${c}22;border:2px solid ${c};display:flex;align-items:center;justify-content:center;font-family:'DM Mono',monospace;font-size:10px;font-weight:700;color:${c}" title="${p.description||''}">${label}</div>`;
      }).join('');
      return `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:10px">${dots10}</div>
      <div style="font-family:'DM Mono',monospace;font-size:11px;color:${formColor};font-weight:700">${pct10}% — ${w10}W ${l10}L last ${last10.length} picks</div>`;
    })()}
  </div>

  <!-- BEST PICKS STREAK CALENDAR HEATMAP -->
  <div class="analysis-card" style="margin-top:8px">
    <div class="analysis-card-title">Pick Frequency (Last 12 Weeks)</div>
    ${(()=>{
      const now = Date.now();
      const weeks = 12;
      const cells = [];
      for(let w=weeks-1;w>=0;w--){
        for(let d=0;d<7;d++){
          const dayMs = now - ((w*7+d)*86400000);
          const dayKey = new Date(dayMs).toLocaleDateString('en-CA');
          const dayPicks = settled.filter(p=>{
            const dk = new Date(p.madeAt||0).toLocaleDateString('en-CA');
            return dk===dayKey;
          });
          const wins = dayPicks.filter(p=>normalizeResult(p.result)==='won').length;
          const losses = dayPicks.filter(p=>normalizeResult(p.result)==='lost').length;
          const total = dayPicks.length;
          let bg = 'rgba(255,255,255,.04)';
          if(total>0){
            if(wins>losses) bg='rgba(46,213,115,'+(0.2+Math.min(0.6,total*0.1))+')';
            else if(losses>wins) bg='rgba(255,71,87,'+(0.2+Math.min(0.6,total*0.1))+')';
            else bg='rgba(255,165,2,.3)';
          }
          cells.push(`<div style="width:12px;height:12px;border-radius:2px;background:${bg}" title="${dayKey}: ${total} pick${total!==1?'s':''}${total>0?' ('+wins+'W '+losses+'L)':''}"></div>`);
        }
      }
      return `<div style="display:grid;grid-template-columns:repeat(${weeks},1fr);gap:3px;margin-top:4px">${cells.join('')}</div>
      <div style="display:flex;gap:12px;margin-top:8px;font-family:'DM Mono',monospace;font-size:9px;color:var(--dim)">
        <span><span style="display:inline-block;width:8px;height:8px;border-radius:1px;background:rgba(46,213,115,.5);margin-right:3px"></span>Win day</span>
        <span><span style="display:inline-block;width:8px;height:8px;border-radius:1px;background:rgba(255,71,87,.5);margin-right:3px"></span>Loss day</span>
        <span><span style="display:inline-block;width:8px;height:8px;border-radius:1px;background:rgba(255,255,255,.04);margin-right:3px"></span>No picks</span>
      </div>`;
    })()}
  </div>

  <!-- BANKROLL CHART -->
  <div class="analysis-card" style="margin-top:8px;isolation:isolate;overflow:hidden">
    <div class="analysis-card-title">Bankroll History</div>
    ${renderBankrollChart()}
  </div>

  <!-- ACHIEVEMENTS -->
  <div class="section-hdr-row" style="margin-top:16px">
    <div><div class="section-title">🏅 Achievements</div><div class="section-sub">${achUnlocked}/${ACHIEVEMENTS.length} UNLOCKED</div></div>
  </div>
  <div class="ach-grid">
    ${ACHIEVEMENTS.map(a=>{
      const unlocked=unlockedAchs.has(a.id);
      return `<div class="ach-card ${unlocked?'unlocked':'locked'}">
        <div class="ach-icon">${a.icon}</div>
        <div class="ach-name">${a.name}</div>
        <div class="ach-desc">${a.desc}</div>
        ${unlocked?'<div class="ach-date">✓ Unlocked</div>':''}
      </div>`;
    }).join('')}
  </div>`;
}

// ═══════════════════════════════════════════════════════
// NEWS VIEW — ESPN headlines via proxy
// ═══════════════════════════════════════════════════════
const NEWS_LEAGUES=[
  {label:'All',key:'all'},
  {label:'NFL 🏈',key:'nfl',url:'https://site.api.espn.com/apis/site/v2/sports/football/nfl/news'},
  {label:'NBA 🏀',key:'nba',url:'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/news'},
  {label:'MLB ⚾',key:'mlb',url:'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/news'},
  {label:'NHL 🏒',key:'nhl',url:'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/news'},
  {label:'NCAAF 🏈',key:'ncaaf',url:'https://site.api.espn.com/apis/site/v2/sports/football/college-football/news'},
];
let newsCache={};
let newsFilter='all';

async function renderNewsView(){
  const el=document.getElementById('newsContent');
  el.innerHTML=`<div class="section-hdr-row">
    <div><div class="section-title">📰 News Feed</div><div class="section-sub">LATEST HEADLINES</div></div>
  </div>
  <div class="news-filters">${NEWS_LEAGUES.map(l=>`<button class="news-filter-btn${newsFilter===l.key?' active':''}" onclick="setNewsFilter('${l.key}')">${l.label}</button>`).join('')}</div>
  <div id="newsGrid" class="news-grid"><div class="news-loading"><div class="stats-loading-ring"></div>LOADING…</div></div>`;
  await loadNews();
}

function setNewsFilter(key){
  newsFilter=key;
  renderNewsView();
}

async function loadNews(){
  const grid=document.getElementById('newsGrid');
  if(!grid) return;

  const leagues=newsFilter==='all'
    ? NEWS_LEAGUES.slice(1)
    : [NEWS_LEAGUES.find(l=>l.key===newsFilter)].filter(Boolean);

  // Memory cache first (fast path)
  if(newsCache[newsFilter]){ renderNewsGrid(newsCache[newsFilter]); return; }

  const key=`news:${newsFilter}`;
  try{
    const all = await cachedFetch(key, async()=>{
      const results=await Promise.allSettled(leagues.map(async l=>{
        const data=await go(l.url,8000);
        const articles=(data?.articles||[]).slice(0,newsFilter==='all'?4:12);
        return articles.map(a=>({...a,_league:l.label}));
      }));
      return results.flatMap(r=>r.status==='fulfilled'?r.value:[]);
    }, 300000, true); // persist for 5 minutes

    newsCache[newsFilter]=all;
    renderNewsGrid(all);
  }catch(e){
    if(grid) grid.innerHTML=`<div class="news-loading">Could not load news</div>`;
  }
}

function renderNewsGrid(articles){
  const grid=document.getElementById('newsGrid');
  if(!grid) return;
  if(!articles.length){grid.innerHTML=`<div class="news-loading">No articles found</div>`;return;}
  grid.innerHTML=articles.map(a=>{
    const img=a.images?.[0]?.url;
    const pub=a.published?new Date(a.published).toLocaleDateString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'';
    return `<div class="news-card" onclick="window.open('${a.links?.web?.href||'#'}','_blank')">
      ${img?`<img class="news-card-img" src="${img}" alt="" loading="lazy" onerror="this.style.display='none'">`
            :`<div class="news-card-img-placeholder">📰</div>`}
      <div class="news-card-body">
        <div class="news-card-league">${a._league||''}</div>
        <div class="news-card-title">${a.headline||a.title||'Untitled'}</div>
        <div class="news-card-meta">${pub}${a.byline?' · '+a.byline:''}</div>
      </div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════
// PICK'EM CONTESTS
// ═══════════════════════════════════════════════════════
// Contests are auto-generated from today's games
// Shared storage key: contest:{contestId}:picks:{userId}
let activeContestId=null;

function getWeeklyContestId(){
  const now=new Date();
  const day=now.getDay(); // 0=Sun
  const diff=now.getDate()-day;
  const sun=new Date(now); sun.setDate(diff); sun.setHours(0,0,0,0);
  return `week_${sun.getFullYear()}_${String(sun.getMonth()+1).padStart(2,'0')}_${String(sun.getDate()).padStart(2,'0')}`;
}

function getDailyContestId(){
  return `daily_${todayStr()}`;
}

async function renderContestsView(){
  const el=document.getElementById('contestsContent');
  el.innerHTML=`<div class="section-hdr-row"><div><div class="section-title">🏆 Pick'em Contests</div><div class="section-sub">COMPETE WITH EVERYONE · NO BANKROLL RISK</div></div></div>
  <div id="contestsInner"><div class="news-loading"><div class="stats-loading-ring"></div>LOADING…</div></div>`;
  if(activeContestId) await renderContestDetail(activeContestId);
  else await renderContestList();
}

// ── Pick'em Record (separate from main picks — no bankroll impact) ──
function pickemRecordKey(){ return `pickem_record_${currentUser?.id||'anon'}`; }
function loadPickemRecord(){
  try{ return JSON.parse(localStorage.getItem(pickemRecordKey())||'{"w":0,"l":0,"streak":0,"bestStreak":0,"lastDate":""}'); }
  catch{ return {w:0,l:0,streak:0,bestStreak:0,lastDate:''}; }
}
function savePickemRecord(rec){ localStorage.setItem(pickemRecordKey(), JSON.stringify(rec)); }

// ── Supabase sync for Pick'em picks ─────────────────────────────
async function syncPickemPickToServer(contestId, gameId, pickData){
  try{
    if(!currentUser?.id || !supaOnline) return;
    // Table uses composite PK (user_id, contest_id, game_id) — no id column needed
    const row = {
      user_id:    currentUser.id,
      user_name:  currentUser.name || '',
      contest_id: contestId,
      game_id:    gameId,
      side:       pickData ? pickData.side : null,
      side_type:  pickData ? pickData.sideType : null,
      result:     pickData ? (pickData.result || 'pending') : 'removed',
      picked_at:  pickData ? (pickData.pickedAt || Date.now()) : Date.now(),
    };
    await sbUpsertOnConflict('pickem_picks', row, 'user_id,contest_id,game_id');
  } catch(e){
    console.warn('[Pickem] syncPickemPickToServer failed:', e?.message);
  }
}

async function syncPickemFromServer(contestId){
  try{
    if(!currentUser?.id || !supaOnline) return;
    const rows = await sbSelect('pickem_picks',
      `contest_id=eq.${contestId}&select=*`);
    if(!rows?.length) return;

    // Write each user's picks into localStorage so leaderboard can read them
    const byUser = {};
    rows.forEach(r => {
      if(!byUser[r.user_id]) byUser[r.user_id] = { _name: r.user_name || r.user_id.slice(0,8) };
      if(r.result !== 'removed'){
        byUser[r.user_id][r.game_id] = {
          side:     r.side,
          sideType: r.side_type,
          result:   r.result || 'pending',
          locked:   r.result !== 'pending',
          pickedAt: r.picked_at,
        };
      }
    });

    Object.entries(byUser).forEach(([userId, picks]) => {
      const lsKey = 'ls_contest_' + contestId + '_' + userId;
      try{ localStorage.setItem(lsKey, JSON.stringify(picks)); }catch{}
    });

    console.log('[Pickem] Synced ' + rows.length + ' pickem picks from server for ' + contestId);
  } catch(e){
    console.warn('[Pickem] syncPickemFromServer failed:', e?.message);
  }
}

async function syncPickemRecordToServer(){
  try{
    if(!currentUser?.id || !supaOnline) return;
    const rec = pickemRecordFromHistory();
    await sbUpsert('pickem_records', {
      user_id:     currentUser.id,
      user_name:   currentUser.name || '',
      wins:        rec.w || 0,
      losses:      rec.l || 0,
      streak:      rec.streak || 0,
      best_streak: rec.bestStreak || 0,
      crowns:      rec.crowns || 0,
      updated_at:  Date.now(),
    });
  } catch(e){
    console.warn('[Pickem] syncPickemRecordToServer failed:', e?.message);
  }
}

function pickemRecordFromHistory(){
  // Recompute from all contest localStorage keys
  let w=0, l=0;
  const dailyResults = {};
  lsKeysWithPrefix('ls_contest_daily_')
    .filter(k=>k.endsWith('_'+(currentUser?.id||'anon')))
    .forEach(k=>{
      try{
        const data=JSON.parse(localStorage.getItem(k)||'{}');
        let dayW=0, dayL=0;
        Object.entries(data).forEach(([gid,p])=>{
          if(gid==='_name') return;
          if(p?.result==='correct'){ w++; dayW++; }
          else if(p?.result==='wrong'){ l++; dayL++; }
        });
        const dateMatch = k.match(/daily_(\d{4}-\d{2}-\d{2})/);
        if(dateMatch) dailyResults[dateMatch[1]] = { w:dayW, l:dayL };
      }catch{}
    });
  // Compute streak (consecutive days with more correct than wrong)
  const dates = Object.keys(dailyResults).sort().reverse();
  let streak=0;
  for(const d of dates){
    if(dailyResults[d].w > dailyResults[d].l) streak++;
    else break;
  }

  // Compute daily crowns: 70%+ correct with at least 3 picks settled
  let crowns = 0;
  Object.values(dailyResults).forEach(day => {
    const total = day.w + day.l;
    if(total >= 3 && day.w / total >= 0.70) crowns++;
  });

  const rec = loadPickemRecord();
  rec.w = w; rec.l = l; rec.streak = streak;
  rec.bestStreak = Math.max(rec.bestStreak||0, streak);
  rec.crowns = crowns;
  savePickemRecord(rec);
  return rec;
}

function getPickemCrowns(){
  try{ return loadPickemRecord().crowns || 0; }catch{ return 0; }
}

// ── Consensus data (from cachedTrends + local picks) ──
function getConsensusForGame(contestId, gameId){
  // Count picks across all localStorage contest entries for this contest
  let homePicks=0, awayPicks=0;
  lsKeysWithPrefix('ls_contest_'+contestId+'_').forEach(k=>{
    try{
      const data=JSON.parse(localStorage.getItem(k)||'{}');
      const pick=data[gameId];
      if(!pick) return;
      if(pick.sideType==='home') homePicks++;
      else if(pick.sideType==='away') awayPicks++;
    }catch{}
  });
  // Also pull from cachedTrends if available
  const trend = cachedTrends[gameId];
  if(trend?.spread){
    Object.entries(trend.spread).forEach(([side,cnt])=>{
      // Heuristic: if side matches home/away name, add to counts
      homePicks += cnt || 0;
    });
  }
  const total = homePicks + awayPicks;
  return { homePicks, awayPicks, total, homePct: total>0?Math.round(homePicks/total*100):50, awayPct: total>0?Math.round(awayPicks/total*100):50 };
}

// ── Countdown timer ──
function countdownStr(gameDate){
  if(!gameDate) return '';
  const now = Date.now();
  const start = new Date(gameDate).getTime();
  if(isNaN(start)) return '';
  const diff = start - now;
  if(diff <= 0) return 'LOCKED';
  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if(hrs > 24) return Math.floor(hrs/24) + 'd ' + (hrs%24) + 'h';
  if(hrs > 0) return hrs + 'h ' + mins + 'm';
  return mins + 'm';
}

async function renderContestList(){
  const el=document.getElementById('contestsInner');
  if(!el) return;
  const dailyId=getDailyContestId();
  const weeklyId=getWeeklyContestId();
  const today=new Date().toLocaleDateString([],{weekday:'long',month:'long',day:'numeric'});
  const preGames = allGames.filter(g=>g.isPre);

  if(!preGames.length){
    el.innerHTML=`<div class="news-loading">No upcoming games available for pick'em today.<br><small>Check back before games start.</small></div>`;
    return;
  }

  // Sync pickem picks from server for both contests so record is up to date
  await Promise.allSettled([
    syncPickemFromServer(dailyId),
    syncPickemFromServer(weeklyId),
  ]);

  // Pick'em record
  const rec = pickemRecordFromHistory();
  const decided = rec.w + rec.l;
  const pct = decided > 0 ? Math.round(rec.w / decided * 100) : 0;
  const pctColor = pct >= 55 ? '#2ed573' : pct <= 40 ? '#ff4757' : 'var(--text)';

  // Load my picks for daily
  const lsKey='ls_contest_'+dailyId+'_'+(currentUser?.id||'anon');
  let myPicks={};
  try{myPicks=JSON.parse(localStorage.getItem(lsKey)||'{}');}catch{}
  const pickCount=Object.keys(myPicks).filter(k=>k!=='_name').length;

  el.innerHTML=`
    <!-- Pick'em Record Card -->
    <div style="background:linear-gradient(135deg,rgba(0,229,255,.06),rgba(0,229,255,.02));border:1px solid rgba(0,229,255,.15);border-radius:14px;padding:16px;margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <div>
          <div style="font-family:'DM Mono',monospace;font-size:9px;letter-spacing:2px;color:var(--dim)">YOUR PICK'EM RECORD</div>
          <div style="display:flex;align-items:baseline;gap:10px;margin-top:6px">
            <span style="font-size:26px;font-weight:900;color:${pctColor}">${decided>0?pct+'%':'—'}</span>
            <span style="font-family:'DM Mono',monospace;font-size:13px;color:var(--muted)">${rec.w}-${rec.l}</span>
          </div>
        </div>
        <div style="display:flex;gap:12px;text-align:center">
          <div>
            <div style="font-size:20px;font-weight:900;color:${rec.crowns>0?'#ffa502':'var(--text)'}">${rec.crowns||0}</div>
            <div style="font-family:'DM Mono',monospace;font-size:8px;color:var(--dim);letter-spacing:1px">🏆 CROWNS</div>
          </div>
          <div>
            <div style="font-size:20px;font-weight:900;color:${rec.streak>=3?'#2ed573':'var(--text)'}">${rec.streak}</div>
            <div style="font-family:'DM Mono',monospace;font-size:8px;color:var(--dim);letter-spacing:1px">${rec.streak===1?'DAY':'DAYS'} STREAK</div>
          </div>
          <div>
            <div style="font-size:20px;font-weight:900;color:var(--accent)">${rec.bestStreak||0}</div>
            <div style="font-family:'DM Mono',monospace;font-size:8px;color:var(--dim);letter-spacing:1px">BEST</div>
          </div>
          <div>
            <div style="font-size:20px;font-weight:900">${decided}</div>
            <div style="font-family:'DM Mono',monospace;font-size:8px;color:var(--dim);letter-spacing:1px">TOTAL</div>
          </div>
        </div>
      </div>
      ${rec.streak >= 3 ? '<div style="margin-top:10px;font-family:\'DM Mono\',monospace;font-size:10px;color:#2ed573">🔥 ' + rec.streak + ' day streak! Keep it going!</div>' : ''}
      <div style="margin-top:8px;font-family:'DM Mono',monospace;font-size:9px;color:var(--dim)">Pick'em is free to play — no bankroll risk. Just pick winners.</div>
    </div>

    <!-- Contest Cards -->
    <div class="contests-grid">
      <div class="contest-card active-contest" onclick="openContest('${dailyId}')" style="border-color:rgba(0,229,255,.2)">
        <div class="contest-badge open">● OPEN NOW</div>
        <div class="contest-name">Daily Pick'em</div>
        <div class="contest-desc">Pick today's games straight up — no spread, no bankroll risk</div>
        <div class="contest-meta">
          <div class="contest-meta-item">📅 <strong>${today}</strong></div>
          <div class="contest-meta-item">🎯 <strong>${preGames.slice(0,10).length}</strong> games</div>
          <div class="contest-meta-item">✅ <strong>${pickCount}</strong> picked</div>
        </div>
      </div>
      <div class="contest-card active-contest" onclick="openContest('${weeklyId}')">
        <div class="contest-badge open">● OPEN</div>
        <div class="contest-name">Weekly Pick'em</div>
        <div class="contest-desc">Best record by Sunday wins the week</div>
        <div class="contest-meta">
          <div class="contest-meta-item">📅 <strong>This Week</strong></div>
          <div class="contest-meta-item">🎯 <strong>${preGames.slice(0,10).length}</strong> games</div>
        </div>
      </div>
    </div>`;
}

async function openContest(contestId){
  activeContestId=contestId;
  await renderContestDetail(contestId);
}

async function renderContestDetail(contestId){
  const el=document.getElementById('contestsInner');
  if(!el) return;
  const isDaily=contestId.startsWith('daily_');
  const contestName=isDaily?`Daily Pick'em`:`Weekly Pick'em`;
  const games=allGames.filter(g=>g.isPre).slice(0,10);

  // Show loading state while we pull server data
  el.innerHTML = '<div class="news-loading"><div class="stats-loading-ring"></div>LOADING CONTEST…</div>';

  // Pull latest picks from server into localStorage (for my picks + consensus)
  await syncPickemFromServer(contestId).catch(()=>{});

  // Load my picks from localStorage
  const lsKey='ls_contest_'+contestId+'_'+(currentUser?.id||'anon');
  let myPicks={};
  try{myPicks=JSON.parse(localStorage.getItem(lsKey)||'{}');}catch{}

  // Build leaderboard directly from pickem_records (server-side, all users)
  // This is the source of truth — not localStorage — so everyone sees the same standings.
  const lbEntries=[];
  try{
    const recordRows = await sbSelect('pickem_records', 'select=user_id,user_name,wins,losses,crowns&order=wins.desc,losses.asc&limit=100').catch(()=>[]);
    (recordRows||[]).forEach(r => {
      const total = (r.wins||0) + (r.losses||0);
      if(total === 0) return; // skip users who haven't settled any picks yet
      lbEntries.push({
        userId:  r.user_id,
        name:    r.user_name || r.user_id.slice(0,8),
        correct: r.wins  || 0,
        wrong:   r.losses|| 0,
        crowns:  r.crowns|| 0,
        total,
      });
    });
    lbEntries.sort((a,b)=>b.correct-a.correct||a.wrong-b.wrong);
  }catch(e){ console.warn('[Pickem] leaderboard fetch failed:', e?.message); }

  // Count total participants for consensus
  const totalParticipants = lbEntries.length;

  el.innerHTML=`
  <div class="section-hdr-row" style="margin-bottom:12px">
    <button class="contest-back-btn" onclick="activeContestId=null;renderContestList()">← Back</button>
    <div style="text-align:right">
      <div class="section-title">${contestName}</div>
      <div class="section-sub">${games.length} GAMES · STRAIGHT UP PICKS · NO BANKROLL RISK</div>
    </div>
  </div>

  <div class="contest-detail">
    ${games.map(g=>{
      const myPick=myPicks[g.id];
      const locked=myPick&&myPick.locked;
      const hBtn=myPick?.side===g.home.name?'selected':'';
      const aBtn=myPick?.side===g.away.name?'selected':'';
      const resultH=myPick?.result==='correct'&&myPick?.side===g.home.name?'correct':myPick?.result==='wrong'&&myPick?.side===g.home.name?'wrong':'';
      const resultA=myPick?.result==='correct'&&myPick?.side===g.away.name?'correct':myPick?.result==='wrong'&&myPick?.side===g.away.name?'wrong':'';

      // Consensus
      const consensus = getConsensusForGame(contestId, g.id);
      const hasConsensus = consensus.total > 0;

      // Countdown
      const cd = countdownStr(g.rawDate || g.dateStr);
      const isLocked = cd === 'LOCKED';

      return `<div class="contest-game-row" style="padding:12px;border-radius:10px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div class="contest-teams" style="font-weight:700;font-size:13px">${g.away.name} <span style="color:var(--muted);font-weight:400">@</span> ${g.home.name}
            <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);margin-top:2px">${g.leagueLabel} · ${g.odds?.spread||'PK'}</div>
          </div>
          <div style="font-family:'DM Mono',monospace;font-size:10px;letter-spacing:1px;color:${isLocked?'#ff4757':'var(--accent)'}">
            ${isLocked?'🔒 LOCKED':'⏱ '+cd}
          </div>
        </div>

        <div class="contest-game-pick" style="display:flex;gap:8px;margin-bottom:${hasConsensus?'8':'0'}px">
          <button class="contest-pick-btn ${aBtn} ${resultA}" data-cpcontest="${contestId}" data-cpgame="${g.id}" data-cpside="away" data-cpname="${g.away.name.replace(/"/g,'&quot;')}" ${locked||isLocked?'disabled':''}
            style="flex:1;padding:10px;border-radius:8px;font-weight:700;font-size:12px;cursor:${isLocked?'not-allowed':'pointer'}">${g.away.abbr||g.away.name}</button>
          <button class="contest-pick-btn ${hBtn} ${resultH}" data-cpcontest="${contestId}" data-cpgame="${g.id}" data-cpside="home" data-cpname="${g.home.name.replace(/"/g,'&quot;')}" ${locked||isLocked?'disabled':''}
            style="flex:1;padding:10px;border-radius:8px;font-weight:700;font-size:12px;cursor:${isLocked?'not-allowed':'pointer'}">${g.home.abbr||g.home.name}</button>
        </div>

        ${hasConsensus ? `<div style="display:flex;align-items:center;gap:6px;margin-top:4px">
          <span style="font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);min-width:28px">${consensus.awayPct}%</span>
          <div style="flex:1;height:6px;border-radius:3px;background:rgba(255,255,255,.06);overflow:hidden;display:flex">
            <div style="width:${consensus.awayPct}%;background:${consensus.awayPct>55?'#00e5ff':'rgba(255,255,255,.2)'}; border-radius:3px 0 0 3px;transition:width .3s"></div>
            <div style="width:${consensus.homePct}%;background:${consensus.homePct>55?'#00e5ff':'rgba(255,255,255,.2)'};border-radius:0 3px 3px 0;transition:width .3s"></div>
          </div>
          <span style="font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);min-width:28px;text-align:right">${consensus.homePct}%</span>
        </div>` : ''}
      </div>`;
    }).join('')}
  </div>

  ${lbEntries.length?`
  <div style="margin-top:16px">
    <div class="section-sub" style="margin-bottom:8px">ALL-TIME STANDINGS</div>
    <table class="contest-standings-table">
      <thead><tr><th>#</th><th>Name</th><th style="color:#2ed573">W</th><th style="color:#ff4757">L</th><th style="color:#ffd166">👑</th><th>Win%</th></tr></thead>
      <tbody>
        ${lbEntries.map((e,i)=>{
          const winPct = e.total > 0 ? Math.round(e.correct/e.total*100) : 0;
          return `<tr class="${e.userId===currentUser?.id?'me-row':''}">
            <td>${i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1)}</td>
            <td>${e.name}${e.userId===currentUser?.id?' <span style="color:var(--accent);font-size:9px">YOU</span>':''}</td>
            <td style="color:#2ed573;font-weight:700">${e.correct}</td>
            <td style="color:#ff4757">${e.wrong}</td>
            <td style="color:#ffd166">${e.crowns||0}</td>
            <td style="color:var(--muted);font-family:'DM Mono',monospace;font-size:11px">${winPct}%</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`:``}`;

  // Start countdown refresh timer
  if(window._contestCountdownTimer) clearInterval(window._contestCountdownTimer);
  window._contestCountdownTimer = setInterval(()=>{
    // Only refresh countdowns, not the whole view
    const cdEls = el.querySelectorAll('[data-countdown-gid]');
    if(!cdEls.length && activeContestId === contestId) renderContestDetail(contestId);
  }, 60000); // refresh every minute
}

// Settle all pending pick'em picks for a contest based on final game scores
// Called after games go final so standings show correct/wrong instead of all pending
async function settlePickemContest(contestId){
  try{
    if(!currentUser?.id) return;
    const lsKey = 'ls_contest_' + contestId + '_' + currentUser.id;
    let myPicks = {};
    try{ myPicks = JSON.parse(localStorage.getItem(lsKey)||'{}'); }catch{}

    let changed = false;
    Object.entries(myPicks).forEach(([gameId, pick]) => {
      if(gameId === '_name' || !pick || pick.result !== 'pending') return;
      const game = allGames.find(g => g.id === gameId);
      if(!game || !game.isFinal) return;

      const hs = parseFloat(game.home.score);
      const as2 = parseFloat(game.away.score);
      if(isNaN(hs) || isNaN(as2)) return;

      // Straight-up pick: picked team just needs to win outright
      const pickedHome = pick.sideType === 'home' ||
                         (game.home.name && pick.side && game.home.name === pick.side);
      let result;
      if(hs === as2)       result = 'push';
      else if(pickedHome)  result = hs > as2  ? 'correct' : 'wrong';
      else                 result = as2 > hs  ? 'correct' : 'wrong';

      pick.result = result;
      pick.locked = true;
      changed = true;
    });

    if(changed){
      localStorage.setItem(lsKey, JSON.stringify(myPicks));
      // Push settled results to server
      Object.entries(myPicks).forEach(([gameId, pick]) => {
        if(gameId === '_name' || !pick || pick.result === 'pending') return;
        syncPickemPickToServer(contestId, gameId, pick).catch(()=>{});
      });
      syncPickemRecordToServer().catch(()=>{});
    }
  }catch(e){ console.warn('[Pickem] settle failed:', e?.message); }
}

async function contestPick(contestId,gameId,side){
  if(!currentUser) return;
  const lsKey='ls_contest_'+contestId+'_'+currentUser.id;
  let myPicks={};
  try{myPicks=JSON.parse(localStorage.getItem(lsKey)||'{}');}catch{}

  // Determine if this is home or away
  const game = allGames.find(g=>g.id===gameId);
  const sideType = game && side === game.home.name ? 'home' : 'away';

  // Toggle: clicking same side again removes the pick
  if(myPicks[gameId]&&myPicks[gameId].side===side){
    delete myPicks[gameId];
  } else {
    myPicks[gameId]={side, sideType, result:'pending', locked:false, pickedAt:Date.now()};
  }
  myPicks._name=currentUser.name;
  localStorage.setItem(lsKey,JSON.stringify(myPicks));
  // Sync this pick to Supabase so it persists across devices and appears on leaderboard
  const syncedPick = myPicks[gameId] || null; // null = pick was toggled off
  syncPickemPickToServer(contestId, gameId, syncedPick).catch(()=>{});
  await renderContestDetail(contestId);
  // Update server-side record asynchronously
  setTimeout(()=>{ try{ syncPickemRecordToServer(); }catch(e){ console.warn('[Pickem] record sync failed:', e?.message); } }, 1000);
}

// ═══════════════════════════════════════════════════════
// PRIVATE LEAGUES
// ═══════════════════════════════════════════════════════
let lbTab = 'global';       // 'global' | 'leagues'
let activeLeagueId = null;  // currently viewed league
let myLeagues = [];         // cached list of user's leagues

function switchLbTab(tab){
  lbTab = tab;
  document.getElementById('lbTabGlobal')?.classList.toggle('active', tab==='global');
  document.getElementById('lbTabLeagues')?.classList.toggle('active', tab==='leagues');
  document.getElementById('leaderboardContent').style.display = tab==='global' ? '' : 'none';
  document.getElementById('leaguesContent').style.display = tab==='leagues' ? '' : 'none';
  if(tab==='global') renderLeaderboardView();
  if(tab==='leagues') renderLeaguesView();
}

// ── Supabase helpers for leagues ─────────────────────
function genLeagueCode(){
  return Math.random().toString(36).slice(2,8).toUpperCase();
}

async function createLeague(name){
  if(!currentUser) return null;
  const code = genLeagueCode();
  const league = {
    id: code,
    name: name.trim(),
    owner_id: currentUser.id,
    owner_name: currentUser.name,
    member_count: 1,
  };
  await sbUpsert('leagues', league);
  await sbUpsert('league_members', {
    league_id: code,
    user_id: currentUser.id,
    user_name: currentUser.name,
  });
  return code;
}

async function joinLeague(code){
  if(!currentUser) return {ok:false, msg:'Set your name first'};
  const upper = code.toUpperCase().trim();
  // Check league exists
  const rows = await sbSelect('leagues', `id=eq.${upper}&select=id,name,member_count`);
  if(!rows || !rows.length) return {ok:false, msg:'League not found — check the code'};
  // Check already member
  const mem = await sbSelect('league_members',
    `league_id=eq.${upper}&user_id=eq.${currentUser.id}&select=user_id`);
  if(mem && mem.length) return {ok:false, msg:"You're already in this league"};
  // Join
  await sbUpsert('league_members', {
    league_id: upper,
    user_id: currentUser.id,
    user_name: currentUser.name,
  });
  // Increment member count
  const newCount = (rows[0].member_count||1) + 1;
  await sbUpsert('leagues', {...rows[0], member_count: newCount});
  return {ok:true, leagueName: rows[0].name};
}

async function fetchMyLeagues(){
  if(!currentUser) return [];
  try{
    const mem = await sbSelect('league_members',
      `user_id=eq.${currentUser.id}&select=league_id`);
    if(!mem||!mem.length) return [];
    const ids = mem.map(m=>`"${m.league_id}"`).join(',');
    const leagues = await sbSelect('leagues',
      `id=in.(${ids})&select=*&order=created_at.desc`);
    return leagues || [];
  }catch(e){ console.warn('fetchMyLeagues failed:',e.message); return []; }
}

async function fetchLeagueStandings(leagueId){
  try{
    // Get all members
    const members = await sbSelect('league_members',
      `league_id=eq.${leagueId}&select=user_id,user_name`);
    if(!members||!members.length) return [];
    // Get their leaderboard entries
    const ids = members.map(m=>`"${m.user_id}"`).join(',');
    const entries = await sbSelect('leaderboard',
      `user_id=in.(${ids})&select=*`);
    // Merge with member list (some may have no picks yet)
    return members.map(m=>{
      const lb = (entries||[]).find(e=>e.user_id===m.user_id);
      return {
        id: m.user_id,
        name: m.user_name,
        w: lb?.w||0, l: lb?.l||0, p: lb?.p||0, total: lb?.total||0,
        recentPicks: lb?.recent_picks||[],
      };
    }).sort((a,b)=>{
      const ap=(a.w+a.l)>0?a.w/(a.w+a.l):0;
      const bp=(b.w+b.l)>0?b.w/(b.w+b.l):0;
      if(Math.abs(ap-bp)>0.001) return bp-ap;
      return (b.w+b.l)-(a.w+a.l);
    });
  }catch(e){ console.warn('fetchLeagueStandings failed:',e.message); return []; }
}

// ── Render ───────────────────────────────────────────
async function renderLeaguesView(){
  const el = document.getElementById('leaguesContent');
  if(!el) return;
  if(activeLeagueId){
    await renderLeagueDetail(activeLeagueId);
    return;
  }
  el.innerHTML = `<div class="leagues-page"><div style="color:var(--muted);font-family:'DM Mono',monospace;font-size:10px;text-align:center;padding:20px 0">LOADING…</div></div>`;
  myLeagues = await fetchMyLeagues();
  el.innerHTML = `<div class="leagues-page">
    ${renderCreateJoinForms()}
    ${myLeagues.length ? myLeagues.map(lg=>`
      <div class="league-card" onclick="openLeague('${lg.id}')">
        <div class="league-card-top">
          <div class="league-card-name">${lg.name}</div>
          <div class="league-code-badge">${lg.id}</div>
        </div>
        <div class="league-card-meta">
          <span>👥 ${lg.member_count||1} member${(lg.member_count||1)!==1?'s':''}</span>
          <span>👑 ${lg.owner_name}</span>
        </div>
      </div>`).join('') : `
      <div class="league-empty">
        <div class="league-empty-icon">🏆</div>
        NO LEAGUES YET<br>
        <span style="color:var(--dim)">Create one or join with an invite code</span>
      </div>`}
  </div>`;
}

function renderCreateJoinForms(){
  return `
  <div class="league-form" style="margin-bottom:12px">
    <div class="league-form-title">➕ CREATE A LEAGUE</div>
    <input id="leagueNameInput" class="league-input" placeholder="League name (e.g. Office Picks)" maxlength="40">
    <div id="createLeagueError" class="league-error" style="display:none"></div>
    <button class="league-submit-btn" onclick="handleCreateLeague()">CREATE LEAGUE</button>
  </div>
  <div class="league-form" style="margin-bottom:16px">
    <div class="league-form-title">🔗 JOIN WITH INVITE CODE</div>
    <input id="leagueCodeInput" class="league-input code-input" placeholder="ABC123" maxlength="6">
    <div id="joinLeagueError" class="league-error" style="display:none"></div>
    <button class="league-submit-btn secondary" onclick="handleJoinLeague()">JOIN LEAGUE</button>
  </div>`;
}

async function handleCreateLeague(){
  const nameEl = document.getElementById('leagueNameInput');
  const errEl  = document.getElementById('createLeagueError');
  const name   = nameEl?.value?.trim();
  if(!name){ if(errEl){errEl.textContent='Enter a league name';errEl.style.display='';} return; }
  if(!currentUser){ if(errEl){errEl.textContent='Set your name first';errEl.style.display='';} return; }
  if(errEl) errEl.style.display='none';
  try{
    const code = await createLeague(name);
    activeLeagueId = code;
    await renderLeagueDetail(code);
  }catch(e){
    if(errEl){errEl.textContent='Error: '+e.message;errEl.style.display='';}
  }
}

async function handleJoinLeague(){
  const codeEl = document.getElementById('leagueCodeInput');
  const errEl  = document.getElementById('joinLeagueError');
  const code   = codeEl?.value?.trim().toUpperCase();
  if(!code||code.length<4){ if(errEl){errEl.textContent='Enter a valid invite code';errEl.style.display='';} return; }
  if(errEl) errEl.style.display='none';
  try{
    const result = await joinLeague(code);
    if(!result.ok){ if(errEl){errEl.textContent=result.msg;errEl.style.display='';} return; }
    activeLeagueId = code;
    await renderLeagueDetail(code);
  }catch(e){
    if(errEl){errEl.textContent='Error: '+e.message;errEl.style.display='';}
  }
}

async function openLeague(leagueId){
  activeLeagueId = leagueId;
  await renderLeagueDetail(leagueId);
}

async function renderLeagueDetail(leagueId){
  const el = document.getElementById('leaguesContent');
  if(!el) return;
  el.innerHTML = `<div class="leagues-page"><div style="color:var(--muted);font-family:'DM Mono',monospace;font-size:10px;text-align:center;padding:30px 0">LOADING STANDINGS…</div></div>`;

  let league = myLeagues.find(l=>l.id===leagueId);
  if(!league){
    try{
      const rows = await sbSelect('leagues',`id=eq.${leagueId}&select=*`);
      league = rows?.[0];
    }catch{}
  }
  const standings = await fetchLeagueStandings(leagueId);
  const meId = currentUser?.id;
  const isOwner = league?.owner_id === meId;

  const rankIcon = i => i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}`;

  el.innerHTML = `<div class="leagues-page">
    <div class="league-detail-hdr">
      <button class="league-back-btn" onclick="activeLeagueId=null;renderLeaguesView()">← Back</button>
      <div class="league-detail-name">${league?.name||leagueId}</div>
    </div>

    <div class="league-invite-box">
      <div class="league-invite-label">INVITE CODE — SHARE WITH FRIENDS</div>
      <div class="league-invite-code">${leagueId}</div>
      <button class="league-invite-copy" onclick="navigator.clipboard.writeText('${leagueId}').then(()=>this.textContent='✅ COPIED!').catch(()=>this.textContent='${leagueId}')">📋 COPY CODE</button>
      <button class="league-invite-copy" style="background:rgba(0,229,255,.08)" onclick="copyLeagueLink('${leagueId}')">🔗 SHARE LINK</button>
    </div>

    <div class="lb-subtitle" style="margin-bottom:10px;padding:0 4px">
      ${standings.length} MEMBER${standings.length!==1?'S':''} · RANKED BY WIN %
    </div>

    <div class="lb-table-wrap">
    <table class="lb-table">
      <thead class="lb-head">
        <tr>
          <th style="width:36px">#</th>
          <th>PICKER</th>
          <th class="num">W</th>
          <th class="num">L</th>
          <th class="num">WIN %</th>
          <th class="lb-bar-cell"></th>
        </tr>
      </thead>
      <tbody>
        ${standings.map((entry,i)=>{
          const isMe = entry.id===meId;
          const decided = entry.w+entry.l;
          const pct = decided>0?Math.round(entry.w/decided*100):0;
          return `<tr class="lb-row ${isMe?'me':''} ${i<3?'rank-'+(i+1):''}">
            <td class="lb-cell lb-rank">${rankIcon(i)}</td>
            <td class="lb-cell">
              <div class="lb-name-cell">
                <div class="lb-avatar ${isMe?'me':''}">${entry.name[0].toUpperCase()}</div>
                <div>
                  <div class="lb-username">${entry.name}${isMe?'<span class="lb-you"> YOU</span>':''}</div>
                  <div class="lb-last-pick">${entry.total||0} pick${(entry.total||0)!==1?'s':''}</div>
                </div>
              </div>
            </td>
            <td class="lb-cell num lb-w">${entry.w}</td>
            <td class="lb-cell num lb-l">${entry.l}</td>
            <td class="lb-cell num"><span class="lb-pct">${decided>0?pct+'%':'—'}</span></td>
            <td class="lb-cell lb-bar-cell">
              <div class="lb-bar-wrap"><div class="lb-bar" style="width:${pct}%"></div></div>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    </div>
    <div class="chat-wrap" id="leagueChatWrap-${leagueId}">
      <div class="chat-title">💬 LEAGUE CHAT</div>
      <div class="chat-messages" id="chatMessages-${leagueId}">
        <div style="color:var(--dim);font-family:'DM Mono',monospace;font-size:9px;text-align:center;padding:8px">Loading messages…</div>
      </div>
      <div class="chat-input-row">
        <input class="chat-input" id="chatInput-${leagueId}" placeholder="Say something…" maxlength="200"
          onkeydown="if(event.key==='Enter')sendChatMessage('${leagueId}')" />
        <button class="chat-send-btn" onclick="sendChatMessage('${leagueId}')">SEND</button>
      </div>
    </div>
  </div>`;
  loadChatMessages(leagueId);
}

// ── Delegated click handler for contest pick buttons — avoids inline onclick with team names
document.addEventListener('click',function(e){
  const btn=e.target.closest('.contest-pick-btn');
  if(!btn) return;
  const contestId=btn.dataset.cpcontest;
  const gameId=btn.dataset.cpgame;
  const side=btn.dataset.cpname; // full team name stored in data-cpname
  if(!contestId||!gameId||!side) return;
  e.stopPropagation();
  contestPick(contestId,gameId,side);
});


// ── Debounced render wrappers (applied after all functions defined) ──────────
// Wrapping here (not mid-file) avoids TDZ errors during early init sequences
(function applyDebounceWrappers(){
  if(typeof _debounce !== 'function') return;
  const _rawUpdateRecordUI  = updateRecordUI;
  const _rawUpdateBankrollUI= updateBankrollUI;
  const _rawRenderPicksPanel= renderPicksPanel;
  updateRecordUI   = _debounce(_rawUpdateRecordUI,  60);
  updateBankrollUI = _debounce(_rawUpdateBankrollUI, 60);
  renderPicksPanel = _debounce(_rawRenderPicksPanel, 80);
})();

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════
function afterFirstPaint(fn){
  requestAnimationFrame(()=>setTimeout(fn,0));
}
function runWhenIdle(fn, timeout=2000){
  if('requestIdleCallback' in window){
    requestIdleCallback(()=>fn(), {timeout});
  } else {
    setTimeout(fn, timeout);
  }
}

buildDateStrip();
updateRecordUI();
initHero();

// Clean up desktop nav immediately — hide secondary tabs and inject More button
['btnCalendar','btnNews','btnBracket','btnFeed','btnBattles','btnTrends'].forEach(id=>{
  const el=document.getElementById(id);
  if(el) el.style.display='none';
});
injectDesktopMoreBtn();

// Apply saved theme immediately to prevent flash of wrong theme
try{ loadTheme(); }catch{}

initUserWithAuth();

if(cache[selDate]){
  allGames=cache[selDate];
  clearSkeleton();
  fullRender();
}

fetchDate(selDate).then(()=>{
  schedulePoll();
  prefetchNeighbors();
  if(typeof handleRouteChange==='function') handleRouteChange();

  // Let the UI paint first, then do visual-only/DOM patching work
  afterFirstPaint(()=>{
    snapshotOdds();          // baseline so first odds patch only flashes real changes
    loadAllExternalOdds();   // patch odds pills (no network)
    scheduleOddsPoll();      // then every 3 minutes
    setTimeout(renderDailyChallenge, 800);
    if(shouldShowWeeklyRecap()) setTimeout(showWeeklyRecap, 1400); // Monday recap
  });

  // Defer network-heavy "nice-to-have" work until idle to keep first load snappy
  runWhenIdle(()=>{
    fetchInjuries();                 // load injury feed (cached)
    setTimeout(fetchWeatherForGames, 2500); // weather after initial load (cached)
    patchCheckPickResultsForCelebrations(); // celebrations on pick settlement
    // Sync to Supabase on load
    publishPickTrends();
    refreshTrends();

    // Test Supabase connection
    (async()=>{
      try{
        const r = await Promise.race([
          fetch(`${SUPA_REST}/user_ratings?select=user_id&limit=1`,{headers:{...SUPA_HDR,'Accept':'application/json'}}),
          timeoutPromise(6000)
        ]);
        if(r.ok){
          const lb = await r.json();
          markSupaOk();
          console.log('✅ Supabase connected, leaderboard rows:',lb?.length??0);
          startPicksRealtime();
        } else {
          throw new Error(`HTTP ${r.status}`);
        }
      }catch(e){
        if(e.message?.includes('Failed to fetch')||e.name==='AbortError'){
          console.warn('⚠️ Supabase unreachable on startup — is your project paused? Visit supabase.com/dashboard to resume it. Free tier pauses after 7 days of inactivity.');
        } else {
          console.warn('⚠️ Supabase startup check failed:',e.message);
        }
        supaOnline = false;
        supaFailCount = SUPA_MAX_FAILS;
        setTimeout(retrySupaConnection, 30000); // retry after 30s
      }
    })();
  }, 2200);
});
// ═══════════════════════════════════════════════════════
// MARCH MADNESS BRACKET

// ═══════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════
// CELEBRATIONS
// ═══════════════════════════════════════════════════════
let confettiCanvas, confettiCtx, confettiParticles=[], confettiRunning=false;

function initConfetti(){
  if(confettiCanvas) return;
  confettiCanvas=document.createElement('canvas');
  confettiCanvas.className='confetti-canvas';
  confettiCanvas.id='confettiCanvas';
  document.body.appendChild(confettiCanvas);
  confettiCtx=confettiCanvas.getContext('2d');
  confettiCanvas.width=window.innerWidth;
  confettiCanvas.height=window.innerHeight;
  window.addEventListener('resize',()=>{
    if(confettiCanvas){confettiCanvas.width=window.innerWidth;confettiCanvas.height=window.innerHeight;}
  });
}

function launchConfetti(){
  initConfetti();
  confettiParticles=[];
  const colors=['#2ed573','#1e90ff','#ffa502','#ff4757','#eccc68','#a29bfe'];
  for(let i=0;i<120;i++){
    confettiParticles.push({
      x:Math.random()*confettiCanvas.width,
      y:-10,
      w:Math.random()*10+5,
      h:Math.random()*5+3,
      color:colors[Math.floor(Math.random()*colors.length)],
      rot:Math.random()*360,
      rotSpeed:(Math.random()-0.5)*8,
      vx:(Math.random()-0.5)*4,
      vy:Math.random()*4+2,
      opacity:1,
    });
  }
  if(!confettiRunning) animateConfetti();
}

function animateConfetti(){
  confettiRunning=true;
  confettiCtx.clearRect(0,0,confettiCanvas.width,confettiCanvas.height);
  confettiParticles=confettiParticles.filter(p=>p.opacity>0.05);
  confettiParticles.forEach(p=>{
    p.x+=p.vx; p.y+=p.vy; p.rot+=p.rotSpeed;
    if(p.y>confettiCanvas.height*0.7) p.opacity-=0.03;
    confettiCtx.save();
    confettiCtx.globalAlpha=p.opacity;
    confettiCtx.translate(p.x,p.y);
    confettiCtx.rotate(p.rot*Math.PI/180);
    confettiCtx.fillStyle=p.color;
    confettiCtx.fillRect(-p.w/2,-p.h/2,p.w,p.h);
    confettiCtx.restore();
  });
  if(confettiParticles.length>0) requestAnimationFrame(animateConfetti);
  else{ confettiRunning=false; confettiCtx.clearRect(0,0,confettiCanvas.width,confettiCanvas.height); }
}

// Offline banner — shown when Supabase is unreachable
function showOfflineBanner(show) {
  let banner = document.getElementById('offlineBanner');
  if(show) {
    if(!banner) {
      banner = document.createElement('div');
      banner.id = 'offlineBanner';
      banner.style.cssText = 'position:fixed;bottom:60px;left:12px;right:12px;padding:10px 14px;border-radius:8px;background:#1a1a2e;border:1px solid #ff475744;color:#ff9f43;font-family:"DM Mono",monospace;font-size:10px;z-index:500;text-align:center;line-height:1.5;';
      banner.innerHTML = '⚠️ Server temporarily unreachable — your picks are saved locally and will sync when reconnected.';
      document.body.appendChild(banner);
    }
  } else {
    if(banner) banner.remove();
  }
}

// Sync status indicator (brief toast)
function showSyncIndicator(status) {
  let ind = document.getElementById('syncIndicator');
  if(!ind) {
    ind = document.createElement('div');
    ind.id = 'syncIndicator';
    ind.style.cssText = 'position:fixed;top:8px;right:8px;padding:6px 12px;border-radius:6px;font-family:"DM Mono",monospace;font-size:9px;z-index:600;transition:opacity .3s;pointer-events:none;';
    document.body.appendChild(ind);
  }
  if(status === 'syncing') {
    ind.textContent = '🔄 Syncing…';
    ind.style.background = 'var(--card)';
    ind.style.color = 'var(--accent)';
    ind.style.opacity = '1';
  } else if(status === 'ok') {
    ind.textContent = '✅ Synced';
    ind.style.background = 'var(--card)';
    ind.style.color = '#2ed573';
    ind.style.opacity = '1';
    setTimeout(() => { ind.style.opacity = '0'; }, 1500);
  } else if(status === 'error') {
    ind.textContent = '⚠️ Sync failed';
    ind.style.background = 'var(--card)';
    ind.style.color = '#ff4757';
    ind.style.opacity = '1';
    setTimeout(() => { ind.style.opacity = '0'; }, 3000);
  }
}

function showWinToast(msg, isPush=false){
  let toast=document.getElementById('winToast');
  if(!toast){
    toast=document.createElement('div');
    toast.id='winToast';
    toast.className='win-toast';
    document.body.appendChild(toast);
  }
  toast.textContent=msg;
  toast.className='win-toast'+(isPush?' push-toast':'');
  setTimeout(()=>toast.classList.add('show'),10);
  setTimeout(()=>{ toast.classList.remove('show'); },3500);
}

function showWinCelebration(pick){
  if(pick.result==='won'){
    launchConfetti();
    const emoji = pick.type==='prop' ? '📊' : pick.type==='spread' ? '🏈' : '🎯';
    showWinToast(`${emoji} WIN! ${pick.description}`);
  } else if(pick.result==='push'){
    showWinToast(`🤝 PUSH — ${pick.description}`, true);
  }
}

// Celebrations are patched in at runtime via patchCheckPickResultsForCelebrations()

// ═══════════════════════════════════════════════════════
// CONFIDENCE SLIDER
// ═══════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════
// LOCK OF THE DAY
// One pick per calendar day can be designated as user's "Lock"
// Lock record is tracked separately on the leaderboard
// ═══════════════════════════════════════════════════════
function getTodayKey(){ return new Date().toISOString().slice(0,10); }

function getTodaysLock(){
  const today = getTodayKey();
  return picks.find(p => p.isLock && p.lockDate === today);
}

function canSetLock(pick){
  // Must be a pending, pre-game pick made today
  if(pick.result !== 'pending') return false;
  const g = allGames.find(x=>x.id===pick.gameId);
  if(g && !g.isPre) return false;
  const today = getTodayKey();
  const existing = getTodaysLock();
  // Can set if no lock today, or if this pick IS the lock (to toggle off)
  return !existing || (existing.gameId===pick.gameId && existing.type===pick.type && existing.side===pick.side);
}

function toggleLock(pickKey){
  const pick = picks.find(p=>`${p.gameId}_${p.type}_${p.side}`===pickKey);
  if(!pick) return;
  const today = getTodayKey();
  if(pick.isLock && pick.lockDate === today){
    // Remove lock
    pick.isLock = false;
    pick.lockDate = null;
  } else if(canSetLock(pick)){
    // Clear any existing lock for today first
    picks.forEach(p => { if(p.isLock && p.lockDate===today){ p.isLock=false; p.lockDate=null; } });
    pick.isLock = true;
    pick.lockDate = today;
    pick.confidence = 5; // Locks auto-get max confidence
    showWinToast('🔒 LOCK OF THE DAY set!');
  }
  savePicks();
  renderPicksPanel();
  renderScores();
  publishToLeaderboard();
}

function lockBtnHTML(pick){
  const pickKey = `${pick.gameId}_${pick.type}_${pick.side}`;
  const today = getTodayKey();
  const isLocked = pick.isLock && pick.lockDate === today;
  const canLock = canSetLock(pick);
  if(!canLock && !isLocked) return '';
  return `<button class="lock-btn ${isLocked?'locked':''}" onclick="event.stopPropagation();toggleLock('${pickKey}')">
    ${isLocked ? '🔒 LOCK OF THE DAY' : '🔓 SET AS LOCK'}
  </button>`;
}

function lockBadgeHTML(pick){
  if(!pick.isLock) return '';
  return `<span class="lock-badge"><span class="lock-badge-sm">🔒</span>LOCK</span>`;
}

function getLockRecord(){
  const lockPicks = picks.filter(p => p.isLock && p.result !== 'pending');
  const w = lockPicks.filter(p=>normalizeResult(p.result)==='won').length;
  const l = lockPicks.filter(p=>normalizeResult(p.result)==='lost').length;
  const p = lockPicks.filter(p=>p.result==='push').length;
  return {w, l, p, total: w+l+p};
}

function confidenceHTML(pickKey, currentConf=0){
  const stars = [1,2,3,4,5].map(s=>
    `<span class="conf-star ${s<=currentConf?'active':''}" onclick="setConfidence('${pickKey}',${s})" title="${s} star${s>1?'s':''}">★</span>`
  ).join('');
  return `<div class="confidence-wrap">
    <span class="confidence-label">CONFIDENCE</span>
    <div class="conf-stars" id="confStars_${pickKey}">${stars}</div>
  </div>`;
}

function setConfidence(pickKey, stars){
  // pickKey = gameId+type+side encoded
  const pick = picks.find(p=>`${p.gameId}_${p.type}_${p.side}`===pickKey);
  if(!pick) return;
  pick.confidence = pick.confidence===stars ? 0 : stars; // toggle off if same
  savePicks();
  // Update stars in DOM
  const wrap = document.getElementById(`confStars_${pickKey}`);
  if(wrap){
    wrap.querySelectorAll('.conf-star').forEach((el,i)=>{
      el.classList.toggle('active', i<pick.confidence);
    });
  }
  publishToLeaderboard();
}

// Weighted win % using confidence: 5★ = 3x weight, 4★ = 2x, 1-3★ = 1x
function weightedWinPct(userPicks){
  let weightedW=0, weightedTotal=0;
  userPicks.filter(p=>p.result==='won'||p.result==='lost').forEach(p=>{
    const w = p.confidence>=5?3 : p.confidence>=4?2 : 1;
    weightedTotal+=w;
    if(p.result==='won') weightedW+=w;
  });
  return weightedTotal>0 ? weightedW/weightedTotal : 0;
}

// ═══════════════════════════════════════════════════════
// PICK COMMENTS
// ═══════════════════════════════════════════════════════
function pickCommentHTML(pick, gameIsLocked){
  const key = `${pick.gameId}_${pick.type}_${pick.side}`;
  // Always show editable textarea for pending picks; display-only once settled
  if(pick.result==='pending'){
    return `<div class="pick-comment-wrap">
      <textarea class="pick-comment-input" rows="1" placeholder="Add a hot take… 🔥"
        onchange="savePickComment('${key}',this.value)"
        >${pick.comment||''}</textarea>
    </div>`;
  }
  if(pick.comment){
    return `<div class="pick-comment-wrap">
      <div class="pick-comment-display">${pick.comment}</div>
    </div>`;
  }
  return '';
}

function savePickComment(pickKey, text){
  const [gameId, type, ...sideParts] = pickKey.split('_');
  const side = sideParts.join('_');
  const pick = picks.find(p=>p.gameId===gameId&&p.type===type&&p.side===side);
  if(pick){ pick.comment=text.trim().slice(0,140); savePicks(); }
}

// ═══════════════════════════════════════════════════════
// PARLAY BUILDER
// ═══════════════════════════════════════════════════════
let parlayLegs = []; // [{gameId, type, side, description, odds}]
let parlayPanelOpen = false;
let parlayWager = 50; // user-adjustable bet size for the parlay

function americanToDecimal(american){
  const n = parseFloat(american);
  if(isNaN(n)) return 1.91; // default -110
  return n>0 ? (n/100)+1 : (100/Math.abs(n))+1;
}

function calcParlayOdds(legs){
  if(!legs.length) return {decimal:1, american:0, payout100:0};
  const decimal = legs.reduce((acc,l)=> acc * americanToDecimal(l.odds||'-110'), 1);
  const american = decimal>=2 ? Math.round((decimal-1)*100) : Math.round(-100/(decimal-1));
  const payout100 = Math.round((decimal-1)*100);
  return {decimal, american: american>0?`+${american}`:String(american), payout100};
}

function addToParlay(gameId, type, side, description){
  if(parlayLegs.length>=12){ showWinToast('⚠️ Max 12 legs per parlay', true); return; }
  // Prevent duplicate exact pick (same game + type + side)
  if(parlayLegs.find(l=>l.gameId===gameId&&l.type===type&&l.side===side)){
    showWinToast('⚠️ Already in parlay', true); return;
  }
  // Store date + league on each leg so we can fetch the game later for settlement
  const _g = allGames.find(x=>x.id===gameId);
  parlayLegs.push({
    gameId, type, side, description, odds:'-110',
    league: _g?.league || '',
    gameDate: selDate,
  });
  updateParlayFAB();
  renderParlayPanel();
  // Give immediate feedback on the game card so users know pick was added
  showWinToast(`🎰 Added to parlay (${parlayLegs.length} leg${parlayLegs.length>1?'s':''})`);
  if(!parlayPanelOpen) openParlayPanel();
}

function removeFromParlay(idx){
  parlayLegs.splice(idx,1);
  updateParlayFAB();
  renderParlayPanel();
}

function updateParlayFAB(){
  const fab = document.getElementById('parlayFAB');
  if(!fab) return;
  fab.classList.toggle('has-picks', parlayLegs.length>0);
  const badge = document.getElementById('parlayBadge');
  if(badge) badge.textContent = parlayLegs.length;
}

function openParlayPanel(){
  parlayPanelOpen=true;
  document.getElementById('parlayPanel')?.classList.add('open');
}
function closeParlayPanel(){
  parlayPanelOpen=false;
  document.getElementById('parlayPanel')?.classList.remove('open');
}

function renderParlayPanel(){
  const el = document.getElementById('parlayLegsWrap');
  const oddsEl = document.getElementById('parlayOddsDisplay');
  const btnEl = document.getElementById('parlaySubmitBtn');
  if(!el) return;

  if(!parlayLegs.length){
    el.innerHTML=`<div class="parlay-empty">Add 2–12 picks to build a parlay</div>`;
    if(oddsEl) oddsEl.style.display='none';
    if(btnEl) btnEl.disabled=true;
    return;
  }

  el.innerHTML = parlayLegs.map((leg,i)=>`
    <div class="parlay-leg">
      <div class="parlay-leg-desc">${leg.description}</div>
      <button class="parlay-leg-remove" onclick="removeFromParlay(${i})">✕</button>
    </div>
  `).join('');

  if(parlayLegs.length>=2){
    const {american, decimal} = calcParlayOdds(parlayLegs);
    const profit = Math.round((decimal-1)*parlayWager*100)/100;
    const totalReturn = Math.round(decimal*parlayWager*100)/100;
    const balance = typeof computeBankroll==='function' ? computeBankroll() : 1000;
    const presets = [10,25,50,100,250];
    if(oddsEl){
      oddsEl.style.display='';
      oddsEl.innerHTML=`
        <div class="parlay-odds-num">${american}</div>
        <div class="parlay-odds-lbl">${parlayLegs.length}-LEG PARLAY ODDS</div>
        <div style="margin:10px 0 6px;display:flex;gap:4px;flex-wrap:wrap">
          ${presets.map(amt=>`<div
            style="flex:1;min-width:40px;padding:5px 2px;background:${parlayWager===amt?'rgba(255,215,0,.15)':'var(--bg)'};border:1px solid ${parlayWager===amt?'var(--gold)':'var(--border)'};border-radius:4px;font-family:'DM Mono',monospace;font-size:9px;color:${parlayWager===amt?'var(--gold)':'var(--muted)'};cursor:pointer;text-align:center"
            onclick="setParlayWager(${amt})">$${amt}</div>`).join('')}
          <input
            type="number" min="1" max="${Math.floor(balance)}" value="${parlayWager}"
            oninput="setParlayWager(+this.value)"
            style="flex:1;min-width:50px;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:4px 6px;color:var(--text);font-family:'DM Mono',monospace;font-size:10px;text-align:center;outline:none"
            onclick="event.stopPropagation()">
        </div>
        <div class="parlay-payout">
          Risk <strong style="color:var(--text)">$${parlayWager}</strong>
          · Win <strong style="color:#2ed573">+$${profit}</strong>
          · Return <strong style="color:var(--accent)">$${totalReturn}</strong>
        </div>`;
    }
    if(btnEl) btnEl.disabled=false;
  } else {
    if(oddsEl) oddsEl.style.display='none';
    if(btnEl) btnEl.disabled=true;
  }
}

function setParlayWager(amount){
  const balance = typeof computeBankroll==='function' ? computeBankroll() : 1000;
  parlayWager = Math.max(1, Math.min(Math.round(amount), Math.floor(balance)||1000));
  renderParlayPanel();
}

function submitParlay(){
  if(!currentUser){ alert('Enter your name first.'); return; }
  if(parlayLegs.length<2){ return; }
  const {american} = calcParlayOdds(parlayLegs);
  const desc = `${parlayLegs.length}-Leg Parlay (${american}): `+parlayLegs.map(l=>l.description).join(' + ');
  const parlayId = 'parlay_'+Date.now();
  picks.push({
    gameId: parlayId,
    type: 'parlay',
    side: 'parlay',
    description: desc,
    gameStr: parlayLegs.map(l=>l.description).join(' | '),
    result: 'pending',
    parlayLegs: parlayLegs.map(l=>({...l, gameDate: l.gameDate||selDate})),
    parlayOdds: american,
    wager: parlayWager,
    odds: american,
    league: '',
    madeAt: Date.now(),
  });
  savePicks();
  parlayLegs=[];
  updateParlayFAB();
  closeParlayPanel();
  updateRecordUI();
  renderPicksPanel();
  launchConfetti();
  showWinToast(`🎰 ${parlayLegs.length||'Multi'}-Leg Parlay placed!`);
}

// Settle parlay: all legs must win
function checkParlayResults(){
  let changed=false;

  // Build lookup of ALL cached games across ALL dates
  const allCachedGames = {};
  Object.values(cache).forEach(games=>{
    if(Array.isArray(games)) games.forEach(g=>{ allCachedGames[g.id]=g; });
  });
  allGames.forEach(g=>{ allCachedGames[g.id]=g; });

  picks.forEach(pick=>{
    if(pick.type!=='parlay'||pick.result!=='pending') return;
    const legs=pick.parlayLegs||[];
    if(!legs.length) return;

    // For each leg, try to find the game — if not in cache, kick off a background fetch
    // but don't block settlement of legs we CAN resolve
    const unloadedLegs = legs.filter(leg=>!allCachedGames[leg.gameId]);
    if(unloadedLegs.length){
      // Background-fetch missing game dates for next settlement cycle
      unloadedLegs.forEach(leg=>{
        const legLeague = leg.league || '';
        const legDate   = (leg.gameDate||'').replace(/-/g,'');
        // Try every league if leg.league is missing (old parlays)
        const leaguesToTry = legLeague
          ? [LEAGUES.find(l=>l.league===legLeague)].filter(Boolean)
          : LEAGUES;
        leaguesToTry.forEach(lg=>{
          if(!lg) return;
          // Try today and yesterday if no date stored
          const dates = legDate ? [legDate] : [
            selDate.replace(/-/g,''),
            new Date(Date.now()-86400000).toISOString().slice(0,10).replace(/-/g,''),
            new Date(Date.now()-2*86400000).toISOString().slice(0,10).replace(/-/g,''),
          ];
          dates.forEach(dt=>{
            go(`${ESPN}/${lg.sport}/${lg.league}/scoreboard?dates=${dt}`,5000)
              .then(d=>{
                if(!d) return;
                const parsed=parseGames(d,lg,lg.sport,lg.dot,lg.label);
                parsed.forEach(g=>{ allCachedGames[g.id]=g; cache[dt]=cache[dt]||[]; if(!cache[dt].find(x=>x.id===g.id)) cache[dt].push(g); });
                // Re-run settlement now that we have more data
                setTimeout(checkParlayResults, 500);
              }).catch(()=>{});
          });
        });
      });
      return; // wait for background fetch to complete
    }

    const results = legs.map(leg=>{
      const g = allCachedGames[leg.gameId];
      if(!g) return 'pending';
      if(g.isLive) return 'pending';
      if(g.isPre)  return 'pending';
      if(!g.isFinal) return 'pending';

      const hs=parseFloat(g.home.score), as2=parseFloat(g.away.score);
      if(isNaN(hs)||isNaN(as2)) return 'pending';

      if(leg.type==='spread'){
        const line=parseFloat(leg.description.split(' ').pop());
        if(isNaN(line)) return 'pending';
        const isHome=leg.side===g.home.name;
        const myScore=isHome?hs:as2, oppScore=isHome?as2:hs;
        const adj=myScore+line;
        if(Math.abs(adj-oppScore)<0.01) return 'push';
        return adj>oppScore?'won':'lost';
      } else if(leg.type==='total'){
        const total=parseFloat(leg.description.replace(/over |under /i,''));
        if(isNaN(total)) return 'pending';
        const combined=hs+as2;
        if(Math.abs(combined-total)<0.01) return 'push';
        return leg.side==='over'?(combined>total?'won':'lost'):(combined<total?'won':'lost');
      }
      return 'pending';
    });

    if(results.includes('pending')) return;
    if(results.includes('lost')){ pick.result='lost'; changed=true; }
    else if(results.every(r=>r==='push')){ pick.result='push'; changed=true; }
    else{ pick.result='won'; changed=true; }
  });

  if(changed){
    savePicks();
    checkAchievements();
    updateRecordUI();
    renderPicksPanel();
    publishToLeaderboard();
  }
}

// Manually settle a specific parlay pick using game scores from a provided results map.
// Called from the "Settle" button on stuck parlays.
async function manualSettleParlay(pickIdx){
  const pick = picks[pickIdx];
  if(!pick || pick.type!=='parlay') return;

  // Force-fetch all leg games right now across all leagues and recent dates
  const legs = pick.parlayLegs || [];
  const dates = [0,1,2,3].map(d=>new Date(Date.now()-d*86400000).toISOString().slice(0,10).replace(/-/g,''));

  showWinToast('🔄 Fetching game results…');

  await Promise.allSettled(LEAGUES.flatMap(lg=>
    dates.map(dt=>
      go(`${ESPN}/${lg.sport}/${lg.league}/scoreboard?dates=${dt}`,5000)
        .then(d=>{
          if(!d) return;
          const parsed=parseGames(d,lg,lg.sport,lg.dot,lg.label);
          parsed.forEach(g=>{ allGames.some(x=>x.id===g.id)||(allGames.push(g)); cache[dt]=cache[dt]||[]; if(!cache[dt].find(x=>x.id===g.id)) cache[dt].push(g); });
        }).catch(()=>{})
    )
  ));

  checkParlayResults();
  showWinToast('✅ Settlement check complete');
}

// ═══════════════════════════════════════════════════════
// BEST BET OF THE DAY
// ═══════════════════════════════════════════════════════
function computeBestBet(){
  // Find the game with most public picks (from pick_trends) or biggest line mover
  const pregames = allGames.filter(g=>g.isPre&&(g.odds.spread||g.odds.total));
  if(!pregames.length) return null;

  // Score each game: line movement + has odds
  let best = null, bestScore = -1;
  pregames.forEach(g=>{
    let score = 0;
    // Bonus for line movement
    const hist = oddsHistory[g.id];
    if(hist&&hist.length>1) score+=10;
    // Bonus for having both spread and total
    if(g.odds.spread&&g.odds.total) score+=5;
    // Bonus for bigger games (by league priority)
    const topLeagues=['NBA','NFL','MLB','NHL'];
    if(topLeagues.some(l=>g.leagueLabel.includes(l))) score+=3;
    if(score>bestScore){ bestScore=score; best=g; }
  });
  return best;
}

// (hoisted to early globals)

function renderBestBetCard(){
  const el=document.getElementById('bestBetWrap');
  if(!el) return;

  const localPicks = Array.isArray(picks) ? picks : [];
  const hasPicks = localPicks.length > 0;

  // Only show Quick Pick card after the initial sync has attempted —
  // prevents a flash of "Make Your First Pick" on mobile before server picks load
  if(!hasPicks && !_initialSyncDone){
    el.innerHTML = ''; // blank until sync completes
    return;
  }
  if(!hasPicks){
    renderQuickPickCard(el);
    return;
  }

  const g=computeBestBet();
  if(!g){ el.innerHTML=''; return; }
  const hist=oddsHistory[g.id];
  const reason=hist&&hist.length>1
    ? `Line has moved since open — sharp action detected`
    : `Top game on today's slate`;
  el.innerHTML=`<div class="best-bet-card" onclick="openGame('${g.id}')">
    <div class="best-bet-badge">⭐ BEST BET OF THE DAY <span style="color:var(--muted)">· ${g.leagueLabel}</span></div>
    <div class="best-bet-game">${g.away.name} @ ${g.home.name}</div>
    <div class="best-bet-line">${g.odds.spread||''} ${g.odds.total?'· '+g.odds.total:''}</div>
    <div class="best-bet-reason">${reason}</div>
  </div>`;
}

function renderQuickPickCard(el){
  // Find best pregame with odds for the Quick Pick — never show live games
  const preGames = allGames.filter(g => g.isPre && !g.isLive && (g.odds.spread || g.odds.total));
  if(!preGames.length){
    el.innerHTML = '';
    return;
  }

  // Pick the most interesting game — prefer primetime, popular leagues
  const leaguePriority = {'NBA 🏀':1, 'NFL 🏈':1, 'MLB ⚾':2, 'NHL 🏒':2, 'NCAAB 🏀':3, 'NCAAF 🏈':3};
  preGames.sort((a,b) => (leaguePriority[a.leagueLabel]||5) - (leaguePriority[b.leagueLabel]||5));
  const g = preGames[0];

  const spread = g.odds.spread || '';
  const total = g.odds.total || '';
  const time = g.status || '';

  el.innerHTML = `
    <div onclick="openGame('${g.id}')" style="
      margin:4px 0 10px;padding:18px 16px;border-radius:14px;cursor:pointer;
      background:linear-gradient(135deg, rgba(0,229,255,.08) 0%, rgba(0,229,255,.02) 100%);
      border:1px solid rgba(0,229,255,.20);
      position:relative;overflow:hidden;
    ">
      <div style="position:absolute;top:0;right:0;width:120px;height:120px;
        background:radial-gradient(circle at 100% 0%, rgba(0,229,255,.12), transparent 70%);
        pointer-events:none;"></div>

      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
        <div style="
          padding:4px 10px;border-radius:99px;
          background:rgba(0,229,255,.14);border:1px solid rgba(0,229,255,.25);
          font-family:'DM Mono',monospace;font-size:9px;letter-spacing:2px;color:#00e5ff;font-weight:700;
        ">🎯 MAKE YOUR FIRST PICK</div>
        <div style="font-family:'DM Mono',monospace;font-size:9px;color:rgba(255,255,255,.3);letter-spacing:1px">${g.leagueLabel}</div>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px">
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            ${g.away.logo ? `<img src="${g.away.logo}" style="width:22px;height:22px;border-radius:4px" onerror="this.style.display='none'">` : ''}
            <span style="font-weight:700;font-size:14px">${g.away.abbr || g.away.name}</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            ${g.home.logo ? `<img src="${g.home.logo}" style="width:22px;height:22px;border-radius:4px" onerror="this.style.display='none'">` : ''}
            <span style="font-weight:700;font-size:14px">${g.home.abbr || g.home.name}</span>
          </div>
        </div>
        <div style="text-align:right">
          ${spread ? `<div style="font-family:'DM Mono',monospace;font-size:12px;color:var(--accent);font-weight:700">${spread}</div>` : ''}
          ${total ? `<div style="font-family:'DM Mono',monospace;font-size:11px;color:rgba(255,255,255,.4);margin-top:2px">${total}</div>` : ''}
          <div style="font-family:'DM Mono',monospace;font-size:9px;color:rgba(255,255,255,.25);margin-top:4px">${time}</div>
        </div>
      </div>

      <div style="
        display:flex;align-items:center;justify-content:center;gap:6px;
        padding:10px;border-radius:8px;
        background:rgba(0,229,255,.10);border:1px solid rgba(0,229,255,.18);
        font-family:'DM Mono',monospace;font-size:11px;color:#00e5ff;font-weight:700;letter-spacing:1px;
        margin-top:4px;
      ">
        TAP TO PICK · SPREAD OR TOTAL →
      </div>

      <div style="text-align:center;margin-top:8px;font-size:10px;color:rgba(255,255,255,.25);line-height:1.5">
        Start with $1,000 virtual bankroll · Track your record · Compete on the leaderboard
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════
// INJURY FEED
// ═══════════════════════════════════════════════════════
let injuryCache = {};

async function fetchInjuries(){
  return cachedFetch('injuries:all', _fetchInjuriesImpl, 300000, true);
}
async function _fetchInjuriesImpl(){
  const outdoorLeagues=['americanfootball_nfl','baseball_mlb'];
  // ESPN injury endpoint per league
  const leagues=[
    {key:'basketball/nba',label:'NBA'},
    {key:'football/nfl',label:'NFL'},
    {key:'baseball/mlb',label:'MLB'},
    {key:'hockey/nhl',label:'NHL'},
  ];
  const injuries=[];
  await Promise.allSettled(leagues.map(async lg=>{
    try{
      const data=await go(`https://site.api.espn.com/apis/site/v2/sports/${lg.key}/injuries`,5000);
      if(!data||!data.injuries) return;
      data.injuries.slice(0,5).forEach(inj=>{
        const ath=inj.athlete||{};
        const status=inj.status||inj.type||'';
        injuries.push({
          name:ath.shortName||ath.displayName||'',
          team:inj.team?.abbreviation||'',
          status: status.toLowerCase().includes('out')?'out':
                  status.toLowerCase().includes('quest')?'questionable':'probable',
          statusLabel: status,
          league:lg.label,
        });
      });
    }catch{}
  }));
  injuryCache=injuries;
  // Build a fast lookup: teamAbbr → [injury, ...] for card rendering
  window._injuryByTeam = {};
  injuries.forEach(inj=>{
    if(!inj.team) return;
    const key = inj.team.toUpperCase();
    if(!window._injuryByTeam[key]) window._injuryByTeam[key] = [];
    window._injuryByTeam[key].push(inj);
  });
  renderInjuryFeed();
  // Re-render scores to pick up fresh injury flags on cards
  if(appMode==='scores') renderScores();
}

function renderInjuryFeed(){
  const el=document.getElementById('injuryStrip');
  if(!el||!injuryCache.length) return;
  el.innerHTML=injuryCache.slice(0,20).map(inj=>
    `<div class="injury-pill">
      <span class="injury-status ${inj.status}">${inj.statusLabel.toUpperCase().slice(0,4)}</span>
      <span class="injury-name">${inj.name}</span>
      <span style="color:var(--dim)">${inj.team}</span>
    </div>`
  ).join('');
}

// ═══════════════════════════════════════════════════════
// WEATHER FOR OUTDOOR GAMES
// ═══════════════════════════════════════════════════════
let weatherCache = {}; // gameId → {temp, wind, icon}

async function fetchWeatherForGames(){
  return cachedFetch('weather:all', _fetchWeatherImpl, 600000, true);
}
async function _fetchWeatherImpl(){
  const outdoorGames=allGames.filter(g=>
    g.isPre&&(g.league==='nfl'||g.league==='mlb')
  ).slice(0,6); // limit to reduce startup/network load
  await Promise.allSettled(outdoorGames.map(async g=>{
    try{
      // ESPN game summary has weather in competitions[0].weather
      const lg=LEAGUES.find(l=>l.league===g.league);
      if(!lg) return;
      const data=await go(`${ESPN}/${lg.sport}/${lg.league}/summary?event=${g.id}`,8000);
      const weather=data?.gameInfo?.weather||data?.weather;
      if(!weather) return;
      const temp=weather.temperature;
      const wind=weather.windSpeed||weather.gust;
      const cond=weather.displayValue||weather.shortDisplayName||'';
      weatherCache[g.id]={
        temp:temp?`${Math.round(temp)}°F`:'',
        wind:wind?`💨${Math.round(wind)}mph`:'',
        windSpeed:parseFloat(wind)||0,
        condition:cond,
      };
    }catch{}
  }));
}

function weatherHTML(gameId){
  const w=weatherCache[gameId];
  if(!w||(!w.temp&&!w.wind)) return '';
  const isWindy=w.windSpeed>=15;
  return `<span class="weather-pill ${isWindy?'wind-alert':''}" title="${w.condition}">
    ${w.temp} ${w.wind}${isWindy?' ⚠️':''}
  </span>`;
}

// ═══════════════════════════════════════════════════════
// HEAD-TO-HEAD RECORDS
// ═══════════════════════════════════════════════════════
async function computeH2H(myId){
  try{
    // Get all leaderboard entries to compare against
    const entries=await fetchLeaderboard();
    const others=entries.filter(e=>e.id!==myId);
    const myPicks=picks.filter(p=>normalizeResult(p.result)!=='pending');
    if(!myPicks.length||!others.length) return [];

    // For each other user, compare picks on same games
    const h2h=[];
    for(const other of others.slice(0,10)){
      const theirPicks=(other.recentPicks||[]);
      let w=0,l=0;
      myPicks.forEach(myP=>{
        const theirP=theirPicks.find(tp=>
          tp.gameId===myP.gameId&&tp.type===myP.type
        );
        if(!theirP||myP.result==='push'||theirP.result==='push') return;
        if(myP.result==='won'&&theirP.result==='lost') w++;
        else if(myP.result==='lost'&&theirP.result==='won') l++;
      });
      if(w+l>0) h2h.push({name:other.name, id:other.id, w, l});
    }
    return h2h.sort((a,b)=>(b.w+b.l)-(a.w+a.l));
  }catch(e){ return []; }
}

function renderH2HSection(h2hData){
  const el=document.getElementById('h2hSection');
  if(!el) return;
  if(!h2hData||!h2hData.length){
    el.innerHTML='';
    return;
  }
  el.innerHTML=`
    <div class="h2h-section">
      <div class="lb-subtitle" style="margin-bottom:10px">HEAD-TO-HEAD THIS SEASON</div>
      ${h2hData.map(r=>{
        const edge=r.w>r.l?'You have the edge':'They have the edge';
        return `<div class="h2h-row">
          <div class="h2h-name">${r.name}</div>
          <div class="h2h-record">${r.w}-${r.l}</div>
          <div class="h2h-edge">${edge}</div>
        </div>`;
      }).join('')}
    </div>`;
}

// ═══════════════════════════════════════════════════════
// WEEKLY RECAP
// ═══════════════════════════════════════════════════════
function getLastWeekRange(){
  const now=new Date();
  const dayOfWeek=now.getDay();
  const lastMonday=new Date(now);
  lastMonday.setDate(now.getDate()-dayOfWeek-6);
  lastMonday.setHours(0,0,0,0);
  const lastSunday=new Date(lastMonday);
  lastSunday.setDate(lastMonday.getDate()+6);
  lastSunday.setHours(23,59,59,999);
  return {start:lastMonday.getTime(), end:lastSunday.getTime()};
}

function shouldShowWeeklyRecap(){
  const lastShown=parseInt(localStorage.getItem('recap_last_shown')||'0');
  const now=Date.now();
  const lastMonday=new Date();
  lastMonday.setDate(lastMonday.getDate()-lastMonday.getDay()+1);
  lastMonday.setHours(0,0,0,0);
  // Show on Mondays if not already shown this week
  const isMonday=new Date().getDay()===1;
  return isMonday && lastShown<lastMonday.getTime();
}

function computeWeeklyRecap(){
  const {start,end}=getLastWeekRange();
  const weekPicks=picks.filter(p=>p.madeAt>=start&&p.madeAt<=end&&normalizeResult(p.result)!=='pending');
  if(!weekPicks.length) return null;
  const w=weekPicks.filter(p=>p.result==='won').length;
  const l=weekPicks.filter(p=>p.result==='lost').length;
  const pu=weekPicks.filter(p=>p.result==='push').length;
  const pct=w+l>0?Math.round(w/(w+l)*100):0;
  // Best win: highest confidence winning pick
  const bestWin=weekPicks.filter(p=>p.result==='won').sort((a,b)=>(b.confidence||0)-(a.confidence||0))[0];
  // Biggest loss
  const bigLoss=weekPicks.filter(p=>p.result==='lost')[0];
  return {w,l,pu,pct,total:weekPicks.length,bestWin,bigLoss};
}

function showWeeklyRecap(){
  const data=computeWeeklyRecap();
  if(!data) return;
  localStorage.setItem('recap_last_shown',Date.now());
  const overlay=document.createElement('div');
  overlay.className='recap-overlay';
  const weekStr=new Date().toLocaleDateString([],{month:'long',day:'numeric'});
  overlay.innerHTML=`<div class="recap-card">
    <div class="recap-title">📊 Weekly Recap</div>
    <div class="recap-sub">LAST WEEK · ${weekStr}</div>
    <div class="recap-stat-grid">
      <div class="recap-stat">
        <div class="recap-stat-num" style="color:var(--green)">${data.w}</div>
        <div class="recap-stat-lbl">WINS</div>
      </div>
      <div class="recap-stat">
        <div class="recap-stat-num" style="color:var(--red)">${data.l}</div>
        <div class="recap-stat-lbl">LOSSES</div>
      </div>
      <div class="recap-stat">
        <div class="recap-stat-num" style="color:var(--accent)">${data.pct}%</div>
        <div class="recap-stat-lbl">WIN RATE</div>
      </div>
      <div class="recap-stat">
        <div class="recap-stat-num">${data.total}</div>
        <div class="recap-stat-lbl">TOTAL PICKS</div>
      </div>
    </div>
    ${data.bestWin?`<div class="recap-highlight">
      🏆 Best pick: <strong>${data.bestWin.description}</strong>
    </div>`:''}
    ${data.bigLoss?`<div class="recap-highlight" style="background:rgba(255,71,87,.06);border-color:rgba(255,71,87,.15)">
      💔 Tough loss: <strong>${data.bigLoss.description}</strong>
    </div>`:''}
    <button class="recap-close-btn" onclick="this.closest('.recap-overlay').remove()">NICE — LET'S GO</button>
  </div>`;
  document.body.appendChild(overlay);
}

// ═══════════════════════════════════════════════════════
// BRACKET SCORING + LEADERBOARD
// ═══════════════════════════════════════════════════════
const BRACKET_ROUND_PTS=[1,2,4,8,16,32]; // R64,R32,S16,E8,F4,Champ

// ═══════════════════════════════════════════════════════
// HISTORICAL MATCHUP RECORDS
// ═══════════════════════════════════════════════════════
let matchupCache = {};

async function fetchMatchupHistory(game){
  if(!game) return null;
  const cacheKey=`${game.away.id}_${game.home.id}`;
  if(matchupCache[cacheKey]) return matchupCache[cacheKey];
  try{
    const lg=LEAGUES.find(l=>l.league===game.league);
    if(!lg) return null;
    const data=await go(`${ESPN}/${lg.sport}/${lg.league}/summary?event=${game.id}`,8000);
    const h2h=data?.predictor||data?.againstTheSpread||data?.teamStats;
    // ESPN head2head data is in different places per sport
    const series=data?.seasonseries||data?.record?.items;
    if(series&&series.length){
      const rec=series[0];
      const result={
        awayW: parseInt(rec.value||rec.wins||0),
        homeW: parseInt(rec.homeWins||rec.losses||0),
        label:`Last ${rec.displayValue||'matchups'}`,
      };
      matchupCache[cacheKey]=result;
      return result;
    }
  }catch{}
  return null;
}

// ═══════════════════════════════════════════════════════
// BANKROLL / FAKE MONEY SYSTEM
// ═══════════════════════════════════════════════════════
// STARTING_BANKROLL hoisted to top
// DEFAULT_WAGER hoisted to top

function bankrollKey(){ return `bankroll_${currentUser?.id||'anon'}`; }
function rebuyKey(){ return `rebuys_${currentUser?.id||'anon'}`; }

function loadRebuys(){
  try{ return JSON.parse(localStorage.getItem(rebuyKey()) || '[]'); }catch{ return []; }
}
function saveRebuys(rebuys){
  localStorage.setItem(rebuyKey(), JSON.stringify(rebuys));
}
function getRebuyCount(){ return loadRebuys().length; }
function getRebuyOffset(){ return loadRebuys().length * STARTING_BANKROLL; }

// Push rebuy count to Supabase profiles so it syncs across devices
async function syncRebuyCountToServer(){
  try{
    if(!currentUser?.id || !supaOnline) return;
    const count = getRebuyCount();
    const patchR = await fetch(
      `${SUPA_REST}/profiles?user_id=eq.${currentUser.id}`,
      {
        method: 'PATCH',
        headers: {...SUPA_HDR, 'Prefer': 'return=minimal'},
        body: JSON.stringify({ rebuy_count: count, updated_at: new Date().toISOString() })
      }
    );
    if(!patchR.ok){
      // Try POST (insert) if PATCH found no row
      await fetch(`${SUPA_REST}/profiles`, {
        method: 'POST',
        headers: {...SUPA_HDR, 'Prefer': 'resolution=merge-duplicates,return=minimal'},
        body: JSON.stringify({ user_id: currentUser.id, rebuy_count: count })
      });
    }
  }catch(e){
    console.warn('syncRebuyCountToServer failed:', e?.message);
  }
}

// Pull rebuy count from Supabase and reconcile with localStorage (take the max)
async function syncRebuyCountFromServer(){
  try{
    if(!currentUser?.id || !supaOnline) return;
    const rows = await sbSelect('profiles', `select=rebuy_count&user_id=eq.${currentUser.id}`);
    const serverCount = rows?.[0]?.rebuy_count ?? 0;
    const localCount  = getRebuyCount();
    if(serverCount > localCount){
      // Server has more rebuys — generate synthetic entries to match the count
      const rebuys = loadRebuys();
      while(rebuys.length < serverCount){
        rebuys.push({ at: Date.now(), balanceAtRebuy: 0, fromServer: true });
      }
      saveRebuys(rebuys);
      updateBankrollUI?.();
      console.log(`[SharpPick] Rebuy count synced from server: ${serverCount}`);
    }
  }catch(e){
    console.warn('syncRebuyCountFromServer failed:', e?.message);
  }
}

function rebuyBankroll(){
  const balance = computeBankroll();
  if(balance > 50){
    showWinToast('⚠️ You still have $' + Math.round(balance) + ' — play it out!');
    return;
  }
  showConfirm(
    '🔄 Rebuy $1,000?',
    'Your record and Sharp Rating stay intact. A rebuy counter will be visible on your profile and leaderboard entry. This cannot be undone.',
    ()=>{
      const rebuys = loadRebuys();
      rebuys.push({ at: Date.now(), balanceAtRebuy: Math.round(balance) });
      saveRebuys(rebuys);
      updateBankrollUI();
      renderPicksPanel?.();
      showWinToast('🔄 Rebuy complete — $1,000 added!');
      // Sync rebuy count to server so all devices stay in sync
      try{ ensureProfile(); }catch{}
      try{ syncRebuyCountToServer(); }catch(e){ console.warn('[SharpPick] rebuy sync failed:', e?.message); }
    },
    'REBUY', false
  );
}

function loadBankroll(){
  try{
    const stored = localStorage.getItem(bankrollKey());
    if(stored) return JSON.parse(stored);
  }catch{}
  return { balance: STARTING_BANKROLL };
}

function saveBankroll(br){
  localStorage.setItem(bankrollKey(), JSON.stringify(br));
}

// Compute bankroll from starting amount + all settled P&L
function computeBankroll(){
  let balance = STARTING_BANKROLL + getRebuyOffset();
  picks.forEach(p=>{
    const wager = p.wager || 0;
    if(!wager) return;
    const r = normalizeResult(p.result); // handles 'win','won','loss','lost' etc.
    if(r === 'won')  balance += calcPayout(wager, p.odds || -110);
    else if(r === 'lost') balance -= wager;
    // push = no change, pending = not deducted yet
  });
  return Math.max(0, Math.round(balance * 100) / 100);
}

// Profit from American odds for a wager
function calcPayout(wager, americanOdds){
  const odds = parseFloat(americanOdds) || -110;
  if(odds > 0) return Math.round(wager * (odds / 100) * 100) / 100;
  return Math.round(wager * (100 / Math.abs(odds)) * 100) / 100;
}

// Normalize result strings across app (db uses win/loss; UI may use won/lost)
function normalizeResult(r){
  // Normalize legacy / inconsistent result values across builds.
  // Treat missing/empty as pending so older picks still count toward pending.
  if(r===undefined || r===null || r==='') return 'pending';
  const x = String(r).toLowerCase();
  if(x === 'win') return 'won';
  if(x === 'won') return 'won';
  if(x === 'loss') return 'lost';
  if(x === 'lost') return 'lost';
  if(x === 'push' || x === 'pushed') return 'push';
  if(x === 'pending' || x === 'open' || x === 'unsettled') return 'pending';
  return x;
}

// Total P&L across all settled picks
function totalPnL(){
  let pnl = 0;
  picks.filter(p=>normalizeResult(p.result)!=='pending'&&p.wager).forEach(p=>{
    const r = normalizeResult(p.result);
    if(r==='won')  pnl += calcPayout(p.wager, p.odds||-110);
    else if(r==='lost') pnl -= p.wager;
  });
  return Math.round(pnl * 100) / 100;
}

// Amount currently at risk in pending picks
function pendingExposure(){
  // Only count wagers on games that have actually locked (started or are live)
  // Picks on future games shouldn't show as "AT RISK" until the game begins
  const now = Date.now();
  return picks.filter(p=>{
    if(normalizeResult(p.result)!=='pending' || !p.wager) return false;
    // If game is in allGames and isPre (hasn't started), don't count as at risk yet
    const g = allGames.find(x=>x.id===(p.actualGameId||p.gameId));
    if(g && g.isPre) return false;
    return true;
  }).reduce((s,p)=>s+(p.wager||0),0);
}

function updateBankrollUI(){
  const bar = document.getElementById('bankrollBar');
  const display = document.getElementById('bankrollDisplay');
  const pnl = document.getElementById('bankrollPnL');
  if(!bar||!display||!currentUser) return;

  if(bar.style.display==='none') bar.style.display = ''; // only set if hidden — avoids needless reflow
  const balance = computeBankroll();
  const rebuyCount = getRebuyCount();
  const totalInvested = STARTING_BANKROLL + (rebuyCount * STARTING_BANKROLL);
  const diff = balance - totalInvested;
  const pending = pendingExposure();

  const newDisplay = `$${balance.toLocaleString()}`;
  const newClass = 'bankroll-amount' + (diff>0?' up':diff<0?' down':'');
  if(display.textContent !== newDisplay) display.textContent = newDisplay;
  if(display.className !== newClass) display.className = newClass;

  const pnlStr = diff===0 ? 'EVEN' : (diff>0?'+':'')+`$${Math.abs(diff).toLocaleString()}`;
  const pendStr = pending>0 ? ` · $${pending} AT RISK` : '';
  const rebuyStr = rebuyCount > 0 ? ` · ${rebuyCount} REBUY${rebuyCount>1?'S':''}` : '';
  const newPnl = `${pnlStr} REALISED${pendStr}${rebuyStr}`;
  const newPnlColor = diff>0?'#2ed573':diff<0?'#ff4757':'var(--muted)';
  if(pnl.textContent !== newPnl) pnl.textContent = newPnl;
  if(pnl.style.color !== newPnlColor) pnl.style.color = newPnlColor;

  // Add a subtle sync indicator / manual sync button next to bankroll
  let syncBtn = document.getElementById('bankrollSyncBtn');
  if(!syncBtn){
    syncBtn = document.createElement('button');
    syncBtn.id = 'bankrollSyncBtn';
    syncBtn.title = 'Sync bankroll across devices';
    syncBtn.style.cssText = 'margin-left:8px;padding:3px 8px;border-radius:5px;border:1px solid rgba(255,255,255,.1);background:transparent;color:rgba(255,255,255,.3);font-family:"DM Mono",monospace;font-size:9px;cursor:pointer;transition:all .2s;';
    syncBtn.textContent = '⟳';
    syncBtn.onclick = async (e) => {
      e.stopPropagation();
      syncBtn.style.color = 'var(--accent)';
      syncBtn.textContent = '⟳';
      syncBtn.style.animation = 'spin 1s linear infinite';
      try {
        lastSyncAt = 0;
        await syncRebuyCountFromServer();
        await syncPicksFromServer(false);
        updateBankrollUI?.();
        showWinToast('💰 Bankroll synced');
      } catch(e) {
        showWinToast('⚠️ Sync failed — check connection');
      }
      syncBtn.style.animation = '';
      syncBtn.style.color = 'rgba(255,255,255,.3)';
      syncBtn.textContent = '⟳';
    };
    bar.appendChild(syncBtn);
  }

  // Show/hide rebuy button
  let rebuyBtn = document.getElementById('rebuyBtn');
  if(balance <= 50){
    if(!rebuyBtn){
      rebuyBtn = document.createElement('button');
      rebuyBtn.id = 'rebuyBtn';
      rebuyBtn.onclick = rebuyBankroll;
      rebuyBtn.style.cssText = 'margin-left:12px;padding:5px 12px;border-radius:6px;border:1px solid rgba(255,165,2,.3);background:rgba(255,165,2,.1);color:#ffa502;font-family:"DM Mono",monospace;font-size:9px;font-weight:700;letter-spacing:1px;cursor:pointer;white-space:nowrap;';
      rebuyBtn.textContent = '🔄 REBUY $1K';
      bar.appendChild(rebuyBtn);
    }
    rebuyBtn.style.display = '';
  } else {
    if(rebuyBtn) rebuyBtn.style.display = 'none';
  }
}

// Wager selector HTML shown under a pick once it's made
function wagerSelectorHTML(gameId, type){
  const existingPick = picks.find(p=>p.gameId===gameId&&p.type===type);
  if(!existingPick) return '';
  const wager = existingPick.wager || DEFAULT_WAGER;
  const presets = [25, 50, 100, 250];
  const profit = calcPayout(wager, existingPick.odds || -110);
  const balance = computeBankroll();

  return `<div class="wager-row" onclick="event.stopPropagation()">
    <span class="wager-label">BET</span>
    <div class="wager-presets">
      ${presets.map(amt=>
        `<div class="wager-preset ${wager===amt?'active':''}" onclick="setWager('${gameId}','${type}',${amt})">$${amt}</div>`
      ).join('')}
    </div>
    <input class="wager-custom" type="number" min="1" max="${Math.floor(balance)||STARTING_BANKROLL}" value="${wager}"
      onchange="setWager('${gameId}','${type}',+this.value)" onclick="event.stopPropagation()">
  </div>
  <div class="wager-payout">Win: <span class="win-amt">+$${profit}</span> · Risk: $${wager}</div>`;
}

function setWager(gameId, type, amount){
  const pick = picks.find(p=>p.gameId===gameId&&p.type===type);
  if(!pick) return;
  const balance = computeBankroll();
  pick.wager = Math.max(1, Math.min(Math.round(amount), Math.floor(balance)||STARTING_BANKROLL));
  savePicks();
  updateBankrollUI();
  renderScores();
}

// ── Patch checkPickResults to fire celebrations on settlement ──────
// Done at runtime after checkPickResults is defined, not at parse time
function patchCheckPickResultsForCelebrations(){
  const orig = checkPickResults;
  checkPickResults = function(){
    const before = picks.map(p=>({k:p.gameId+p.type+p.side, result:p.result}));
    orig();
    picks.forEach(p=>{
      const prev = before.find(b=>b.k===p.gameId+p.type+p.side);
      if(prev && prev.result==='pending' && normalizeResult(p.result)!=='pending'){
        showWinCelebration(p);
      }
    });
    updateBankrollUI();
  };
}


// ═══════════════════════════════════════════════════════
// TRENDS DASHBOARD
// ═══════════════════════════════════════════════════════
function renderTrendsDashboard(){
  const el = document.getElementById('trendsContent');
  if(!el) return;
  showViewLoader('trendsContent','LOADING TRENDS…');
  setTimeout(()=>{try{
 // allow loader to paint

  // Safe local picks array — guards against picks being undefined/null
  const localPicks = Array.isArray(picks) ? picks : [];

  // Compute personal stats from local picks
  const settled = localPicks.filter(p=>normalizeResult(p.result)!=='pending');
  const byType = {spread:{w:0,l:0,p:0}, total:{w:0,l:0,p:0}, prop:{w:0,l:0,p:0}, parlay:{w:0,l:0,p:0}};
  const byLeague = {};
  const byDay = {}; // 0=Sun..6=Sat
  const byResult = {won:0,lost:0,push:0};
  let totalWagered=0, totalProfit=0;

  settled.forEach(p=>{
    const rr = normalizeResult(p.result);
    const t = p.type||'spread';
    if(byType[t]) {
      if(rr==='won') byType[t].w++;
      else if(rr==='lost') byType[t].l++;
      else byType[t].p++;
    }
    const lg = p.league||'Other';
    if(!byLeague[lg]) byLeague[lg]={w:0,l:0};
    if(rr==='won') byLeague[lg].w++;
    else if(rr==='lost') byLeague[lg].l++;

    const day = new Date(p.madeAt).getDay();
    if(!byDay[day]) byDay[day]={w:0,l:0};
    if(rr==='won') byDay[day].w++;
    else if(rr==='lost') byDay[day].l++;

    byResult[rr]=(byResult[rr]||0)+1;

    if(p.wager){
      totalWagered += p.wager;
      if(rr==='won') totalProfit += calcPayout(p.wager, p.odds||-110);
      else if(rr==='lost') totalProfit -= p.wager;
    }
  });

  const pct = (w,l) => w+l>0 ? Math.round(w/(w+l)*100) : null;
  const pctStr = (w,l) => { const p=pct(w,l); return p!==null?p+'%':'—'; };
  const pctColor = (w,l) => { const p=pct(w,l); return p===null?'':p>=55?'hot':p<=40?'cold':''; };

  const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const bestDay = Object.entries(byDay)
    .filter(([,v])=>v.w+v.l>=3)
    .sort(([,a],[,b])=>pct(b.w,b.l)-pct(a.w,a.l))[0];
  const worstDay = Object.entries(byDay)
    .filter(([,v])=>v.w+v.l>=3)
    .sort(([,a],[,b])=>pct(a.w,a.l)-pct(b.w,b.l))[0];

  const leagueRows = Object.entries(byLeague)
    .filter(([,v])=>v.w+v.l>0)
    .sort(([,a],[,b])=>(b.w+b.l)-(a.w+a.l))
    .slice(0,6);

  const roi = totalWagered>0 ? Math.round(totalProfit/totalWagered*100) : 0;
  const totalDecided = byResult.won+byResult.lost;
  const overallPct = pct(byResult.won, byResult.lost);

  el.innerHTML = `
    <div class="trends-hdr">📊 Your Trends</div>
    <div style="font-family:'DM Mono',monospace;font-size:10px;color:var(--muted);letter-spacing:1px">${settled.length} SETTLED PICKS ALL TIME</div>

    <div class="trends-grid">

      <!-- Overall record -->
      <div class="trend-card">
        <div class="trend-card-title">OVERALL RECORD</div>
        <div style="display:flex;align-items:flex-end;gap:8px;margin-bottom:10px">
          <div class="trend-big-num" style="color:${overallPct>=55?'#2ed573':overallPct<=40?'#ff4757':'var(--text)'}">${byResult.won}</div>
          <div style="font-size:20px;color:var(--muted);margin-bottom:4px">-${byResult.lost}-${byResult.push}</div>
        </div>
        <div class="trend-mini-bar"><div class="trend-mini-fill" style="width:${overallPct||0}%;background:${overallPct>=55?'#2ed573':overallPct<=40?'#ff4757':'var(--accent)'}"></div></div>
        <div style="display:flex;justify-content:space-between;font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);margin-top:4px">
          <span>${overallPct!==null?overallPct+'% WIN RATE':'—'}</span>
          <span>ROI ${roi>=0?'+':''}${roi}%</span>
        </div>
      </div>

      <!-- By pick type -->
      <div class="trend-card">
        <div class="trend-card-title">BY PICK TYPE</div>
        ${['spread','total','prop','parlay'].map(t=>{
          const {w,l} = byType[t];
          const p2 = pctStr(w,l);
          const c = pctColor(w,l);
          return `<div class="trend-stat-row">
            <div>
              <div class="trend-stat-label">${t.toUpperCase()}</div>
              <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--dim)">${w}-${l}</div>
            </div>
            <div class="trend-stat-val ${c}">${p2}</div>
          </div>`;
        }).join('')}
      </div>

      <!-- By league -->
      <div class="trend-card">
        <div class="trend-card-title">BY LEAGUE</div>
        ${leagueRows.length ? leagueRows.map(([lg,{w,l}])=>{
          const p2=pctStr(w,l), c=pctColor(w,l);
          const barW=pct(w,l)||0;
          return `<div class="trend-stat-row">
            <div style="flex:1">
              <div class="trend-stat-label">${lg}</div>
              <div class="trend-mini-bar" style="margin-top:3px"><div class="trend-mini-fill" style="width:${barW}%"></div></div>
            </div>
            <div style="text-align:right;margin-left:10px">
              <div class="trend-stat-val ${c}">${p2}</div>
              <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--dim)">${w}-${l}</div>
            </div>
          </div>`;
        }).join('') : '<div style="color:var(--dim);font-size:11px;padding:8px 0">No data yet — make some picks!</div>'}
      </div>

      <!-- By day of week -->
      <div class="trend-card">
        <div class="trend-card-title">BY DAY OF WEEK</div>
        <div style="display:flex;gap:4px;align-items:flex-end;height:60px;margin-bottom:8px">
          ${dayNames.map((d,i)=>{
            const {w=0,l=0} = byDay[i]||{};
            const p2=pct(w,l)||0;
            const h=Math.max(p2,4);
            const c=p2>=55?'#2ed573':p2<=40&&w+l>0?'#ff4757':'var(--accent)';
            return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px">
              <div style="width:100%;background:${c};border-radius:3px 3px 0 0;height:${h}%;opacity:${w+l>0?1:.2}"></div>
              <div style="font-family:'DM Mono',monospace;font-size:7px;color:var(--muted)">${d[0]}</div>
            </div>`;
          }).join('')}
        </div>
        ${bestDay ? `<div style="font-size:10px;color:#2ed573">🔥 Best: ${dayNames[bestDay[0]]} (${pctStr(bestDay[1].w,bestDay[1].l)})</div>` : ''}
        ${worstDay && worstDay[0]!==bestDay?.[0] ? `<div style="font-size:10px;color:#ff4757">❄️ Worst: ${dayNames[worstDay[0]]} (${pctStr(worstDay[1].w,worstDay[1].l)})</div>` : ''}
      </div>

      <!-- Bankroll chart -->
      <div class="trend-card">
        <div class="trend-card-title">BANKROLL HISTORY</div>
        ${renderMiniSparkline()}
      </div>

      <!-- Hot/cold streaks -->
      <div class="trend-card">
        <div class="trend-card-title">CURRENT FORM</div>
        ${renderStreakCard(settled)}
      </div>

    </div>`;

    if(settled.length===0){
      el.innerHTML = `
        <div class="trends-hdr">📊 Your Trends</div>
        <div style="margin-top:10px;color:var(--muted);font-family:'DM Mono',monospace;font-size:11px;letter-spacing:1px">
          NO SETTLED PICKS YET
        </div>
        <div style="margin-top:14px;color:var(--dim);line-height:1.6">
          Trends populate after games settle. Once picks resolve, you'll see win rate, ROI, best leagues, and streaks here.
        </div>
      `;
      return;
    }

} catch(e){ console.error('[trends] render failed', e); el.innerHTML = `<div style="color:var(--muted)">Trends unavailable. Please refresh.</div>`; } finally { /* Ensure loader is never stuck — if el still shows the loader spinner, replace it */ if(el && el.querySelector && el.querySelector('[style*="spin"]') && !el.querySelector('.trends-hdr')) { el.innerHTML = `<div style="color:var(--muted);padding:20px;text-align:center">Trends could not load. Pull to refresh.</div>`; } }
},0);
}

function renderMiniSparkline(){
  const _p = Array.isArray(picks) ? picks : [];
  const wagered = _p.filter(p=>normalizeResult(p.result)!=='pending'&&p.wager).sort((a,b)=>a.madeAt-b.madeAt);
  if(wagered.length<2) return '<div style="color:var(--dim);font-size:11px">Make picks with wagers to see bankroll history</div>';
  let running = STARTING_BANKROLL;
  const points = [{y:running}];
  wagered.forEach(p=>{
    if(p.result==='won') running += calcPayout(p.wager, p.odds||-110);
    else if(p.result==='lost') running -= p.wager;
    points.push({y:Math.max(0,running)});
  });
  const min=Math.min(...points.map(p=>p.y));
  const max=Math.max(...points.map(p=>p.y));
  const range=max-min||1;
  const W=240,H=60;
  const coords = points.map((p,i)=>({
    x: i/(points.length-1)*W,
    y: H - ((p.y-min)/range)*H
  }));
  const path = coords.map((c,i)=>i===0?`M${c.x},${c.y}`:`L${c.x},${c.y}`).join(' ');
  const fillPath = path + ` L${W},${H} L0,${H} Z`;
  const lastY = points[points.length-1].y;
  const color = lastY>=STARTING_BANKROLL?'#2ed573':'#ff4757';
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:60px;overflow:hidden;display:block">
    <defs><linearGradient id="spGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity=".3"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <path d="${fillPath}" fill="url(#spGrad)"/>
    <path d="${path}" fill="none" stroke="${color}" stroke-width="2"/>
  </svg>
  <div style="display:flex;justify-content:space-between;font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);margin-top:4px">
    <span>$${STARTING_BANKROLL}</span><span style="color:${color}">$${Math.round(lastY).toLocaleString()}</span>
  </div>`;
}

function renderStreakCard(settled){
  if(!settled.length) return '<div style="color:var(--dim);font-size:11px">No settled picks yet</div>';
  const last10 = settled.slice(-10).reverse();
  const dots = last10.map(p=>{
    const c = p.result==='won'?'#2ed573':p.result==='lost'?'#ff4757':'var(--gold)';
    return `<div style="width:18px;height:18px;border-radius:50%;background:${c};display:flex;align-items:center;justify-content:center;font-size:9px">${p.result==='won'?'W':p.result==='lost'?'L':'P'}</div>`;
  }).join('');
  // Current streak
  let streak=0, streakType='';
  for(const p of settled.slice().reverse()){
    if(!streakType) streakType=p.result;
    if(p.result===streakType) streak++;
    else break;
  }
  const streakMsg = streak>=2 ? (streakType==='won'?`🔥 ${streak}-pick win streak!`:streakType==='lost'?`❄️ ${streak}-pick cold streak`:`${streak} pushes in a row`) : 'No active streak';
  return `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px">${dots}</div>
    <div style="font-size:12px;font-weight:700">${streakMsg}</div>
    <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);margin-top:4px">LAST ${last10.length} PICKS</div>`;
}

// ═══════════════════════════════════════════════════════
// PICK FEED
// ═══════════════════════════════════════════════════════
let feedTab = 'all';
let feedCache = [];

function switchFeedTab(tab){
  feedTab = tab;
  const idMap = {all:'feedTabAll', following:'feedTabFollowing', league:'feedTabLeague', mine:'feedTabLeague'};
  document.querySelectorAll('.feed-tab').forEach(el=>{
    el.classList.toggle('active', el.id === (idMap[tab] || 'feedTabAll'));
  });
  renderPickFeed();
}

// Get set of followed user IDs for feed filtering
function getFollowedUserIds(){
  return loadFollowing ? loadFollowing() : new Set();
}

async function renderPickFeed(){
  const el = document.getElementById('feedContent');
  if(!el) return;
  el.innerHTML = '<div style="color:var(--dim);font-family:\'DM Mono\',monospace;font-size:10px;padding:16px;text-align:center">Loading feed…</div>';

  try{
    // Fetch all leaderboard entries which have recent_picks
    const entries = await fetchLeaderboard();
    const feed = [];
    entries.forEach(entry=>{
      (entry.recentPicks||[]).forEach(pk=>{
        feed.push({
          userId: entry.id,
          name: entry.name,
          ...pk,
          bankroll: entry.bankroll||1000,
        });
      });
    });
    // Sort: followed users first, then by recency
    const followedIds = loadFollowing ? loadFollowing() : new Set();
    feed.sort((a,b)=>{
      const aFollowed = followedIds.has(a.userId) ? 1 : 0;
      const bFollowed = followedIds.has(b.userId) ? 1 : 0;
      if(bFollowed !== aFollowed) return bFollowed - aFollowed;
      return (b.madeAt||0)-(a.madeAt||0);
    });
    feedCache = feed;
  }catch(e){
    // Fall back to local picks
    feedCache = picks.map(p=>({...p, userId:currentUser?.id, name:currentUser?.name||'You'}));
    feedCache.sort((a,b)=>(b.madeAt||0)-(a.madeAt||0));
  }

  renderFeedItems();
}

function renderFeedItems(){
  const el = document.getElementById('feedContent');
  if(!el) return;
  let items = feedCache;
  if(feedTab==='league' && currentUser){
    items = items.filter(p=>p.userId===currentUser.id);
  }
  if(feedTab==='following' && currentUser){
    const followedIds = loadFollowing ? loadFollowing() : new Set();
    items = items.filter(p=>followedIds.has(p.userId) || p.userId===currentUser.id);
    if(!items.length){
      el.innerHTML = '<div style="color:var(--dim);font-family:\'DM Mono\',monospace;font-size:10px;padding:30px;text-align:center;line-height:1.8">You\'re not following anyone yet.<br><small>Tap any user on the Leaderboard to follow them.</small></div>';
      return;
    }
  }
  if(!items.length){
    el.innerHTML = '<div style="color:var(--dim);font-family:\'DM Mono\',monospace;font-size:10px;padding:20px;text-align:center">No picks in feed yet</div>';
    return;
  }
  const isMe = id => id===currentUser?.id;
  el.innerHTML = items.slice(0,50).map(p=>{
    const ago = timeAgo(p.madeAt||0);
    const avatarClass = p.result==='won'?'settled-won':p.result==='lost'?'settled-lost':'';
    const pnl = p.result==='won'&&p.wager ? `+$${calcPayout(p.wager,p.odds||-110)}` : p.result==='lost'&&p.wager ? `-$${p.wager}` : '';
    const pnlClass = p.result==='won'?'pos':p.result==='lost'?'neg':'';
    return `<div class="feed-item">
      <div class="feed-item-top">
        <div class="feed-avatar ${avatarClass}">${(p.name||'?')[0].toUpperCase()}</div>
        <div class="feed-name">${p.name||'Anonymous'}${isMe(p.userId)?' <span style="color:var(--accent);font-size:9px">(you)</span>':''}</div>
        <div class="feed-time">${ago}</div>
      </div>
      <div class="feed-pick">${p.description||p.type||'Pick'}</div>
      ${p.comment?`<div class="feed-comment">"${escapeHtml(p.comment)}"</div>`:''}
      <div style="display:flex;align-items:center;margin-top:6px">
        <span class="feed-result-badge ${p.result||'pending'}">${(p.result||'PENDING').toUpperCase()}</span>
        ${pnl?`<span class="feed-pnl ${pnlClass}" style="margin-left:8px">${pnl}</span>`:''}
        ${p.wager&&p.result==='pending'?`<span style="font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);margin-left:8px">$${p.wager} at risk</span>`:''}
        ${isMe(p.userId)?`<button class="pi-share-btn" style="margin-left:auto" onclick="sharePickCard(${JSON.stringify(p).replace(/"/g,'&quot;')})" title="Share pick">📤</button>`:''}
      </div>
    </div>`;
  }).join('');
}

function timeAgo(ts){
  if(!ts) return '';
  const s = Math.floor((Date.now()-ts)/1000);
  if(s<60) return 'just now';
  if(s<3600) return Math.floor(s/60)+'m ago';
  if(s<86400) return Math.floor(s/3600)+'h ago';
  return Math.floor(s/86400)+'d ago';
}

// ═══════════════════════════════════════════════════════
// SHAREABLE PICK CARDS
// ═══════════════════════════════════════════════════════
// Lightweight image loader with cache for canvas rendering.
const _imgCache = new Map();
function loadImageCached(src){
  if(_imgCache.has(src)) return _imgCache.get(src);
  const p = new Promise((resolve,reject)=>{
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = ()=>resolve(img);
    img.onerror = reject;
    img.src = src;
  }).catch(()=>null);
  _imgCache.set(src,p);
  return p;
}

function sharePickCard(pick){
  const overlay = document.createElement('div');
  overlay.className = 'share-overlay';
  overlay.onclick = e => { if(e.target===overlay) overlay.remove(); };

  const canvas = document.createElement('canvas');
  const W = 640, H = 400;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Build modal immediately (fast UI), then render canvas async.
  canvas.style.borderRadius = '14px';
  canvas.style.maxWidth = '100%';
  overlay.innerHTML = '<div class="share-modal">'
    + '<div class="share-canvas-wrap" id="shareCanvasWrap"></div>'
    + '<div style="font-family:\'DM Mono\',monospace;font-size:9px;color:var(--muted);margin-bottom:12px;letter-spacing:1px">PICK CARD</div>'
    + '<div class="share-actions">'
    + '<button class="share-btn" onclick="this.closest(\'.share-overlay\').remove()">CLOSE</button>'
    + '<button class="share-btn primary" onclick="downloadPickCard()">⬇ DOWNLOAD</button>'
    + '</div>'
    + '</div>';
  document.body.appendChild(overlay);
  document.getElementById('shareCanvasWrap').appendChild(canvas);
  window._shareCanvas = canvas;

  // Render after paint.
  setTimeout(()=>renderPickCardCanvas(ctx, W, H, pick), 0);
}

async function renderPickCardCanvas(ctx, W, H, pick){
  const result = pick.result||'pending';
  const accentColor = result==='won'?'#2ed573':result==='lost'?'#ff4757':result==='push'?'#ffa502':'#00e5ff';
  const accentDark = result==='won'?'#1a8a4a':result==='lost'?'#a02a35':result==='push'?'#b87300':'#0097a7';

  // ── BACKGROUND: rich gradient with depth ──
  const bgGrad = ctx.createLinearGradient(0,0,W,H);
  bgGrad.addColorStop(0,'#080c10');
  bgGrad.addColorStop(0.5,'#0d1520');
  bgGrad.addColorStop(1,'#0a1018');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0,0,W,H);

  // ── AMBIENT GLOW: colored orb behind pick ──
  const orbGrad = ctx.createRadialGradient(480,100,0,480,100,260);
  orbGrad.addColorStop(0, accentColor+'25');
  orbGrad.addColorStop(0.5, accentColor+'08');
  orbGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = orbGrad;
  ctx.fillRect(0,0,W,H);

  // ── SCANLINES: subtle texture ──
  ctx.globalAlpha = 0.03;
  for(let y=0;y<H;y+=3){ ctx.fillStyle='#00e5ff'; ctx.fillRect(0,y,W,1); }
  ctx.globalAlpha = 1;

  // ── BORDER: gradient accent border ──
  ctx.save();
  const borderGrad = ctx.createLinearGradient(0,0,W,H);
  borderGrad.addColorStop(0, accentColor);
  borderGrad.addColorStop(0.5, accentColor+'60');
  borderGrad.addColorStop(1, accentDark);
  ctx.strokeStyle = borderGrad;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(2,2,W-4,H-4,14);
  ctx.stroke();
  ctx.restore();

  // ── Inner accent line at top ──
  const topGrad = ctx.createLinearGradient(0,0,W,0);
  topGrad.addColorStop(0,'transparent');
  topGrad.addColorStop(0.2, accentColor);
  topGrad.addColorStop(0.8, accentColor);
  topGrad.addColorStop(1,'transparent');
  ctx.strokeStyle = topGrad;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(24,3);
  ctx.lineTo(W-24,3);
  ctx.stroke();

  // ── LOGO: use new mark image (with fallback) ──
  const mark = await loadImageCached('assets/sharppick-mark.png');
  if(mark){
    const mW = 34, mH = 34;
    ctx.drawImage(mark, 22, 18, mW, mH);
    ctx.fillStyle = '#e8f4f8';
    ctx.font = '800 18px Syne, sans-serif';
    ctx.fillText('SharpPick', 64, 42);
  } else {
    ctx.fillStyle = '#e8f4f8';
    ctx.font = '800 18px Syne, sans-serif';
    ctx.fillText('SharpPick', 24, 42);
  }

  // ── RESULT BADGE ──
  if(result!=='pending'){
    const badgeW = ctx.measureText(result.toUpperCase()).width;
    const bx = W-28-(badgeW+24);
    ctx.fillStyle = accentColor+'18';
    ctx.beginPath();
    ctx.roundRect(bx, 22, badgeW+24, 26, 6);
    ctx.fill();
    ctx.strokeStyle = accentColor+'40';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = accentColor;
    ctx.font = '700 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(result.toUpperCase(), bx+(badgeW+24)/2, 40);
    ctx.textAlign = 'left';
  } else {
    ctx.fillStyle = '#00e5ff18';
    ctx.beginPath();
    ctx.roundRect(W-100, 22, 72, 26, 6);
    ctx.fill();
    ctx.strokeStyle = '#00e5ff40';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#00e5ff';
    ctx.font = '700 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PENDING', W-64, 40);
    ctx.textAlign = 'left';
  }

  // ── LEAGUE / TYPE TAG ──
  const leagueStr = (pick.league||'').toUpperCase();
  const typeStr = (pick.type||'spread').toUpperCase();
  if(leagueStr){
    ctx.fillStyle = '#1a2a3a';
    ctx.beginPath();
    ctx.roundRect(24, 64, ctx.measureText(leagueStr+'  ·  '+typeStr).width+20, 22, 4);
    ctx.fill();
    ctx.fillStyle = '#4a6070';
    ctx.font = '600 10px monospace';
    ctx.fillText(leagueStr + '  ·  ' + typeStr, 34, 79);
  }

  // ── PICK DESCRIPTION: large and bold ──
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 30px Syne, sans-serif';
  const desc = pick.description||'Pick';
  const maxW = W-48;
  const words = desc.split(' ');
  var line='', pLines=[], lineH=38;
  words.forEach(function(w){
    var test=line+w+' ';
    if(ctx.measureText(test).width>maxW&&line){ pLines.push(line.trim()); line=w+' '; }
    else line=test;
  });
  pLines.push(line.trim());
  pLines.slice(0,2).forEach(function(l,i){ ctx.fillText(l, 24, 128+i*lineH); });


// ── SHARP RATING: number + bar + label ──
const srRaw = (pick.sharpRating!=null ? pick.sharpRating : (pick.sharp_rating!=null ? pick.sharp_rating : (pick.rating!=null ? pick.rating : null)));
const sr = srRaw==null ? null : Math.max(0, Math.min(100, Number(srRaw)));
const hasSR = (sr!=null && isFinite(sr));
if(hasSR){
  const baseY = 128 + pLines.length*lineH;
  const tier = ratingTierLabel(sr);

  const barX = 24, barW = W-48, barH = 10;
  const labelY = baseY + 30;   // below game line
  const barY   = baseY + 38;

  ctx.fillStyle = '#4a6070';
  ctx.font = '700 10px monospace';
  ctx.fillText(`SHARP RATING ${Math.round(sr)}  ·  ${tier}`, 24, labelY);

  // Bar background
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW, barH, 6);
  ctx.fill();

  // Bar fill
  const fillW = Math.max(6, Math.round(barW * (sr/100)));
  const g = ctx.createLinearGradient(barX,0,barX+barW,0);
  g.addColorStop(0, accentColor);
  g.addColorStop(1, accentColor+'70');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(barX, barY, fillW, barH, 6);
  ctx.fill();
}

// ── GAME CONTEXT ──
  // Clean up gameStr: if scores are both 0 (pre-game), strip the numbers to show just matchup
  let gameStr = pick.gameStr||'';
  if(gameStr){
    // Replace "Team 0 @ Team 0" pattern → "Team @ Team"
    gameStr = gameStr.replace(/(\w[\w\s]+?)\s+0\s+@\s+([\w\s]+?)\s+0$/i, '$1 @ $2').trim();
    // Also strip any final score like "Team 125 @ Team 119" that looks like it has scores
    // Keep it clean — if description already has the pick, a clean matchup is enough
    ctx.fillStyle = '#4a6070';
    ctx.font = '500 13px monospace';
    ctx.fillText(gameStr.slice(0,55), 24, 128+pLines.length*lineH+8);
  }

  // ── DIVIDER LINE ──
  var divY = 128+pLines.length*lineH+28 + ((typeof hasSR!=='undefined' && hasSR) ? 26 : 0);
  var divGrad = ctx.createLinearGradient(24,0,W-24,0);
  divGrad.addColorStop(0, '#1a2a3a');
  divGrad.addColorStop(0.5, accentColor+'40');
  divGrad.addColorStop(1, '#1a2a3a');
  ctx.strokeStyle = divGrad;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(24, divY);
  ctx.lineTo(W-24, divY);
  ctx.stroke();

  // ── WAGER / PAYOUT SECTION ──
  var statY = divY + 30;
  if(pick.wager){
    var risk = Math.max(0, +pick.wager||0);
    var profit = calcPayout(risk, pick.odds||-110);

    // Status-first share card layout:
    // - Pending: show Risk / To Win / Odds (3 columns)
    // - Won/Lost/Push: make RESULT the hero line for shareability
    const cx = W/2;

    if(result==='won'){
      ctx.textAlign='center';
      ctx.fillStyle = '#4a6070';
      ctx.font = '700 10px monospace';
      ctx.fillText('PROFIT', cx, statY);

      ctx.fillStyle = '#2ed573';
      ctx.font = '900 44px Syne, sans-serif';
      ctx.fillText('+$'+profit, cx, statY+46);

      ctx.fillStyle = '#4a6070';
      ctx.font = '600 11px monospace';
      ctx.fillText((pick.description||'').slice(0,40).toUpperCase(), cx, statY+70);
      ctx.textAlign='left';
    } else if(result==='lost'){
      ctx.textAlign='center';
      ctx.fillStyle = '#4a6070';
      ctx.font = '700 10px monospace';
      ctx.fillText('LOSS', cx, statY);

      ctx.fillStyle = '#ff4757';
      ctx.font = '900 44px Syne, sans-serif';
      ctx.fillText('-$'+risk, cx, statY+46);

      ctx.fillStyle = '#4a6070';
      ctx.font = '600 11px monospace';
      ctx.fillText((pick.description||'').slice(0,40).toUpperCase(), cx, statY+70);
      ctx.textAlign='left';
    } else if(result==='push'){
      ctx.textAlign='center';
      ctx.fillStyle = '#4a6070';
      ctx.font = '700 10px monospace';
      ctx.fillText('RESULT', cx, statY);

      ctx.fillStyle = '#ffa502';
      ctx.font = '900 44px Syne, sans-serif';
      ctx.fillText('$0', cx, statY+46);

      ctx.fillStyle = '#4a6070';
      ctx.font = '600 11px monospace';
      ctx.fillText((pick.description||'').slice(0,40).toUpperCase(), cx, statY+70);
      ctx.textAlign='left';
    } else {
      // Pending / pre-game
      const riskX = 24;
      const winX  = W/2;
      const oddsX = W-24;

      ctx.fillStyle = '#4a6070';
      ctx.font = '600 9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('RISKING', riskX, statY);
      ctx.textAlign = 'center';
      ctx.fillText('TO WIN', winX, statY);
      ctx.textAlign = 'right';
      ctx.fillText('ODDS', oddsX, statY);

      ctx.font = '800 26px Syne, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#e8f4f8';
      ctx.fillText('$'+risk, riskX, statY+32);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#00e5ff';
      ctx.fillText('+$'+profit, winX, statY+32);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#e8f4f8';
      ctx.fillText(String(pick.odds||-110), oddsX, statY+32);
      ctx.textAlign = 'left';
    }
  }


  // ── CONFIDENCE STARS ──
  if(pick.confidence){
    var starY = statY;
    ctx.fillStyle = '#ffd166';
    ctx.font = '18px sans-serif';
    var stars = '';
    for(var s=0;s<5;s++) stars += s<pick.confidence ? '★' : '☆';
    ctx.textAlign = 'right';
    ctx.fillText(stars, W-24, starY+12);
    ctx.textAlign = 'left';
    if(pick.isLock){
      ctx.fillStyle = '#ffd166';
      ctx.font = '700 9px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('🔒 LOCK OF THE DAY', W-24, starY+28);
      ctx.textAlign = 'left';
    }
  }

  // ── COMMENT ──
  if(pick.comment){
    ctx.fillStyle = '#4a6070';
    ctx.font = 'italic 13px sans-serif';
    ctx.fillText('"'+pick.comment.slice(0,65)+'"', 24, statY+60);
  }

  // ── FOOTER: user + date ──
  ctx.fillStyle = '#1a2a3a';
  ctx.fillRect(0, H-52, W, 52);
  // Footer accent line
  var footGrad = ctx.createLinearGradient(0,0,W,0);
  footGrad.addColorStop(0, accentColor+'00');
  footGrad.addColorStop(0.3, accentColor+'60');
  footGrad.addColorStop(0.7, accentColor+'60');
  footGrad.addColorStop(1, accentColor+'00');
  ctx.strokeStyle = footGrad;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, H-52);
  ctx.lineTo(W, H-52);
  ctx.stroke();

  var userName = pick.name||currentUser?.name||'Anonymous';
  var dateStr = new Date(pick.madeAt||Date.now()).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  const rec = (typeof recordFor==='function') ? recordFor('all') : {w:0,l:0,p:0,n:0};
  const recStr = `${rec.w}-${rec.l}-${rec.p}` + (rec.n?`  (${rec.n}P)`:'');
  ctx.fillStyle = '#4a6070';
  ctx.font = '500 11px monospace';
  const units = (typeof unitsFor==='function') ? unitsFor('all') : 0;
const decisions = (rec.w + rec.l);
const winPct = decisions ? (rec.w/decisions) : 0;
const unitsStr = formatUnits(units) + 'U';
const winStr = formatPct(winPct) + ' WIN';
// Split footer into two lines to avoid overflow on the card
// Line 1 (top): username · date
// Line 2 (bottom): record · units · win%
ctx.font = '600 11px monospace';
ctx.fillStyle = '#6a8090';
ctx.fillText(`${userName}  ·  ${dateStr}`, 24, H-28);
ctx.font = '500 10px monospace';
ctx.fillStyle = '#4a6070';
ctx.fillText(`REC ${recStr}  ·  ${unitsStr}  ·  ${winStr}`, 24, H-13);

  // Footer mark (small) — new logo
  if(mark){
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.drawImage(mark, W-52, H-46, 22, 22);
    ctx.restore();
  }

  // sharppick.netlify.app text
  ctx.fillStyle = '#4a6070';
  ctx.font = '500 9px monospace';
  ctx.textAlign = 'right';
  ctx.fillText('getsharppick.com', W-52, H-13);
  ctx.textAlign = 'left';

}

function downloadPickCard(){
  if(!window._shareCanvas) return;
  const a = document.createElement('a');
  a.download = 'pick-card.png';
  a.href = window._shareCanvas.toDataURL('image/png');
  a.click();
}

// ═══════════════════════════════════════════════════════
// SHAREABLE PLAYER CARD
// ═══════════════════════════════════════════════════════
function openPlayerCard(entry){
  const e = entry || {};
  const isMe = !entry || (e.id === currentUser?.id);

  // Gather stats — prefer entry data, fallback to local
  let w, l, p, winPct, sharp, tier, topSport, topSportRating, streak, roi, units, picks90, record;
  if(isMe){
    const loc = _getLocalRecord();
    w = loc.w; l = loc.l; p = loc.p;
    const decided = w + l;
    winPct = decided > 0 ? Math.round(w / decided * 100) : 0;
    const snap = typeof computeRatingsDaily === 'function' ? computeRatingsDaily() : null;
    sharp = snap?.overall90?.rating != null ? Math.round(snap.overall90.rating * 10) / 10 : (e.sharp || 0);
    tier = snap?.overall90?.tier || (typeof _tierFromRating === 'function' ? _tierFromRating(sharp, loc.total) : 'Rookie');
    topSport = e.topSport || '';
    topSportRating = e.sportRating || 0;
    streak = e.streak || '';
    roi = e.roi || 0;
    units = e.units || 0;
    picks90 = e.picks || loc.total;
    record = `${w}-${l}-${p}`;
  } else {
    w = 0; l = 0; p = 0;
    if(e.record){ const parts = String(e.record).split('-').map(Number); w = parts[0]||0; l = parts[1]||0; p = parts[2]||0; }
    const decided = w + l;
    winPct = e.winRate != null ? Math.round(e.winRate) : (decided > 0 ? Math.round(w / decided * 100) : 0);
    sharp = e.sharp || 0;
    tier = e.tier || (typeof _tierFromRating === 'function' ? _tierFromRating(sharp, e.picks||0) : 'Rookie');
    topSport = e.topSport || '';
    topSportRating = e.sportRating || 0;
    streak = e.streak || '';
    roi = e.roi || 0;
    units = e.units || 0;
    picks90 = e.picks || 0;
    record = e.record || `${w}-${l}-${p}`;
  }

  const name = e.name || currentUser?.name || 'Player';
  const provisional = e.provisional != null ? e.provisional : (picks90 < 20);

  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'share-overlay';
  overlay.onclick = ev => { if(ev.target === overlay) overlay.remove(); };

  const canvas = document.createElement('canvas');
  const W = 640, H = 480;
  canvas.width = W;
  canvas.height = H;
  canvas.style.borderRadius = '14px';
  canvas.style.maxWidth = '100%';

  overlay.innerHTML = '<div class="share-modal">'
    + '<div class="share-canvas-wrap" id="playerCardWrap"></div>'
    + '<div style="font-family:\'DM Mono\',monospace;font-size:9px;color:var(--muted);margin-bottom:12px;letter-spacing:1px">PLAYER CARD</div>'
    + '<div class="share-actions">'
    + '<button class="share-btn" onclick="this.closest(\'.share-overlay\').remove()">CLOSE</button>'
    + '<button class="share-btn primary" onclick="downloadPlayerCard()">⬇ DOWNLOAD</button>'
    + '<button class="share-btn primary" onclick="sharePlayerCardNative()">📤 SHARE</button>'
    + '</div>'
    + '</div>';
  document.body.appendChild(overlay);
  document.getElementById('playerCardWrap').appendChild(canvas);
  window._playerCardCanvas = canvas;

  setTimeout(() => renderPlayerCardCanvas(canvas.getContext('2d'), W, H, {
    name, sharp, tier, winPct, record, roi, units, picks90, streak,
    topSport, topSportRating, provisional, w, l, p,
    rebuys: isMe ? getRebuyCount() : 0,
    crowns: isMe ? getPickemCrowns() : 0
  }), 0);
}

async function renderPlayerCardCanvas(ctx, W, H, data){
  const { name, sharp, tier, winPct, record, roi, units, picks90, streak,
          topSport, topSportRating, provisional, w, l } = data;

  // Tier color mapping
  const tierColors = { Elite:'#ff6b6b', Pro:'#a855f7', Sharp:'#00e5ff', Solid:'#ffa502', Rookie:'#636e72' };
  const accentColor = tierColors[tier] || '#00e5ff';

  // ── BACKGROUND ──
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#060a0e');
  bgGrad.addColorStop(0.3, '#0a1018');
  bgGrad.addColorStop(0.7, '#0d1520');
  bgGrad.addColorStop(1, '#080c10');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // ── AMBIENT GLOW ──
  const orbGrad = ctx.createRadialGradient(W * 0.75, H * 0.25, 0, W * 0.75, H * 0.25, 300);
  orbGrad.addColorStop(0, accentColor + '20');
  orbGrad.addColorStop(0.5, accentColor + '06');
  orbGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = orbGrad;
  ctx.fillRect(0, 0, W, H);

  // Second glow bottom-left
  const orb2 = ctx.createRadialGradient(80, H - 80, 0, 80, H - 80, 200);
  orb2.addColorStop(0, '#00e5ff10');
  orb2.addColorStop(1, 'transparent');
  ctx.fillStyle = orb2;
  ctx.fillRect(0, 0, W, H);

  // ── SCANLINES ──
  ctx.globalAlpha = 0.025;
  for(let y = 0; y < H; y += 3){ ctx.fillStyle = '#00e5ff'; ctx.fillRect(0, y, W, 1); }
  ctx.globalAlpha = 1;

  // ── BORDER ──
  const borderGrad = ctx.createLinearGradient(0, 0, W, H);
  borderGrad.addColorStop(0, accentColor);
  borderGrad.addColorStop(0.5, accentColor + '40');
  borderGrad.addColorStop(1, '#0097a7');
  ctx.strokeStyle = borderGrad;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(2, 2, W - 4, H - 4, 16);
  ctx.stroke();

  // ── TOP ACCENT LINE ──
  const topGrad = ctx.createLinearGradient(24, 0, W - 24, 0);
  topGrad.addColorStop(0, 'transparent');
  topGrad.addColorStop(0.2, accentColor);
  topGrad.addColorStop(0.8, accentColor);
  topGrad.addColorStop(1, 'transparent');
  ctx.strokeStyle = topGrad;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(24, 3);
  ctx.lineTo(W - 24, 3);
  ctx.stroke();

  // ── LOGO ──
  const mark = await loadImageCached('assets/sharppick-mark.png');
  if(mark){
    ctx.drawImage(mark, 24, 20, 30, 30);
    ctx.fillStyle = '#e8f4f8';
    ctx.font = '800 16px Syne, sans-serif';
    ctx.fillText('SharpPick', 62, 42);
  } else {
    ctx.fillStyle = '#e8f4f8';
    ctx.font = '800 16px Syne, sans-serif';
    ctx.fillText('SharpPick', 24, 42);
  }

  // ── PLAYER CARD badge ──
  ctx.fillStyle = accentColor + '18';
  ctx.beginPath();
  ctx.roundRect(W - 148, 20, 124, 28, 6);
  ctx.fill();
  ctx.strokeStyle = accentColor + '40';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = accentColor;
  ctx.font = '700 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('PLAYER CARD', W - 86, 39);
  ctx.textAlign = 'left';

  // ── AVATAR CIRCLE ──
  const avX = 44, avY = 82, avR = 28;
  ctx.save();
  ctx.beginPath();
  ctx.arc(avX, avY, avR, 0, Math.PI * 2);
  ctx.fillStyle = accentColor + '22';
  ctx.fill();
  ctx.strokeStyle = accentColor + '55';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = accentColor;
  ctx.font = '800 22px Syne, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(name[0].toUpperCase(), avX, avY + 8);
  ctx.textAlign = 'left';
  ctx.restore();

  // ── PLAYER NAME ──
  ctx.fillStyle = '#e8f4f8';
  ctx.font = '800 26px Syne, sans-serif';
  ctx.fillText(name.slice(0, 20), 82, 90);

  // ── TIER BADGE ──
  const tierIcons = { Elite:'🔥', Pro:'💎', Sharp:'🥇', Solid:'🥈', Rookie:'🥉' };
  const tierStr = (tierIcons[tier] || '🥉') + ' ' + tier.toUpperCase();
  const tierW = ctx.measureText(tierStr).width;
  ctx.fillStyle = accentColor + '14';
  ctx.beginPath();
  ctx.roundRect(82, 98, tierW + 20, 22, 4);
  ctx.fill();
  ctx.fillStyle = accentColor;
  ctx.font = '600 10px monospace';
  ctx.fillText(tierStr, 92, 113);

  // ── PROVISIONAL BADGE ──
  if(provisional){
    ctx.fillStyle = '#ffa50218';
    ctx.beginPath();
    ctx.roundRect(82 + tierW + 28, 98, 90, 22, 4);
    ctx.fill();
    ctx.fillStyle = '#ffa502';
    ctx.font = '600 9px monospace';
    ctx.fillText('PROVISIONAL', 82 + tierW + 38, 113);
  }

  // ── REBUY BADGE ──
  if(data.rebuys > 0){
    const rbX = provisional ? 82 + tierW + 128 : 82 + tierW + 28;
    const rbText = '🔄 ' + data.rebuys + ' REBUY' + (data.rebuys > 1 ? 'S' : '');
    ctx.fillStyle = 'rgba(255,255,255,.06)';
    ctx.beginPath();
    ctx.roundRect(rbX, 98, 82, 22, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.4)';
    ctx.font = '600 9px monospace';
    ctx.fillText(rbText, rbX + 8, 113);
  }

  // ── DIVIDER ──
  const divY = 134;
  const divGrad = ctx.createLinearGradient(24, 0, W - 24, 0);
  divGrad.addColorStop(0, '#1a2a3a');
  divGrad.addColorStop(0.5, accentColor + '40');
  divGrad.addColorStop(1, '#1a2a3a');
  ctx.strokeStyle = divGrad;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(24, divY);
  ctx.lineTo(W - 24, divY);
  ctx.stroke();

  // ── SHARP RATING — BIG NUMBER ──
  const ratingY = 200;
  ctx.fillStyle = '#4a6070';
  ctx.font = '700 10px monospace';
  ctx.fillText('SHARP RATING · 90 DAY', 34, 160);

  // Rating ring
  const ringX = 100, ringY = 216, ringR = 50;
  ctx.beginPath();
  ctx.arc(ringX, ringY, ringR, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,.06)';
  ctx.lineWidth = 6;
  ctx.stroke();

  // Filled arc
  const pct = Math.min(sharp / 100, 1);
  ctx.beginPath();
  ctx.arc(ringX, ringY, ringR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.lineCap = 'butt';

  // Rating number inside ring
  ctx.fillStyle = accentColor;
  ctx.font = '900 32px Syne, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(sharp.toFixed(1), ringX, ringY + 10);
  ctx.textAlign = 'left';

  // ── STATS GRID (right of ring) ──
  const statsX = 190;
  const statBox = (x, y, label, value, color) => {
    ctx.fillStyle = 'rgba(255,255,255,.03)';
    ctx.beginPath();
    ctx.roundRect(x, y, 130, 52, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.06)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#4a6070';
    ctx.font = '600 9px monospace';
    ctx.fillText(label, x + 12, y + 18);

    ctx.fillStyle = color || '#e8f4f8';
    ctx.font = '800 18px Syne, sans-serif';
    ctx.fillText(value, x + 12, y + 42);
  };

  const winColor = winPct >= 55 ? '#2ed573' : winPct <= 40 ? '#ff4757' : '#e8f4f8';
  const roiColor = roi > 0 ? '#2ed573' : roi < 0 ? '#ff4757' : '#e8f4f8';
  const roiStr = (roi >= 0 ? '+' : '') + roi.toFixed(1) + '%';
  const unitsStr = (units >= 0 ? '+' : '') + units.toFixed(1) + 'u';

  statBox(statsX, 176, 'RECORD', record, '#e8f4f8');
  statBox(statsX + 140, 176, 'WIN RATE', winPct + '%', winColor);
  statBox(statsX, 238, 'ROI', roiStr, roiColor);
  statBox(statsX + 140, 238, 'UNITS', unitsStr, roiColor);

  // ── SECONDARY STATS ROW ──
  const secY = 310;
  const secDiv = ctx.createLinearGradient(24, 0, W - 24, 0);
  secDiv.addColorStop(0, '#1a2a3a');
  secDiv.addColorStop(0.5, 'rgba(255,255,255,.08)');
  secDiv.addColorStop(1, '#1a2a3a');
  ctx.strokeStyle = secDiv;
  ctx.beginPath();
  ctx.moveTo(24, secY);
  ctx.lineTo(W - 24, secY);
  ctx.stroke();

  const crownCount = data.crowns || 0;
  const secStatW = (W - 48 - 40) / 5;
  const secStats = [
    { label: 'PICKS (90D)', value: String(picks90) },
    { label: 'STREAK', value: streak || '—' },
    { label: 'TOP SPORT', value: topSport ? topSport.replace(/[^\w\s]/g, '').trim().slice(0, 8) : '—' },
    { label: 'SPORT SR', value: topSportRating ? topSportRating.toFixed(1) : '—' },
    { label: '🏆 CROWNS', value: String(crownCount), color: crownCount > 0 ? '#ffa502' : '#e8f4f8' },
  ];
  secStats.forEach((s, i) => {
    const sx = 34 + i * (secStatW + 10);
    ctx.fillStyle = '#4a6070';
    ctx.font = '600 8px monospace';
    ctx.fillText(s.label, sx, secY + 22);
    ctx.fillStyle = s.color || '#e8f4f8';
    ctx.font = '700 14px Syne, sans-serif';
    ctx.fillText(s.value, sx, secY + 42);
  });

  // ── WIN RATE BAR ──
  const barY = secY + 62;
  ctx.fillStyle = '#4a6070';
  ctx.font = '600 8px monospace';
  ctx.fillText('WIN RATE DISTRIBUTION', 34, barY);

  const barStartX = 34, barW = W - 68, barH = 14;
  const totalDecided = (w || 0) + (l || 0);
  const winFrac = totalDecided > 0 ? w / totalDecided : 0.5;

  ctx.fillStyle = 'rgba(255,255,255,.06)';
  ctx.beginPath();
  ctx.roundRect(barStartX, barY + 8, barW, barH, 4);
  ctx.fill();

  if(totalDecided > 0){
    // Win portion
    const winW = Math.max(4, barW * winFrac);
    ctx.fillStyle = '#2ed573';
    ctx.beginPath();
    ctx.roundRect(barStartX, barY + 8, winW, barH, 4);
    ctx.fill();

    // Loss portion
    ctx.fillStyle = '#ff4757';
    ctx.beginPath();
    ctx.roundRect(barStartX + winW, barY + 8, barW - winW, barH, 4);
    ctx.fill();
  }

  // Bar labels
  ctx.font = '600 9px monospace';
  ctx.fillStyle = '#2ed573';
  ctx.fillText(w + 'W', barStartX, barY + 38);
  ctx.fillStyle = '#ff4757';
  ctx.textAlign = 'right';
  ctx.fillText(l + 'L', barStartX + barW, barY + 38);
  ctx.textAlign = 'left';

  // ── FOOTER ──
  const footY = H - 30;
  ctx.fillStyle = '#2a3a4a';
  ctx.font = '500 9px monospace';
  ctx.fillText('getsharppick.com', 34, footY);

  const dateStr = new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  ctx.textAlign = 'right';
  ctx.fillText(dateStr, W - 34, footY);
  ctx.textAlign = 'left';
}

function downloadPlayerCard(){
  if(!window._playerCardCanvas) return;
  const a = document.createElement('a');
  a.download = 'sharppick-player-card.png';
  a.href = window._playerCardCanvas.toDataURL('image/png');
  a.click();
}

async function sharePlayerCardNative(){
  if(!window._playerCardCanvas) return;
  try{
    const blob = await new Promise(resolve => window._playerCardCanvas.toBlob(resolve, 'image/png'));
    const file = new File([blob], 'sharppick-player-card.png', { type: 'image/png' });
    if(navigator.share && navigator.canShare && navigator.canShare({ files: [file] })){
      await navigator.share({
        title: 'My SharpPick Player Card',
        text: 'Check out my Sharp Rating on SharpPick! 🎯',
        url: 'https://getsharppick.com',
        files: [file]
      });
    } else {
      downloadPlayerCard();
    }
  }catch(e){
    downloadPlayerCard();
  }
}

// ═══════════════════════════════════════════════════════
// SHARP RATING EXPLAINER MODAL
// ═══════════════════════════════════════════════════════
function openSharpRatingExplainer(){
  const existing = document.getElementById('sharpExplainerOverlay');
  if(existing){ existing.remove(); document.body.style.overflow=''; return; }

  function closeExplainer(){
    const ov = document.getElementById('sharpExplainerOverlay');
    if(ov) ov.remove();
    document.body.style.overflow = '';
  }

  document.body.style.overflow = 'hidden';

  const pillars = [
    { icon:'🎯', label:'WIN RATE · 50%',    color:'#2ed573', desc:'Breakeven (52.4%) = 500 pts. Every 1% above breakeven adds ~20 pts. Proven accuracy over volume is the biggest driver.' },
    { icon:'📈', label:'ROI · 30%',          color:'#00e5ff', desc:'Profit per dollar risked. 0% ROI = 500 pts, +10% ROI = 750 pts. Rewards making money, not just winning.' },
    { icon:'📊', label:'CONSISTENCY · 20%',  color:'#a855f7', desc:'Penalizes catastrophic losing weeks. Steady week-to-week profit beats boom/bust streaks.' },
    { icon:'🔬', label:'VOLUME MULTIPLIER',  color:'#ffa502', desc:'Rating scales from 70% to 100% as you log 5→50+ settled picks. More picks = more confidence your edge is real.' },
  ];

  const tiers = [
    { icon:'🔥', name:'Elite',  range:'750–1000', color:'#ff6b6b', req:'50+ picks req.' },
    { icon:'💎', name:'Pro',    range:'600–749',  color:'#a855f7', req:'' },
    { icon:'🥇', name:'Sharp',  range:'500–599',  color:'#00e5ff', req:'' },
    { icon:'🥈', name:'Solid',  range:'400–499',  color:'#ffa502', req:'' },
    { icon:'🥉', name:'Rookie', range:'0–399',    color:'#8a9ba8', req:'' },
  ];

  const pillarHTML = pillars.map(p => `
    <div style="display:flex;gap:12px;align-items:flex-start;padding:12px 14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:12px">
      <div style="font-size:20px;flex-shrink:0;margin-top:1px">${p.icon}</div>
      <div>
        <div style="font-family:'DM Mono',monospace;font-size:10px;letter-spacing:2px;color:${p.color};font-weight:700;margin-bottom:3px">${p.label}</div>
        <div style="font-size:12px;color:rgba(255,255,255,.5);line-height:1.55">${p.desc}</div>
      </div>
    </div>`).join('');

  const tierHTML = tiers.map(t => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.05)">
      <span style="font-size:18px;width:26px;text-align:center;flex-shrink:0">${t.icon}</span>
      <span style="font-family:'DM Mono',monospace;font-weight:700;font-size:13px;color:${t.color};width:58px;flex-shrink:0">${t.name}</span>
      <span style="font-family:'DM Mono',monospace;font-size:11px;color:rgba(255,255,255,.45);flex:1">${t.range}</span>
      ${t.req ? `<span style="font-family:'DM Mono',monospace;font-size:9px;color:rgba(255,255,255,.25);white-space:nowrap">${t.req}</span>` : ''}
    </div>`).join('');

  const overlay = document.createElement('div');
  overlay.id = 'sharpExplainerOverlay';
  overlay.style.cssText = `
    position:fixed;inset:0;
    background:rgba(0,0,0,.82);
    z-index:10000;
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:flex-end;
    backdrop-filter:blur(4px);
    -webkit-backdrop-filter:blur(4px);
  `;
  overlay.onclick = e => { if(e.target === overlay) closeExplainer(); };

  // Use a fully self-contained layout: header + scroll + footer all inside one flex column
  // Height is capped so it never overflows on mobile Safari
  overlay.innerHTML = `
    <div id="sharpExplainerSheet" onclick="event.stopPropagation()" style="
      width:min(520px,100%);
      height:80%;
      max-height:80%;
      background:#090e16;
      border:1px solid rgba(0,229,255,.14);
      border-bottom:none;
      border-radius:20px 20px 0 0;
      display:flex;
      flex-direction:column;
      box-shadow:0 -24px 80px rgba(0,0,0,.7);
      overflow:hidden;
    ">

      <!-- HEADER — never scrolls -->
      <div style="
        flex-shrink:0;
        padding:16px 20px 14px;
        border-bottom:1px solid rgba(255,255,255,.06);
        background:#090e16;
      ">
        <div style="width:36px;height:4px;background:rgba(255,255,255,.12);border-radius:999px;margin:0 auto 12px;"></div>
        <div style="font-family:'DM Mono',monospace;font-size:8px;letter-spacing:3px;color:#00e5ff;margin-bottom:4px">📐 RATING SYSTEM</div>
        <div style="font-size:18px;font-weight:800;line-height:1.1">What is a <span style="color:#00e5ff">Sharp Rating?</span></div>
      </div>

      <!-- BODY — scrolls -->
      <div style="
        flex:1;
        overflow-y:auto;
        -webkit-overflow-scrolling:touch;
        overscroll-behavior:contain;
        padding:20px 20px 8px;
        min-height:0;
      ">
        <div style="font-size:13px;color:rgba(255,255,255,.45);line-height:1.65;margin-bottom:22px">
          A skill-based score from <strong style="color:rgba(255,255,255,.7)">0–1000</strong> measuring your betting performance over the last 90 days. 500 = average, 600+ = profitable, 750+ = elite. No real money — just picks against real odds.
        </div>

        <div style="font-family:'DM Mono',monospace;font-size:8px;letter-spacing:2.5px;color:rgba(255,255,255,.25);margin-bottom:10px">THE 4 PILLARS</div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:24px">
          ${pillarHTML}
        </div>

        <div style="font-family:'DM Mono',monospace;font-size:8px;letter-spacing:2.5px;color:rgba(255,255,255,.25);margin-bottom:10px">TIER BREAKDOWN</div>
        <div style="background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:4px 14px 0;margin-bottom:22px">
          ${tierHTML}
        </div>

        <div style="display:flex;gap:10px;margin-bottom:22px">
          <div style="flex:1;padding:13px;background:rgba(0,229,255,.04);border:1px solid rgba(0,229,255,.12);border-radius:12px">
            <div style="font-family:'DM Mono',monospace;font-size:8px;letter-spacing:2px;color:#00e5ff;margin-bottom:5px">🔓 VERIFIED</div>
            <div style="font-size:11px;color:rgba(255,255,255,.45);line-height:1.55">20 settled singles to unlock. Verified ratings appear on the public leaderboard.</div>
          </div>
          <div style="flex:1;padding:13px;background:rgba(255,71,87,.04);border:1px solid rgba(255,71,87,.12);border-radius:12px">
            <div style="font-family:'DM Mono',monospace;font-size:8px;letter-spacing:2px;color:#ff4757;margin-bottom:5px">⚠️ DECAY</div>
            <div style="font-size:11px;color:rgba(255,255,255,.45);line-height:1.55">14+ days inactive = slight weekly rating decay. Stay active to keep your rank.</div>
          </div>
        </div>

        <div style="text-align:center;color:rgba(255,255,255,.2);font-family:'DM Mono',monospace;font-size:9px;letter-spacing:1px;padding-bottom:8px">
          Ratings recalculate daily · getsharppick.com
        </div>
      </div>

      <!-- FOOTER CLOSE BUTTON — never scrolls, always visible -->
      <div style="flex-shrink:0;padding:12px 20px 28px;background:#090e16;border-top:1px solid rgba(255,255,255,.07);">
        <button onclick="document.getElementById('sharpExplainerOverlay')?.remove();document.body.style.overflow='';" style="
          width:100%;padding:16px;border-radius:14px;
          border:1.5px solid rgba(0,229,255,.4);
          background:rgba(0,229,255,.08);
          color:#00e5ff;
          font-family:'DM Mono',monospace;font-size:13px;font-weight:800;
          letter-spacing:2px;cursor:pointer;
          -webkit-tap-highlight-color:transparent;
          touch-action:manipulation;
        ">✕  CLOSE</button>
      </div>

    </div>`;

  document.body.appendChild(overlay);

  // Animate up
  const sheet = document.getElementById('sharpExplainerSheet');
  sheet.style.transform = 'translateY(100%)';
  sheet.style.transition = 'transform 0.32s cubic-bezier(0.32,0.72,0,1)';
  requestAnimationFrame(() => requestAnimationFrame(() => { sheet.style.transform = 'translateY(0)'; }));
}

const STEAM_THRESHOLD = 1.5; // points of movement to trigger steam alert

function isSteaming(gameId){
  const hist = oddsHistory[gameId];
  if(!hist||hist.length<2) return false;
  const parseNum = s => { if(!s) return null; const m=s.match(/([+-]?\d+\.?\d*)\s*$/); return m?parseFloat(m[1]):null; };
  const current = parseNum(allGames.find(g=>g.id===gameId)?.odds?.spread);
  const opening = parseNum(hist[0].spread);
  if(current===null||opening===null) return false;
  return Math.abs(current-opening) >= STEAM_THRESHOLD;
}

function steamBadgeHTML(gameId){
  if(!isSteaming(gameId)) return '';
  return `<span class="steam-badge">🔥 STEAM</span>`;
}

// ═══════════════════════════════════════════════════════
// PUBLIC VS SHARP SPLIT
// ═══════════════════════════════════════════════════════
// Use our own pick_trends data as "public" and flag line movement as "sharp"
function pubSharpHTML(g){
  const t = cachedTrends[g.id];
  if(!t) return '';
  const sp = t.spread||{};
  const spTotal = Object.values(sp).reduce((a,b)=>a+b,0);
  if(spTotal<2) return '';

  const sides = Object.keys(sp);
  if(sides.length<2) return '';
  const [sideA, sideB] = sides;
  const pctA = Math.round((sp[sideA]||0)/spTotal*100);
  const pctB = 100-pctA;

  // If line moved against public favorite, flag as sharp action
  const hist = oddsHistory[g.id];
  const isSharpAlert = hist&&hist.length>1&&isSteaming(g.id);
  const publicFav = pctA>=pctB ? sideA : sideB;
  const sharpNote = isSharpAlert ? ` · ⚡ Sharp vs ${publicFav}` : '';

  return `<div class="pub-sharp-wrap">
    <div class="pub-sharp-label-row">
      <span>PUBLIC ${pctA}%</span>
      <span>${pctB}% PUBLIC${sharpNote}</span>
    </div>
    <div class="pub-sharp-bar">
      <div class="pub-sharp-public" style="width:${pctA}%"></div>
      <div class="pub-sharp-sharp" style="width:${pctB}%"></div>
    </div>
    <div class="pub-sharp-counts">
      <span class="pub-sharp-public-cnt">${sideA.split(' ').slice(-1)[0]} ${sp[sideA]||0} picks</span>
      <span class="pub-sharp-sharp-cnt">${sp[sideB]||0} picks ${sideB.split(' ').slice(-1)[0]}</span>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════
// DAILY PROP CHALLENGE
// ═══════════════════════════════════════════════════════
// CHALLENGE_KEY hoisted to top

// todayKey() defined at top of file — duplicate removed

async function loadDailyChallenge(){
  // Pick the featured prop — prefer NBA/NFL, expand to MLB/NHL on off-days
  let game = allGames.find(g=>g.isPre&&(g.leagueLabel.includes('NBA')||g.leagueLabel.includes('NFL')));
  if(!game) game = allGames.find(g=>g.isPre&&(g.leagueLabel.includes('MLB')||g.leagueLabel.includes('NHL')));
  if(!game) game = allGames.find(g=>g.isPre); // any pre-game as last resort
  if(!game) return null;

  // Try to pull live roster players so the challenge always uses real active players
  const lg = LEAGUES.find(l=>l.league===game.league);
  let player = null, stat = 'Points', line = 24.5;

  if(lg){
    try{
      const [awayRoster, homeRoster] = await Promise.all([
        fetchTeamRoster(lg.sport, lg.league, game.away.id, game.away.name, game.away.logo),
        fetchTeamRoster(lg.sport, lg.league, game.home.id, game.home.name, game.home.logo),
      ]);
      // Gather all players from both rosters
      const allPlayers = [
        ...((awayRoster?.players)||[]),
        ...((homeRoster?.players)||[]),
      ].filter(p => p?.name && p.name !== 'TBD');

      if(allPlayers.length){
        // Pick a player deterministically by date so it's stable for the whole day
        const seed = parseInt(todayKey().replace(/-/g,''))%allPlayers.length;
        const picked = allPlayers[seed];
        player = picked.name;
        // Use season avg to set a realistic line
        const pts = parseFloat(picked.stats?.pts) || 0;
        if(pts > 5){
          stat = 'Points';
          line = Math.round(pts * 2 - 1) / 2; // round to nearest 0.5
        }
      }
    }catch(e){ console.warn('[DailyChallenge] roster fetch failed:', e?.message); }
  }

  // Fallback if roster fetch failed
  if(!player){
    const seed = parseInt(todayKey().replace(/-/g,''))%100;
    const fallbackStats = ['Points','Assists','Rebounds'];
    const fallbackLines = [22.5, 24.5, 27.5, 7.5, 5.5, 3.5];
    stat = fallbackStats[Math.floor(seed/34)%fallbackStats.length];
    line = fallbackLines[seed%fallbackLines.length];
    // Use team names as fallback player label rather than a possibly-retired star
    player = `${game.away.abbr||game.away.name} vs ${game.home.abbr||game.home.name} — Top Scorer`;
  }

  return { gameId:game.id, player, stat, line, game:game.away.name+' @ '+game.home.name, league:game.leagueLabel };
}

async function renderDailyChallenge(){
  const el = document.getElementById('dailyChallengeWrap');
  if(!el) return;
  const challenge = await loadDailyChallenge();
  if(!challenge){
    el.innerHTML=`<div style="background:rgba(255,255,255,.02);border:1px solid var(--border);border-radius:12px;padding:16px;text-align:center;font-family:'DM Mono',monospace;font-size:10px;color:var(--dim);letter-spacing:1px">No challenge today — check back before games start 🏆</div>`;
    return;
  }

  const savedKey = `${CHALLENGE_KEY}_${todayKey()}`;
  const myPick = localStorage.getItem(savedKey);

  // Count total picks from Supabase trends (use as participant proxy)
  const totalPicks = Object.values(cachedTrends).reduce((sum,t)=>{
    return sum + Object.values(t.total||{}).reduce((a,b)=>a+b,0);
  },0);
  const participants = Math.max(totalPicks, myPick?1:0);

  el.innerHTML = `<div class="challenge-banner" onclick="event.stopPropagation()">
    <div class="challenge-badge"><span class="challenge-badge-dot"></span>DAILY CHALLENGE · ${new Date().toLocaleDateString([],{weekday:'long',month:'short',day:'numeric'})}</div>
    <div class="challenge-prop">${challenge.player}</div>
    <div class="challenge-line">${challenge.stat} O/U ${challenge.line} · ${challenge.league}</div>
    <div class="challenge-picks-row" onclick="event.stopPropagation()">
      <div class="challenge-pick-btn ${myPick==='over'?'picked-over':''}" onclick="makeDailyPick('over',${JSON.stringify(challenge).replace(/"/g,"'")})">⬆ OVER ${challenge.line}</div>
      <div class="challenge-pick-btn ${myPick==='under'?'picked-under':''}" onclick="makeDailyPick('under',${JSON.stringify(challenge).replace(/"/g,"'")})">⬇ UNDER ${challenge.line}</div>
    </div>
    <div class="challenge-participants">${participants>0?participants+' pick'+(participants!==1?'s':'')+' made today':'Be the first to pick!'}</div>
  </div>`;
}

function makeDailyPick(side, challenge){
  if(!currentUser){ alert('Enter your name to pick.'); return; }
  const savedKey = `${CHALLENGE_KEY}_${todayKey()}`;
  const existing = localStorage.getItem(savedKey);

  // Toggle: if same side tapped again, remove the pick
  if(existing === side){
    localStorage.removeItem(savedKey);
    picks = picks.filter(p => !(p.gameId === challenge.gameId && p.type === 'prop' && p._isChallenge));
    savePicks();
    renderDailyChallenge();
    return;
  }

  localStorage.setItem(savedKey, side);
  renderDailyChallenge();

  const desc = `${challenge.player} ${challenge.stat} ${side==='over'?'O':'U'} ${challenge.line}`;

  // Remove any existing challenge pick for this game (e.g. switching sides)
  picks = picks.filter(p => !(p.gameId === challenge.gameId && p.type === 'prop' && p._isChallenge));

  // Use the real gameId so settlement can actually match the game.
  // _isChallenge flag identifies these picks for cleanup.
  picks.push({
    gameId: challenge.gameId,
    type: 'prop', side,
    description: desc,
    gameStr: challenge.game,
    result: 'pending',
    league: challenge.league,
    madeAt: Date.now(),
    wager: DEFAULT_WAGER, odds: -110,
    _isChallenge: true,
  });
  savePicks();
  showWinToast(`\U0001f3af Daily challenge pick: ${desc}`);
}



// ═══════════════════════════════════════════════════════
// LEAGUE CHAT
// ═══════════════════════════════════════════════════════
const CHAT_POLL_MS = 15000;
let chatPollTimer = null;
let chatMessages = {}; // leagueId -> [{id,user,name,text,ts,reactions}]

async function loadChatMessages(leagueId){
  clearInterval(chatPollTimer);
  try{
    const rows = await sbSelect('league_chat',
      `league_id=eq.${leagueId}&select=*&order=ts.asc&limit=80`);
    chatMessages[leagueId] = rows||[];
    renderChatMessages(leagueId);
  }catch(e){
    // Table might not exist yet — show create instructions
    const el = document.getElementById(`chatMessages-${leagueId}`);
    if(el) el.innerHTML = `<div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--dim);text-align:center;padding:10px">Run the chat SQL to enable this feature</div>`;
    return;
  }
  // Poll for new messages
  chatPollTimer = setInterval(()=>loadChatMessages(leagueId), CHAT_POLL_MS);
}

function renderChatMessages(leagueId){
  const el = document.getElementById(`chatMessages-${leagueId}`);
  if(!el) return;
  const msgs = chatMessages[leagueId]||[];
  if(!msgs.length){
    el.innerHTML = `<div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--dim);text-align:center;padding:10px">No messages yet — start the conversation!</div>`;
    return;
  }
  const REACTIONS = ['🔥','👀','💀','🤡','💰'];
  el.innerHTML = msgs.map(m=>{
    const isMe = m.user_id === currentUser?.id;
    const reactions = m.reactions||{};
    return `<div class="chat-msg">
      <div class="chat-avatar" style="${isMe?'background:var(--accent)':'background:#30363d'}">${(m.name||'?')[0].toUpperCase()}</div>
      <div class="chat-bubble">
        <div class="chat-name" style="${isMe?'color:var(--accent)':''}">${m.name||'Unknown'}</div>
        <div class="chat-text">${escapeHtml(m.text||'')}</div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px">
          <div class="chat-reactions">
            ${REACTIONS.map(r=>{
              const cnt = reactions[r]||0;
              const mine = (reactions[r+'_users']||[]).includes(currentUser?.id);
              return `<span class="chat-reaction${mine?' mine':''}" onclick="reactToMsg('${leagueId}','${m.id}','${r}')">${r}${cnt>0?` ${cnt}`:''}</span>`;
            }).join('')}
          </div>
          <div class="chat-time">${timeAgo(m.ts||0)}</div>
        </div>
      </div>
    </div>`;
  }).join('');
  // Scroll to bottom
  el.scrollTop = el.scrollHeight;
}

async function sendChatMessage(leagueId){
  if(!currentUser){ alert('Enter your name first.'); return; }
  const input = document.getElementById(`chatInput-${leagueId}`);
  const text = (input?.value||'').trim();
  if(!text) return;
  input.value = '';
  const msg = {
    league_id: leagueId,
    user_id: currentUser.id,
    name: currentUser.name,
    text,
    ts: Date.now(),
    reactions: {}
  };
  // Optimistic update
  if(!chatMessages[leagueId]) chatMessages[leagueId] = [];
  chatMessages[leagueId].push({...msg, id: 'temp_'+Date.now()});
  renderChatMessages(leagueId);
  try{ await sbUpsert('league_chat', msg); }
  catch(e){ console.warn('Chat send failed:', e?.message); }
  // Refresh to get server ID
  setTimeout(()=>loadChatMessages(leagueId), 500);
}

async function reactToMsg(leagueId, msgId, emoji){
  if(!currentUser) return;
  const msgs = chatMessages[leagueId]||[];
  const msg = msgs.find(m=>m.id===msgId);
  if(!msg) return;
  if(!msg.reactions) msg.reactions = {};
  const usersKey = emoji+'_users';
  if(!msg.reactions[usersKey]) msg.reactions[usersKey] = [];
  const idx = msg.reactions[usersKey].indexOf(currentUser.id);
  if(idx>=0){
    msg.reactions[usersKey].splice(idx,1);
    msg.reactions[emoji] = Math.max(0,(msg.reactions[emoji]||1)-1);
  } else {
    msg.reactions[usersKey].push(currentUser.id);
    msg.reactions[emoji] = (msg.reactions[emoji]||0)+1;
  }
  renderChatMessages(leagueId);
  try{ await sbUpsert('league_chat', {...msg}); }catch(e){ console.warn('[SharpPick] chat upsert failed:', e?.message); }
}

function escapeHtml(str){
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ═══════════════════════════════════════════════════════
// PUSH NOTIFICATIONS
// ═══════════════════════════════════════════════════════
// (moved to top) pushPermission
// (moved to top) PUSH_DISMISSED_KEY

function shouldShowPushPrompt(){
  if(pushPermission === 'granted' || pushPermission === 'denied') return false;
  if(localStorage.getItem(PUSH_DISMISSED_KEY)) return false;
  return 'Notification' in window;
}

function renderPushPrompt(){
  const existing = document.getElementById('pushPromptBanner');
  if(existing) existing.remove();
  if(!shouldShowPushPrompt()) return;

  const banner = document.createElement('div');
  banner.id = 'pushPromptBanner';
  banner.className = 'push-prompt';
  banner.innerHTML = `
    <span style="font-size:20px">🔔</span>
    <div class="push-prompt-text">
      <strong>Get notified when your picks settle</strong>
      Know the moment your parlay hits or a pick wins — no refreshing needed
    </div>
    <button class="push-enable-btn" onclick="requestPushPermission()">ENABLE</button>
    <button class="push-prompt-dismiss" onclick="dismissPushPrompt()" title="Dismiss">✕</button>`;

  // Inject below bankroll bar
  const bankrollBar = document.getElementById('bankrollBar');
  if(bankrollBar) bankrollBar.after(banner);
  else{
    const scoresView = document.getElementById('scoresView');
    if(scoresView) scoresView.prepend(banner);
  }
}

async function requestPushPermission(){
  if(!('Notification' in window)) return;
  const result = await Notification.requestPermission();
  pushPermission = result;
  document.getElementById('pushPromptBanner')?.remove();
  if(result === 'granted'){
    showWinToast('🔔 Notifications enabled! You\'ll be notified when picks settle.');
    registerServiceWorker();
  }
}

function dismissPushPrompt(){
  localStorage.setItem(PUSH_DISMISSED_KEY, '1');
  document.getElementById('pushPromptBanner')?.remove();
}

function registerServiceWorker(){
  if(!('serviceWorker' in navigator)) return;
  // Inline SW as blob since we're a single-file app
  const swCode = `
self.addEventListener('message', e => {
  if(e.data?.type === 'NOTIFY'){
    self.registration.showNotification(e.data.title, {
      body: e.data.body,
      icon: 'https://em-content.zobj.net/source/google/387/sports-medal_1f3c5.png',
      badge: 'https://em-content.zobj.net/source/google/387/sports-medal_1f3c5.png',
      tag: e.data.tag || 'pick-result',
      renotify: true
    });
  }
});`;
  const blob = new Blob([swCode], {type:'application/javascript'});
  const swUrl = URL.createObjectURL(blob);
  navigator.serviceWorker.register(swUrl).then(reg=>{
    window._swReg = reg;
    console.log('✅ Push SW registered');
  }).catch(e=>console.warn('SW register failed:', e));
}

function sendPushNotification(title, body, tag){
  if(pushPermission !== 'granted') return;
  if(window._swReg?.active){
    window._swReg.active.postMessage({type:'NOTIFY', title, body, tag});
  } else if('Notification' in window){
    new Notification(title, {body, tag});
  }
}

// Hook push into pick settlement
function notifyPickResult(pick){
  if(pushPermission !== 'granted') return;
  const result = pick.result;
  if(result === 'won'){
    const profit = pick.wager ? `+$${calcPayout(pick.wager, pick.odds||-110)}` : '';
    sendPushNotification(`✅ WIN! ${profit}`, pick.description, 'pick-won');
  } else if(result === 'lost'){
    const loss = pick.wager ? `-$${pick.wager}` : '';
    sendPushNotification(`❌ Loss ${loss}`, pick.description, 'pick-lost');
  } else if(result === 'push'){
    sendPushNotification(`↔ Push — money back`, pick.description, 'pick-push');
  }
}

// ═══════════════════════════════════════════════════════
// PROP BUILDER — browse actual game props
// ═══════════════════════════════════════════════════════
let propBuilderGameId = null;
let propBuilderProps = [];

function openPropBuilder(gameId){
  propBuilderGameId = gameId;
  const game = allGames.find(g=>g.id===gameId);
  if(!game) return;

  const overlay = document.createElement('div');
  overlay.id = 'propBuilderOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:600;display:flex;align-items:flex-end;justify-content:center;';
  overlay.onclick = e=>{ if(e.target===overlay) overlay.remove(); };

  overlay.innerHTML = `<div style="background:var(--card);border-top:1px solid var(--border);border-radius:16px 16px 0 0;width:100%;max-width:600px;max-height:80vh;overflow:hidden;display:flex;flex-direction:column;">
    <div style="padding:14px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <div style="font-weight:700;font-size:14px">Prop Builder</div>
        <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);margin-top:2px">${game.away.name} @ ${game.home.name}</div>
      </div>
      <button onclick="document.getElementById('propBuilderOverlay').remove()" style="background:none;border:none;color:var(--dim);font-size:18px;cursor:pointer">✕</button>
    </div>
    <div id="propBuilderContent" style="overflow-y:auto;padding:12px;flex:1;">
      <div style="font-family:'DM Mono',monospace;font-size:10px;color:var(--muted);text-align:center;padding:20px">Loading props…</div>
    </div>
  </div>`;

  document.body.appendChild(overlay);
  fetchAndRenderProps(gameId, game);
}

async function fetchAndRenderProps(gameId, game){
  const el = document.getElementById('propBuilderContent');
  if(!el) return;

  // Try to get props from ESPN odds endpoint
  const league = game.leagueKey||'nba';
  let props = [];
  try{
    // ESPN props endpoint
    const url = `https://sports.core.api.espn.com/v2/sports/basketball/leagues/${league}/events/${gameId}/competitions/${gameId}/odds`;
    const data = await go(url);
    // Parse player props if available
    const items = data?.items||[];
    items.forEach(item=>{
      (item.playerOdds||[]).forEach(po=>{
        (po.categories||[]).forEach(cat=>{
          (cat.props||[]).forEach(prop=>{
            props.push({
              player: po.athlete?.displayName||'Unknown',
              team: po.athlete?.teamAbbrev||'',
              stat: cat.name||prop.name||'Stat',
              line: prop.line,
              overOdds: prop.overOdds||prop.over,
              underOdds: prop.underOdds||prop.under,
              id: `${gameId}_${po.athlete?.id}_${prop.id||prop.name}`
            });
          });
        });
      });
    });
  }catch(e){}

  // Fallback: use synthetic props if ESPN returns nothing
  if(!props.length){
    const syntheticPlayers = [
      {player: game.away.name+' Player', stat:'Points', line: 22.5},
      {player: game.away.name+' Player', stat:'Assists', line: 5.5},
      {player: game.home.name+' Player', stat:'Points', line: 24.5},
      {player: game.home.name+' Player', stat:'Rebounds', line: 8.5},
    ];
    props = syntheticPlayers.map((p,i)=>({...p, overOdds:-115, underOdds:-105, id:`synth_${gameId}_${i}`}));
  }

  propBuilderProps = props;

  if(!props.length){
    el.innerHTML = `<div style="font-family:'DM Mono',monospace;font-size:10px;color:var(--dim);text-align:center;padding:20px">No props available for this game yet</div>`;
    return;
  }

  // Group by stat category
  const byStat = {};
  props.forEach(p=>{ if(!byStat[p.stat]) byStat[p.stat]=[]; byStat[p.stat].push(p); });

  el.innerHTML = Object.entries(byStat).map(([stat, players])=>`
    <div style="margin-bottom:16px">
      <div style="font-family:'DM Mono',monospace;font-size:9px;letter-spacing:2px;color:var(--muted);margin-bottom:8px">${stat.toUpperCase()}</div>
      <div class="prop-browse-grid">
        ${players.map(prop=>{
          const existingPick = picks.find(pk=>pk.gameId===prop.id&&pk.result==='pending');
          return `<div class="prop-browse-card">
            <div class="prop-browse-player">${prop.player}</div>
            <div class="prop-browse-stat">${prop.stat} · Line: ${prop.line} · ${prop.team}</div>
            <div class="prop-browse-btns">
              <div class="prop-browse-btn ${existingPick?.side==='over'?'picked':''}"
                onclick="makePropBuilderPick('${prop.id}','${prop.player}','${prop.stat}',${prop.line},'over','${gameId}')">
                ⬆ OVER ${prop.line}<br><span style="color:var(--dim)">${prop.overOdds||'−115'}</span>
              </div>
              <div class="prop-browse-btn ${existingPick?.side==='under'?'picked':''}"
                onclick="makePropBuilderPick('${prop.id}','${prop.player}','${prop.stat}',${prop.line},'under','${gameId}')">
                ⬇ UNDER ${prop.line}<br><span style="color:var(--dim)">${prop.underOdds||'−105'}</span>
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`).join('');
}

function makePropBuilderPick(propId, player, stat, line, side, gameId){
  if(!currentUser){ alert('Enter your name first.'); return; }
  const game = allGames.find(g=>g.id===gameId)||{};
  // Remove existing pick for this prop
  picks = picks.filter(p=>!(p.gameId===propId&&p.result==='pending'));
  const desc = `${player} ${side==='over'?'O':'U'} ${line} ${stat}`;
  picks.push({
    gameId: propId,
    actualGameId: gameId,
    type: 'prop', side,
    description: desc,
    gameStr: `${game.away?.name||''} @ ${game.home?.name||''}`,
    result: 'pending',
    league: game.leagueLabel||'',
    madeAt: Date.now(),
    wager: DEFAULT_WAGER, odds: -110
  });
  savePicks();
  updateBankrollUI();
  showWinToast(`🎯 Picked: ${desc}`);
  // Re-render prop builder to show picked state
  const existGame = allGames.find(g=>g.id===gameId);
  if(existGame) fetchAndRenderProps(gameId, existGame);
}

// ═══════════════════════════════════════════════════════
// CLOSING LINE VALUE (CLV)
// ═══════════════════════════════════════════════════════
function calcCLV(pick){
  // CLV = did you beat the closing line?
  // We use oddsHistory: your pick vs the last odds snapshot before game started
  const hist = oddsHistory[pick.actualGameId||pick.gameId];
  if(!hist||hist.length<2) return null;
  if(pick.type!=='spread') return null;

  const opening = hist[0]?.spread;
  const closing = hist[hist.length-1]?.spread;
  if(!opening||!closing) return null;

  // Parse spread number
  const parseSpread = s=>{ const m=(s||'').match(/([+-]?\d+\.?\d*)\s*$/); return m?parseFloat(m[1]):null; };
  const closingNum = parseSpread(closing);
  if(closingNum===null) return null;

  // Pick side: if pick.side contains home team, they got home spread, else away
  // Simplified: positive CLV if the line moved in your favor after you picked
  const openNum = parseSpread(opening);
  if(openNum===null) return null;
  const movement = closingNum - openNum;
  // If you took the favorite (negative spread) and line got shorter, positive CLV
  // This is simplified — real CLV needs to know which side you took
  return movement !== 0 ? movement.toFixed(1) : null;
}

function clvBadgeHTML(pick){
  const clv = calcCLV(pick);
  if(!clv) return '';
  const pos = parseFloat(clv) > 0;
  return `<span style="font-family:'DM Mono',monospace;font-size:8px;padding:2px 5px;border-radius:3px;background:${pos?'rgba(46,213,115,.12)':'rgba(255,71,87,.1)'};color:${pos?'#2ed573':'#ff4757'};margin-left:4px" title="Closing Line Value">CLV ${pos?'+':''}${clv}</span>`;
}

// ═══════════════════════════════════════════════════════
// ONBOARDING
// ═══════════════════════════════════════════════════════
// (moved to top) ONBOARDED_KEY

function checkOnboarding(){
  if(localStorage.getItem(ONBOARDED_KEY)) return;
  if(!currentUser) return; // wait until user sets their name
  showOnboarding();
}

function showOnboarding(){
  if(document.getElementById('onboardingModal')) return;

  const steps = [
    { icon:'<svg viewBox="0 0 80 80" width="56" height="56"><defs><linearGradient id="obLogo" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#00e5ff"/><stop offset="100%" stop-color="#00b8d4"/></linearGradient></defs><path d="M10 14 L34 40 L10 66 L20 66 L44 40 L20 14 Z" fill="url(#obLogo)"/><path d="M26 14 L50 40 L26 66 L36 66 L60 40 L36 14 Z" fill="url(#obLogo)" opacity="0.4"/></svg>', title:'Welcome to SharpPick!', body:'Pick games against real ESPN odds, track your bankroll, and compete on the leaderboard with friends.' },
    { icon:'📲', title:'Make Your Picks', body:'Tap any game card to pick the spread or total. Set your wager and add a hot take comment.' },
    { icon:'💰', title:'Manage Your Bankroll', body:'You start with $1,000. Your bankroll updates automatically as picks settle. Don\'t go broke!' },
    { icon:'🏅', title:'Compete with Friends', body:'Create or join a private league with a code to battle friends on the leaderboard. Once inside, league chat unlocks so you can trash talk.' },
    { icon:'🎰', title:'Build Parlays', body:'Add 2-12 picks to a parlay for massive payouts. Tap the 🎰 button after making picks.' },
    { icon:'📊', title:'Track Your Trends', body:'The Trends tab shows your win rate by sport, day, and pick type so you can find your edge.' },
  ];

  let step = 0;

  const modal = document.createElement('div');
  modal.id = 'onboardingModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:700;display:flex;align-items:center;justify-content:center;padding:20px;';

  function renderStep(){
    const s = steps[step];
    const progress = steps.map((_,i)=>`<div style="width:${i===step?20:6}px;height:6px;border-radius:3px;background:${i===step?'var(--accent)':'var(--border)'};transition:all .3s"></div>`).join('');
    modal.innerHTML = `<div style="background:var(--card);border:1px solid var(--border);border-radius:16px;padding:32px 24px;max-width:360px;width:100%;text-align:center;">
      <div style="font-size:48px;margin-bottom:16px">${s.icon}</div>
      <div style="font-size:18px;font-weight:800;margin-bottom:10px">${s.title}</div>
      <div style="font-size:13px;color:var(--muted);line-height:1.6;margin-bottom:24px">${s.body}</div>
      <div style="display:flex;gap:4px;justify-content:center;margin-bottom:24px">${progress}</div>
      <div style="display:flex;gap:8px;">
        ${step>0?`<button onclick="prevOnboardStep()" style="flex:1;padding:12px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--muted);font-family:'DM Mono',monospace;font-size:10px;cursor:pointer">← BACK</button>`:''}
        <button onclick="${step<steps.length-1?'nextOnboardStep()':'finishOnboarding()'}" style="flex:2;padding:12px;border-radius:8px;border:none;background:var(--accent);color:#000;font-family:'DM Mono',monospace;font-size:11px;font-weight:700;cursor:pointer">
          ${step<steps.length-1?'NEXT →':'LET\'S GO! 🚀'}
        </button>
      </div>
      ${step===0?`<button onclick="finishOnboarding()" style="margin-top:10px;background:none;border:none;color:var(--dim);font-family:'DM Mono',monospace;font-size:9px;cursor:pointer">Skip intro</button>`:''}
    </div>`;
  }

  window.nextOnboardStep = ()=>{ step = Math.min(step+1, steps.length-1); renderStep(); };
  window.prevOnboardStep = ()=>{ step = Math.max(step-1, 0); renderStep(); };
  window.finishOnboarding = ()=>{
    localStorage.setItem(ONBOARDED_KEY, '1');
    modal.remove();
    // Show push prompt after onboarding
    setTimeout(renderPushPrompt, 1000);
  };

  renderStep();
  document.body.appendChild(modal);
}

// GUEST CONVERSION NUDGE
// ═══════════════════════════════════════════════════════
const GUEST_NUDGE_KEY = 'sp_guest_nudge_shown';
function maybeShowGuestConvertNudge(){
  if(!currentUser?.isGuest) return;
  if(localStorage.getItem(GUEST_NUDGE_KEY)) return;
  const totalPicks = Array.isArray(picks) ? picks.length : 0;
  if(totalPicks !== 3) return; // fire exactly on the 3rd pick
  localStorage.setItem(GUEST_NUDGE_KEY, '1');
  setTimeout(showGuestConvertNudge, 800);
}

function showGuestConvertNudge(){
  if(document.getElementById('guestNudgeModal')) return;
  const overlay = document.createElement('div');
  overlay.id = 'guestNudgeModal';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,.82);
    z-index:800;display:flex;align-items:flex-end;justify-content:center;
    backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);
  `;
  overlay.onclick = e => { if(e.target===overlay) overlay.remove(); };
  overlay.innerHTML = `
    <div onclick="event.stopPropagation()" style="
      width:min(480px,100%);background:#0f1923;
      border:1px solid rgba(0,229,255,.18);border-bottom:none;
      border-radius:20px 20px 0 0;padding:28px 24px 36px;
      box-shadow:0 -20px 60px rgba(0,0,0,.7);
    ">
      <div style="width:36px;height:4px;background:rgba(255,255,255,.1);border-radius:99px;margin:0 auto 20px;"></div>
      <div style="font-size:28px;text-align:center;margin-bottom:12px">🔐</div>
      <div style="font-size:17px;font-weight:800;text-align:center;margin-bottom:8px">Save Your Picks!</div>
      <div style="font-size:13px;color:rgba(255,255,255,.5);text-align:center;line-height:1.6;margin-bottom:22px">
        You've made <strong style="color:#00e5ff">3 picks</strong> as a guest — but they'll disappear if you clear your browser.<br><br>
        Create a free account to save your record, appear on the leaderboard, and compete in leagues.
      </div>
      <button onclick="
        document.getElementById('guestNudgeModal')?.remove();
        document.getElementById('nameModalOverlay')?.classList.remove('hidden');
        if(typeof switchAuthTab==='function') switchAuthTab('signup');
      " style="
        width:100%;padding:14px;border-radius:12px;border:none;
        background:#00e5ff;color:#000;
        font-family:'DM Mono',monospace;font-size:12px;font-weight:800;
        letter-spacing:1px;cursor:pointer;margin-bottom:10px;
      ">🚀 CREATE FREE ACCOUNT</button>
      <button onclick="document.getElementById('guestNudgeModal')?.remove()" style="
        width:100%;padding:12px;border-radius:12px;
        border:1px solid rgba(255,255,255,.08);background:transparent;
        color:rgba(255,255,255,.4);font-family:'DM Mono',monospace;
        font-size:11px;cursor:pointer;
      ">Maybe later</button>
    </div>`;
  document.body.appendChild(overlay);
  // Animate up
  const sheet = overlay.querySelector('div');
  sheet.style.transform = 'translateY(100%)';
  sheet.style.transition = 'transform 0.32s cubic-bezier(0.32,0.72,0,1)';
  requestAnimationFrame(()=>requestAnimationFrame(()=>{ sheet.style.transform='translateY(0)'; }));
}
// ═══════════════════════════════════════════════════════
// syncInProgress hoisted to early globals
// (hoisted to early globals)
const SYNC_THROTTLE_MS = 5000;

// Normalize results
function normalizeResult(res){
  const r = String(res||'').toLowerCase().trim();
  if(!r) return 'pending';
  if(['pending','open','unsettled'].includes(r)) return 'pending';
  if(['won','win','w'].includes(r)) return 'won';
  if(['lost','loss','l'].includes(r)) return 'lost';
  if(['push','pushed','p'].includes(r)) return 'push';
  if(['void','canceled','cancelled','cancel'].includes(r)) return 'push';
  return 'pending';
}

function normalizeAllPicksInPlace(){
  if(!Array.isArray(picks)) return;
  let changed=false;
  for(const p of picks){
    const nr = normalizeResult(p.result);
    if(p.result!==nr){ p.result=nr; changed=true; }
    if(nr!=='pending' && !p.settledAt){ p.settledAt = Date.now(); changed=true; }
  }
  if(changed){
    try{ localStorage.setItem(picksKey(), JSON.stringify(picks)); }catch{}
  }
}


// Convert local pick → Supabase row
function pickToRow(p) {

  const userId = currentUser?.id;
  if (!userId) return null;

  // IMPORTANT: generate stable UUID per pick
  let id = p._syncId || p.id;

  if(!id){
    if(crypto?.randomUUID){
      id = crypto.randomUUID();
    }else{
      id = `p_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    }

    p._syncId = id;
    p.id = id;

    try{ localStorage.setItem(picksKey(), JSON.stringify(picks)); }catch{}
  }

  const res = normalizeResult(p.result);

  return {
    id,
    user_id: userId,
    game_id: p.gameId,
    actual_game_id: p.actualGameId || null,
    type: p.type || 'spread',
    side: p.side || null,
    description: p.description || null,
    game_str: p.gameStr || null,
    result: res,
    league: p.league || null,

    made_at: Number(p.madeAt) || Date.now(),

    wager: Number(p.wager) || 50,
    odds: Number(p.odds) || -110,
    confidence: Number(p.confidence) || 0,
    comment: p.comment || null,
    line: p.line ?? null,
    player_id: p.playerId || null,
    stat_key: p.statKey || null,
    parlay_legs: p.parlayLegs ? JSON.stringify(p.parlayLegs) : null,
    parlay_odds: p.parlayOdds || null,

    settled_at: (res !== 'pending'
      ? (Number(p.settledAt) || Date.now())
      : null),

    // DO NOT send updated_at — DB handles it
  };
}


// Convert Supabase row → local pick
function rowToPick(row){
  const id = row.id;

  // Reconstruct homeTeam / awayTeam from game_str if available
  // game_str format: "Away SCORE @ Home SCORE" or "Away @ Home"
  let homeTeam = '', awayTeam = '';
  if(row.game_str){
    const atIdx = row.game_str.indexOf(' @ ');
    if(atIdx !== -1){
      // Strip trailing score digits: "Yankees 3" → "Yankees"
      awayTeam = row.game_str.slice(0, atIdx).replace(/\s+\d+$/, '').trim();
      homeTeam = row.game_str.slice(atIdx + 3).replace(/\s+\d+$/, '').trim();
    }
  }

  return {
    id,
    _syncId: id,

    gameId: row.game_id,
    actualGameId: row.actual_game_id || undefined,
    type: row.type,
    side: row.side,
    description: row.description,
    gameStr: row.game_str,
    result: row.result || 'pending',
    league: row.league,

    homeTeam,
    awayTeam,

    madeAt: row.made_at,
    wager: row.wager || 50,
    odds: row.odds || -110,
    confidence: row.confidence || 0,
    comment: row.comment,
    line: row.line,

    playerId: row.player_id,
    statKey: row.stat_key,

    parlayLegs: row.parlay_legs
      ? (typeof row.parlay_legs === 'string'
        ? JSON.parse(row.parlay_legs)
        : row.parlay_legs)
      : undefined,

    parlayOdds: row.parlay_odds,

    settledAt: row.settled_at
  };
}


// Push local picks → server
async function syncPicksToServerForced(){
  // Simply resets throttle and calls the standard Netlify sync.
  // The direct PATCH approach caused 400 errors due to unknown columns.
  lastSyncAt = 0;
  syncInProgress = false;
  return syncPicksToServer();
}


async function syncPicksToServer(){
  if (!currentUser || !supaOnline) return;
  if (syncInProgress) return;

  const now = Date.now();
  // Skip throttle on the very first sync after login (_initialSyncDone is false)
  // so that a fresh mobile device gets picks pushed immediately.
  if (_initialSyncDone && now - lastSyncAt < SYNC_THROTTLE_MS) return;

  lastSyncAt = now;
  syncInProgress = true;

  try {
    const rows = picks.map(pickToRow).filter(Boolean);
    if (!rows.length){ syncInProgress = false; return; }

    // Always get the freshest token — SUPA_HDR may still have the anon key
    // if the session expired since last login (common on mobile after hours idle).
    // Try to get user token; if expired, attempt refresh first.
    let userToken = null;

    // 1. Check authSession in memory
    if (typeof authSession !== 'undefined' && authSession?.access_token) {
      userToken = authSession.access_token;
    }

    // 2. Check localStorage
    if (!userToken) {
      userToken = localStorage.getItem('sb_token');
    }

    // 3. Decode and check expiry — refresh if within 5 min of expiring
    if (userToken) {
      try {
        const payload = JSON.parse(atob(userToken.split('.')[1]));
        const expiry = payload.exp * 1000;
        if (Date.now() >= expiry - 300000) {
          // Token expired or expiring soon — try to refresh
          console.log('[SharpPick] syncPicksToServer: token expiring, refreshing...');
          const refreshed = await restoreAuthSession();
          if (refreshed) {
            userToken = localStorage.getItem('sb_token');
          } else {
            console.warn('[SharpPick] syncPicksToServer: token refresh failed — picks not synced');
            syncInProgress = false;
            return;
          }
        }
      } catch(e) {
        console.warn('[SharpPick] syncPicksToServer: token decode failed', e?.message);
      }
    }

    if (!userToken) {
      console.warn('[SharpPick] syncPicksToServer: no auth token available');
      syncInProgress = false;
      return;
    }

    // Write directly to Supabase with the user's auth token (not anon key).
    // Bypasses the Netlify function which was failing silently on mobile Safari.
    const authHeaders = {
      'apikey': SUPA_KEY,
      'Authorization': 'Bearer ' + userToken,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    };

    const BATCH = 50;
    let anySuccess = false;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const r = await fetch(`${SUPA_REST}/user_picks`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(batch),
      });
      if (!r.ok) {
        const txt = await r.text().catch(()=>'');
        if (r.status === 401) {
          console.warn('[SharpPick] syncPicksToServer: 401 — token rejected by Supabase');
          break;
        }
        console.warn(`[SharpPick] syncPicksToServer: HTTP ${r.status}`, txt.slice(0,200));
      } else {
        markSupaOk();
        anySuccess = true;
      }
    }

    if (anySuccess) {
      try{ notifyPicksChanged(); }catch{}
      console.log(`[SharpPick] ✅ syncPicksToServer: pushed ${rows.length} picks`);
    }

  } catch(e) {
    if (supaOnline !== false) console.warn('[SharpPick] syncPicksToServer failed:', e?.message);
  } finally {
    syncInProgress = false;
  }
}

// Pull picks from Supabase and merge with local
async function syncPicksFromServer(showIndicator = false) {
  if (!currentUser || !supaOnline) return false;

  try {
    if (showIndicator) showSyncIndicator('syncing');

    const rows = await sbSelect(
      'user_picks',
      `user_id=eq.${currentUser.id}&select=*&order=made_at.desc&limit=500`
    );

    if (!rows?.length) {
      if (showIndicator) showSyncIndicator('ok');
      _initialSyncDone = true;
      return false;
    }

    const serverPicks = rows.map(rowToPick);
    let merged = false;

    // If local picks is empty (fresh device/browser), trust the server completely
    const freshDevice = picks.length === 0;

    // Merge strategy: server wins on settled result; local wins on pending
    serverPicks.forEach(sp => {
      const localIdx = picks.findIndex(lp =>
        lp.gameId === sp.gameId && lp.type === sp.type && lp.side === sp.side
      );

      if (localIdx === -1) {
        // Always pull picks from server that aren't already in local storage.
        // Previously this was gated to only pull pending picks on non-fresh devices,
        // which caused the bankroll to diverge between desktop and mobile because
        // settled picks made on one device were never imported on the other.
        picks.push(sp);
        merged = true;
        return;
      }

      const lp = picks[localIdx];

      // Sync the server's canonical _syncId onto the local pick so future pushes
      // use the same UUID and don't create duplicate rows on the server.
      if (sp.id && lp._syncId !== sp.id) {
        picks[localIdx]._syncId = sp.id;
        picks[localIdx].id = sp.id;
        merged = true;
      }

      // Apply server settlement if local is still pending
      if (normalizeResult(lp.result) === 'pending' && normalizeResult(sp.result) !== 'pending') {
        const wasPending = normalizeResult(lp.result) === 'pending';
        picks[localIdx] = { ...lp, result: normalizeResult(sp.result), settledAt: sp.settledAt || Date.now() };
        merged = true;

        if (wasPending) {
          try { showWinCelebration(picks[localIdx]); } catch {}
          try { notifyPickResult(picks[localIdx]); } catch {}
        }
      }

      // Sync wager + odds from server — these directly affect bankroll calculation.
      // If the user changed their wager on desktop, mobile must use the same value
      // or the bankroll will show a different number on each device.
      if (sp.wager && sp.wager !== lp.wager) {
        picks[localIdx].wager = sp.wager;
        merged = true;
      }
      if (sp.odds && sp.odds !== lp.odds) {
        picks[localIdx].odds = sp.odds;
        merged = true;
      }

      // Pull comment/confidence from server if local missing
      if (!lp.comment && sp.comment) { picks[localIdx].comment = sp.comment; merged = true; }
      if ((!lp.confidence || lp.confidence === 0) && sp.confidence) { picks[localIdx].confidence = sp.confidence; merged = true; }
    });

    if (merged) {
      try { localStorage.setItem(picksKey(), JSON.stringify(picks)); } catch {}
      updateRecordUI();
      renderPicksPanel();
      updateBankrollUI?.();
      renderScores?.();
      // If any newly merged picks are still pending, try to settle them now.
      // This handles the case where a pick was made on another device and the
      // game has since finished — without this the pick sits pending indefinitely.
      const hasPending = picks.some(p => normalizeResult(p.result) === 'pending');
      if (hasPending) {
        setTimeout(() => {
          try { checkPickResults(); checkParlayResults(); } catch {}
          // Also fetch historical ESPN scores for picks whose game is no longer live
          fetchAndResettleHistoricalPicks(true).catch(() => {});
        }, 500);
      }
    }

    if (showIndicator) showSyncIndicator('ok');
    _initialSyncDone = true;
    // Always refresh bankroll after sync completes — even if no picks changed,
    // the rebuys may have synced from server changing the base balance
    updateBankrollUI?.();
    renderBestBetCard?.(); // re-render now that sync is done

    // If the server has significantly fewer picks than local, it means many picks
    // never got uploaded (common after RLS was blocking writes). Force push everything.
    if (picks.length > 0 && rows.length < picks.length * 0.8) {
      console.log(`[SharpPick] Server has ${rows.length} picks but local has ${picks.length} — force pushing all picks`);
      setTimeout(() => { lastSyncAt = 0; syncInProgress = false; syncPicksToServer(); }, 500);
    }

    return merged;
  } catch (e) {
    console.warn('Pick sync from server failed:', e?.message || e);
    if (showIndicator) showSyncIndicator('error');
    _initialSyncDone = true; // even on failure, ungate so UI shows
    renderBestBetCard?.();
    return false;
  }
}


// ─────────────────────────────────────────────────────────────
// Realtime listener for picks (refresh UI when DB changes)
let picksRealtimeSub = null;

// Cross-tab / cross-window pick sync fallback (helps when Realtime events are missed during init)
// _pendingPickSync hoisted to early globals
let _picksBC = null;

function initPickSyncChannels(){
  try{
    // BroadcastChannel (modern browsers)
    if(typeof BroadcastChannel !== 'undefined'){
      if(_picksBC) try{ _picksBC.close(); }catch{}
      _picksBC = new BroadcastChannel('sharppick:picks');
      _picksBC.onmessage = async (ev)=>{
        const msg = ev?.data || {};
        if(msg?.type !== 'picks_changed') return;
        if(!currentUser?.id) { _pendingPickSync = true; return; }
        await syncPicksFromServer(false);
        renderPicksPanel?.();
        updateRecordUI?.();
        renderScores?.();
        renderHistoryView?.();
        // Leaderboard ratings are server-computed — no refresh needed on pick sync
      };
    }

    // localStorage event fallback (works across tabs even without BroadcastChannel)
    window.addEventListener('storage', async (e)=>{
      if(e.key !== 'sharppick:picks_changed') return;
      if(!currentUser?.id) { _pendingPickSync = true; return; }
      await syncPicksFromServer(false);
      renderPicksPanel?.();
      updateRecordUI?.();
      renderScores?.();
      renderHistoryView?.();
    });

    // When the tab becomes visible again, re-sync once and attempt resettlement
    document.addEventListener('visibilitychange', ()=>{
      if(document.visibilityState === 'visible'){
        try{ syncPicksFromServer(false); }catch{}
        // Also attempt to settle any picks that are still pending
        setTimeout(() => {
          try { checkPickResults(); checkParlayResults(); } catch {}
          fetchAndResettleHistoricalPicks().catch(() => {});
        }, 1500);
      }
    });
    window.addEventListener('focus', ()=>{ try{ syncPicksFromServer(false); }catch{}; });
  }catch(e){}
}

function notifyPicksChanged(){
  try{ localStorage.setItem('sharppick:picks_changed', String(Date.now())); }catch{}
  try{ _picksBC?.postMessage({ type:'picks_changed', ts: Date.now() }); }catch{}
}

// ── Background pick sync timer ───────────────────────────────────
// Polls the server every 60s so picks made on another device (phone → desktop)
// show up without requiring a tab focus or manual refresh.
let _bgSyncTimer = null;
const BG_SYNC_INTERVAL_MS = 60_000; // 60 seconds

function startBackgroundPickSync(){
  if(_bgSyncTimer) return; // already running
  _bgSyncTimer = setInterval(async ()=>{
    if(!currentUser || !supaOnline) return;
    try{
      const prevBankroll = computeBankroll();
      const merged = await syncPicksFromServer(false);
      // If new picks arrived, also sync rebuy count in case it changed
      if(merged){
        await syncRebuyCountFromServer();
        const newBankroll = computeBankroll();
        if(newBankroll !== prevBankroll){
          console.log(`[SharpPick] Background sync: bankroll updated $${prevBankroll} → $${newBankroll}`);
        }
      }
    }catch(e){
      console.warn('[SharpPick] Background sync error:', e?.message);
    }
  }, BG_SYNC_INTERVAL_MS);
  console.log('[SharpPick] Background pick sync started (60s interval)');
}

function stopBackgroundPickSync(){
  if(_bgSyncTimer){ clearInterval(_bgSyncTimer); _bgSyncTimer = null; }
}


function startPicksRealtime() {
  try {
    console.log('🔄 startPicksRealtime: using poll-based sync (no supabase-js client loaded)');

    // Stop any existing poller
    stopPicksRealtime();

    // Poll for pick changes every 15 seconds while tab is visible
    // This replaces Supabase Realtime which requires the supabase-js library
    const POLL_INTERVAL = 15000;

    function doPoll() {
      if(!currentUser?.id) return;
      if(document.visibilityState === 'hidden') return; // save bandwidth when tab hidden
      syncPicksFromServer(false).then((merged) => {
        // Only update UI if picks actually changed — avoids unnecessary flicker every 15s
        if(merged){
          renderPicksPanel?.();
          updateRecordUI?.();
          renderScores?.();
          // Note: leaderboard ratings are computed server-side on a schedule,
          // NOT updated by pick sync — so no leaderboard refresh needed here.
        }
      }).catch(() => {}); // silent fail — next poll will retry
    }

    picksRealtimeSub = setInterval(doPoll, POLL_INTERVAL);

    // Also sync immediately on first call
    setTimeout(doPoll, 500);

  } catch (e) {
    console.warn('Realtime poll setup error:', e?.message || e);
  }
}

function stopPicksRealtime() {
  try {
    if (picksRealtimeSub) clearInterval(picksRealtimeSub);
  } catch {}
  picksRealtimeSub = null;
}
// ═══════════════════════════════════════════════════════
// APP HERO
// ═══════════════════════════════════════════════════════
// (moved to top) HERO_DISMISSED_KEY
function initHero(){
  const hero = document.getElementById('appHero');
  if(!hero) return;
  if(localStorage.getItem(HERO_DISMISSED_KEY)){
    hero.style.display = 'none';
  } else {
    // Animate counters on landing page
    initLandingCounters();
  }
}
function dismissHero(){
  localStorage.setItem(HERO_DISMISSED_KEY,'1');
  const hero = document.getElementById('appHero');
  if(hero){
    hero.style.transition='opacity .4s ease, transform .4s ease';
    hero.style.opacity='0';
    hero.style.transform='translateY(-30px)';
    setTimeout(()=>hero.style.display='none',400);
  }
}
function initLandingCounters(){
  const counters = document.querySelectorAll('.lp-count');
  if(!counters.length) return;
  const observer = new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if(entry.isIntersecting){
        const el = entry.target;
        const target = parseInt(el.dataset.target)||0;
        const duration = 1800;
        const start = performance.now();
        function tick(now){
          const elapsed = now - start;
          const progress = Math.min(elapsed/duration, 1);
          const eased = 1 - Math.pow(1-progress, 3);
          el.textContent = Math.round(target * eased);
          if(progress < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
        observer.unobserve(el);
      }
    });
  }, {threshold:0.3});
  counters.forEach(function(c){ observer.observe(c); });
}

// ═══════════════════════════════════════════════════════
// PUBLIC PROFILES
// ═══════════════════════════════════════════════════════
// ── FOLLOW SYSTEM ────────────────────────────────────────────────
const FOLLOWS_KEY = () => `sp_follows_${currentUser?.id||'anon'}`;

function loadFollowing(){
  try{ return new Set(JSON.parse(localStorage.getItem(FOLLOWS_KEY())||'[]')); }
  catch{ return new Set(); }
}
function saveFollowing(set){
  try{ localStorage.setItem(FOLLOWS_KEY(), JSON.stringify([...set])); }catch{}
  // Sync to Supabase
  if(currentUser?.id && supaOnline){
    sbUpsert('user_follows', {
      user_id: currentUser.id,
      following: JSON.stringify([...set]),
      updated_at: Date.now()
    }).catch(()=>{});
  }
}
function isFollowing(userId){ return loadFollowing().has(userId); }
function toggleFollow(userId, userName){
  if(!currentUser){ showAuthPrompt('follow pickers'); return; }
  const set = loadFollowing();
  if(set.has(userId)){
    set.delete(userId);
    showWinToast(`Unfollowed ${userName}`);
  } else {
    set.add(userId);
    showWinToast(`✅ Following ${userName} — you'll see their picks in Feed`);
  }
  saveFollowing(set);
  // Re-render profile overlay follow button if open
  const followBtn = document.getElementById('followBtn_'+userId);
  if(followBtn){
    const nowFollowing = set.has(userId);
    followBtn.textContent = nowFollowing ? '✓ FOLLOWING' : '+ FOLLOW';
    followBtn.style.background = nowFollowing ? 'rgba(46,213,115,.1)' : 'rgba(0,229,255,.08)';
    followBtn.style.borderColor = nowFollowing ? 'rgba(46,213,115,.3)' : 'rgba(0,229,255,.2)';
    followBtn.style.color = nowFollowing ? '#2ed573' : '#00e5ff';
  }
}

async function syncFollowsFromServer(){
  try{
    if(!currentUser?.id || !supaOnline) return;
    const rows = await sbSelect('user_follows', `user_id=eq.${currentUser.id}&select=following`);
    if(!rows?.[0]?.following) return;
    const serverFollows = new Set(JSON.parse(rows[0].following||'[]'));
    const local = loadFollowing();
    const merged = new Set([...local, ...serverFollows]);
    if(merged.size !== local.size){
      localStorage.setItem(FOLLOWS_KEY(), JSON.stringify([...merged]));
      console.log('[SharpPick] Follows synced from server:', merged.size);
    }
  }catch(e){ console.warn('[Follows] sync failed:', e?.message); }
}


function openProfile(entry){
  if(!entry) return;
  const existing = document.getElementById('profileOverlay');
  if(existing) existing.remove();

  const isMe = entry.id === currentUser?.id;
  const decided = (entry.w||0)+(entry.l||0);
  const pct = decided>0 ? Math.round((entry.w||0)/decided*100) : 0;
  const bankroll = isMe ? computeBankroll() : (entry.bankroll||1000);
  const ratingsSnap = (isMe && typeof computeRatingsDaily==='function') ? computeRatingsDaily() : null;
  const pnl = bankroll - 1000;
  const pnlStr = (pnl>=0?'+':'')+pnl.toLocaleString();
  const pnlColor = pnl>0?'#2ed573':pnl<0?'#ff4757':'var(--muted)';

  // Build form breakdown from recentPicks
  const rp = entry.recentPicks||[];
  const byType = {spread:{w:0,l:0},total:{w:0,l:0},prop:{w:0,l:0},parlay:{w:0,l:0}};
  rp.forEach(p=>{ const t=p.type||'spread'; if(byType[t]){ if(p.result==='won') byType[t].w++; else if(p.result==='lost') byType[t].l++; }});
  const typeRows = Object.entries(byType).filter(([,v])=>v.w+v.l>0).map(([t,v])=>{
    const d=v.w+v.l; const p2=Math.round(v.w/d*100);
    return `<div class="profile-form-row"><span class="profile-form-label">${t.toUpperCase()}</span><span class="profile-form-val" style="color:${p2>=55?'#2ed573':p2<=40?'#ff4757':'var(--text)'}">${v.w}-${v.l} (${p2}%)</span></div>`;
  }).join('');

  // Recent form dots
  const form = rp.slice(-10).reverse().map(p=>`<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.result==='won'?'#2ed573':p.result==='lost'?'#ff4757':'var(--gold)'}"></span>`).join('');

  // H2H vs me
  const myPicks = picks.filter(p=>normalizeResult(p.result)!=='pending');
  const h2hWins = rp.filter(tp=> myPicks.some(mp=>mp.gameId===(tp.gameId||'') && mp.type===tp.type && mp.result==='won' && tp.result==='lost')).length;
  const h2hLosses = rp.filter(tp=> myPicks.some(mp=>mp.gameId===(tp.gameId||'') && mp.type===tp.type && mp.result==='lost' && tp.result==='won')).length;

  // Lock body scroll on mobile
  const _pScrollY = window.scrollY;
  document.body.style.overflow = 'hidden';
  document.body.style.position = 'fixed';
  document.body.style.top = `-${_pScrollY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.dataset.profileScrollY = _pScrollY;

  function _closeProfileOverlay(){
    const ov = document.getElementById('profileOverlay');
    if(ov) ov.remove();
    const sy = parseInt(document.body.dataset.profileScrollY || '0');
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    window.scrollTo(0, sy);
  }

  const overlay = document.createElement('div');
  overlay.id = 'profileOverlay';
  overlay.className = 'profile-overlay';
  overlay.onclick = e => { if(e.target===overlay) _closeProfileOverlay(); };

  overlay.innerHTML = `<div class="profile-sheet">
    <div class="profile-hero">
      <div class="profile-avatar-lg" style="${isMe?'background:var(--accent);color:#000':'background:#30363d'}">${(entry.name||'?')[0].toUpperCase()}</div>
      <div class="profile-name">${entry.name||'Unknown'}</div>
      <div class="profile-tagline">${isMe?'YOUR PROFILE':'PICKER PROFILE'} · ${entry.total||0} PICKS ALL TIME</div>
    </div>

    <div class="profile-stats-row">
      <div class="profile-stat">
        <div class="profile-stat-val" style="color:${pct>=55?'#2ed573':pct<=40?'#ff4757':'var(--text)'}">${pct}%</div>
        <div class="profile-stat-lbl">WIN RATE</div>
      </div>
      <div class="profile-stat">
        <div class="profile-stat-val">${entry.w||0}-${entry.l||0}</div>
        <div class="profile-stat-lbl">RECORD</div>
      </div>
      <div class="profile-stat">
        <div class="profile-stat-val" style="color:${pnlColor}">$${Math.abs(pnl).toLocaleString()}</div>
        <div class="profile-stat-lbl">${pnl>=0?'PROFIT':'DOWN'}</div>
      </div>
      <div class="profile-stat">
        <div class="profile-stat-val" style="color:${pnlColor}">$${bankroll.toLocaleString()}</div>
        <div class="profile-stat-lbl">BANKROLL</div>
      </div>
    </div>

    ${form ? `<div class="profile-section">
      <div class="profile-section-title">RECENT FORM</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">${form}</div>
    </div>` : ''}

    ${typeRows ? `<div class="profile-section" style="padding-top:0">
      <div class="profile-section-title">BY TYPE</div>
      ${typeRows}
    </div>` : ''}

    ${!isMe && currentUser ? `<div class="profile-section" style="padding-top:0">
      <div class="profile-section-title">HEAD TO HEAD VS YOU</div>
      <div class="profile-form-row">
        <span class="profile-form-label">On same games</span>
        <span class="profile-form-val">${h2hWins>h2hLosses?'You lead':'They lead'}: ${Math.max(h2hWins,h2hLosses)}-${Math.min(h2hWins,h2hLosses)}</span>
      </div>
    </div>` : ''}

    ${!isMe && currentUser ? `
      <div style="display:flex;gap:8px;padding:0 16px 12px">
        <button id="followBtn_${entry.id}" onclick="toggleFollow('${entry.id}','${entry.name.replace(/'/g,"\'")}');event.stopPropagation()"
          style="flex:1;padding:10px;border-radius:8px;font-family:'DM Mono',monospace;font-size:10px;font-weight:700;cursor:pointer;letter-spacing:1px;border:1px solid;transition:all .2s;
          background:${isFollowing(entry.id)?'rgba(46,213,115,.1)':'rgba(0,229,255,.08)'};
          border-color:${isFollowing(entry.id)?'rgba(46,213,115,.3)':'rgba(0,229,255,.2)'};
          color:${isFollowing(entry.id)?'#2ed573':'#00e5ff'}">
          ${isFollowing(entry.id)?'✓ FOLLOWING':'+ FOLLOW'}
        </button>
        <button onclick="startBattle('${entry.id}','${entry.name}');_closeProfileOverlay();setMode('battles')"
          style="flex:1;padding:10px;border-radius:8px;font-family:'DM Mono',monospace;font-size:10px;font-weight:700;cursor:pointer;letter-spacing:1px;border:1px solid var(--border);background:var(--card);color:var(--muted)">
          ⚔️ CHALLENGE
        </button>
      </div>` : ''}

    <div style="padding:0 16px 8px">
      <button onclick="_closeProfileOverlay();openPlayerCard(${JSON.stringify(entry).replace(/"/g,'&quot;')})" style="width:100%;padding:12px;background:linear-gradient(135deg,rgba(0,229,255,.12),rgba(0,229,255,.04));border:1px solid rgba(0,229,255,.25);border-radius:8px;color:#00e5ff;font-family:'DM Mono',monospace;font-size:11px;font-weight:700;cursor:pointer;letter-spacing:1px">📤 SHARE PLAYER CARD</button>
      <button onclick="(()=>{ const url='https://getsharppick.com/u/'+encodeURIComponent(('${entry.name}').replace(/\\s+/g,'')).toLowerCase(); navigator.clipboard?.writeText(url).then(()=>showWinToast('🔗 Profile link copied!')).catch(()=>{ prompt('Copy this link:',url); }); })()" style="width:100%;padding:10px;background:var(--card);border:1px solid var(--border);border-radius:8px;color:var(--muted);font-family:'DM Mono',monospace;font-size:10px;cursor:pointer;margin-top:6px">🔗 COPY PROFILE LINK</button>
    </div>

    <div style="padding:0 16px 20px">
      <button onclick="_closeProfileOverlay()" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--muted);font-family:'DM Mono',monospace;font-size:10px;cursor:pointer">CLOSE</button>
    </div>
  </div>`;

  document.body.appendChild(overlay);
}

// ═══════════════════════════════════════════════════════
// PERSONAL EDGE FINDER
// ═══════════════════════════════════════════════════════
function renderEdgeFinder(){
  // Edge finder is part of trends dashboard — called from renderTrendsDashboard
  const settled = picks.filter(p=>normalizeResult(p.result)!=='pending'&&p.result!=='push');
  const insights = [];

  // Helper
  const pct=(w,l)=>w+l>0?Math.round(w/(w+l)*100):null;
  const edge=(w,l)=>{ const p=pct(w,l); return p!==null?p-50:null; };

  // 1. Best/worst league
  const byLeague={};
  settled.forEach(p=>{
    const lg=p.league||'Other';
    if(!byLeague[lg]) byLeague[lg]={w:0,l:0};
    if(p.result==='won') byLeague[lg].w++; else byLeague[lg].l++;
  });
  const leagueEdges=Object.entries(byLeague).filter(([,v])=>v.w+v.l>=5);
  if(leagueEdges.length){
    const best=leagueEdges.sort(([,a],[,b])=>pct(b.w,b.l)-pct(a.w,a.l))[0];
    const worst=leagueEdges.sort(([,a],[,b])=>pct(a.w,a.l)-pct(b.w,b.l))[0];
    const [bl,bv]=best; const bp=pct(bv.w,bv.l);
    const [wl,wv]=worst; const wp=pct(wv.w,wv.l);
    if(bp>=55) insights.push({type:'hot',title:`🔥 Your ${bl} edge`,sub:`${bv.w}-${bv.l} record`,body:`You win ${bp}% of your ${bl} picks — significantly above average. Lean into this.`,pct:bp});
    if(wp<=40) insights.push({type:'cold',title:`❄️ Avoid ${wl}`,sub:`${wv.w}-${wv.l} record`,body:`You're only hitting ${wp}% on ${wl} picks. Consider skipping these or reducing your wager size.`,pct:wp});
  }

  // 2. Best pick type
  const byType={spread:{w:0,l:0},total:{w:0,l:0},prop:{w:0,l:0}};
  settled.forEach(p=>{ const t=p.type||'spread'; if(byType[t]){ if(p.result==='won') byType[t].w++; else byType[t].l++; }});
  const typeEdges=Object.entries(byType).filter(([,v])=>v.w+v.l>=5);
  if(typeEdges.length){
    const bestType=typeEdges.sort(([,a],[,b])=>pct(b.w,b.l)-pct(a.w,a.l))[0];
    const [bt,bv]=bestType; const bp=pct(bv.w,bv.l);
    if(bp>=55) insights.push({type:'hot',title:`💡 Stick to ${bt}s`,sub:`${bv.w}-${bv.l} on ${bt}s`,body:`You're hitting ${bp}% on ${bt} picks. This is your bread and butter.`,pct:bp});
  }

  // 3. Best day of week
  const byDay={};
  settled.forEach(p=>{
    const d=new Date(p.madeAt).getDay();
    if(!byDay[d]) byDay[d]={w:0,l:0};
    if(p.result==='won') byDay[d].w++; else byDay[d].l++;
  });
  const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dayEdges=Object.entries(byDay).filter(([,v])=>v.w+v.l>=3);
  if(dayEdges.length){
    const bestDay=dayEdges.sort(([,a],[,b])=>pct(b.w,b.l)-pct(a.w,a.l))[0];
    const [d,dv]=bestDay; const dp=pct(dv.w,dv.l);
    if(dp>=58) insights.push({type:'hot',title:`📅 ${dayNames[d]} is your day`,sub:`${dv.w}-${dv.l} on ${dayNames[d]}s`,body:`You win ${dp}% of picks made on ${dayNames[d]}. Load up your slate.`,pct:dp});
  }

  // 4. Wager sizing insight
  const bigWagers=settled.filter(p=>p.wager&&p.wager>=100);
  const smallWagers=settled.filter(p=>p.wager&&p.wager<100);
  if(bigWagers.length>=5&&smallWagers.length>=5){
    const bigPct=pct(bigWagers.filter(p=>p.result==='won').length,bigWagers.filter(p=>p.result==='lost').length);
    const smPct=pct(smallWagers.filter(p=>p.result==='won').length,smallWagers.filter(p=>p.result==='lost').length);
    if(bigPct!==null&&smPct!==null&&bigPct>smPct+10){
      insights.push({type:'hot',title:'💰 Bet bigger when confident',sub:`${bigPct}% on $100+ bets vs ${smPct}% on smaller`,body:`Your win rate on larger bets is ${bigPct-smPct} points higher. Your instincts are good when you size up.`,pct:bigPct});
    } else if(smPct!==null&&bigPct!==null&&smPct>bigPct+10){
      insights.push({type:'neutral',title:'⚠️ Shrink your big bets',sub:`Only ${bigPct}% on $100+ bets`,body:`You're actually worse on your bigger bets. Consider capping wagers at $75 until your larger picks improve.`,pct:bigPct});
    }
  }

  // 5. Tonight's games that match your edges
  const tonightGames=allGames.filter(g=>g.isPre);
  const edgeLeagues=Object.entries(byLeague).filter(([,v])=>pct(v.w,v.l)>=55).map(([lg])=>lg);
  const tonightEdge=tonightGames.filter(g=>edgeLeagues.some(lg=>g.leagueLabel?.includes(lg)));
  if(tonightEdge.length&&edgeLeagues.length){
    insights.push({type:'tonight',title:`🎯 ${tonightEdge.length} game${tonightEdge.length!==1?'s':''} in your wheelhouse tonight`,sub:tonightEdge.map(g=>`${g.away.name} @ ${g.home.name}`).join(' · ').slice(0,80),body:`Tonight has games in ${edgeLeagues.join(', ')} — leagues where you have a proven edge. Prime time to pick.`,pct:null});
  }

  if(!insights.length){
    return `<div style="color:var(--dim);font-family:'DM Mono',monospace;font-size:10px;text-align:center;padding:20px">Make at least 5 settled picks to unlock your edge analysis</div>`;
  }

  return insights.map(ins=>`<div class="edge-insight ${ins.type==='tonight'?'edge-tonight':ins.type}">
    <div class="edge-insight-title">${ins.title}</div>
    <div class="edge-insight-sub">${ins.sub}</div>
    <div class="edge-insight-body">
      ${ins.pct!==null?`<span class="edge-pct-pill ${ins.type}">${ins.pct}%</span>`:''}
      ${ins.body}
    </div>
  </div>`).join('');
}

// ═══════════════════════════════════════════════════════
// PICK BATTLES
// ═══════════════════════════════════════════════════════
const BATTLES_KEY = 'pick_battles';

function loadBattles(){
  try{ return JSON.parse(localStorage.getItem(BATTLES_KEY)||'[]'); }catch{ return []; }
}
function saveBattles(battles){
  localStorage.setItem(BATTLES_KEY, JSON.stringify(battles));
  // Sync each battle as its own row so opponents can query by their user_id
  if(currentUser && supaOnline){
    battles.forEach(b => {
      const row = {
        id:              b.id || (currentUser.id + '_' + (b.opponentId||b.opponentName) + '_' + (b.startDate||'')),
        challenger_id:   currentUser.id,
        challenger_name: currentUser.name || '',
        opponent_id:     b.opponentId || null,
        opponent_name:   b.opponentName || '',
        duration_days:   b.durationDays || 7,
        start_date:      b.startDate || null,
        end_date:        b.endDate || null,
        wager_units:     b.wagerUnits || 0,
        status:          b.status || 'pending',
        updated_at:      Date.now(),
      };
      sbUpsert('pick_battles', row).catch(()=>{});
    });
  }
}

async function loadBattlesFromServer(){
  try{
    if(!currentUser?.id || !supaOnline) return;
    // Fetch battles where user is challenger OR opponent
    const [asChallenger, asOpponent] = await Promise.all([
      sbSelect('pick_battles', `challenger_id=eq.${currentUser.id}&select=*`),
      sbSelect('pick_battles', `opponent_id=eq.${currentUser.id}&select=*`),
    ]);
    const rows = [...(asChallenger||[]), ...(asOpponent||[])];
    if(!rows.length) return;
    // Convert server rows back to local battle format and merge
    const local = loadBattles();
    const localIds = new Set(local.map(b=>b.id));
    rows.forEach(r => {
      if(!localIds.has(r.id)){
        local.push({
          id: r.id,
          opponentId:   r.challenger_id === currentUser.id ? r.opponent_id : r.challenger_id,
          opponentName: r.challenger_id === currentUser.id ? r.opponent_name : r.challenger_name,
          durationDays: r.duration_days,
          startDate:    r.start_date,
          endDate:      r.end_date,
          wagerUnits:   r.wager_units,
          status:       r.status,
        });
      }
    });
    localStorage.setItem(BATTLES_KEY, JSON.stringify(local));
    console.log('[Battles] Synced', rows.length, 'battles from server');
  }catch(e){ console.warn('[Battles] loadBattlesFromServer failed:', e?.message); }
}

async function renderBattlesView(){
  const el = document.getElementById('battlesContent');
  if(!el) return;
  if(!currentUser){ el.innerHTML=`<div style="text-align:center;padding:30px;color:var(--muted);font-family:'DM Mono',monospace;font-size:10px">Sign in to create battles</div>`; return; }
  showViewLoader('battlesContent','LOADING BATTLES…');

  // Fetch leaderboard data to get real opponent records
  let lbEntries = [];
  try { lbEntries = await fetchLeaderboard(); } catch(e) {}
  const lbMap = {};
  lbEntries.forEach(e => { lbMap[e.id] = e; lbMap[e.name?.toLowerCase()] = e; });

  const battles = loadBattles();

  // Render new battle form
  let html = `<div class="new-battle-form">
    <div style="font-family:'DM Mono',monospace;font-size:9px;letter-spacing:2px;color:var(--muted);margin-bottom:10px">⚔️ NEW BATTLE</div>
    <input class="battle-input" id="battleOpponentName" placeholder="Opponent's display name…" list="battleNameSuggest" />
    <datalist id="battleNameSuggest">${lbEntries.filter(e=>e.id!==currentUser?.id).map(e=>`<option value="${e.name}">`).join('')}</datalist>
    <div style="display:flex;gap:6px;margin-bottom:8px">
      <select class="battle-input" id="battleDuration" style="margin:0">
        <option value="7">1 week</option>
        <option value="14">2 weeks</option>
        <option value="30">This month</option>
      </select>
      <select class="battle-input" id="battleLeague" style="margin:0">
        <option value="all">All sports</option>
        <option value="NFL">NFL only</option>
        <option value="NBA">NBA only</option>
        <option value="MLB">MLB only</option>
      </select>
    </div>
    <button class="battle-submit-btn" onclick="createBattle()">⚔️ SEND CHALLENGE</button>
  </div>`;

  if(!battles.length){
    html += `<div style="text-align:center;padding:20px;color:var(--dim);font-family:'DM Mono',monospace;font-size:10px">No active battles — challenge someone from the leaderboard!</div>`;
  } else {
    battles.forEach((b,i)=>{
      // My record during the battle window
      const myPicks = picks.filter(p=>normalizeResult(p.result)!=='pending'&&p.madeAt>=b.startAt&&(!b.league||b.league==='all'||p.league?.includes(b.league)));
      const myW = myPicks.filter(p=>p.result==='won').length;
      const myL = myPicks.filter(p=>p.result==='lost').length;

      // REAL opponent data from leaderboard
      const opp = lbMap[b.opponentId] || lbMap[b.opponentName?.toLowerCase()];
      let theirW = 0, theirL = 0, oppLinked = false;
      if(opp && opp.recentPicks) {
        // Filter opponent's recent picks to the battle window
        const oppPicks = opp.recentPicks.filter(p => p.madeAt >= b.startAt && p.result !== 'push');
        theirW = oppPicks.filter(p => p.result === 'won').length;
        theirL = oppPicks.filter(p => p.result === 'lost').length;
        oppLinked = true;
        // Update stored opponent ID for faster future lookups
        if(!b.opponentId && opp.id) { b.opponentId = opp.id; saveBattles(battles); }
      }

      const myPct = Math.round((myW+myL>0?myW/(myW+myL):0)*100);
      const theirPct = Math.round((theirW+theirL>0?theirW/(theirW+theirL):0)*100);
      const daysLeft = Math.max(0, Math.ceil((b.startAt + b.durationDays*86400000 - Date.now())/86400000));
      const ended = daysLeft===0;
      let status, statusClass;
      if(!ended){ status='ACTIVE'; statusClass='active'; }
      else if(myW>theirW){ status='YOU WON 🏆'; statusClass='won'; }
      else if(theirW>myW){ status='YOU LOST'; statusClass='lost'; }
      else{ status='TIED'; statusClass='tied'; }
      const myBarPct = Math.round((myW/Math.max(myW+theirW,1))*100);

      html += `<div class="battle-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div style="font-size:11px;font-weight:700">vs ${b.opponentName}</div>
          <span class="battle-status ${statusClass}">${status}</span>
        </div>
        ${!oppLinked?`<div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--gold);padding:4px 8px;background:rgba(255,165,2,.06);border-radius:4px;margin-bottom:8px">⚠️ Opponent "${b.opponentName}" not found on the leaderboard — they need to make some picks first</div>`:''}
        <div class="battle-vs">
          <div class="battle-player">
            <div class="battle-player-name">${currentUser.name}</div>
            <div class="battle-player-rec">${myW}W-${myL}L · ${myPct}%</div>
          </div>
          <div class="battle-vs-badge">VS</div>
          <div class="battle-player">
            <div class="battle-player-name">${b.opponentName}</div>
            <div class="battle-player-rec">${theirW}W-${theirL}L · ${theirPct}%</div>
          </div>
        </div>
        <div class="battle-progress">
          <div class="battle-progress-me" style="width:${myBarPct}%"></div>
          <div class="battle-progress-them" style="width:${100-myBarPct}%"></div>
        </div>
        <div class="battle-meta">
          <span>${b.league&&b.league!=='all'?b.league+' only':'All sports'}</span>
          <span>${ended?'Ended':''+daysLeft+' day'+(daysLeft!==1?'s':'')+' left'}</span>
          <button onclick="deleteBattle(${i})" style="background:none;border:none;color:var(--dim);cursor:pointer;font-size:10px">✕ Remove</button>
        </div>
      </div>`;
    });
  }

  el.innerHTML = html;
}

function createBattle(){
  if(!currentUser){ alert('Enter your name first.'); return; }
  const name = (document.getElementById('battleOpponentName')?.value||'').trim();
  const duration = parseInt(document.getElementById('battleDuration')?.value||'7');
  const league = document.getElementById('battleLeague')?.value||'all';
  if(!name){ alert('Enter your opponent\'s name.'); return; }

  // Try to find opponent in cached leaderboard for ID linking
  let oppId = null;
  try {
    const lbStr = localStorage.getItem('lb_cache');
    if(lbStr) {
      const entries = JSON.parse(lbStr);
      const match = entries.find(e => e.name?.toLowerCase() === name.toLowerCase());
      if(match) oppId = match.id || match.user_id;
    }
  } catch(e){}

  const battles = loadBattles();
  battles.unshift({
    id: Date.now().toString(),
    opponentName: name,
    opponentId: oppId,
    durationDays: duration,
    league,
    startAt: Date.now(),
  });
  saveBattles(battles);
  renderBattlesView();
  showWinToast(`⚔️ Battle started vs ${name}! Go get 'em.`);
}

function startBattle(opponentId, opponentName){
  if(!currentUser) return;
  const battles = loadBattles();
  battles.unshift({
    id: Date.now().toString(),
    opponentName,
    opponentId,
    durationDays: 7,
    league: 'all',
    startAt: Date.now(),
    opponentW: 0, opponentL: 0,
  });
  saveBattles(battles);
  showWinToast(`⚔️ Battle started vs ${opponentName}!`);
}

function showNewBattleForm(){
  document.getElementById('battleOpponentName')?.focus();
}

function deleteBattle(idx){
  const battles = loadBattles();
  battles.splice(idx,1);
  saveBattles(battles);
  renderBattlesView();
}

// ═══════════════════════════════════════════════════════
// WEEKLY RECAP
// ═══════════════════════════════════════════════════════
function getWeeklyRecap(){
  const now = Date.now();
  const weekAgo = now - 7*86400000;
  const weekPicks = picks.filter(p=>p.madeAt>=weekAgo&&normalizeResult(p.result)!=='pending');
  if(!weekPicks.length) return null;

  const w = weekPicks.filter(p=>p.result==='won').length;
  const l = weekPicks.filter(p=>p.result==='lost').length;
  const decided = w+l;
  const pct = decided>0?Math.round(w/decided*100):0;
  const pnl = weekPicks.reduce((sum,p)=>{
    if(p.result==='won') return sum+calcPayout(p.wager||50,p.odds||-110);
    if(p.result==='lost') return sum-(p.wager||50);
    return sum;
  },0);

  // Best pick
  const bestPick = weekPicks.filter(p=>p.result==='won'&&p.wager).sort((a,b)=>
    calcPayout(b.wager||50,b.odds||-110)-calcPayout(a.wager||50,a.odds||-110))[0];

  // Best league
  const lgMap={};
  weekPicks.forEach(p=>{ const lg=p.league||'Other'; if(!lgMap[lg]) lgMap[lg]={w:0,l:0}; if(p.result==='won') lgMap[lg].w++; else lgMap[lg].l++; });
  const bestLg = Object.entries(lgMap).filter(([,v])=>v.w+v.l>=2).sort(([,a],[,b])=>(b.w/(b.w+b.l))-(a.w/(a.w+a.l)))[0];

  // Headline
  let headline;
  if(pct>=65) headline = `🔥 Scorching week — you hit ${pct}% and pocketed ${pnl>=0?'+':''}$${Math.round(pnl)}`;
  else if(pct>=50) headline = `📈 Solid week — ${w}W-${l}L, ${pnl>=0?'+':''}$${Math.round(pnl)} on the bankroll`;
  else if(pct>0) headline = `📉 Rough week — ${w}W-${l}L. Bounce back time.`;
  else headline = `No settled picks this week — get in the action!`;

  return { w, l, pct, pnl: Math.round(pnl), bestPick, bestLg: bestLg?.[0], weekPicks };
}

function renderWeeklyRecap(){
  const recap = getWeeklyRecap();
  if(!recap) return;

  // Show as a card in scoresView if it hasn't been dismissed this week
  const weekKey = `recap_dismissed_${new Date().toISOString().slice(0,10).slice(0,7)}`;
  if(localStorage.getItem(weekKey)) return;

  const wrap = document.getElementById('slateSummary');
  if(!wrap) return;

  const el = document.createElement('div');
  el.className = 'recap-card';
  el.id = 'weeklyRecapCard';
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div class="recap-week">WEEKLY RECAP · LAST 7 DAYS</div>
      <button onclick="dismissWeeklyRecap()" style="background:none;border:none;color:var(--dim);cursor:pointer;font-size:12px">✕</button>
    </div>
    <div class="recap-headline">${recap.headline||recap.w+'W-'+recap.l+'L this week'}</div>
    <div class="recap-stats">
      <div class="recap-stat-chip"><div class="recap-stat-chip-val" style="color:${recap.pct>=50?'#2ed573':'#ff4757'}">${recap.pct}%</div><div class="recap-stat-chip-lbl">WIN RATE</div></div>
      <div class="recap-stat-chip"><div class="recap-stat-chip-val">${recap.w}-${recap.l}</div><div class="recap-stat-chip-lbl">RECORD</div></div>
      <div class="recap-stat-chip"><div class="recap-stat-chip-val" style="color:${recap.pnl>=0?'#2ed573':'#ff4757'}">${recap.pnl>=0?'+':''}$${Math.abs(recap.pnl)}</div><div class="recap-stat-chip-lbl">P&L</div></div>
      ${recap.bestLg?`<div class="recap-stat-chip"><div class="recap-stat-chip-val" style="font-size:11px">${recap.bestLg}</div><div class="recap-stat-chip-lbl">BEST LEAGUE</div></div>`:''}
    </div>
    ${recap.bestPick?`<div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);margin-top:8px">🏆 Best pick: ${recap.bestPick.description} (+$${calcPayout(recap.bestPick.wager||50,recap.bestPick.odds||-110)})</div>`:''}
  `;

  // Insert before scoresGrid
  const grid = document.getElementById('scoresGrid');
  if(grid) grid.before(el);
}

function dismissWeeklyRecap(){
  const weekKey = `recap_dismissed_${new Date().toISOString().slice(0,10).slice(0,7)}`;
  localStorage.setItem(weekKey,'1');
  document.getElementById('weeklyRecapCard')?.remove();
}

// Weekly recap push notification — schedule for Monday morning
// ── PRE-GAME REMINDER PUSH ───────────────────────────────────────
// Schedules a push notification 15 minutes before each game the user has a pending pick on.
// Called once on login and whenever picks change.
let _preGameTimers = {}; // gameId → timer handle

function schedulePreGameReminders(){
  if(pushPermission !== 'granted') return;
  // Clear any old timers
  Object.values(_preGameTimers).forEach(t=>clearTimeout(t));
  _preGameTimers = {};

  const REMIND_MS = 15 * 60 * 1000; // 15 minutes before

  picks.filter(p=>normalizeResult(p.result)==='pending').forEach(p=>{
    const gid = p.actualGameId || p.gameId;
    const g = allGames.find(x=>x.id===gid);
    if(!g || !g.isPre) return; // only pre-game picks

    // Parse game start time from ESPN date string
    const startTs = g.rawDate ? new Date(g.rawDate).getTime() : null;
    if(!startTs) return;

    const fireAt = startTs - REMIND_MS;
    const delay = fireAt - Date.now();
    if(delay <= 0 || delay > 6*60*60*1000) return; // skip past or >6hr away

    if(_preGameTimers[gid]) return; // already scheduled for this game

    _preGameTimers[gid] = setTimeout(()=>{
      // Double-check pick is still pending at fire time
      const stillPending = picks.some(pp=>
        (pp.actualGameId||pp.gameId)===gid && normalizeResult(pp.result)==='pending'
      );
      if(!stillPending) return;
      const matchup = g.away?.name && g.home?.name ? `${g.away.name} @ ${g.home.name}` : 'your game';
      sendPushNotification(
        `⏰ Starting in 15 min: ${matchup}`,
        `You have a pending pick — ${p.description}`,
        'pregame-'+gid
      );
      delete _preGameTimers[gid];
    }, delay);
  });
}


function scheduleWeeklyRecapPush(){
  if(pushPermission !== 'granted') return;
  const recap = getWeeklyRecap();
  if(!recap) return;
  // Send immediately if it's Monday and we haven't sent this week
  const sentKey = `recap_push_${new Date().toISOString().slice(0,7)}`;
  if(localStorage.getItem(sentKey)) return;
  const today = new Date().getDay();
  if(today === 1){ // Monday
    localStorage.setItem(sentKey,'1');
    const msg = `${recap.w}W-${recap.l}L last week (${recap.pct}%) · ${recap.pnl>=0?'+':''}$${Math.abs(recap.pnl)} P&L`;
    sendPushNotification('📊 Your Weekly Recap', msg, 'weekly-recap');
  }
}



// ── PWA Manifest — injected via JS to avoid HTML attribute quoting issues ──
(function injectManifest(){ /* disabled: use static /manifest.json */ }
)();

// ── Suppress benign "message channel closed" extension errors ──────
window.addEventListener('unhandledrejection', e => {
  if(e.reason?.message?.includes('message channel closed') ||
     e.reason?.message?.includes('listener indicated')) {
    e.preventDefault(); // suppress — browser extension conflict, not our bug
    return;
  }
  // Log all other unhandled promise rejections so they appear in Netlify logs
  console.error('[SharpPick] Unhandled rejection:', e.reason);
});

// Global error boundary — catches synchronous throws that would otherwise
// produce a blank screen with no feedback to the user
window.onerror = function(msg, src, line, col, err){
  // Ignore benign browser/extension errors
  const benign = ['ResizeObserver loop', 'Script error', 'Non-Error promise'];
  if(benign.some(b => String(msg).includes(b))) return false;

  console.error('[SharpPick] Uncaught error:', msg, 'at', src, line+':'+col, err);

  // Show a non-blocking recovery banner (not a full modal — don't block the app)
  try{
    const existing = document.getElementById('_errBanner');
    if(existing) return false; // only show once per session
    const banner = document.createElement('div');
    banner.id = '_errBanner';
    banner.style.cssText = 'position:fixed;bottom:70px;left:50%;transform:translateX(-50%);background:#1a0a0a;border:1px solid rgba(255,71,87,.4);border-radius:10px;padding:10px 16px;z-index:9999;font-family:"DM Mono",monospace;font-size:10px;color:#ff4757;letter-spacing:.5px;display:flex;align-items:center;gap:10px;max-width:90vw;box-shadow:0 4px 20px rgba(0,0,0,.6)';
    banner.innerHTML = `<span>⚠️ Something went wrong</span><button onclick="location.reload()" style="background:rgba(255,71,87,.15);border:1px solid rgba(255,71,87,.3);color:#ff4757;border-radius:6px;padding:4px 10px;font-family:'DM Mono',monospace;font-size:9px;cursor:pointer;letter-spacing:.5px">RELOAD</button><button onclick="this.parentElement.remove()" style="background:none;border:none;color:rgba(255,71,87,.6);cursor:pointer;font-size:14px;line-height:1">✕</button>`;
    document.body.appendChild(banner);
    // Auto-dismiss after 8 seconds if user doesn't interact
    setTimeout(()=>banner.remove(), 8000);
  }catch{}
  return false; // don't suppress — let browser console still show it
};
// (hoisted to top)
// (hoisted to top)

function switchAuthTab(tab) {
  currentAuthTab = tab;
  // Tabs
  ['login','signup','guest'].forEach(t => {
    const key = t.charAt(0).toUpperCase() + t.slice(1);
    const tabEl = document.getElementById('authTab' + key);
    const panelEl = document.getElementById('authPanel' + key);
    if(tabEl) tabEl.classList.toggle('active', t === tab);
    if(panelEl) panelEl.style.display = (t === tab) ? 'block' : 'none';
  });
  const msg = document.getElementById('authMessage');
  if(msg) msg.style.display = 'none';
  // Focus first input in active panel
  const activePanel = document.getElementById('authPanel' + tab.charAt(0).toUpperCase() + tab.slice(1));
  if(activePanel) {
    const firstInput = activePanel.querySelector('input');
    if(firstInput) setTimeout(() => firstInput.focus(), 50);
  }
}

// Auth rate-limit guard — Supabase free tier: 3 auth requests/hour per IP
// (hoisted to top)
// (hoisted to top)
// AUTH_COOLDOWN_MS hoisted to top

function checkAuthRateLimit(errEl) {
  const now = Date.now();
  // Reset counter if >1 hour since first attempt
  if(now - _authLastAttempt > 3600000) _authAttemptCount = 0;
  if(now - _authLastAttempt < AUTH_COOLDOWN_MS) {
    const wait = Math.ceil((AUTH_COOLDOWN_MS - (now - _authLastAttempt)) / 1000);
    if(errEl) errEl.textContent = `Please wait ${wait}s before trying again.`;
    return false;
  }
  _authLastAttempt = now;
  _authAttemptCount++;
  return true;
}

function friendlyAuthError(status, data) {
  if(status === 429) return '⚠️ Too many attempts. Supabase limits auth to a few tries per hour on the free tier. Wait a few minutes, or use "Guest" mode for now.';
  if(status === 400) return data?.error_description || data?.msg || 'Invalid email or password.';
  if(status === 422) return 'Email already registered — try signing in instead.';
  if(status === 500) return 'Server error. Try again in a moment.';
  return data?.error_description || data?.msg || `Auth error (${status})`;
}

async function submitSignup() {
  try {
  const name = (document.getElementById('signupName')?.value||'').trim();
  const email = (document.getElementById('signupEmail')?.value||'').trim();
  const password = (document.getElementById('signupPassword')?.value||'').trim();
  const err = document.getElementById('signupError');
  if(!name){ err.textContent='Display name required.'; return; }
  if(!email||!email.includes('@')){ err.textContent='Valid email required.'; return; }
  if(password.length<8){ err.textContent='Password must be 8+ characters.'; return; }
  if(!checkAuthRateLimit(err)) return;
  err.textContent='';
  const btn = document.querySelector('#authPanelSignup .name-submit-btn');
  if(btn){ btn.textContent='Creating account…'; btn.disabled=true; }
  try {
    const r = await fetch(`${SUPA_AUTH}/signup`, {
      method:'POST', headers: SUPA_AUTH_HDR,
      body: JSON.stringify({ email, password, data: { display_name: name } })
    });
    const data = await r.json();
    if(!r.ok) throw new Error(friendlyAuthError(r.status, data));
    if(data.session) {
      // Signed up and immediately signed in (email confirm disabled)
      await handleAuthSession(data.session, name);
    } else if(data.user) {
      if(data.user.identities?.length === 0) {
        // Email already registered — redirect to login
        const errEl = document.getElementById('signupError');
        if(errEl) errEl.textContent = 'Email already registered. Try signing in instead.';
        setTimeout(()=>switchAuthTab('login'), 2000);
      } else {
        // Account created but no session yet — try logging in automatically
        try {
          const loginR = await fetch(`${SUPA_AUTH}/token?grant_type=password`, {
            method:'POST', headers: SUPA_AUTH_HDR,
            body: JSON.stringify({ email, password })
          });
          const loginData = await loginR.json();
          if(loginR.ok && loginData.session) {
            await handleAuthSession(loginData.session, name);
          } else if(loginR.ok && loginData.access_token) {
            await handleAuthSession(loginData, name);
          } else {
            // Auto-login failed — send to login tab with success message
            showAuthMessage('✅ Account created! Sign in below to continue.', true);
            setTimeout(()=>switchAuthTab('login'), 1500);
          }
        } catch(autoLoginErr) {
          showAuthMessage('✅ Account created! Sign in below to continue.', true);
          setTimeout(()=>switchAuthTab('login'), 1500);
        }
      }
    } else {
      // No user or session returned — redirect to login
      showAuthMessage('✅ Account created! Sign in below to continue.', true);
      setTimeout(()=>switchAuthTab('login'), 1500);
    }
  } catch(e) {
    const errEl = document.getElementById('signupError');
    if(errEl) errEl.textContent = e.message || 'Something went wrong. Try again.';
    console.error('Signup error:', e);
  } finally {
    const btnEl = document.querySelector('#authPanelSignup .name-submit-btn');
    if(btnEl){ btnEl.textContent='CREATE ACCOUNT →'; btnEl.disabled=false; }
  }
  } catch(outerErr) { console.error('submitSignup outer error:', outerErr); }
}

async function submitLogin() {
  const email = (document.getElementById('loginEmail')?.value||'').trim();
  const password = (document.getElementById('loginPassword')?.value||'').trim();
  const err = document.getElementById('loginError');
  if(!email){ err.textContent='Email required.'; return; }
  if(!password){ err.textContent='Password required.'; return; }
  if(!checkAuthRateLimit(err)) return;
  err.textContent='';
  const btn = document.querySelector('#authPanelLogin .name-submit-btn');
  if(btn){ btn.textContent='Signing in…'; btn.disabled=true; }
  try {
    const r = await fetch(`${SUPA_AUTH}/token?grant_type=password`, {
      method:'POST', headers: SUPA_AUTH_HDR,
      body: JSON.stringify({ email, password })
    });
    const data = await r.json();
    if(!r.ok) throw new Error(friendlyAuthError(r.status, data));
    await handleAuthSession(data, data.user?.user_metadata?.display_name);
  } catch(e) {
    const errEl = document.getElementById('loginError');
    if(errEl) errEl.textContent = e.message || 'Something went wrong. Try again.';
    console.error('Login error:', e);
  } finally {
    const btnEl = document.querySelector('#authPanelLogin .name-submit-btn');
    if(btnEl){ btnEl.textContent='SIGN IN →'; btnEl.disabled=false; }
  }
}

async function submitMagicLink() {
  const email = (document.getElementById('loginEmail')?.value||'').trim();
  const err = document.getElementById('loginError');
  if(!email||!email.includes('@')){ err.textContent='Enter your email first.'; return; }
  err.textContent='';
  try {
    const r = await fetch(`${SUPA_AUTH}/magiclink`, {
      method:'POST', headers: SUPA_AUTH_HDR,
      body: JSON.stringify({ email })
    });
    if(r.ok) {
      showAuthMessage('✅ Magic link sent! Check your email and click the link to sign in.', true);
    } else {
      const d = await r.json();
      err.textContent = d.msg || 'Failed to send magic link.';
    }
  } catch(e) {
    err.textContent = e.message;
  }
}

function submitGuest() {
  const name = (document.getElementById('guestName')?.value||'').trim();
  const err = document.getElementById('guestError');
  if(!name||name.length<2){ err.textContent='Name must be at least 2 characters.'; return; }
  // Guest mode: use localStorage UID like before, no Supabase auth
  let uid = localStorage.getItem('ls_uid');
  if(!uid){ uid='guest_'+Math.random().toString(36).slice(2)+Date.now().toString(36); localStorage.setItem('ls_uid',uid); }
currentUser = { name, id: uid, isGuest: true };
saveUser(currentUser);
applyUser();                 // update UI state first
syncPicksFromServer(true);   // pull latest
  startBackgroundPickSync();   // keep syncing in background
startPicksRealtime();        // start realtime
  
document.getElementById('nameModalOverlay').classList.add('hidden');
  
}

async function handleAuthSession(session, displayName) {
  authSession = session;
  const userId = session.user?.id;
  const email = session.user?.email;
  const name = displayName || session.user?.user_metadata?.display_name || email?.split('@')[0] || 'Player';
  // Store token for API calls
  localStorage.setItem('sb_token', session.access_token);
  localStorage.setItem('sb_refresh', session.refresh_token||'');
  localStorage.setItem('sb_user_id', userId);
  // Update SUPA_HDR to use auth token
  Object.assign(SUPA_HDR, { 'Authorization': 'Bearer ' + session.access_token });
  currentUser = { name, id: userId, email, isGuest: false, verified: true };
  saveUser(currentUser);
  document.getElementById('nameModalOverlay').classList.add('hidden');
  // Show verified badge in user chip
  const chip = document.getElementById('userChip');
  if(chip) chip.title = `Signed in as ${email}`;
  applyUser();
  // Ensure profile exists in DB for leaderboard, then start sync
  await ensureProfile();
  initPickSyncChannels();
  startPicksRealtime();
  syncPicksFromServer(true).catch(() => {});
  // Sync rebuy count from server so bankroll matches across devices
  syncRebuyCountFromServer().catch(() => {});
  // Start 60s background sync so picks made on other devices appear automatically
  startBackgroundPickSync();
  // Sync achievements from server so they survive device switches
  syncAchievementsFromServer().catch(() => {});
  // Sync follows from server
  syncFollowsFromServer().catch(() => {});
}

function showAuthMessage(msg, success=true) {
  const el = document.getElementById('authMessage');
  if(!el) return;
  el.textContent = msg;
  el.style.display = '';
  el.style.color = success ? '#2ed573' : '#ff4757';
  // Hide all panels
  ['Login','Signup','Guest'].forEach(p => {
    const el2 = document.getElementById('authPanel'+p);
    if(el2) el2.style.display = 'none';
  });
}

async function restoreAuthSession() {
  const token = localStorage.getItem('sb_token');
  const refresh = localStorage.getItem('sb_refresh');
  if(!token) return false;

  // Quick local check: decode JWT exp without network call
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const expiry = payload.exp * 1000;
    if(Date.now() < expiry - 60000) {
      // Token still valid — use it without a network call
      Object.assign(SUPA_HDR, { 'Authorization': 'Bearer '+token });
      authSession = { access_token: token, user: { id: localStorage.getItem('sb_user_id') } };
      const savedUser = loadUser();
      if(savedUser) { currentUser = { ...savedUser, verified: true }; return true; }
      return false;
    }
  } catch(e) {
    // Bad token format — clear it
    localStorage.removeItem('sb_token');
    localStorage.removeItem('sb_refresh');
    return false;
  }

  // Token expired — try refresh (only one network call, not two)
  if(!refresh) {
    localStorage.removeItem('sb_token');
    return false;
  }
  try {
    const r = await fetch(`${SUPA_AUTH}/token?grant_type=refresh_token`, {
      method:'POST', headers: SUPA_AUTH_HDR,
      body: JSON.stringify({ refresh_token: refresh })
    });
    if(r.ok) {
      const data = await r.json();
      localStorage.setItem('sb_token', data.access_token);
      localStorage.setItem('sb_refresh', data.refresh_token||'');
      localStorage.setItem('sb_user_id', data.user?.id||'');
      Object.assign(SUPA_HDR, { 'Authorization': 'Bearer '+data.access_token });
      authSession = data;
      const savedUser = loadUser();
      if(savedUser) { currentUser = { ...savedUser, verified: true }; return true; }
      return false;
    }
  } catch(e) {}

  // Refresh failed — clear stale tokens so we don't loop
  localStorage.removeItem('sb_token');
  localStorage.removeItem('sb_refresh');
  return false;
}

async function signOut() {
  stopBackgroundPickSync();
  try {
    await fetch(`${SUPA_AUTH}/logout`, {
      method:'POST',
      headers: { ...SUPA_AUTH_HDR, 'Authorization': 'Bearer '+(localStorage.getItem('sb_token')||'') }
    });
  } catch(e) {}
  localStorage.removeItem('sb_token');
  localStorage.removeItem('sb_refresh');
  localStorage.removeItem('sb_user_id');
  localStorage.removeItem('ls_user');
  authSession = null;
  currentUser = null;
  picks = [];
  location.reload();
}

// Handle magic link token in URL hash
function checkAuthRedirect() {
  const hash = window.location.hash;
  if(hash.includes('access_token=')) {
    const params = new URLSearchParams(hash.replace('#',''));
    const token = params.get('access_token');
    const refresh = params.get('refresh_token');
    if(token) {
      localStorage.setItem('sb_token', token);
      if(refresh) localStorage.setItem('sb_refresh', refresh);
      // Clean URL
      history.replaceState(null,'',window.location.pathname);
      // Restore session
      restoreAuthSession().then(ok => { if(ok && currentUser) applyUser(); });
    }
  }
}

// ═══════════════════════════════════════════════════════
// WEBSOCKET LIVE SCORES
// ═══════════════════════════════════════════════════════
// (hoisted to top)
// (hoisted to top)
// (hoisted to top)
// (hoisted to top)

function startWebSocket(gameIds) {
  if(!gameIds?.length) return;
  stopWebSocket();
  wsEnabled = true;
  wsGameIds = new Set(gameIds);

  // ESPN WebSocket for live scores
  // Falls back to fast polling if WS unavailable
  try {
    // Use ESPN's streaming endpoint
    const wsUrl = `wss://streaming.espn.com/v2/subscribe?apiKey=${encodeURIComponent(SUPA_KEY)}&topics=${gameIds.map(id=>`gp_${id}`).join(',')}`;
    // ESPN WS requires auth we don't have — use SSE-style fast polling instead
    startFastPoll(gameIds);
  } catch(e) {
    startFastPoll(gameIds);
  }
}

// (hoisted to top)
function startFastPoll(gameIds) {
  clearInterval(fastPollTimer);
  if(!gameIds?.length) return;
  console.log(`⚡ Fast poll started for ${gameIds.length} live game(s) — 8s interval`);
  fastPollTimer = setInterval(async () => {
    const stillLive = allGames.filter(g=>g.isLive).map(g=>g.id);
    if(!stillLive.length) { stopFastPoll(); return; }
    // Fetch just the live games — targeted, not full date fetch
    const updates = await Promise.allSettled(
      stillLive.slice(0,3).map(gid => {
        const g = allGames.find(x=>x.id===gid);
        if(!g) return Promise.resolve(null);
        const lg = LEAGUES.find(l=>l.league===g.league);
        if(!lg) return Promise.resolve(null);
        return go(`${ESPN}/${lg.sport}/${lg.league}/scoreboard?dates=${selDate}`, 5000);
      })
    );
    let changed = false;
    updates.forEach(r => {
      if(r.status==='fulfilled' && r.value?.events) {
        r.value.events.forEach(ev => {
          const comp = ev.competitions?.[0];
          if(!comp) return;
          const gid = ev.id;
          const g = allGames.find(x=>x.id===gid);
          if(!g||!g.isLive) return;
          const home = comp.competitors?.find(c=>c.homeAway==='home');
          const away = comp.competitors?.find(c=>c.homeAway==='away');
          if(!home||!away) return;
          const newHS = parseInt(home.score)||0;
          const newAS = parseInt(away.score)||0;
          const newStatus = comp.status?.displayClock || g.statusText;
          if(g.home.score !== newHS || g.away.score !== newAS || g.statusText !== newStatus) {
            g.home.score = newHS; g.away.score = newAS; g.statusText = newStatus;
            changed = true;
          }
        });
      }
    });
    if(changed) {
      patchScores();
      checkPickResults();
      checkParlayResults();
      if(openGameId) { const g=allGames.find(x=>x.id===openGameId); if(g) updateModalScoreboard(g); }
    }
  }, 8000); // 8 second fast poll during live games
}

function stopFastPoll() {
  clearInterval(fastPollTimer);
  fastPollTimer = null;
  console.log('⏸ Fast poll stopped — no live games');
}

function stopWebSocket() {
  if(wsConnection) { try { wsConnection.close(); } catch(e){} wsConnection = null; }
  stopFastPoll();
}

// Hook into schedulePoll — when live games detected, upgrade to fast poll
function upgradePollIfLive() {
  const liveGames = allGames.filter(g=>g.isLive);
  if(liveGames.length && !fastPollTimer) {
    startFastPoll(liveGames.map(g=>g.id));
  } else if(!liveGames.length && fastPollTimer) {
    stopFastPoll();
  }
}

// ═══════════════════════════════════════════════════════
// DEEP LINKS / HASH ROUTING
// ═══════════════════════════════════════════════════════
const ROUTES = {
  '/league/:code':   (p) => { setMode('leaderboard'); switchLbTab('leagues'); setTimeout(()=>openLeague(p.code), 300); },
  '/profile/:id':    (p) => { setTimeout(()=>openProfileById(p.id), 300); },
  '/u/:name':        (p) => { setTimeout(()=>openProfileByName(p.name), 300); },
  '/pick/:id':       (p) => { setTimeout(()=>openPickById(p.id), 300); },
  '/battle/:id':     (p) => { setMode('battles'); },
  '/scores':         ()  => { setMode('scores'); },
  '/trends':         ()  => { setMode('trends'); },
  '/history':        ()  => { setMode('history'); },
};

function parseRoute(hash) {
  const path = hash.replace('#','').replace(/^\/$/,'') || '/scores';
  for(const [pattern, handler] of Object.entries(ROUTES)) {
    const keys = [];
    const regStr = pattern.replace(/:([^/]+)/g, (_,k) => { keys.push(k); return '([^/]+)'; });
    const match = path.match(new RegExp('^'+regStr+'$'));
    if(match) {
      const params = {};
      keys.forEach((k,i) => params[k] = decodeURIComponent(match[i+1]||''));
      return { handler, params };
    }
  }
  return null;
}

function navigateTo(path) {
  history.pushState(null,'','#'+path);
  const route = parseRoute(path);
  if(route) route.handler(route.params);
}

function getShareableLink(type, id) {
  return `${window.location.origin}${window.location.pathname}#/${type}/${id}`;
}

function handleRouteChange() {
  const hash = window.location.hash;
  if(!hash || hash === '#' || hash.includes('access_token=')) return;
  const route = parseRoute(hash);
  if(route) route.handler(route.params);
}

window.addEventListener('popstate', handleRouteChange);

async function openProfileByName(nameSlug) {
  // Decode URL slug back to display name (e.g. "iguthrie" → search leaderboard)
  try{
    const rows = await fetchLeaderboard();
    const decoded = decodeURIComponent(nameSlug).toLowerCase();
    const entry = (rows||[]).find(r=>
      (r.name||'').toLowerCase().replace(/\s+/g,'') === decoded ||
      (r.name||'').toLowerCase() === decoded
    );
    if(entry){ openProfile(entry); return; }
    showWinToast('⚠️ Profile not found — they may not have made picks yet');
  }catch(e){ console.warn('openProfileByName failed:', e?.message); }
}

async function openProfileById(userId) {
  // Find in cached leaderboard
  const entries = await fetchLeaderboard();
  const entry = entries.find(e=>e.id===userId);
  if(entry) { openProfile(entry); return; }
  // Try fetching from Supabase directly
  try {
    const rows = await sbSelect('leaderboard', `user_id=eq.${userId}&select=*`);
    if(rows?.[0]) {
      const r = rows[0];
      openProfile({ id:r.user_id, name:r.name, w:r.w||0, l:r.l||0, p:r.p||0, total:r.total||0, bankroll:r.bankroll||1000, pnl:r.pnl||0, recentPicks:r.recent_picks||[] });
    }
  } catch(e) {}
}

function openPickById(pickId) {
  const pick = picks.find(p => p._syncId===pickId || (p.gameId+p.type+p.side)===pickId);
  if(pick) { sharePickCard({...pick, name:currentUser?.name}); }
}

// Shareable link helpers — add to pick cards and profiles
function copyProfileLink(userId) {
  const link = getShareableLink('profile', userId);
  navigator.clipboard.writeText(link).then(()=>showWinToast('🔗 Profile link copied!'));
}

function copyLeagueLink(code) {
  const link = getShareableLink('league', code);
  navigator.clipboard.writeText(link).then(()=>showWinToast('🔗 League link copied!'));
}

// ═══════════════════════════════════════════════════════
// SETTLEMENT AUDIT TRAIL
// ═══════════════════════════════════════════════════════
function recordSettlement(pick, finalHomeScore, finalAwayScore, method='client') {
  pick.settledAt = Date.now();
  pick.settleMethod = method; // 'client' | 'server' | 'manual'
  pick.finalScore = finalHomeScore !== undefined ? `${finalAwayScore}-${finalHomeScore}` : null;
}

function settlementAuditHTML(pick) {
  if(pick.result==='pending' || !pick.settledAt) return '';
  const time = pick.settledAt ? new Date(pick.settledAt).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : '';
  const method = pick.settleMethod || 'client';
  const score = pick.finalScore ? `Final: ${pick.finalScore}` : '';
  const verified = method==='server';
  return `<div class="settle-audit">
    ${time ? `<span class="settle-audit-item">🕐 ${time}</span>` : ''}
    ${score ? `<span class="settle-audit-item">📊 ${score}</span>` : ''}
    <span class="settle-audit-item ${verified?'verified':''}">
      ${verified ? '✅ Server verified' : '📱 Client settled'}
    </span>
  </div>`;
}

// Patch checkPickResults to record audit data
const _origCheckPicks = checkPickResults;
checkPickResults = function() {
  const before = picks.map(p=>({k:p.gameId+p.type+p.side, result:p.result}));
  _origCheckPicks.call(this);
  picks.forEach(p => {
    const prev = before.find(b=>b.k===p.gameId+p.type+p.side);
    if(prev?.result==='pending' && normalizeResult(p.result)!=='pending') {
      const g = allGames.find(x=>x.id===p.gameId||x.id===p.actualGameId);
      recordSettlement(p, g?.home?.score, g?.away?.score, 'client');
    }
  });
};

// ═══════════════════════════════════════════════════════
// UPDATED initUser — tries auth restore first
// ═══════════════════════════════════════════════════════
async function initUserWithAuth() {
  // 1. Check for magic link / OAuth redirect in URL
  checkAuthRedirect();

  // 2. Try to restore Supabase session
  const restored = await restoreAuthSession();
if (restored && currentUser) {
  picks = loadPicks();
  applyUser();
  await ensureProfile();

  initPickSyncChannels();
  startPicksRealtime();
  startBackgroundPickSync();
  // Always pull from server on load — picks made on another device won't be
  // in localStorage yet, so we must fetch them before rendering anything.
  syncPicksFromServer(true).catch(() => {});
  syncRebuyCountFromServer().catch(() => {});

  document.getElementById('nameModalOverlay').classList.add('hidden');
  return;
}

  // 3. Fall back to saved guest/local user
  const u = loadUser();
 if (u && u.name) {
  currentUser = u;
  picks = loadPicks();
  applyUser();
  await ensureProfile();

  initPickSyncChannels();
  startPicksRealtime();   // ADD THIS
  if(_pendingPickSync){ _pendingPickSync=false; try{ syncPicksFromServer(false); }catch{} }

  document.getElementById('nameModalOverlay').classList.add('hidden');
  return;
}

  // 4. Show auth modal — default to signup for new users
  switchAuthTab('signup');
  setTimeout(()=>{ document.getElementById('signupName')?.focus(); }, 100);
}



// ═══════════════════════════════════════════════════════
// USER MENU DROPDOWN (replaces promptRename click)
// ═══════════════════════════════════════════════════════
function showUserMenu() {
  const existing = document.getElementById('userMenuDropdown');
  if(existing) { existing.remove(); return; }

  const chip = document.getElementById('userChip');
  if(!chip) return;
  const rect = chip.getBoundingClientRect();

  const menu = document.createElement('div');
  menu.id = 'userMenuDropdown';
  menu.style.cssText = `position:fixed;top:${rect.bottom+6}px;right:${window.innerWidth-rect.right}px;
    background:var(--card);border:1px solid var(--border);border-radius:10px;
    min-width:180px;z-index:400;box-shadow:0 8px 32px rgba(0,0,0,.4);overflow:hidden;`;

  const isGuest = currentUser?.isGuest;
  const isVerified = currentUser?.verified;

  menu.innerHTML = `
    <div style="padding:10px 14px;border-bottom:1px solid var(--border);">
      <div style="font-weight:700;font-size:12px">${currentUser?.name||'Player'}</div>
      <div style="font-family:'DM Mono',monospace;font-size:8px;color:${isGuest?'var(--gold)':isVerified?'#2ed573':'var(--muted)'};margin-top:2px">
        ${isGuest?'⚠️ GUEST MODE':isVerified?'✅ VERIFIED ACCOUNT':'LOCAL ACCOUNT'}
      </div>
      ${currentUser?.email?`<div style="font-size:9px;color:var(--dim);margin-top:2px">${currentUser.email}</div>`:''}
    </div>
    <div style="padding:6px 0;">
      ${isGuest?`<button class="user-menu-item" onclick="userMenuAction('upgrade')">🔐 Create Account</button>`:''}
      <button id="themeToggleBtn" class="user-menu-item" onclick="toggleTheme()" style="display:flex;align-items:center;justify-content:space-between"><span>Toggle Theme</span><span>${document.body.classList.contains('light-mode')?'🌙':'☀️'}</span></button>
      <button class="user-menu-item" onclick="userMenuAction('rename')">✏️ Change Display Name</button>
      <button class="user-menu-item" onclick="userMenuAction('profile')">👤 My Profile</button>
      <button class="user-menu-item" onclick="userMenuAction('copyProfile')">🔗 Copy Profile Link</button>
      <button class="user-menu-item" onclick="userMenuAction('playerCard')">📤 Share Player Card</button>
    </div>
    <div style="padding:6px 0;border-top:1px solid var(--border);">
      <button class="user-menu-item" onclick="userMenuAction('signout')" style="color:#ff4757">
        ${isGuest?'🚪 Clear Data':'🚪 Sign Out'}
      </button>
    </div>`;

  document.body.appendChild(menu);

  // Close on outside click
  setTimeout(()=>{
    document.addEventListener('click', function handler(e){
      if(!menu.contains(e.target) && !chip.contains(e.target)){
        menu.remove();
        document.removeEventListener('click', handler);
      }
    });
  }, 10);
}

function userMenuAction(action) {
  document.getElementById('userMenuDropdown')?.remove();
  switch(action) {
    case 'rename':
      const newName = prompt('Change your display name:', currentUser?.name||'');
      if(!newName?.trim()) return;
      const name = newName.trim().slice(0,24);
      currentUser = {...currentUser, name};
      saveUser(currentUser);
      applyUser();
      publishToLeaderboard();
      ensureProfile(); // sync new name to Supabase profiles table for leaderboard
      showWinToast('✅ Name updated!');
      break;
    case 'profile':
      if(currentUser) {
        const myEntry = {
          id: currentUser.id,
          name: currentUser.name,
          w: picks.filter(p=>p.result==='won').length,
          l: picks.filter(p=>p.result==='lost').length,
          p: picks.filter(p=>p.result==='push').length,
          total: picks.length,
          bankroll: computeBankroll(),
          pnl: totalPnL(),
          recentPicks: picks.filter(p=>normalizeResult(p.result)!=='pending').slice(-20).map(p=>({result:p.result,type:p.type,madeAt:p.madeAt})),
        };
        openProfile(myEntry);
      }
      break;
    case 'copyProfile':
      if(currentUser) copyProfileLink(currentUser.id);
      break;
    case 'playerCard':
      openPlayerCard();
      break;
    case 'upgrade':
      // Show auth modal in signup tab
      document.getElementById('nameModalOverlay')?.classList.remove('hidden');
      switchAuthTab('signup');
      break;
    case 'signout':
      showConfirm(currentUser?.isGuest?'Clear all data?':'Sign out?',currentUser?.isGuest?'This cannot be undone.':'You can sign back in anytime.',()=>{
        if(typeof signOut==='function') signOut();
        else { localStorage.clear(); location.reload(); }
      });
      break;
  }
}


// ── Runtime CSS patches ──────────────────────────────────────────
(function injectRuntimeCSS(){
  const style = document.createElement('style');
  style.id = 'sp-runtime-css';
  style.textContent = `
    /* Wider score grid on large desktops — show 3-4 columns instead of 2 */
    @media(min-width:1200px){
      .score-grid{grid-template-columns:repeat(auto-fill,minmax(260px,1fr));}
    }
    @media(min-width:1600px){
      .score-grid{grid-template-columns:repeat(auto-fill,minmax(240px,1fr));}
    }
    /* Static/estimated odds pill styling */
    .odds-pill.odds-estimated{opacity:.75;border-style:dashed;}
    /* Light mode support */
    body.light-mode{
      --bg:#f4f6f9;--card:#ffffff;--border:rgba(0,0,0,.1);
      --text:#0d1117;--muted:#555f6b;--dim:#8b949e;
      --accent:#0088cc;--gold:#d97706;--green:#16a34a;--red:#dc2626;
    }
    body.light-mode .score-card{box-shadow:0 1px 3px rgba(0,0,0,.08);}
    body.light-mode .mobile-nav{background:rgba(244,246,249,.97);}
    body.light-mode .picks-panel{background:#ffffff;border-left:1px solid rgba(0,0,0,.1);}
    body.light-mode .hdr{background:rgba(244,246,249,.97);}
    /* Profile link copy button hover */
    button[onclick*="COPY PROFILE"]:hover{border-color:rgba(0,229,255,.3)!important;color:var(--accent)!important;}

    /* Sync button spin animation */
    @keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }

    /* Fix 7: Bankroll bar stacks on very small screens */
    @media(max-width:380px){
      #bankrollBar{flex-direction:column;align-items:flex-start;gap:2px;}
      #bankrollPnL{font-size:9px;}
    }

    /* Fix 9: Record pill — bigger and bolder */
    .record-pill{
      font-size:12px!important;
      font-weight:700!important;
      letter-spacing:.5px!important;
      padding:4px 10px!important;
      background:rgba(255,255,255,.06)!important;
      border-radius:6px!important;
    }
    .record-pill .rp-w{color:#2ed573;font-weight:800;}
    .record-pill .rp-l{color:#ff4757;}

    /* Fix 11: Picks panel has a "peek" strip so users know it's there */
    .picks-panel{transition:right .3s cubic-bezier(.32,.72,0,1);}
    .picks-panel-peek{
      position:fixed;right:0;bottom:120px;z-index:170;
      background:var(--accent);color:#000;
      font-family:'DM Mono',monospace;font-size:9px;font-weight:700;letter-spacing:1px;
      padding:8px 6px;border-radius:6px 0 0 6px;
      cursor:pointer;writing-mode:vertical-rl;text-orientation:mixed;
      box-shadow:-2px 0 12px rgba(0,229,255,.3);
      display:none;
    }
    @media(max-width:640px){
      .picks-panel-peek{display:block;}
    }

    /* Fix 12: Truncate long team names on pick buttons gracefully */
    .pick-btn{
      overflow:hidden;
      white-space:nowrap;
      text-overflow:ellipsis;
      max-width:100%;
    }
    .pick-btn br + span{display:block;white-space:nowrap;}
  `;
  document.head.appendChild(style);
})();


// ── DARK / LIGHT MODE TOGGLE ─────────────────────────────────────
const THEME_KEY = 'sp_theme';

function loadTheme(){
  const saved = localStorage.getItem(THEME_KEY) || 'dark';
  applyTheme(saved);
}

function applyTheme(theme){
  if(theme === 'light'){
    document.body.classList.add('light-mode');
  } else {
    document.body.classList.remove('light-mode');
  }
  try{ localStorage.setItem(THEME_KEY, theme); }catch{}
  // Update toggle button icon if present
  const btn = document.getElementById('themeToggleBtn');
  if(btn) btn.textContent = theme === 'light' ? '🌙' : '☀️';
}

function toggleTheme(){
  const current = document.body.classList.contains('light-mode') ? 'light' : 'dark';
  applyTheme(current === 'light' ? 'dark' : 'light');
}

// CSS for user menu
(function() {
  const style = document.createElement('style');
  style.textContent = `.user-menu-item{display:block;width:100%;padding:9px 14px;background:none;border:none;color:var(--text);font-size:12px;text-align:left;cursor:pointer;transition:background .1s;}.user-menu-item:hover{background:rgba(255,255,255,.04);}`;
  document.head.appendChild(style);
})();


// ═══════════════════════════════════════════════════════
// UX HELPERS — replaces alert() and confirm()
// ═══════════════════════════════════════════════════════

// Show auth modal with a contextual prompt instead of alert()
function showAuthPrompt(action) {
  const modal = document.getElementById('nameModalOverlay');
  if(!modal) return;
  // Flash the auth modal with a hint
  modal.classList.remove('hidden');
  switchAuthTab('signup');
  const tagline = document.querySelector('.auth-tagline');
  if(tagline && action) {
    const orig = tagline.textContent;
    tagline.textContent = `Sign up to ${action}`;
    tagline.style.color = 'var(--accent)';
    setTimeout(()=>{ tagline.textContent=orig; tagline.style.color=''; }, 3000);
  }
  setTimeout(()=>document.getElementById('signupName')?.focus(), 100);
}

// Beautiful confirm dialog replacing native confirm()
function showConfirm(title, body, onConfirm, confirmLabel='Confirm', danger=true) {
  const existing = document.getElementById('confirmModal');
  if(existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'confirmModal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:900;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px);';

  overlay.innerHTML = `<div style="background:var(--card);border:1px solid var(--border);border-radius:14px;padding:24px;max-width:320px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.5);">
    <div style="font-size:16px;font-weight:800;margin-bottom:8px">${title}</div>
    <div style="font-size:12px;color:var(--muted);line-height:1.5;margin-bottom:20px">${body}</div>
    <div style="display:flex;gap:8px">
      <button id="confirmModalCancel" style="flex:1;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--muted);font-family:'DM Mono',monospace;font-size:10px;cursor:pointer">CANCEL</button>
      <button id="confirmModalOk" style="flex:1;padding:10px;background:${danger?'#ff4757':'var(--accent)'};border:none;border-radius:8px;color:${danger?'#fff':'#000'};font-family:'DM Mono',monospace;font-size:10px;font-weight:700;cursor:pointer">${confirmLabel.toUpperCase()}</button>
    </div>
  </div>`;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.addEventListener('click', e => { if(e.target===overlay) close(); });
  document.getElementById('confirmModalCancel').onclick = close;
  document.getElementById('confirmModalOk').onclick = () => { close(); onConfirm(); };
  document.getElementById('confirmModalOk').focus();
}

// ═══════════════════════════════════════════════════════
// GUEST → ACCOUNT PICK MIGRATION
// ═══════════════════════════════════════════════════════
// Called inside handleAuthSession when a guest upgrades
async function migrateGuestPicks(oldUserId, newUserId) {
  if(!oldUserId || !newUserId || oldUserId === newUserId) return;
  // Load picks from old guest key
  const guestKey = `ls_picks_${oldUserId}`;
  let guestPicks = [];
  try { guestPicks = JSON.parse(localStorage.getItem(guestKey)||'[]'); } catch{}
  if(!guestPicks.length) return;

  console.log(`📦 Migrating ${guestPicks.length} guest picks to new account…`);
  // Re-assign all picks to new user ID — they'll sync on next savePicks
  picks = [...guestPicks, ...picks.filter(p =>
    !guestPicks.some(gp => gp.gameId===p.gameId && gp.type===p.type && gp.side===p.side)
  )];
  localStorage.setItem(`ls_picks_${newUserId}`, JSON.stringify(picks));
  localStorage.removeItem(guestKey);
  await syncPicksToServer();
  showWinToast(`✅ ${guestPicks.length} picks migrated to your new account!`);
}

// ═══════════════════════════════════════════════════════
// MOBILE NAV — "MORE" DRAWER
// ═══════════════════════════════════════════════════════
function openMoreDrawer() {
  const existing = document.getElementById('moreDrawer');
  if(existing) { existing.remove(); return; }

  const drawer = document.createElement('div');
  drawer.id = 'moreDrawer';
  drawer.style.cssText = 'position:fixed;bottom:60px;left:0;right:0;background:rgba(8,12,16,.98);border-top:1px solid var(--border);z-index:175;padding:12px;backdrop-filter:blur(20px);display:grid;grid-template-columns:repeat(4,1fr);gap:8px;transform:translateY(100%);transition:transform .22s cubic-bezier(.32,.72,0,1);';
  // Trigger slide-up animation on next frame
  requestAnimationFrame(()=>{ drawer.style.transform='translateY(0)'; });

  // Trends and Pick'em promoted to top — highest daily use features
  const moreItems = [
    { label:'Trends',   icon:'📈', mode:'trends',   featured:true  },
    { label:"Pick'em",  icon:'🏆', mode:'contests',  featured:true  },
    { label:'Analytics',icon:'📊', mode:'analysis',  featured:false },
    { label:'History',  icon:'📋', mode:'history',   featured:false },
    { label:'Battles',  icon:'⚔️', mode:'battles',   featured:false },
    { label:'Feed',     icon:'👥', mode:'feed',      featured:false },
    { label:'News',     icon:'📰', mode:'news',      featured:false },
    { label:'Calendar', icon:'📅', mode:'calendar',  featured:false },
    { label:'My Action',icon:'🎯', mode:'myaction',   featured:false },
  ];

  drawer.innerHTML = moreItems.map(item => `
    <button onclick="setMode('${item.mode}');closeMoreDrawer()" style="background:${item.featured?'rgba(0,229,255,.06)':'var(--card)'};border:1px solid ${item.featured?'rgba(0,229,255,.25)':'var(--border)'};border-radius:10px;padding:12px 8px;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;">
      <span style="font-size:18px">${item.icon}</span>
      <span style="font-family:'DM Mono',monospace;font-size:8px;color:${item.featured?'var(--accent)':'var(--muted)'};letter-spacing:.5px;font-weight:${item.featured?700:400}">${item.label.toUpperCase()}</span>
    </button>`).join('');

  document.body.appendChild(drawer);

  // Close on outside click
  setTimeout(()=>{
    document.addEventListener('click', function handler(e){
      const btn = document.getElementById('mobBtnMore');
      if(!drawer.contains(e.target) && !btn?.contains(e.target)){
        drawer.remove();
        document.removeEventListener('click', handler);
      }
    });
  }, 10);
}

function closeMoreDrawer() {
  const drawer = document.getElementById('moreDrawer');
  if(!drawer) return;
  drawer.style.transform = 'translateY(100%)';
  setTimeout(()=>drawer.remove(), 220);
}

// ═══════════════════════════════════════════════════════
// DESKTOP "MORE" DROPDOWN
// ═══════════════════════════════════════════════════════
function injectDesktopMoreBtn(){
  if(document.getElementById('btnDesktopMore')) return;
  const nav = document.getElementById('desktopNav');
  if(!nav) return;
  const btn = document.createElement('button');
  btn.id = 'btnDesktopMore';
  btn.className = 'mode-btn';
  btn.textContent = 'More ▾';
  btn.onclick = toggleDesktopMoreDropdown;
  // Insert before the Picks button if it exists, otherwise append
  const picksBtn = document.getElementById('btnPicks');
  if(picksBtn) nav.insertBefore(btn, picksBtn);
  else nav.appendChild(btn);
}

function toggleDesktopMoreDropdown(){
  const existing = document.getElementById('desktopMoreDropdown');
  if(existing){ existing.remove(); return; }

  const btn = document.getElementById('btnDesktopMore');
  if(!btn) return;
  const rect = btn.getBoundingClientRect();

  const dropdown = document.createElement('div');
  dropdown.id = 'desktopMoreDropdown';
  dropdown.style.cssText = `position:fixed;top:${rect.bottom+4}px;left:${rect.left}px;
    background:var(--card);border:1px solid var(--border);border-radius:10px;
    min-width:160px;z-index:400;box-shadow:0 8px 32px rgba(0,0,0,.5);overflow:hidden;padding:4px 0;`;

  const items = [
    { label:'📰 News',      mode:'news' },
    { label:'⚔️ Battles',   mode:'battles' },
    { label:'👥 Feed',       mode:'feed' },
    { label:'📈 Trends',     mode:'trends' },
    { label:'📅 Calendar',   mode:'calendar' },
  ];

  dropdown.innerHTML = items.map(item =>
    `<button onclick="setMode('${item.mode}');document.getElementById('desktopMoreDropdown')?.remove()" style="
      display:block;width:100%;text-align:left;padding:10px 14px;
      background:none;border:none;color:var(--text);cursor:pointer;
      font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.5px;
      transition:background .15s;
    " onmouseover="this.style.background='rgba(255,255,255,.06)'"
       onmouseout="this.style.background='none'">${item.label}</button>`
  ).join('');

  document.body.appendChild(dropdown);

  // Close on outside click
  setTimeout(()=>{
    document.addEventListener('click', function handler(e){
      if(!dropdown.contains(e.target) && !btn.contains(e.target)){
        dropdown.remove();
        document.removeEventListener('click', handler);
      }
    });
  }, 10);
}

// ═══════════════════════════════════════════════════════
// LOADING STATES for Trends, Battles, Feed
// ═══════════════════════════════════════════════════════
function showViewLoader(containerId, msg='Loading…') {
  const el = document.getElementById(containerId);
  if(!el) return;
  el.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 20px;gap:12px">
    <div style="width:20px;height:20px;border:2px solid var(--dim);border-top-color:var(--accent);border-radius:50%;animation:spin 1s linear infinite"></div>
    <div style="font-family:'DM Mono',monospace;font-size:10px;color:var(--muted);letter-spacing:2px">${msg}</div>
  </div>`;
}



// ═══════════════════════════════════════════════════════
// BANKROLL CHART — full interactive SVG in Analysis view
// ═══════════════════════════════════════════════════════
function renderBankrollChart() {
  const wagered = picks.filter(p=>normalizeResult(p.result)!=='pending'&&p.wager).sort((a,b)=>a.madeAt-b.madeAt);
  if(wagered.length < 2) return `<div style="color:var(--dim);font-family:'DM Mono',monospace;font-size:11px;text-align:center;padding:20px">Make 2+ picks with wagers to see your chart</div>`;

  let running = STARTING_BANKROLL;
  const points = [{y: running, pick: null, date: null}];
  wagered.forEach(p => {
    if(p.result==='won') running += calcPayout(p.wager, p.odds||-110);
    else if(p.result==='lost') running -= p.wager;
    points.push({
      y: Math.max(0, Math.round(running)),
      pick: p,
      date: new Date(p.madeAt).toLocaleDateString([],{month:'short',day:'numeric'})
    });
  });

  const min = Math.min(...points.map(p=>p.y));
  const max = Math.max(...points.map(p=>p.y));
  const range = max - min || 100;
  const W = 400, H = 120, PAD = 8;
  const coords = points.map((p,i) => ({
    x: PAD + (i / (points.length-1)) * (W - PAD*2),
    y: PAD + (1 - (p.y - min) / range) * (H - PAD*2),
    ...p
  }));

  const path = coords.map((c,i) => i===0 ? `M${c.x},${c.y}` : `L${c.x},${c.y}`).join(' ');
  const fillPath = path + ` L${coords[coords.length-1].x},${H} L${PAD},${H} Z`;
  const lastVal = points[points.length-1].y;
  const color = lastVal >= STARTING_BANKROLL ? '#2ed573' : '#ff4757';
  const pnl = lastVal - STARTING_BANKROLL;
  const pnlStr = (pnl >= 0 ? '+' : '') + '$' + Math.abs(Math.round(pnl)).toLocaleString();

  // Dots for last few picks
  const dotHtml = coords.slice(-8).map(c => {
    const dc = c.pick?.result==='won' ? '#2ed573' : c.pick?.result==='lost' ? '#ff4757' : 'var(--gold)';
    return `<circle cx="${c.x}" cy="${c.y}" r="3" fill="${dc}" stroke="var(--card)" stroke-width="1.5"/>`;
  }).join('');

  // Baseline at $1000
  const baseY = PAD + (1 - (STARTING_BANKROLL - min) / range) * (H - PAD*2);
  const baseLine = baseY > PAD && baseY < H ? `<line x1="${PAD}" y1="${baseY}" x2="${W-PAD}" y2="${baseY}" stroke="rgba(255,255,255,.08)" stroke-width="1" stroke-dasharray="4,4"/>` : '';

  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:12px">
      <div>
        <div style="font-size:28px;font-weight:800;font-family:'Syne',sans-serif;color:${color}">${'$'+lastVal.toLocaleString()}</div>
        <div style="font-family:'DM Mono',monospace;font-size:10px;color:${color}">${pnlStr} all time</div>
      </div>
      <div style="text-align:right;font-family:'DM Mono',monospace;font-size:9px;color:var(--muted)">
        <div>START $${STARTING_BANKROLL.toLocaleString()}</div>
        <div>${wagered.length} PICKS</div>
      </div>
    </div>
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px;overflow:hidden;display:block">
      <defs>
        <linearGradient id="bankGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity=".25"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${baseLine}
      <path d="${fillPath}" fill="url(#bankGrad)"/>
      <path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${dotHtml}
    </svg>
    <div style="display:flex;justify-content:space-between;font-family:'DM Mono',monospace;font-size:9px;color:var(--dim);margin-top:6px">
      <span>${points[1]?.date||''}</span>
      <span>— — — $${STARTING_BANKROLL.toLocaleString()} baseline — — —</span>
      <span>TODAY</span>
    </div>`;
}

// ═══════════════════════════════════════════════════════
// MY ACTION VIEW — Focused view of all games user has picks on
// Shows live games first, then upcoming, then recently settled
// ═══════════════════════════════════════════════════════
function renderMyActionView(){
  const el = document.getElementById('myactionContent');
  if(!el) return;

  const pendingPicks = picks.filter(p => p.result === 'pending' && p.type !== 'parlay');
  const todaySettled = picks.filter(p => p.result !== 'pending' && p.type !== 'parlay' && p.madeAt && (Date.now() - p.madeAt < 86400000));

  if(!pendingPicks.length && !todaySettled.length){
    el.innerHTML = `<div class="myaction-hdr">
      <div><div class="myaction-title">🎯 My Action</div><div class="myaction-subtitle">GAMES WITH YOUR PICKS</div></div>
    </div>
    <div class="myaction-empty">
      <div class="myaction-empty-icon">🎯</div>
      NO ACTIVE PICKS<br><br>
      <span style="color:var(--dim)">Make some picks from the Scores tab<br>and they'll appear here</span><br><br>
      <button onclick="setMode('scores')" style="background:var(--accent);color:#000;border:none;border-radius:6px;padding:8px 20px;font-family:'DM Mono',monospace;font-size:10px;font-weight:700;cursor:pointer;letter-spacing:1px">BROWSE GAMES →</button>
    </div>`;
    return;
  }

  // Group picks by game
  const gamePickMap = {};
  [...pendingPicks, ...todaySettled].forEach(p => {
    const gid = p.gameId;
    if(!gamePickMap[gid]) gamePickMap[gid] = {picks:[], game: allGames.find(g=>g.id===gid)};
    gamePickMap[gid].picks.push(p);
  });

  // Categorize
  const liveEntries = [], upcomingEntries = [], settledEntries = [];
  Object.values(gamePickMap).forEach(entry => {
    const g = entry.game;
    if(!g){
      // Game not in cache — might be from a different date
      const hasSettled = entry.picks.some(p=>normalizeResult(p.result)!=='pending');
      if(hasSettled) settledEntries.push(entry);
      else upcomingEntries.push(entry);
      return;
    }
    if(g.isLive) liveEntries.push(entry);
    else if(g.isPre) upcomingEntries.push(entry);
    else settledEntries.push(entry);
  });

  // Summary stats
  const dayPicks = [...pendingPicks, ...todaySettled];
  const dayWon = dayPicks.filter(p=>p.result==='won').length;
  const dayLost = dayPicks.filter(p=>p.result==='lost').length;
  let dayPnL = 0;
  dayPicks.forEach(p => {
    if(p.result==='won' && p.wager) dayPnL += calcPayout(p.wager, p.odds||-110);
    else if(p.result==='lost' && p.wager) dayPnL -= p.wager;
  });
  const pnlClass = dayPnL > 0 ? 'pos' : dayPnL < 0 ? 'neg' : 'even';
  const pnlStr = (dayPnL >= 0 ? '+' : '') + '$' + Math.abs(Math.round(dayPnL));
  const todaysLock = getTodaysLock();

  let html = `<div class="myaction-hdr">
    <div>
      <div class="myaction-title">🎯 My Action</div>
      <div class="myaction-subtitle">${dayPicks.length} PICK${dayPicks.length!==1?'S':''} TODAY</div>
    </div>
    <div class="myaction-pnl ${pnlClass}">${pnlStr}</div>
  </div>`;

  // Summary cards
  html += `<div class="myaction-summary">
    <div class="myaction-stat"><div class="myaction-stat-val" style="color:var(--green)">${liveEntries.length}</div><div class="myaction-stat-lbl">LIVE</div></div>
    <div class="myaction-stat"><div class="myaction-stat-val" style="color:var(--gold)">${upcomingEntries.length}</div><div class="myaction-stat-lbl">UPCOMING</div></div>
    <div class="myaction-stat"><div class="myaction-stat-val">${dayWon}W-${dayLost}L</div><div class="myaction-stat-lbl">TODAY</div></div>
  </div>`;

  // Today's Lock callout
  if(todaysLock){
    html += `<div style="background:rgba(255,165,2,.06);border:1px solid rgba(255,165,2,.2);border-radius:8px;padding:10px 12px;margin-bottom:14px;display:flex;align-items:center;gap:10px">
      <span style="font-size:20px">🔒</span>
      <div style="flex:1">
        <div style="font-family:'DM Mono',monospace;font-size:8px;color:var(--gold);letter-spacing:1.5px;margin-bottom:2px">LOCK OF THE DAY</div>
        <div style="font-size:12px;font-weight:700">${todaysLock.description}</div>
        ${todaysLock.wager?`<div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);margin-top:2px">💰 $${todaysLock.wager} to win +$${calcPayout(todaysLock.wager,todaysLock.odds||-110)}</div>`:''}
      </div>
      <span style="font-family:'DM Mono',monospace;font-size:10px;color:${todaysLock.result==='won'?'var(--green)':todaysLock.result==='lost'?'var(--red)':'var(--gold)'}">${todaysLock.result==='pending'?'PENDING':todaysLock.result.toUpperCase()}</span>
    </div>`;
  }

  function renderActionCard(entry, category){
    const g = entry.game;
    const gameName = g ? `${g.away.name} @ ${g.home.name}` : (entry.picks[0]?.gameStr || 'Unknown Game');
    const scoreText = g && !g.isPre ? `${g.away.score} — ${g.home.score}` : '';
    const statusText = g ? (g.isLive ? g.statusText : g.isPre ? g.startTime : 'FINAL') : '';

    let cardsHtml = `<div class="myaction-card ${category}" onclick="${g?`openGame('${g.id}')`:''}">
      <div class="myaction-game">
        <div>
          <div class="myaction-teams">${gameName}</div>
          <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);margin-top:2px">${entry.picks[0]?.league||''} · ${statusText}</div>
        </div>
        ${scoreText?`<div class="myaction-score">${scoreText}</div>`:''}
      </div>`;

    entry.picks.forEach(p => {
      let statusClass = '', statusLabel = '';
      if(p.result === 'won'){ statusClass='won'; statusLabel='✅ WON'; }
      else if(p.result === 'lost'){ statusClass='lost'; statusLabel='❌ LOST'; }
      else if(p.result === 'push'){ statusClass='push'; statusLabel='↔ PUSH'; }
      else if(g && g.isLive){
        const cov = evaluateCovering(p, g);
        if(cov === true){ statusClass='covering'; statusLabel='✅ COVERING'; }
        else if(cov === false){ statusClass='losing'; statusLabel='⚠️ LOSING'; }
        else{ statusClass='push'; statusLabel='↔ PUSH'; }
      } else {
        statusClass='pending'; statusLabel='⏳ PENDING';
      }

      cardsHtml += `<div class="myaction-pick-row">
        ${p.isLock?'<span class="lock-badge"><span class="lock-badge-sm">🔒</span>LOCK</span>':''}
        <div class="myaction-pick-desc">${p.description}</div>
        <span class="myaction-status ${statusClass}">${statusLabel}</span>
        ${p.wager?`<span class="myaction-wager">$${p.wager}</span>`:''}
      </div>`;
    });

    cardsHtml += `</div>`;
    return cardsHtml;
  }

  if(liveEntries.length){
    html += `<div class="myaction-section-title"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--green);animation:pulse 1.2s infinite"></span> LIVE — ${liveEntries.length} GAME${liveEntries.length!==1?'S':''}</div>`;
    liveEntries.forEach(e => { html += renderActionCard(e, 'live'); });
  }

  if(upcomingEntries.length){
    html += `<div class="myaction-section-title">UPCOMING — ${upcomingEntries.length} GAME${upcomingEntries.length!==1?'S':''}</div>`;
    upcomingEntries.forEach(e => { html += renderActionCard(e, 'upcoming'); });
  }

  if(settledEntries.length){
    html += `<div class="myaction-section-title">SETTLED TODAY</div>`;
    settledEntries.forEach(e => { html += renderActionCard(e, 'settled'); });
  }

  el.innerHTML = html;
}

// ═══════════════════════════════════════════════════════
// LIVE PICK TRACKER BAR
// ═══════════════════════════════════════════════════════
function renderLivePickBar() {
  // Find pending picks on live games
  const liveGames = allGames.filter(g => g.isLive);
  if(!liveGames.length) {
    document.getElementById('livePickBar')?.remove();
    return;
  }

  const livePicks = picks.filter(p => {
    if(p.result !== 'pending') return false;
    return liveGames.some(g => g.id === p.gameId || g.id === p.actualGameId);
  });

  if(!livePicks.length) {
    document.getElementById('livePickBar')?.remove();
    return;
  }

  let bar = document.getElementById('livePickBar');
  const wasCollapsed = bar ? bar.dataset.collapsed === '1' : livePicks.length >= 3;
  if(!bar) {
    bar = document.createElement('div');
    bar.id = 'livePickBar';
    // Static position — sits at top of scores view, never covers content
    bar.style.cssText = 'background:rgba(8,12,16,.97);border-bottom:1px solid rgba(46,213,115,.2);overflow:hidden;';
    // Insert before slateSummary
    const slate = document.getElementById('slateSummary');
    if(slate) slate.before(bar);
    else document.getElementById('scoresView')?.prepend(bar);
  }
  // Persist collapsed state across poll refreshes
  bar.dataset.collapsed = wasCollapsed ? '1' : '0';

  const covering = livePicks.filter(p => evaluateCovering(p, liveGames.find(x => x.id === p.gameId || x.id === p.actualGameId)) === true).length;
  const losing   = livePicks.filter(p => evaluateCovering(p, liveGames.find(x => x.id === p.gameId || x.id === p.actualGameId)) === false).length;
  const summaryColor = losing > covering ? '#ff4757' : covering > 0 ? '#2ed573' : 'var(--gold)';

  const items = livePicks.map(p => {
    const g = liveGames.find(x => x.id === p.gameId || x.id === p.actualGameId);
    if(!g) return '';
    const hs = g.home.score, as2 = g.away.score;
    const isCovering = evaluateCovering(p, g);
    const statusColor = isCovering === true ? '#2ed573' : isCovering === false ? '#ff4757' : 'var(--gold)';
    const statusIcon  = isCovering === true ? '✅' : isCovering === false ? '⚠️' : '⏳';
    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 12px;border-bottom:1px solid rgba(255,255,255,.04);cursor:pointer" onclick="openGame('${g.id}')">
      <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#2ed573;animation:pulse 1.2s infinite;flex-shrink:0"></span>
      <span style="font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);flex-shrink:0">${g.statusText}</span>
      <span style="font-family:'DM Mono',monospace;font-size:10px;font-weight:700;flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${g.away.abbr} ${as2} — ${g.home.abbr} ${hs}</span>
      <span style="font-size:9px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px">${p.description}</span>
      <span style="font-family:'DM Mono',monospace;font-size:9px;color:${statusColor};flex-shrink:0">${statusIcon} ${isCovering===true?'COVERING':isCovering===false?'LOSING':'PUSH'}</span>
    </div>`;
  }).join('');

  // Summary chips for collapsed view
  const chips = [
    covering > 0 ? `<span style="background:rgba(46,213,115,.15);border:1px solid rgba(46,213,115,.3);color:#2ed573;border-radius:10px;padding:1px 8px;font-size:8px">✅ ${covering} COVERING</span>` : '',
    losing  > 0 ? `<span style="background:rgba(255,71,87,.15);border:1px solid rgba(255,71,87,.3);color:#ff4757;border-radius:10px;padding:1px 8px;font-size:8px">⚠️ ${losing} LOSING</span>` : '',
    (livePicks.length - covering - losing) > 0 ? `<span style="background:rgba(255,200,0,.1);border:1px solid rgba(255,200,0,.2);color:var(--gold);border-radius:10px;padding:1px 8px;font-size:8px">⏳ ${livePicks.length - covering - losing} PUSH</span>` : '',
  ].filter(Boolean).join('');

  const headerHtml = `<div style="display:flex;align-items:center;gap:8px;padding:6px 12px;cursor:pointer;user-select:none" onclick="(function(el){const b=document.getElementById('livePickBar');const c=b.dataset.collapsed==='1';b.dataset.collapsed=c?'0':'1';const list=b.querySelector('.lpb-list');if(list)list.style.display=c?'block':'none';el.querySelector('.lpb-chevron').textContent=c?'▲':'▼';})(this)">
    <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#2ed573;animation:pulse 1.2s infinite;flex-shrink:0"></span>
    <span style="font-family:'DM Mono',monospace;font-size:8px;letter-spacing:2px;color:#2ed573;flex-shrink:0">LIVE — ${livePicks.length} PICK${livePicks.length!==1?'S':''} IN ACTION</span>
    <span style="display:flex;gap:4px;flex-wrap:nowrap;overflow:hidden">${chips}</span>
    <span class="lpb-chevron" style="font-family:'DM Mono',monospace;font-size:8px;color:var(--muted);margin-left:auto;flex-shrink:0">${wasCollapsed?'▼':'▲'}</span>
  </div>`;

  const barHtml = `${headerHtml}<div class="lpb-list" style="display:${wasCollapsed?'none':'block'}">${items}</div>`;
  // Only update DOM if content changed — prevents animation restart on every poll
  if(bar.dataset.lastHtml !== barHtml){ bar.dataset.lastHtml=barHtml; bar.innerHTML=barHtml; }
}

// Evaluate if a pending pick is currently covering
function evaluateCovering(pick, game) {
  if(!game.isLive) return null;
  const hs = parseInt(game.home.score) || 0;
  const as2 = parseInt(game.away.score) || 0;
  try {
    if(pick.type === 'spread') {
      const line = parseFloat((pick.description||'').match(/([+-][\d.]+)/)?.[1] || '0');
      const isHome = pick.side?.includes(game.home.name) || pick.side?.includes(game.home.abbr);
      const margin = isHome ? hs - as2 : as2 - hs;
      const adjusted = margin + line;
      if(Math.abs(adjusted) < 0.5) return null; // push territory
      return adjusted > 0;
    } else if(pick.type === 'total') {
      const total = hs + as2;
      const line = parseFloat((pick.description||'').match(/([\d.]+)/)?.[1] || '0');
      const isOver = pick.side?.toLowerCase().includes('over') || pick.description?.toLowerCase().includes('over');
      if(Math.abs(total - line) < 0.5) return null;
      return isOver ? total > line : total < line;
    }
  } catch(e) {}
  return null;
}

// ═══════════════════════════════════════════════════════
// WIN SHARE PROMPT
// ═══════════════════════════════════════════════════════
function showWinSharePrompt(pick) {
  // Delay slightly so confetti plays first
  setTimeout(() => {
    const existing = document.getElementById('winSharePrompt');
    if(existing) existing.remove();

    const profit = pick.wager ? `+$${calcPayout(pick.wager, pick.odds||-110)}` : '';
    const overlay = document.createElement('div');
    overlay.id = 'winSharePrompt';
    overlay.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:500;width:calc(100% - 32px);max-width:360px;';

    overlay.innerHTML = `<div style="background:linear-gradient(135deg,rgba(46,213,115,.15),rgba(0,229,255,.08));border:1px solid rgba(46,213,115,.3);border-radius:14px;padding:16px;backdrop-filter:blur(20px);box-shadow:0 20px 60px rgba(0,0,0,.6)">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <span style="font-size:24px">🏆</span>
        <div>
          <div style="font-size:13px;font-weight:800">Winner! ${profit}</div>
          <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);margin-top:2px">${pick.description}</div>
        </div>
        <button onclick="document.getElementById('winSharePrompt').remove()" style="margin-left:auto;background:none;border:none;color:var(--dim);cursor:pointer;font-size:16px;flex-shrink:0">✕</button>
      </div>
      <div style="display:flex;gap:8px">
        <button onclick="shareWin(${JSON.stringify(pick).replace(/"/g,'&quot;')})" style="flex:1;padding:9px;background:rgba(46,213,115,.15);border:1px solid rgba(46,213,115,.3);border-radius:8px;color:#2ed573;font-family:'DM Mono',monospace;font-size:9px;font-weight:700;cursor:pointer;letter-spacing:1px">📤 SHARE WIN</button>
        <button onclick="postWinToFeed(${JSON.stringify(pick).replace(/"/g,'&quot;')})" style="flex:1;padding:9px;background:rgba(0,229,255,.08);border:1px solid rgba(0,229,255,.15);border-radius:8px;color:var(--accent);font-family:'DM Mono',monospace;font-size:9px;font-weight:700;cursor:pointer;letter-spacing:1px">📢 POST TO FEED</button>
      </div>
    </div>`;

    document.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), 8000); // auto-dismiss
  }, 1500);
}

function shareWin(pick) {
  document.getElementById('winSharePrompt')?.remove();
  sharePickCard({...pick, name: currentUser?.name});
}

function postWinToFeed(pick) {
  document.getElementById('winSharePrompt')?.remove();
  // Already published via publishToLeaderboard — just show confirmation
  publishToLeaderboard();
  showWinToast('📢 Shared to feed!');
}

// ═══════════════════════════════════════════════════════
// GLOBAL SEARCH
// ═══════════════════════════════════════════════════════
// (hoisted to top)

function toggleSearch() {
  searchOpen = !searchOpen;
  let panel = document.getElementById('globalSearchPanel');
  if(!searchOpen) { panel?.remove(); return; }
  if(panel) return;

  panel = document.createElement('div');
  panel.id = 'globalSearchPanel';
  panel.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:600;background:rgba(0,0,0,.92);backdrop-filter:blur(10px);display:flex;flex-direction:column;padding:16px;';
  panel.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
      <input id="globalSearchInput" type="search" placeholder="Search games, teams, your picks…"
        style="flex:1;background:var(--card);border:1px solid var(--accent);border-radius:10px;padding:12px 16px;color:var(--text);font-size:15px;outline:none;font-family:'DM Sans',sans-serif"
        oninput="runSearch(this.value)" autocomplete="off" spellcheck="false">
      <button onclick="toggleSearch()" style="background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer;padding:8px">✕</button>
    </div>
    <div id="searchResults" style="overflow-y:auto;flex:1"></div>`;

  document.body.appendChild(panel);
  setTimeout(() => document.getElementById('globalSearchInput')?.focus(), 50);

  // ESC to close
  panel._escHandler = e => { if(e.key==='Escape') toggleSearch(); };
  document.addEventListener('keydown', panel._escHandler);
}

function runSearch(q) {
  const el = document.getElementById('searchResults');
  if(!el) return;
  const query = q.trim().toLowerCase();
  if(!query) { el.innerHTML = renderSearchPlaceholder(); return; }

  const results = [];

  // Search games
  allGames.forEach(g => {
    if(g.home.name.toLowerCase().includes(query) || g.away.name.toLowerCase().includes(query) ||
       g.home.abbr.toLowerCase().includes(query) || g.away.abbr.toLowerCase().includes(query)) {
      results.push({ type: 'game', g, score: g.isLive ? 3 : g.isPre ? 2 : 1 });
    }
  });

  // Search pick history
  picks.filter(p => normalizeResult(p.result)!=='pending').forEach(p => {
    if(p.description?.toLowerCase().includes(query) || p.gameStr?.toLowerCase().includes(query) ||
       p.league?.toLowerCase().includes(query)) {
      results.push({ type: 'pick', p, score: 0 });
    }
  });

  results.sort((a,b) => b.score - a.score);

  if(!results.length) {
    el.innerHTML = `<div style="text-align:center;padding:40px;color:var(--dim);font-family:'DM Mono',monospace;font-size:11px">No results for "${q}"</div>`;
    return;
  }

  const games = results.filter(r=>r.type==='game').slice(0,8);
  const pickResults = results.filter(r=>r.type==='pick').slice(0,6);

  let html = '';
  if(games.length) {
    html += `<div style="font-family:'DM Mono',monospace;font-size:8px;letter-spacing:2px;color:var(--muted);margin-bottom:8px">GAMES</div>`;
    html += games.map(({g}) => `<div onclick="closeSearchAndOpen('${g.id}')" style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:8px;cursor:pointer;display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-size:12px;font-weight:700">${g.away.name} <span style="color:var(--muted)">@</span> ${g.home.name}</div>
        <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);margin-top:3px">${g.leagueLabel} · ${g.isLive?'<span style="color:#2ed573">LIVE</span>':g.isFinal?'Final':g.startTime}</div>
      </div>
      ${g.isLive?`<div style="font-weight:700">${g.away.score}—${g.home.score}</div>`:''}
    </div>`).join('');
  }
  if(pickResults.length) {
    html += `<div style="font-family:'DM Mono',monospace;font-size:8px;letter-spacing:2px;color:var(--muted);margin:16px 0 8px">YOUR PICKS</div>`;
    html += pickResults.map(({p}) => `<div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-size:11px;font-weight:600">${p.description}</div>
        <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);margin-top:3px">${p.league||''} · ${new Date(p.madeAt).toLocaleDateString()}</div>
      </div>
      <span style="font-family:'DM Mono',monospace;font-size:9px;padding:3px 8px;border-radius:4px;background:${p.result==='won'?'rgba(46,213,115,.12)':p.result==='lost'?'rgba(255,71,87,.1)':'rgba(255,255,255,.05)'};color:${p.result==='won'?'#2ed573':p.result==='lost'?'#ff4757':'var(--muted)'}">${p.result.toUpperCase()}</span>
    </div>`).join('');
  }
  el.innerHTML = html;
}

function renderSearchPlaceholder() {
  const pending = picks.filter(p=>p.result==='pending').length;
  const liveCount = allGames.filter(g=>g.isLive).length;
  return `<div style="padding:8px 0;font-family:'DM Mono',monospace;font-size:10px;color:var(--muted)">
    ${liveCount?`<div onclick="closeSearchAndMode('scores')" style="padding:10px;border-radius:8px;margin-bottom:6px;cursor:pointer;background:rgba(46,213,115,.06);border:1px solid rgba(46,213,115,.1)">🟢 ${liveCount} game${liveCount!==1?'s':''} live right now</div>`:''}
    ${pending?`<div onclick="toggleSearch();openPanel()" style="padding:10px;border-radius:8px;margin-bottom:6px;cursor:pointer;background:var(--card);border:1px solid var(--border)">🎯 You have ${pending} pending pick${pending!==1?'s':''}</div>`:''}
    <div style="color:var(--dim);text-align:center;padding:20px;letter-spacing:1px">TYPE TO SEARCH TEAMS · GAMES · PICKS</div>
  </div>`;
}

function closeSearchAndOpen(gameId) {
  toggleSearch();
  searchOpen = false;
  setMode('scores');
  setTimeout(() => openGame(gameId), 200);
}

function closeSearchAndMode(mode) {
  toggleSearch();
  searchOpen = false;
  setMode(mode);
}

// ═══════════════════════════════════════════════════════
// DAILY DIGEST NOTIFICATION
// ═══════════════════════════════════════════════════════
function scheduleDailyDigest() {
  if(pushPermission !== 'granted') return;
  const now = new Date();
  const sentKey = `digest_sent_${now.toISOString().slice(0,10)}`;
  if(localStorage.getItem(sentKey)) return;

  const hour = now.getHours();
  // Send between 9-11am local time
  if(hour < 9 || hour > 11) return;

  localStorage.setItem(sentKey, '1');

  // Build digest message
  const todayGames = allGames.filter(g => g.isPre || g.isLive);
  const pendingPicks = picks.filter(p => p.result === 'pending');
  const bankroll = computeBankroll();
  const pnl = bankroll - STARTING_BANKROLL;
  const streak = calcPickStats(picks);

  let title = '📊 SharpPick Daily Briefing';
  let body = '';

  if(todayGames.length && pendingPicks.length) {
    body = `${todayGames.length} games today · ${pendingPicks.length} picks live · $${Math.round(bankroll).toLocaleString()} bankroll`;
  } else if(todayGames.length) {
    body = `${todayGames.length} games on today's slate · Bankroll: $${Math.round(bankroll).toLocaleString()}${pnl!==0?' ('+((pnl>0?'+':'')+'$'+Math.round(pnl))+')':''}`;
  } else {
    body = `Bankroll: $${Math.round(bankroll).toLocaleString()} · ${streak.curStreak>1?streak.curStreak+'-pick win streak · ':''}Check today's slate`;
  }

  if(streak.curStreak >= 3) title = `🔥 ${streak.curStreak}-pick streak! · ${title}`;

  sendPushNotification(title, body, 'daily-digest');
}

// ═══════════════════════════════════════════════════════
// IMPROVED EMPTY STATES
// ═══════════════════════════════════════════════════════
function getBestGameToday() {
  // Return the game with the most props/action for empty state CTA
  const preGames = allGames.filter(g => g.isPre);
  if(!preGames.length) return allGames[0] || null;
  // Prefer games with odds
  return preGames.find(g => g.odds?.spread) || preGames[0];
}

function emptyPicksHTML() {
  const game = getBestGameToday();
  if(!game) {
    return `<div class="no-picks">NO PICKS YET<br><br><small style="font-size:10px;color:var(--dim)">Browse today's games and tap any card to get started</small></div>`;
  }
  const hasOdds = game.odds?.spread;
  return `<div class="no-picks" style="padding:24px">
    <div style="font-size:28px;margin-bottom:12px">🎯</div>
    <div style="font-size:13px;font-weight:700;margin-bottom:6px">No picks yet</div>
    <div style="font-size:11px;color:var(--dim);margin-bottom:20px">Tap a game card to pick spreads, totals, and props</div>
    <div onclick="closePanel();setMode('scores');setTimeout(()=>openGame('${game.id}'),200)" style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px;cursor:pointer;text-align:left">
      <div style="font-family:'DM Mono',monospace;font-size:8px;color:var(--muted);margin-bottom:6px">FEATURED GAME · TAP TO PICK</div>
      <div style="font-size:12px;font-weight:700;margin-bottom:4px">${game.away.name} @ ${game.home.name}</div>
      <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--muted)">${game.leagueLabel} · ${game.startTime}${hasOdds?' · '+game.odds.spread:''}</div>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════
// LEAGUE PERSONALITY — name + emoji in header
// ═══════════════════════════════════════════════════════
function renderLeagueHeader(league) {
  if(!league) return '';
  const emoji = league.emoji || '🏆';
  const name = league.name || 'My League';
  const memberCount = league.members?.length || 0;
  const myRank = league.members ? (() => {
    const sorted = [...league.members].sort((a,b)=>(b.w||0)-(a.w||0));
    const idx = sorted.findIndex(m=>m.id===currentUser?.id);
    return idx >= 0 ? idx+1 : null;
  })() : null;

  return `<div style="background:linear-gradient(135deg,rgba(0,229,255,.06),rgba(138,43,226,.04));border-bottom:1px solid var(--border);padding:16px">
    <div style="display:flex;align-items:center;gap:12px">
      <div style="font-size:32px">${emoji}</div>
      <div style="flex:1">
        <div style="font-size:18px;font-weight:800">${name}</div>
        <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);margin-top:2px">
          ${memberCount} MEMBER${memberCount!==1?'S':''} ${myRank?'· YOU ARE #'+myRank:''}
        </div>
      </div>
      <button onclick="copyLeagueLink('${league.id}')" style="background:rgba(0,229,255,.08);border:1px solid rgba(0,229,255,.15);border-radius:8px;padding:7px 12px;color:var(--accent);font-family:'DM Mono',monospace;font-size:8px;cursor:pointer;letter-spacing:1px">🔗 INVITE</button>
    </div>
    ${myRank === 1 ? `<div style="margin-top:10px;font-family:'DM Mono',monospace;font-size:9px;color:var(--gold)">👑 You're leading this league. Don't let up.</div>` :
      myRank ? `<div style="margin-top:10px;font-family:'DM Mono',monospace;font-size:9px;color:var(--muted)">You're #${myRank}. ${myRank===2?'One spot from the top.':myRank<=4?'In the hunt.':'Keep picking.'}</div>` : ''}
  </div>`;
}




// ═══════════════════════════════════════════════════════
// SYNC DEBUG — run window.debugSync() in browser console
// to diagnose mobile→desktop pick sync issues
// ═══════════════════════════════════════════════════════
window.debugSync = async function(){
  console.group('🔍 SharpPick Sync Debug');
  console.log('supaOnline:', supaOnline);
  console.log('currentUser:', currentUser?.id, currentUser?.name);
  console.log('_initialSyncDone:', _initialSyncDone);
  console.log('syncInProgress:', syncInProgress);
  console.log('lastSyncAt:', new Date(lastSyncAt).toISOString());
  console.log('local picks count:', picks.length);

  const token = _getUserToken();
  console.log('auth token present:', !!token);
  if(token){
    try{
      const payload = JSON.parse(atob(token.split('.')[1]));
      console.log('token expires:', new Date(payload.exp*1000).toISOString());
      console.log('token expired:', Date.now() > payload.exp*1000);
    }catch(e){ console.warn('token decode failed:', e.message); }
  }

  // Try a direct Supabase read with the user token
  try{
    const userToken = _getUserToken();
    const headers = userToken
      ? { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + userToken, 'Content-Type': 'application/json' }
      : { ...SUPA_HDR };
    const r = await fetch(`${SUPA_REST}/user_picks?user_id=eq.${currentUser?.id}&select=id,game_id,type,side,result&order=made_at.desc&limit=500`, { headers });
    const txt = await r.text();
    console.log('Direct Supabase read — status:', r.status);
    try{
      const rows = JSON.parse(txt);
      console.log('Rows returned from server:', rows.length);
      // Show which local picks are NOT on the server
      const serverIds = new Set(rows.map(r=>r.id));
      const missing = picks.filter(p => p._syncId && !serverIds.has(p._syncId));
      const noId = picks.filter(p => !p._syncId);
      console.log('Local picks missing from server:', missing.length);
      console.log('Local picks with no _syncId:', noId.length);
      if(rows.length) console.log('First server row:', rows[0]);
    }catch{ console.log('Raw response:', txt.slice(0,300)); }
  }catch(e){
    console.error('Direct fetch failed:', e.message);
  }

  // Force push ALL local picks to server
  console.log('--- Force pushing all local picks to server ---');
  lastSyncAt = 0; syncInProgress = false;
  await syncPicksToServerForced().catch(e => console.error('push failed:', e.message));
  console.log('Push complete — waiting 2s then pulling from server...');
  await new Promise(r => setTimeout(r, 2000));

  // Force a fresh pull
  console.log('--- Forcing syncPicksFromServer ---');
  lastSyncAt = 0; syncInProgress = false;
  const result = await syncPicksFromServer(true).catch(e => 'ERROR: '+e.message);
  console.log('syncPicksFromServer result:', result);
  console.log('local picks after sync:', picks.length);
  console.groupEnd();
};
console.log('[SharpPick] Debug ready — run window.debugSync() in console to diagnose sync issues');

