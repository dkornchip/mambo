# box horse

Some brainrot AI slop game. Four meme screenshots of chibi horse-girls (one screaming in a cardboard box
next to a smug one, a "we live in a society" stat-bubble edit, a boxing-ring close-up yelling 哦耶, and
a chicken-coop 土鸡土鸡蛋蛋 bit) were handed to an AI with "make a game out of this", and this is what
came back. Nobody asked for it. It plays anyway.

| the box | the society |
|---|---|
| ![screaming in a cardboard box next to the smug one](ref/1-box.jpg) | ![we live in a society](ref/2-society.jpg) |

| the ring | the farm |
|---|---|
| ![哦耶](ref/3-ohyeah.jpg) | ![土鸡土鸡蛋蛋](ref/4-chicken.jpg) |

A one-button cardboard-box luge for the browser. A chibi horse-girl in a cardboard box goes down an
infinite hill, screaming. The score is likes. The subtitle bar is the narrator. We live in a society.

No build step, no assets, no dependencies: every sprite and every sound is drawn or synthesized at runtime.
Works on desktop and phones. Open `index.html` or run `node serve.mjs`.

## how to play

- **hold** (space, click, or touch anywhere) = **dive**. On a downhill that is speed. On an uphill it is a brake.
- **release** at the top of a hill with enough speed and you fly.
- **hold in the air** = fast-fall + backflip. Release before you land; each full flip is a comment.
- Land within 35° of the slope = clean. Within 12° on a downslope = perfect (speed boost). 35–55° = sketchy
  (you keep your combo, lose some speed). Worse than that = bonk: combo halved, short stun.
- **clout** drains while you are slow and stops draining above the speed on the HUD (18 m/s on lap 1,
  higher every lap). Eggs, chickens, clean landings, flips and smashed box stacks refill it.
  Clout at zero gives you 2.5 seconds of slow-motion grace: earn 5 clout and you clutch back in.
- Between biomes the cheerleader offers three sponsor perks. Pick one with 1 / 2 / 3 or a tap. They stack.
- The smug one sits in her own box on some crests. Hit her on the ground and she shoves you: usually
  forward, sometimes not. Fly over her and she doesn't look up.

Biomes loop: the street (400 m) → chicken farm → the ring → society, then again with more drain and a higher
speed line each lap. Hill size stops growing after lap 5; the algorithm does not.

## modes and meta

- **play**: random seed. **daily**: everyone gets the same hills for that date; best-of-day is tracked.
- Followers are earned per run (a flat 5, likes / 30, distance / 50, plus one-time milestones) and spent on
  two more characters and a dozen hats. Hats go on top of the beret. The beret always stays.
- Game over copies a share text: the longest scream of the run, your stats next to 0 / 0 / 0, and the distance.

## development

```
node serve.mjs            # http://localhost:8080
node test/smoke.mjs       # headless Chromium: console errors, real-input run, screenshots in test/out/
node test/bot.mjs --runs 20 --policies auto,sloppy,never   # headless balance stats via BOXHORSE.simulate
node build.mjs            # dist/box-horse.html: one self-contained file
```

The tests use the Playwright package (`npm install` fetches it; a global install on NODE_PATH also works).
`window.BOXHORSE` exposes the running game, `simulate({seed, policy, charId, maxTime})` for headless runs,
the input policies, and the live constants object `C` so balance sweeps can mutate values without editing files.

Files: `js/terrain.js` (procedural hills, biome laps), `js/game.js` (physics, entities, scoring, clout, perks,
subtitles), `js/render.js` (canvas renderer, biomes, HUD, subtitle bar), `js/sprites.js` (procedural chibi art),
`js/audio.js` (procedural SFX and music), `js/ui.js` (DOM screens), `js/main.js` (bootstrap, input, save, bots).
`DESIGN.md` has the design notes.

All characters are original procedural chibi homages drawn with canvas primitives. No third-party assets.
