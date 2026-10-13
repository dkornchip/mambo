# BOX HORSE — "we live in a society"

A one-button endless downhill luge / trick game. Brainrot on the surface, Tiny Wings + Alto's Adventure
skill curve underneath, Vampire-Survivors-style perk picks for build variety. Browser, HTML5 canvas,
zero external assets (all art and audio are procedural).

## Fantasy

Tannhauser (chibi horse-girl, purple beret, red hair clips, orange eyes) is strapped into a cardboard box
and shoved down an infinite hill. She screams "AAAAAAA" the whole way. Gold Ship (lavender hair, brown
kepi, smug) lurks on the course and shoves people for fun. Teio (brown hair, pink streak, blue eyes) cheers
at checkpoints. The scoreboard is social media: LIKES (score), COMMENTS (tricks), FOLLOWERS (meta currency).
Game over is the "we live in a society" meme: your stats bubble vs. the 0 / 0 / 0 bubble.

## Core loop (the skill)

- The world is an infinite procedural hilly track. Gravity pulls the box; downslopes become speed.
- **ONE INPUT**: hold (space / click / touch) = **DIVE**.
  - On the ground, diving multiplies gravity (x2.4). On a downslope that is acceleration; on an upslope
    it is a brake. Releasing at a crest with enough speed launches you.
  - In the air, diving = fast-fall AND the box starts to **backflip** (angular velocity ramps up while held).
- Landing rule: angle between box and slope <= 35 deg = **clean** ("OH YEAH"). <= 12 deg on a downslope =
  **PERFECT** (speed x1.15, clout +10). Else **BONK**: speed x0.45, combo reset, 0.4 s stun scream.
- Each full 360 in the air = one **trick** (a "comment").

## The pressure: CLOUT meter

- 0..100, starts at 100. Drains at 4 / s base, +0.6 / s per difficulty tier.
- Refill: egg +4, golden egg +25, clean landing +5, perfect +10, chicken +3, trick +3, Teio cheer +15.
- While speed >= 18 m/s drain pauses ("feeding the algorithm"). Going fast is how you survive; going fast is
  how you die. That tension is the whole game.
- Clout hits 0 -> game over: "The algorithm moved on. We live in a society."

## Scoring

- LIKES = score. Distance: +1 per 10 m. Egg: +5 x mult. Golden egg: +60 x mult. Trick: +20 x mult per flip.
  Chicken: +15 x mult. Box smash: +10 x mult per box. Gold Ship flex (airborne over her): +30 x mult.
- COMBO increments on egg / trick / clean landing / chicken / smash. Resets on bonk.
  mult = 1 + 0.1 x combo, capped at x5.
- FOLLOWERS (persistent): run end awards floor(likes / 40) + floor(distance / 100). Spent on unlocks.

## Entities

| Entity | Where | Effect |
|---|---|---|
| Egg | ground clusters of 3-7; arcs in the air over crests | +likes, +clout, +combo |
| Golden egg | high in the air, rare | big likes + clout, needs a real launch |
| Chicken | walks on ground, farm biome dense | feathers explode, "土鸡!" text, +likes, no penalty |
| Box stack (1-3 tall) | ground | speed >= 14 / 17 / 20 m/s (by height) or airborne = SMASH; else BONK |
| Gold Ship | stands on a crest | ground contact = SHOVE gamble: 70% big forward launch "GOLDSHIP BOOST", 30% kicked back "GOLDSHIP'D" (bonk). Airborne over her = "FLEX" bonus |
| Teio | biome transitions | cheer, +15 clout, perk pick opens |

## Biomes (~700 m each, loop; tier += 1 per loop)

1. **Street** (img 1): tan buildings, white windows, pavement, benches. Gentle hills. Tutorial-ish.
2. **Chicken Farm** (img 4): grass, coop, fences in background, chickens everywhere, the sky chants
   "土鸡土鸡蛋蛋". Medium hills.
3. **Boxing Gym** (img 3): brick walls, blue mat, red ropes, punching bags, neon "OH YEAH". Big hills,
   many box stacks.
4. **Society Void** (img 2): white void, floating red notification bubbles with giant counters, very
   large hills, golden eggs.

Tier scaling: hill amplitude x(1 + 0.12 tier), obstacle density x(1 + 0.15 tier), drain +0.6/s per tier.

## Perks (pick 1 of 3 at each biome transition; 4 s slow-mo to choose, else random)

Egg Magnet, Heavy Box (+20% dive force), Feather Box (-20% air gravity), Clout Insurance (-25% drain),
Second Wind (revive once at 35 clout), Chicken Whisperer (chickens x3), Smash Mode (smash thresholds -30%),
Clout Goblin (eggs +50% clout), Trick Daddy (tricks x2), Goldship Pact (Gold Ship always boosts),
Rizz (bonk halves combo instead of resetting), Algorithm Hack (drain pause threshold 15 m/s instead of 18).
Perks stack; they are the run's "build".

## Meta / replay

- Characters: Tannhauser (default). Gold Ship (300 followers): +15% mass, bigger dives, harsher landing window
  (30 deg). Teio (1000 followers): -15% mass, floatier, wider landing window (40 deg). Eyepatch Tannhauser skin
  (2000 followers): cosmetic, pirate laugh.
- Hats (cosmetic) for followers.
- Modes: Endless (random seed) and Daily (seed = date, separate best).
- Game over: meme layout, stats vs. best, "new record" fanfare, share-to-clipboard text, instant restart.

## Juice / brainrot

Screen shake, hit-stop on smash, speed lines, "AAAAAAA" letter trail when fast or airborne, feather bursts,
pop numbers, combo announcer escalation (nice -> OH YEAH -> 土鸡土鸡蛋蛋 -> WE LIVE IN A SOCIETY -> AAAAAAAAA),
procedural chiptune loop, procedural screams, mute toggle.

## Tech

- Fixed-step physics (120 Hz, accumulator), rAF render, DPR-aware canvas (cap 2).
- Terrain: sampled height field, 0.5 m spacing, sum-of-sines per biome + ramps; `heightAt(x)`, `slopeAt(x)`.
- Rider physics: free-body integrate, snap-to-ground with normal-velocity threshold to leave ground, tangent
  projection on contact, landing-angle check.
- Deterministic RNG (mulberry32) per run; daily seed from date.
- `window.BOXHORSE` test hooks: `state`, `setInput(bool)`, `newRun(seed)`, `step(dt)`, `telemetry()`.
- Files: `index.html`, `css/style.css`, `js/{rng,audio,sprites,terrain,game,ui,main}.js`,
  `test/bot.mjs` (Playwright harness), `build.mjs` -> `dist/box-horse.html` (single file bundle).
- Save: `localStorage["boxhorse.save.v1"]`.
