# SharpPick — The Sports Intelligence Platform

> **Pick against real odds. Track your edge. Prove you're actually sharp.**

[![Live App](https://img.shields.io/badge/Live%20App-getsharppick.com-00e5ff?style=flat-square)](https://getsharppick.com)
[![Built with Vanilla JS](https://img.shields.io/badge/Built%20With-Vanilla%20JS-f7df1e?style=flat-square&logo=javascript)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Powered by Supabase](https://img.shields.io/badge/Backend-Supabase-3ecf8e?style=flat-square&logo=supabase)](https://supabase.com)
[![Deployed on Netlify](https://img.shields.io/badge/Deployed-Netlify-00c7b7?style=flat-square&logo=netlify)](https://netlify.com)

---

## Overview

SharpPick is a full-stack, real-time sports pick-tracking and social competition platform — think **Strava for sports picks**. Users make predictions against live sportsbook-grade odds from ESPN, track their performance across a proprietary skill-rating system, and compete on global leaderboards.

**No real money. No gambling. Just data-driven competition and skill development.**

Built entirely as a solo project by a self-taught developer, SharpPick is a live production application with real users, real-time data, and a growing feature set.

---

## Features

### 🎯 Core Pick Tracking
- Make picks against **live ESPN odds** (spreads, totals, moneylines, props)
- Real-time pick settlement as games go final
- Virtual bankroll simulation with full ROI tracking
- Parlay builder supporting up to 12-leg parlays

### 🏆 Sharp Rating System
- Proprietary **0–1000 skill rating** incorporating win rate, ROI, consistency, and volume
- **Provisional → Verified** tier progression (20+ settled picks to verify)
- Global leaderboard with 90-day rolling performance windows
- Weekly leaderboard resets and "Biggest Movers" tracking

### 🤖 AI Performance Breakdown
- Personalized coaching powered by **Claude AI (Anthropic)**
- Analyzes your last 10 settled picks and generates specific, actionable insights
- Identifies your strongest sport/bet type and surfaces patterns in your losses
- Delivered via a secure Netlify serverless function — API key never exposed client-side

### ⚔️ Social & Competition
- **Pick Battles** — head-to-head challenges against any user
- **Pick'em contests** — daily and weekly group competitions
- Follow system with personalized activity feed
- Shareable player cards showing your record and Sharp Rating

### 📊 Analytics Dashboard
- Win rate by sport, league, bet type, day of week, and time of day
- 30-day vs. all-time performance trend comparison
- Rolling 7-pick win rate sparkline
- Over/Under split analysis and average odds tracking
- Bankroll history chart

### 🔴 Live Experience
- Live score updates every 5 seconds
- Real-time pick grading as games finish
- Injury flags and consensus pick percentages
- Multi-sport calendar view (12+ leagues covered)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JavaScript (SPA), HTML5, CSS3 |
| Backend | Supabase (PostgreSQL + Auth + RLS) |
| Serverless Functions | Netlify Functions (Node.js) |
| Data Source | ESPN API (live scores, odds, game data) |
| AI Integration | Anthropic Claude API (claude-sonnet) |
| Deployment | Netlify (CI/CD via GitHub) |
| Version Control | GitHub |

---

## Architecture

SharpPick is a **single-page application** with a vanilla JavaScript frontend communicating directly with Supabase via REST API. Netlify Functions handle server-side logic including:

- `on-pick-settled.js` — Supabase webhook trigger that fires when picks are graded
- `recalculate-ratings.js` — Sharp Rating computation on a scheduled cron
- `ai-breakdown.js` — Secure Claude API proxy for the AI Performance Breakdown feature

Authentication is handled via Supabase Auth with JWT tokens. All database writes enforce **Row Level Security (RLS)** policies ensuring users can only read/write their own data.

```
Browser (Vanilla JS SPA)
    │
    ├── ESPN API (live odds + scores)
    │
    ├── Supabase REST API (picks, ratings, leaderboard)
    │    └── PostgreSQL with RLS policies
    │
    └── Netlify Functions
         ├── ai-breakdown.js → Anthropic Claude API
         ├── on-pick-settled.js (webhook)
         └── recalculate-ratings.js (cron)
```

---

## Key Engineering Challenges Solved

**Cross-device sync** — Rewrote the sync layer to write directly to Supabase with JWT freshness checks and auto-refresh, replacing a Netlify proxy that was silently failing on mobile Safari.

**Rating consistency** — Identified and resolved a scheduled Netlify function silently overwriting correct Sharp Ratings with a stale formula every 4 hours. Implemented formula synchronization across three compute locations.

**RLS & auth discipline** — Resolved conflicting RLS policies and fixed Pick'em records not persisting due to anon key being used instead of user JWT on writes.

**ESPN API edge cases** — Fixed moneyline bets being misclassified as point spreads due to undocumented spread string format variations in the ESPN response schema.

**Secure AI integration** — Routed all Anthropic API calls through a Netlify serverless function to keep the API key server-side, with CORS handling for the frontend SPA.

---

## Local Development

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/sharppick.git
cd sharppick

# No build step required — vanilla JS SPA
# Open index.html in your browser or use a local server:
npx serve .
```

### Environment Variables (Netlify Functions)

Create a `.env` file or set these in your Netlify dashboard:

```
ANTHROPIC_API_KEY=your_anthropic_api_key
```

> The Supabase anon key is intentionally client-side (this is standard Supabase practice). All data access is protected by Row Level Security policies.

---

## Project Structure

```
/
├── index.html                  # Single HTML shell
├── app_hotfix_v39.js           # Main application (SPA logic)
├── styles.css                  # Global styles
├── assets/                     # Icons and images
├── LICENSE                     # CC BY-NC 4.0
└── netlify/
    └── functions/
        ├── ai-breakdown.js     # Claude AI proxy
        ├── on-pick-settled.js  # Pick settlement webhook
        └── recalculate-ratings.js  # Sharp Rating cron
```

---

## Roadmap

- [ ] Push notifications for pick settlements
- [ ] Private leagues with custom scoring rules
- [ ] Expanded prop betting markets
- [ ] Mobile app (React Native)
- [ ] AI pick trend analysis across the full user base

---

## About

SharpPick was designed and built by **Robert Guthrie** as a solo full-stack project — from database schema to deployment pipeline. The goal was to build something genuinely useful for sports fans who want to track their prediction skill without the risk of real-money gambling.

📧 rguthrie9@gmail.com
🌐 [getsharppick.com](https://getsharppick.com)
💼 [LinkedIn](https://linkedin.com/in/YOUR_LINKEDIN)

---

## License

This project is licensed under [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) — free to view and learn from, not for commercial use. Copyright (c) 2025 Robert Guthrie.

---

*SharpPick is a skill-based competition platform. No real money is wagered or won. This is not a gambling product.*
