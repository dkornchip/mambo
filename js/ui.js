/* BOX HORSE — DOM UI: title, character/hat shop, perk picker, game over, pause. Deadpan register. */
(function () {
  'use strict';
  const BH = (window.BH = window.BH || {});
  const S = BH.sprites;

  const CHAR_ORDER = ['tann', 'gold', 'teio'];
  const CHAR_PRICE = { tann: 0, gold: 250, teio: 600 };
  const HATS = [
    { id: 'none', name: 'nothing', price: 0, desc: 'The beret stays. The beret always stays.' },
    { id: 'secondbox', name: 'Second Box', price: 50, desc: 'A smaller box. On your head.' },
    { id: 'cone', name: 'Traffic Cone', price: 100, desc: 'Street biome merch.' },
    { id: 'chicken', name: 'Chicken', price: 150, desc: 'A live chicken sits on your beret.' },
    { id: 'eyepatch', name: 'Eyepatch', price: 200, desc: 'Does nothing.' },
    { id: 'kepi', name: 'Her Hat', price: 300, desc: 'She did not notice.' },
    { id: 'friedegg', name: 'Fried Egg', price: 400, desc: 'A golden egg, afterwards.' },
    { id: 'zero', name: '0', price: 500, desc: 'A tiny red bubble above your head. It says 0 0 0.' },
    { id: 'live', name: 'LIVE', price: 800, desc: 'A red LIVE badge. Nobody is watching.' },
    { id: 'crown', name: 'Crown', price: 1200, desc: 'King of the hill. Literally.' },
    { id: 'halo', name: 'Halo', price: 1800, desc: 'For when the algorithm takes you.' },
    { id: 'propeller', name: 'Propeller', price: 2500, desc: 'Does nothing. Looks like it should.' },
  ];

  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function fmt(n) { return Math.round(n).toLocaleString(); }

  class UI {
    constructor(app) {
      this.app = app;
      this.root = document.getElementById('ui');
      this.screens = {};
      for (const id of ['title', 'chars', 'hats', 'perk', 'over', 'pause']) {
        const s = el('div', 'screen hidden'); s.id = 'screen-' + id; this.root.appendChild(s); this.screens[id] = s;
      }
      this.muteBtn = el('button', 'mute', '🔊'); this.muteBtn.id = 'mute';
      this.muteBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
      this.muteBtn.addEventListener('click', (e) => { e.stopPropagation(); this.app.toggleMute(); this.refreshMute(); });
      this.root.appendChild(this.muteBtn);
      this.buildTitle();
      this.refreshMute();
    }

    refreshMute() { this.muteBtn.textContent = this.app.save.muted ? '🔇' : '🔊'; if (this.soundBtn) this.soundBtn.textContent = this.app.save.muted ? 'sound: off' : 'sound: on'; }

    show(id) {
      for (const k in this.screens) this.screens[k].classList.toggle('hidden', k !== id);
      this.current = id;
      this.root.classList.toggle('menu', true);
      if (id === 'title') this.refreshTitle();
      if (id === 'chars') this.buildChars();
      if (id === 'hats') this.buildHats();
    }
    hideAll() { for (const k in this.screens) this.screens[k].classList.add('hidden'); this.current = null; this.root.classList.toggle('menu', false); }

    nextUnlock() {
      const sv = this.app.save;
      let best = null;
      for (const id of CHAR_ORDER) if (!sv.unlocks[id] && (best == null || CHAR_PRICE[id] < best.price)) best = { name: S.CHARACTERS[id].name, price: CHAR_PRICE[id] };
      for (const h of HATS) if (!sv.hats[h.id] && (best == null || h.price < best.price)) best = { name: h.name, price: h.price };
      return best;
    }

    // ---- title ---------------------------------------------------------------
    buildTitle() {
      const s = this.screens.title;
      s.innerHTML = '';
      const card = el('div', 'card title-card');
      card.appendChild(el('div', 'logo', 'box<span>horse</span>'));
      card.appendChild(el('div', 'tagline', 'one button. hold to dive.'));
      const canvas = el('canvas', 'hero'); canvas.width = 220; canvas.height = 200; card.appendChild(canvas);
      this.heroCanvas = canvas;
      this.titleStats = el('div', 'stats'); card.appendChild(this.titleStats);
      const btns = el('div', 'btns');
      const play = el('button', 'btn primary', 'play'); play.addEventListener('click', () => this.app.startRun('endless'));
      const daily = el('button', 'btn', 'daily'); daily.addEventListener('click', () => this.app.startRun('daily'));
      this.dailyBtn = daily;
      const chars = el('button', 'btn', 'characters'); chars.addEventListener('click', () => this.show('chars'));
      const hats = el('button', 'btn', 'hats'); hats.addEventListener('click', () => this.show('hats'));
      const snd = el('button', 'btn small'); this.soundBtn = snd;
      snd.addEventListener('click', () => { this.app.toggleMute(); this.refreshMute(); });
      btns.append(play, daily, chars, hats, snd);
      card.appendChild(btns);
      card.appendChild(el('div', 'howto', '<b>hold</b> anywhere to dive. dive on downhills for speed. <b>release</b> at the top to fly. <b>hold</b> in the air to backflip. land flat. keep the clout bar up or the algorithm forgets you.'));
      s.appendChild(card);
      for (const b of s.querySelectorAll('button')) b.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
    refreshTitle() {
      const sv = this.app.save;
      const d = BH.rng.dailySeed();
      const dailyBest = sv.daily && sv.daily.date === d.key ? sv.daily.likes : 0;
      this.titleStats.innerHTML =
        '<span>👤 <b>' + fmt(sv.followers) + '</b> followers</span>' +
        '<span>♥ best <b>' + fmt(sv.bestLikes) + '</b></span>' +
        '<span>📏 best <b>' + fmt(sv.bestDist) + ' m</b></span>' +
        (sv.bestScream ? '<span>longest ' + (this.app.cjk ? '啊' : 'A') + ' <b>' + sv.bestScream + '</b></span>' : '') +
        '<span>runs <b>' + fmt(sv.runs) + '</b></span>';
      this.dailyBtn.innerHTML = 'daily' + (dailyBest ? ' <small>best today ♥ ' + fmt(dailyBest) + '</small>' : ' <small>' + d.key + '</small>');
      this.drawHero();
    }
    drawHero() {
      const c = this.heroCanvas; if (!c) return;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.save(); ctx.translate(110, 125);
      const bs = 1.6; ctx.scale(bs, bs);
      S.drawBoxBack(ctx);
      ctx.save(); ctx.translate(0, -34); ctx.scale(0.8, 0.8);
      S.CHARACTERS[this.app.save.char].draw(ctx, { mouth: this.app.save.char === 'gold' ? 'smug' : 'scream', upperOnly: true, arms: 'up', hat: this.app.save.hat });
      ctx.restore();
      S.drawBoxFront(ctx, { label: '社会' });
      ctx.restore();
    }

    // ---- characters ----------------------------------------------------------
    buildChars() {
      const s = this.screens.chars; s.innerHTML = '';
      const sv = this.app.save;
      const card = el('div', 'card wide');
      card.appendChild(el('h2', null, 'characters <small>👤 ' + fmt(sv.followers) + ' followers</small>'));
      const grid = el('div', 'grid');
      for (const id of CHAR_ORDER) {
        const ch = S.CHARACTERS[id];
        const owned = !!sv.unlocks[id];
        const item = el('div', 'item' + (sv.char === id ? ' selected' : '') + (owned ? '' : ' locked'));
        const cv = el('canvas'); cv.width = 120; cv.height = 150; item.appendChild(cv);
        const ctx = cv.getContext('2d'); ctx.translate(60, 62); ctx.scale(0.9, 0.9);
        ch.draw(ctx, { mouth: id === 'gold' ? 'smug' : id === 'teio' ? 'grin' : 'scream', arms: 'down', hat: sv.char === id ? sv.hat : 'none' });
        item.appendChild(el('div', 'name', ch.name));
        item.appendChild(el('div', 'desc', ch.desc));
        const btn = el('button', 'btn small');
        if (owned) { btn.textContent = sv.char === id ? '✓ selected' : 'select'; btn.addEventListener('click', () => { sv.char = id; this.app.persist(); BH.audio.play('click'); this.buildChars(); }); }
        else { btn.textContent = fmt(CHAR_PRICE[id]) + ' followers'; btn.disabled = sv.followers < CHAR_PRICE[id];
          btn.addEventListener('click', () => { if (sv.followers >= CHAR_PRICE[id]) { sv.followers -= CHAR_PRICE[id]; sv.unlocks[id] = true; sv.char = id; this.app.persist(); BH.audio.play('record'); this.buildChars(); } }); }
        item.appendChild(btn);
        grid.appendChild(item);
      }
      card.appendChild(grid);
      const back = el('button', 'btn', '← back'); back.addEventListener('click', () => this.show('title'));
      card.appendChild(back);
      s.appendChild(card);
      for (const b of s.querySelectorAll('button')) b.addEventListener('pointerdown', (e) => e.stopPropagation());
    }

    buildHats() {
      const s = this.screens.hats; s.innerHTML = '';
      const sv = this.app.save;
      const card = el('div', 'card wide');
      card.appendChild(el('h2', null, 'hats <small>👤 ' + fmt(sv.followers) + ' followers · they go on top of the beret</small>'));
      const grid = el('div', 'grid');
      for (const h of HATS) {
        const owned = !!sv.hats[h.id];
        const item = el('div', 'item' + (sv.hat === h.id ? ' selected' : '') + (owned ? '' : ' locked'));
        const cv = el('canvas'); cv.width = 120; cv.height = 140; item.appendChild(cv);
        const ctx = cv.getContext('2d'); ctx.translate(60, 82); ctx.scale(0.85, 0.85);
        S.CHARACTERS[sv.char].draw(ctx, { mouth: sv.char === 'gold' ? 'smug' : 'smile', arms: 'down', upperOnly: true, hat: h.id });
        item.appendChild(el('div', 'name', h.name));
        item.appendChild(el('div', 'desc', h.desc));
        const btn = el('button', 'btn small');
        if (owned) { btn.textContent = sv.hat === h.id ? '✓ wearing' : 'wear'; btn.addEventListener('click', () => { sv.hat = h.id; this.app.persist(); BH.audio.play('click'); this.buildHats(); }); }
        else { btn.textContent = fmt(h.price) + ' followers'; btn.disabled = sv.followers < h.price;
          btn.addEventListener('click', () => { if (sv.followers >= h.price) { sv.followers -= h.price; sv.hats[h.id] = true; sv.hat = h.id; this.app.persist(); BH.audio.play('record'); this.buildHats(); } }); }
        item.appendChild(btn);
        grid.appendChild(item);
      }
      card.appendChild(grid);
      const back = el('button', 'btn', '← back'); back.addEventListener('click', () => this.show('title'));
      card.appendChild(back);
      s.appendChild(card);
      for (const b of s.querySelectorAll('button')) b.addEventListener('pointerdown', (e) => e.stopPropagation());
    }

    // ---- perk picker -----------------------------------------------------------
    showPerks(game) {
      const s = this.screens.perk; s.innerHTML = '';
      const card = el('div', 'card perk-card');
      card.appendChild(el('h2', null, (this.app.cjk ? '选一个' : 'pick one') + ' <small>' + (this.app.cjk ? 'pick one · ' : '') + '1 / 2 / 3</small>'));
      const row = el('div', 'perk-row');
      game.perkChoices.forEach((p, i) => {
        const b = el('button', 'perk');
        b.innerHTML = '<div class="emoji">' + p.emoji + '</div><div class="name">' + p.name + '</div><div class="desc">' + p.desc + '</div><div class="key">' + (i + 1) + '</div>';
        b.addEventListener('click', (e) => { e.stopPropagation(); this.app.pickPerk(i); });
        b.addEventListener('pointerdown', (e) => e.stopPropagation());
        row.appendChild(b);
      });
      card.appendChild(row);
      const bar = el('div', 'timer'); const fill = el('div', 'fill'); bar.appendChild(fill); card.appendChild(bar);
      this.perkFill = fill; this.perkTotal = game.perkTimer;
      s.appendChild(card);
      this.show('perk');
    }
    updatePerkTimer(game) {
      if (this.perkFill && game.state === 'perk') this.perkFill.style.width = Math.max(0, 100 * game.perkTimer / this.perkTotal) + '%';
    }

    // ---- game over: image 2, flat -----------------------------------------------
    showGameOver(game, result) {
      const s = this.screens.over; s.innerHTML = '';
      const sv = this.app.save;
      const card = el('div', 'card over-card' + ((result.newLikes || result.newDist) ? ' best' : ''));
      card.appendChild(el('div', 'society', 'We live in a society'));
      const wrap = el('div', 'bubbles');
      const left = el('div', 'bubble-col left');
      left.appendChild(el('div', 'bubble', '💬 ' + fmt(game.comments) + ' · ♥ ' + fmt(game.likes) + ' · 👤 +' + fmt(result.followers)));
      const lc = el('canvas', 'mini'); lc.width = 150; lc.height = 140; left.appendChild(lc);
      { const ctx = lc.getContext('2d'); ctx.translate(75, 82); ctx.scale(0.85, 0.85);
        ctx.save(); ctx.scale(0.9, 0.9); S.drawBoxBack(ctx); ctx.restore();
        ctx.save(); ctx.translate(0, -34); ctx.scale(0.8, 0.8); game.char.draw(ctx, { mouth: game.charId === 'gold' ? 'smug' : 'smile', upperOnly: true, arms: 'up', hat: game.hat }); ctx.restore();
        ctx.save(); ctx.scale(0.9, 0.9); S.drawBoxFront(ctx, { label: '社会' }); ctx.restore(); }
      left.appendChild(el('div', 'cap', 'you, in the box'));
      const right = el('div', 'bubble-col right');
      right.appendChild(el('div', 'bubble dim', '💬 0 · ♥ 0 · 👤 0'));
      const rc = el('canvas', 'mini tall'); rc.width = 140; rc.height = 230; right.appendChild(rc);
      { const ctx = rc.getContext('2d'); ctx.translate(70, 95); ctx.scale(1.35, 1.35); game.char.draw(ctx, { mouth: game.charId === 'gold' ? 'smug' : 'smile', arms: 'down', hat: game.hat }); }
      right.appendChild(el('div', 'cap', 'you, outside'));
      wrap.append(left, right);
      card.appendChild(wrap);
      card.appendChild(el('div', 'reason', (game.deathLine || 'The algorithm moved on.') + ((result.newLikes || result.newDist) ? ' <span class="rec">(new best)</span>' : '')));
      const n = (c, one, many) => c + ' ' + (c === 1 ? one : many);
      const bits = [fmt(game.distance) + ' m', 'combo x' + game.maxCombo, n(game.flips, 'flip', 'flips'), n(game.chickens, 'chicken', 'chickens')];
      if (game.longestScream) bits.push('longest ' + (this.app.cjk ? '啊' : 'A') + ': ' + game.longestScream);
      if (game.subtitleOverflow) bits.push('the subtitle did not fit');
      if (game.clutches) bits.push(n(game.clutches, 'clutch', 'clutches'));
      card.appendChild(el('div', 'bits', bits.join(' · ')));
      const nu = this.nextUnlock();
      card.appendChild(el('div', 'next', nu ? 'next unlock: ' + nu.name + (nu.price <= sv.followers ? ' · you can afford it' : ' · ' + fmt(nu.price - sv.followers) + ' more followers') : 'everything is unlocked. it did not help.'));
      if (game.mode === 'daily') card.appendChild(el('div', 'next', 'daily ' + game.dailyKey + ' · best today ♥ ' + fmt(sv.daily.likes)));
      const btns = el('div', 'btns row');
      const again = el('button', 'btn primary', 'post again'); again.addEventListener('click', () => this.app.startRun(game.mode));
      const share = el('button', 'btn', 'copy'); share.addEventListener('click', () => this.app.share(game, result, share));
      const menu = el('button', 'btn', 'menu'); menu.addEventListener('click', () => this.app.toMenu());
      btns.append(again, share, menu);
      card.appendChild(btns);
      card.appendChild(el('div', 'hintline', 'space / tap anywhere to post again'));
      s.appendChild(card);
      for (const b of s.querySelectorAll('button')) b.addEventListener('pointerdown', (e) => e.stopPropagation());
      this.show('over');
    }

    showPause() {
      const s = this.screens.pause; s.innerHTML = '';
      const card = el('div', 'card');
      card.appendChild(el('h2', null, 'paused'));
      card.appendChild(el('div', 'howto', 'the algorithm waits for no one. it will wait for you.'));
      const btns = el('div', 'btns');
      const res = el('button', 'btn primary', 'resume'); res.addEventListener('click', () => this.app.resume());
      const quit = el('button', 'btn', 'quit to menu'); quit.addEventListener('click', () => this.app.toMenu());
      btns.append(res, quit); card.appendChild(btns);
      s.appendChild(card);
      for (const b of s.querySelectorAll('button')) b.addEventListener('pointerdown', (e) => e.stopPropagation());
      this.show('pause');
    }
  }

  BH.ui = { UI, HATS, CHAR_ORDER, CHAR_PRICE };
})();
