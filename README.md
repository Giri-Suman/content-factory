# Content Factory

Code-first automated video studio. One pipeline for every video:

```
Trend Radar → Script Studio → Voice (your clone) → Render Farm → Review Gate → Publisher → Analytics
   hourly        Claude         ElevenLabs        Remotion/Manim   HUMAN, 15-30m   YT/TT/IG     daily
```

Full master plan: https://claude.ai/code/artifact/eff26ba0-ee88-42f3-a7f5-b7f6d5d2f5b0

## Quickstart

```bash
cp .env.example .env      # fill keys as phases come online
npm run doctor            # verify the toolchain — zero install needed
```

`factory doctor` is the health check for the whole machine. It knows which
phase each dependency belongs to, so it tells you what's blocking *now* vs.
what can wait.

## Structure

```
packages/cli/       the `factory` command (doctor; later: render, radar, script, publish)
packages/shared/    env loading, repo paths, config
renderers/          P1: code-report (Remotion) · P4: math (Manim), shorts
apps/               P3: Mission Control dashboard (Next.js)
assets/brand/       palette, logo, intro sting, licensed SFX/music only
data/               (gitignored) SQLite: trends, jobs, analytics
renders/            (gitignored) finished MP4s
```

## Phase roadmap

| Phase | Deliverable | Status |
|-------|-------------|--------|
| P0 | Monorepo + `factory doctor` | **done** |
| P1 | Code Report renderer — script.json → MP4 (16:9 + 9:16) | next |
| P2 | Trend Radar + Script Studio (publishing starts) | |
| P3 | Mission Control dashboard | |
| P4 | Math engine (Manim) + Shorts factory | |
| P5 | Publisher (YT/TikTok/IG) + analytics loop | |
| P6 | Auto-Editor for filmed footage (separate makeup channel) | |

## P0 homework (human tasks — nothing here can be automated)

1. **Voice clone** — record ~30 min of clean speech (quiet room, consistent
   mic distance, natural pace). Create an ElevenLabs professional voice
   clone → paste `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` into `.env`.
2. **YouTube API** — Google Cloud Console → new project → enable
   *YouTube Data API v3* → OAuth client (Desktop) → `YT_CLIENT_ID` +
   `YT_CLIENT_SECRET` into `.env`. (Refresh token is generated in P5.)
3. **Anthropic key** — console.anthropic.com → `ANTHROPIC_API_KEY`.
4. **Brand** — channel name + handle, 2–3 brand colors, pick an intro-sting
   concept (rendered later with the portfolio repo's Three.js render-engine).

## Rules the factory enforces (non-negotiable)

- Every video passes the **Review Gate** — a human edit + approval click.
- Own-voice clone only. No stock AI voices.
- Disclosure flags set programmatically wherever synthetic media is present.
- No verbatim article narration; no copyrighted meme clips.
- Per-platform native renders; max 2 uploads/day/platform.
