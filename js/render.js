/* BOX HORSE — canvas renderer: parallax biomes, terrain, entities, rider, particles, subtitle bar, HUD.
 * Register: deadpan. The subtitle bar at the bottom is the text system; everything else stays small and grey.
 */
(function () {
  'use strict';
  const BH = (window.BH = window.BH || {});
  const S = BH.sprites;
  const { biomeAt, biomeIndexAt, biomeStartX } = BH.terrain;
  const TAU = Math.PI * 2;
  const FONT = '"Helvetica Neue", Arial, "Noto Sans", sans-serif';
  const SUB_FONT = '"Songti SC", "SimSun", "Noto Serif CJK SC", "Source Han Serif SC", "Noto Serif SC", "PingFang SC", "Microsoft YaHei", serif';

  function h32(i, salt) {
    let x = (i * 374761393 + (salt || 0) * 668265263) | 0;
    x = (x ^ (x >>> 13)) * 1274126177 | 0;
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  const BIOME_STYLE = {
    street: { skyTop: '#bfe3ff', skyBot: '#fff3e0', ground: '#b9b2a6', groundTop: '#d9d2c5', groundLine: '#8e877b', name: 'the street' },
    farm:   { skyTop: '#8fd0ff', skyBot: '#e8f7ff', ground: '#5aa84a', groundTop: '#7cc95c', groundLine: '#3f8a33', name: 'chicken farm' },
    gym:    { skyTop: '#2a1f22', skyBot: '#4a2b2f', ground: '#2f6fc9', groundTop: '#4a8ae6', groundLine: '#1f4b8f', name: 'the ring' },
    void:   { skyTop: '#ffffff', skyBot: '#eef0f4', ground: '#d8dbe2', groundTop: '#f3f4f7', groundLine: '#b9bdc7', name: 'society' },
  };

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d');
      this.W = 0; this.H = 0; this.dpr = 1; this.t = 0;
      this.filterOK = typeof this.ctx.filter === 'string';
      this.resize();
    }
    resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.max(320, window.innerWidth), H = Math.max(240, window.innerHeight);
      this.dpr = dpr; this.W = W; this.H = H;
      this.canvas.width = Math.round(W * dpr); this.canvas.height = Math.round(H * dpr);
      this.canvas.style.width = W + 'px'; this.canvas.style.height = H + 'px';
    }

    // ---- projection ----------------------------------------------------------
    setup(game) {
      const H = this.H, W = this.W;
      const small = W < 600;
      this.small = small;
      this.scale = (H / 22) * game.cam.zoom * (small ? 0.85 : 1);
      this.cam = game.cam;
      // keep the rider on screen even when the camera looks far ahead (portrait phones)
      const want = W * (small ? 0.3 : 0.38);
      const riderOff = (game.rider.x - this.cam.x) * this.scale;
      this.ox = Math.max(want, W * 0.13 - riderOff);
      this.oy = H * 0.56;
      if (game.shake > 0) { const m = game.shake * 9; this.sx = (Math.random() - 0.5) * m; this.sy = (Math.random() - 0.5) * m; }
      else { this.sx = 0; this.sy = 0; }
    }
    wx(x) { return (x - this.cam.x) * this.scale + this.ox + this.sx; }
    wy(y) { return this.oy - (y - this.cam.y) * this.scale + this.sy; }
    screenToWorldX(sx) { return (sx - this.ox - this.sx) / this.scale + this.cam.x; }

    draw(game, dt, opts) {
      opts = opts || {};
      this.t += dt;
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.setup(game);
      const gray = game.grace && this.filterOK;
      if (gray) ctx.filter = 'grayscale(1)';
      const camX = Math.max(0, this.cam.x);
      const bi = biomeIndexAt(camX);
      const biome = biomeAt(camX);
      const nextBoundary = biomeStartX(bi + 1);
      const fade = clamp(1 - (nextBoundary - camX) / 40, 0, 1);
      const nextBiome = biomeAt(nextBoundary + 1);
      this.drawBackground(game, biome, 1);
      if (fade > 0) this.drawBackground(game, nextBiome, fade);
      this.drawGround(game, biome, fade > 0 ? nextBiome : null, fade);
      this.drawEntities(game);
      this.drawRider(game);
      this.drawParticles(game);
      if (biome === 'gym' || (fade > 0 && nextBiome === 'gym')) this.drawRopes(game, biome === 'gym' ? 1 : fade);
      this.drawPopups(game);
      if (gray) ctx.filter = 'none';
      else if (game.grace) { ctx.fillStyle = 'rgba(128,128,128,0.45)'; ctx.fillRect(0, 0, this.W, this.H); }
      if (!opts.attract) { this.drawFaceCam(game); this.drawHUD(game); this.drawSubtitles(game); }
    }

    // ---- backgrounds -------------------------------------------------------
    drawBackground(game, biome, alpha) {
      const ctx = this.ctx, W = this.W, H = this.H;
      const st = BIOME_STYLE[biome];
      ctx.globalAlpha = alpha;
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, st.skyTop); g.addColorStop(1, st.skyBot);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const camX = this.cam.x, camY = this.cam.y;
      const horizon = this.wy(camY) - H * 0.02;
      ctx.save();
      switch (biome) {
        case 'street': this.bgStreet(camX, horizon); break;
        case 'farm': this.bgFarm(camX, horizon); break;
        case 'gym': this.bgGym(camX, horizon); break;
        case 'void': this.bgVoid(camX, horizon, game); break;
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    decor(camX, parallax, spacing, fn) {
      const W = this.W;
      const s = this.scale * parallax;
      const x0 = camX * parallax;
      const i0 = Math.floor((x0 - this.ox / s) / spacing) - 1;
      const i1 = Math.ceil((x0 + (W - this.ox) / s) / spacing) + 1;
      for (let i = i0; i <= i1; i++) {
        const wx = i * spacing + h32(i, 7) * spacing * 0.5;
        const sx = (wx - x0) * s + this.ox + this.sx;
        fn(i, sx, s);
      }
    }

    bgStreet(camX, horizon) {
      const ctx = this.ctx, H = this.H;
      // tan buildings with white window grids; one window in six has her face in it
      this.decor(camX, 0.18, 26, (i, sx, s) => {
        const w = (10 + h32(i, 1) * 8) * s, hgt = (14 + h32(i, 2) * 14) * s;
        const col = ['#e7c9a3', '#d8b48c', '#efd5b2', '#c9a37d'][i & 3];
        ctx.fillStyle = col; ctx.fillRect(sx, horizon - hgt, w, hgt + H);
        const cols = Math.max(1, Math.floor(w / (3.2 * s))), rows = Math.max(1, Math.floor(hgt / (3.4 * s)));
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          const k = h32(i * 31 + r * 7 + c, 3);
          if (k < 0.15) continue;
          const x = sx + (0.6 + c * 3.2) * s, y = horizon - hgt + (0.8 + r * 3.4) * s;
          ctx.fillStyle = '#f7f3ea'; ctx.fillRect(x, y, 2.2 * s, 2.4 * s);
          if (k > 0.975 && s > 4) {
            // the smug one, looking out. same smile.
            ctx.save(); ctx.beginPath(); ctx.rect(x, y, 2.2 * s, 2.4 * s); ctx.clip();
            ctx.translate(x + 1.1 * s, y + 1.6 * s); ctx.scale(s / 30, s / 30);
            S.drawGoldShip(ctx, { headOnly: true, mouth: 'smug' });
            ctx.restore();
          }
        }
      });
      // lamp posts from the horizon down (they stand in front of the buildings)
      this.decor(camX, 0.3, 38, (i, sx, s) => {
        ctx.fillStyle = '#5c5c66'; ctx.fillRect(sx, horizon - 7 * s, 0.3 * s, 7 * s + H);
        ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.arc(sx + 0.15 * s, horizon - 7.2 * s, 0.55 * s, 0, TAU); ctx.fill();
      });
      // bushes, low, mostly behind the ground
      this.decor(camX, 0.45, 23, (i, sx, s) => {
        const baseY = horizon + 3.5 * s;
        ctx.fillStyle = '#6fae5a'; ctx.beginPath(); ctx.arc(sx, baseY - 0.6 * s, 1.1 * s, 0, TAU); ctx.arc(sx + 1.2 * s, baseY - 0.8 * s, 0.9 * s, 0, TAU); ctx.fill();
      });
      // one bench every ~150 m. the cheerleader sits on it.
      this.decor(camX, 0.5, 150, (i, sx, s) => {
        const baseY = horizon + 3.4 * s;
        ctx.fillStyle = '#6b4a2e'; ctx.fillRect(sx, baseY - 1.3 * s, 3.4 * s, 0.4 * s); ctx.fillRect(sx, baseY - 0.7 * s, 3.4 * s, 0.35 * s);
        ctx.fillRect(sx + 0.3 * s, baseY - 0.7 * s, 0.3 * s, 0.8 * s); ctx.fillRect(sx + 2.8 * s, baseY - 0.7 * s, 0.3 * s, 0.8 * s);
        ctx.save(); ctx.translate(sx + 1.7 * s, baseY - 2.6 * s); ctx.scale(s / 24 * 0.9, s / 24 * 0.9);
        S.drawTeio(ctx, { mouth: 'smile', upperOnly: true });
        ctx.restore();
      });
    }

    bgFarm(camX, horizon) {
      const ctx = this.ctx, W = this.W, H = this.H;
      ctx.fillStyle = '#fff2a8'; ctx.beginPath(); ctx.arc(W * 0.8, horizon - H * 0.3, 44, 0, TAU); ctx.fill();
      ctx.fillStyle = '#86c96a';
      ctx.beginPath(); ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 12) {
        const wx = x / (this.scale * 0.12) + camX * 0.12;
        ctx.lineTo(x, horizon - 2 * this.scale + Math.sin(wx * 0.06) * 2.2 * this.scale + Math.sin(wx * 0.021) * 3 * this.scale);
      }
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
      this.decor(camX, 0.3, 34, (i, sx, s) => {
        const baseY = horizon + 1.5 * s;
        const w = 9 * s, hgt = 5 * s;
        ctx.fillStyle = '#e9d9a3'; ctx.fillRect(sx, baseY - hgt, w, hgt + H);
        ctx.fillStyle = '#c8683f'; ctx.beginPath(); ctx.moveTo(sx - 0.5 * s, baseY - hgt); ctx.lineTo(sx + w / 2, baseY - hgt - 2.5 * s); ctx.lineTo(sx + w + 0.5 * s, baseY - hgt); ctx.closePath(); ctx.fill();
        // hex-wire panel
        ctx.strokeStyle = '#9aa39b'; ctx.lineWidth = 1;
        const hx = 0.55 * s, hy = 0.48 * s;
        for (let yy = baseY - hgt + 0.8 * s; yy < baseY + 0.5 * s; yy += hy * 1.5) {
          const row = Math.round((yy - baseY) / (hy * 1.5));
          for (let xx = sx + 0.6 * s + (row & 1 ? hx : 0); xx < sx + w - 0.4 * s; xx += hx * 2) {
            ctx.beginPath();
            for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; const px = xx + Math.cos(a) * hx, py = yy + Math.sin(a) * hy; if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
            ctx.closePath(); ctx.stroke();
          }
        }
        ctx.fillStyle = '#7a5a33'; ctx.fillRect(sx + w * 0.4, baseY - 2.4 * s, 1.6 * s, 2.4 * s);
      });
      this.decor(camX, 0.5, 3, (i, sx, s) => {
        const baseY = horizon + 2.6 * s;
        ctx.fillStyle = '#d9c9a6'; ctx.fillRect(sx, baseY - 1.6 * s, 0.25 * s, 1.6 * s);
        ctx.fillRect(sx, baseY - 1.3 * s, 3.2 * s, 0.18 * s); ctx.fillRect(sx, baseY - 0.7 * s, 3.2 * s, 0.18 * s);
      });
    }

    bgGym(camX, horizon) {
      const ctx = this.ctx, W = this.W, H = this.H;
      const bs = this.scale * 0.2;
      const bw = 2.2 * bs, bh = 1 * bs;
      const off = (camX * 0.2 * this.scale) % (bw * 2);
      for (let y = -bh; y < H; y += bh) {
        const row = Math.floor(y / bh);
        for (let x = -bw * 2 - off + (row & 1 ? bw / 2 : 0); x < W + bw; x += bw) {
          ctx.fillStyle = (row * 7 + Math.floor(x / bw)) % 5 === 0 ? '#6a4444' : '#5f3d3d';
          ctx.fillRect(x + 1, y + 1, bw - 2, bh - 2);
        }
      }
      this.decor(camX, 0.35, 18, (i, sx, s) => {
        const k = h32(i, 9);
        if (k < 0.35) {
          ctx.strokeStyle = '#222'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, horizon - 9 * s); ctx.stroke();
          ctx.fillStyle = '#d9d22a'; ctx.beginPath(); ctx.moveTo(sx - 1.4 * s, horizon - 8.2 * s); ctx.lineTo(sx + 1.4 * s, horizon - 8.2 * s); ctx.lineTo(sx + 0.8 * s, horizon - 9.2 * s); ctx.lineTo(sx - 0.8 * s, horizon - 9.2 * s); ctx.closePath(); ctx.fill();
          ctx.fillStyle = 'rgba(255,240,170,0.08)'; ctx.beginPath(); ctx.moveTo(sx - 1.4 * s, horizon - 8.2 * s); ctx.lineTo(sx + 1.4 * s, horizon - 8.2 * s); ctx.lineTo(sx + 5 * s, horizon + 4 * s); ctx.lineTo(sx - 5 * s, horizon + 4 * s); ctx.closePath(); ctx.fill();
        } else if (k < 0.7) {
          const swing = Math.sin(this.t * 2 + i) * 0.06;
          ctx.save(); ctx.translate(sx, 0); ctx.rotate(swing);
          ctx.strokeStyle = '#222'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, horizon - 7 * s); ctx.stroke();
          ctx.fillStyle = '#c0282e'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-1.1 * s, horizon - 7 * s, 2.2 * s, 5 * s, 0.8 * s) : ctx.rect(-1.1 * s, horizon - 7 * s, 2.2 * s, 5 * s); ctx.fill();
          ctx.fillStyle = '#8f1c22'; ctx.fillRect(-1.1 * s, horizon - 4.6 * s, 2.2 * s, 0.4 * s);
          ctx.restore();
        } else {
          // one poster: a fist. no text.
          ctx.fillStyle = '#111'; ctx.fillRect(sx, horizon - 8 * s, 4 * s, 3 * s);
          ctx.save(); ctx.translate(sx + 2 * s, horizon - 6.5 * s); ctx.scale(s / 24, s / 24);
          S.helpers.rrect(ctx, -14, -10, 28, 22, 6, '#ffe6d2', '#3b2a2a', 2.5);
          ctx.strokeStyle = '#3b2a2a'; ctx.lineWidth = 2; ctx.beginPath();
          for (let f = -7; f <= 7; f += 7) { ctx.moveTo(f, -10); ctx.lineTo(f, 4); }
          ctx.stroke();
          S.helpers.rrect(ctx, -16, 2, 32, 10, 4, '#ffe6d2', '#3b2a2a', 2.5);
          ctx.restore();
        }
      });
      this.decor(camX, 0.5, 40, (i, sx, s) => {
        ctx.fillStyle = i & 1 ? '#c0282e' : '#2f6fc9'; ctx.fillRect(sx - 0.35 * s, horizon - 2 * s, 0.7 * s, 4.4 * s);
      });
    }
    // ring ropes in the foreground: you slide behind them
    drawRopes(game, alpha) {
      const ctx = this.ctx, W = this.W, H = this.H;
      const horizon = this.wy(this.cam.y) - H * 0.02;
      const s2 = this.scale * 0.5;
      ctx.save(); ctx.globalAlpha = 0.85 * alpha;
      for (let r = 0; r < 3; r++) {
        const y = horizon + (5.2 - r * 1.3) * s2;
        ctx.lineWidth = Math.max(3, 0.3 * s2);
        ctx.strokeStyle = r === 1 ? '#f2d33b' : '#2f6fc9';
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        ctx.setLineDash([12, 12]); ctx.lineDashOffset = -(this.cam.x * 0.5 * this.scale) % 24; ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, 0.08 * s2);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.restore();
    }

    bgVoid(camX, horizon, game) {
      const ctx = this.ctx, W = this.W, H = this.H;
      // floating red notification bubbles
      this.decor(camX, 0.25, 16, (i, sx, s) => {
        const k = h32(i, 11);
        const y = horizon - (3 + k * 14) * s + Math.sin(this.t * 1.2 + i) * 0.4 * s;
        const w = (5 + h32(i, 12) * 4) * s, hh = 1.6 * s;
        ctx.fillStyle = '#e8332f';
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(sx, y, w, hh, 0.4 * s) : ctx.rect(sx, y, w, hh); ctx.fill();
        ctx.beginPath(); ctx.moveTo(sx + w * 0.5 - 0.3 * s, y + hh); ctx.lineTo(sx + w * 0.5 + 0.3 * s, y + hh); ctx.lineTo(sx + w * 0.5, y + hh + 0.35 * s); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.max(8, 0.8 * s) + 'px ' + FONT; ctx.textAlign = 'left';
        const txt = k < 0.6 ? '💬 0  ♥ 0  👤 0' : '💬 ' + Math.floor(h32(i, 13) * 900) + '  ♥ ' + Math.floor(h32(i, 14) * 5000) + '  👤 ' + Math.floor(h32(i, 15) * 2000);
        ctx.fillText(txt, sx + 0.3 * s, y + hh * 0.72);
      });
      // the tall calm figure in the far layer. 0 0 0. she never reacts.
      this.decor(camX, 0.12, 90, (i, sx, s) => {
        const base = horizon + 2.5 * s;
        ctx.save(); ctx.translate(sx, base - 5.2 * s); ctx.scale(s / 24 * 2.2, s / 24 * 2.2);
        game.char.draw(ctx, { mouth: 'smile', arms: 'down', hat: game.hat, blink: false });
        ctx.restore();
        const bw = 7 * s, bh = 1.7 * s, by = base - 12.5 * s;
        ctx.fillStyle = '#e8332f';
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(sx - bw / 2, by, bw, bh, 0.4 * s) : ctx.rect(sx - bw / 2, by, bw, bh); ctx.fill();
        ctx.beginPath(); ctx.moveTo(sx - 0.3 * s, by + bh); ctx.lineTo(sx + 0.3 * s, by + bh); ctx.lineTo(sx, by + bh + 0.4 * s); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.max(8, 0.85 * s) + 'px ' + FONT; ctx.textAlign = 'center';
        ctx.fillText('💬 ' + (game.oneComment ? 1 : 0) + '  ♥ 0  👤 0', sx, by + bh * 0.72);
      });
      // your live counters, as the giant bubble in the sky
      {
        const s = this.scale * 0.25;
        const bw = Math.min(W * 0.5, 14 * s), bh = 2.2 * s;
        const bx = W * 0.62 - bw / 2 + Math.sin(this.t * 0.7) * 6, by = horizon - H * 0.34;
        ctx.fillStyle = '#e8332f';
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, 0.5 * s) : ctx.rect(bx, by, bw, bh); ctx.fill();
        ctx.beginPath(); ctx.moveTo(bx + bw * 0.5 - 0.4 * s, by + bh); ctx.lineTo(bx + bw * 0.5 + 0.4 * s, by + bh); ctx.lineTo(bx + bw * 0.5, by + bh + 0.5 * s); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.max(10, 1.1 * s) + 'px ' + FONT; ctx.textAlign = 'center';
        ctx.fillText('💬 ' + game.comments + '   ♥ ' + game.likes.toLocaleString() + '   👤 ' + Math.max(0, Math.floor(game.likes / 30)), bx + bw / 2, by + bh * 0.7);
      }
      ctx.font = '400 ' + Math.round(W * 0.05) + 'px ' + FONT; ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(40,40,50,0.07)'; ctx.fillText('We live in a society', W * 0.04, horizon - H * 0.4);
    }

    // ---- ground ---------------------------------------------------------------
    drawGround(game, biome, nextBiome, fade) {
      const ctx = this.ctx, W = this.W, H = this.H, T = game.terrain;
      const st = BIOME_STYLE[biome];
      const st2 = nextBiome ? BIOME_STYLE[nextBiome] : null;
      const step = Math.max(3, Math.min(8, this.W / 160));
      const pts = [];
      for (let sx = -step; sx <= W + step; sx += step) {
        const wx = this.screenToWorldX(sx);
        pts.push([sx, this.wy(T.heightAt(wx)), wx]);
      }
      const fill = (col, topCol, lineCol, alpha) => {
        ctx.globalAlpha = alpha;
        ctx.beginPath(); ctx.moveTo(pts[0][0], H + 10);
        for (const p of pts) ctx.lineTo(p[0], p[1]);
        ctx.lineTo(pts[pts.length - 1][0], H + 10); ctx.closePath();
        ctx.fillStyle = col; ctx.fill();
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) { const p = pts[i]; if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); }
        for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; ctx.lineTo(p[0], p[1] + 0.9 * this.scale); }
        ctx.closePath(); ctx.fillStyle = topCol; ctx.fill();
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) { const p = pts[i]; if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); }
        ctx.strokeStyle = lineCol; ctx.lineWidth = Math.max(2, 0.12 * this.scale); ctx.stroke();
        ctx.globalAlpha = 1;
      };
      fill(st.ground, st.groundTop, st.groundLine, 1);
      if (st2 && fade > 0) fill(st2.ground, st2.groundTop, st2.groundLine, fade);
      if (biome === 'street' || biome === 'void') {
        ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
        for (let i = 0; i < pts.length; i += 4) { const p = pts[i]; ctx.beginPath(); ctx.moveTo(p[0], p[1] + 0.9 * this.scale); ctx.lineTo(p[0] - 0.4 * this.scale, p[1] + 3 * this.scale); ctx.stroke(); }
      } else if (biome === 'farm') {
        ctx.strokeStyle = '#3f8a33'; ctx.lineWidth = 2;
        for (let i = 1; i < pts.length; i += 3) { const p = pts[i]; if (h32(Math.floor(p[2] * 2), 5) < 0.5) continue; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] - 3, p[1] - 7); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + 3, p[1] - 8); ctx.stroke(); }
      } else if (biome === 'gym') {
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2;
        for (let i = 0; i < pts.length; i += 6) { const p = pts[i]; ctx.beginPath(); ctx.moveTo(p[0], p[1] + 1.2 * this.scale); ctx.lineTo(p[0], p[1] + 6 * this.scale); ctx.stroke(); }
      }
      // biome gate sign
      const bi = biomeIndexAt(Math.max(0, this.cam.x));
      for (const k of [bi, bi + 1]) {
        if (k <= 0) continue;
        const bx = biomeStartX(k);
        const sx = this.wx(bx);
        if (sx < -200 || sx > W + 200) continue;
        const gy = this.wy(T.heightAt(bx));
        const name = BIOME_STYLE[biomeAt(bx + 1)].name;
        const lap = Math.floor(k / 4);
        ctx.save(); ctx.translate(sx, gy);
        ctx.fillStyle = '#6b4a2e'; ctx.fillRect(-0.15 * this.scale, -5 * this.scale, 0.3 * this.scale, 5 * this.scale);
        ctx.fillStyle = '#f7f0d8'; ctx.strokeStyle = '#6b4a2e'; ctx.lineWidth = 3;
        ctx.fillRect(-3 * this.scale, -6.6 * this.scale, 6 * this.scale, 1.8 * this.scale); ctx.strokeRect(-3 * this.scale, -6.6 * this.scale, 6 * this.scale, 1.8 * this.scale);
        ctx.fillStyle = '#3b2a2a'; ctx.font = '600 ' + Math.max(9, 0.65 * this.scale) + 'px ' + FONT; ctx.textAlign = 'center';
        ctx.fillText(name + (lap > 0 ? ' · lap ' + (lap + 1) : ''), 0, -5.3 * this.scale);
        ctx.restore();
      }
    }

    // ---- entities -------------------------------------------------------------
    drawEntities(game) {
      const ctx = this.ctx, W = this.W;
      const k = this.scale / S.R;
      const Cg = BH.game.C;
      for (const e of game.entities) {
        if (!e.alive) continue;
        const sx = this.wx(e.x);
        if (sx < -140 || sx > W + 140) continue;
        const sy = this.wy(e.y);
        ctx.save();
        switch (e.type) {
          case 'egg': case 'gegg': {
            const bob = Math.sin(this.t * 3 + e.bob) * 0.08 * this.scale;
            ctx.translate(sx, sy + bob); ctx.scale(k * 1.05, k * 1.05);
            if (e.spicy) { ctx.shadowColor = '#ff3030'; ctx.shadowBlur = 12 + 6 * Math.sin(this.t * 8); }
            S.drawEgg(ctx, { golden: e.type === 'gegg', spicy: e.spicy });
            if (e.spicy) { ctx.shadowBlur = 0; ctx.globalAlpha = 0.5; S.helpers.ellipse(ctx, 0, 0, 9, 12, 0, '#ff5a5a'); }
            break;
          }
          case 'chicken': {
            const sc = game.biome === 'farm' ? 0.9 : 0.65; // image-4 scale: box-sized chickens on the farm
            ctx.translate(sx, sy - 0.92 * sc * this.scale); ctx.scale(k * sc * (e.dir < 0 ? -1 : 1), k * sc);
            if (e.falling) ctx.rotate(Math.sin(e.t * 20) * 0.3);
            S.drawChicken(ctx, { color: e.color, t: e.t });
            break;
          }
          case 'boxes': {
            ctx.translate(sx, sy); ctx.scale(k, k);
            for (let i = 0; i < e.n; i++) {
              ctx.save(); ctx.translate((i & 1 ? 2 : -2), -i * Cg.BOX_H * S.R);
              S.drawBoxStackUnit(ctx, Cg.BOX_W * S.R, Cg.BOX_H * S.R, i + e.n);
              ctx.restore();
            }
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.font = '600 10px ' + FONT; ctx.textAlign = 'center';
            ctx.fillText('≥' + Math.round(game.smashThreshold), 0, -e.n * Cg.BOX_H * S.R - 6);
            break;
          }
          case 'goldship': {
            // she sits in her own box on the crest. she does not move. ever.
            ctx.translate(sx, sy - 0.85 * this.scale); ctx.scale(k * 1.05, k * 1.05);
            const bs = (1.8 * S.R) / 64;
            ctx.save(); ctx.scale(bs, bs); S.drawBoxBack(ctx); ctx.restore();
            ctx.save(); ctx.translate(0, -0.95 * S.R); ctx.scale(0.8, 0.8); S.drawGoldShip(ctx, { upperOnly: true, mouth: 'smug' }); ctx.restore();
            ctx.save(); ctx.scale(bs, bs); S.drawBoxFront(ctx, { label: 'GOLD' }); ctx.restore();
            break;
          }
          case 'teio': {
            ctx.translate(sx, sy - 1.9 * this.scale); ctx.scale(k * 1.1, k * 1.1);
            const hop = e.done ? 0 : Math.abs(Math.sin(this.t * 6)) * 8;
            ctx.translate(0, -hop);
            S.drawTeio(ctx, { mouth: 'grin' });
            break;
          }
        }
        ctx.restore();
      }
    }

    drawRider(game) {
      const ctx = this.ctx; const r = game.rider;
      const sx = this.wx(r.x), sy = this.wy(r.y);
      const k = this.scale / S.R;
      const speed = Math.hypot(r.vx, r.vy);
      const Cg = BH.game.C;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(-r.angle);
      if (r.wobble > 0) { ctx.rotate(Math.sin(this.t * 30) * 0.08 * r.wobble); r.wobble = Math.max(0, r.wobble - 0.016); }
      ctx.scale(k * r.squashX, k * r.squashY);
      const bs = (Cg.BOX_W_M * S.R) / 64;
      ctx.save(); ctx.scale(bs, bs); S.drawBoxBack(ctx); if (game.goldenBox) { ctx.globalAlpha = 0.35; S.helpers.rrect(ctx, -32, -22, 64, 44, 3, '#ffd34d'); ctx.globalAlpha = 1; } ctx.restore();
      // passenger: the cheerleader, in the box behind you (image-1 composition)
      if (game.passenger) {
        ctx.save(); ctx.translate(-0.55 * S.R, -0.9 * S.R); ctx.scale(0.62, 0.62);
        S.drawTeio(ctx, { mouth: 'grin', upperOnly: true });
        ctx.restore();
      }
      ctx.save();
      ctx.translate(0.1 * S.R, -1.15 * S.R);
      const lean = clamp(-r.vx * 0.004, -0.15, 0.15);
      ctx.rotate(lean);
      ctx.scale(0.9, 0.9);
      const stunned = r.stun > 0;
      const mouth = stunned ? 'flat' : (game.charId === 'gold' ? 'smug' : (!r.grounded || speed > 16 ? 'scream' : (game.state === 'over' ? 'flat' : 'smile')));
      game.char.draw(ctx, { mouth, upperOnly: true, arms: !r.grounded ? 'cheer' : 'up', hat: game.hat, blink: stunned ? (Math.floor(this.t * 12) & 1) === 0 : Math.sin(this.t * 1.7) > 0.985 });
      if (stunned) {
        ctx.fillStyle = '#ffd34d'; ctx.font = '600 14px ' + FONT; ctx.textAlign = 'center';
        for (let i = 0; i < 3; i++) { const a = this.t * 6 + i * 2.1; ctx.fillText('★', Math.cos(a) * 30, -40 + Math.sin(a) * 8); }
      }
      ctx.restore();
      ctx.save(); ctx.scale(bs, bs); S.drawBoxFront(ctx, { label: game.charId === 'gold' ? 'GOLD' : '社会' }); if (game.goldenBox) { ctx.globalAlpha = 0.35; S.helpers.rrect(ctx, -32, -6, 64, 28, 3, '#ffd34d'); ctx.globalAlpha = 1; } ctx.restore();
      ctx.restore();
      // ground shadow: altitude and the target slope, readable at all times
      const gy = this.wy(game.terrain.heightAt(r.x));
      const alt = r.y - game.terrain.heightAt(r.x);
      ctx.globalAlpha = clamp(0.35 - alt * 0.025, 0.06, 0.35);
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(sx, gy + 2, 0.9 * this.scale / (1 + alt * 0.12), 0.16 * this.scale, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }

    drawParticles(game) {
      const ctx = this.ctx; const k = this.scale / S.R;
      for (const p of game.particles) {
        const sx = this.wx(p.x), sy = this.wy(p.y);
        if (sx < -60 || sx > this.W + 60) continue;
        const a = clamp(p.life / (p.ttl || 1), 0, 1);
        ctx.save(); ctx.translate(sx, sy); ctx.globalAlpha = a;
        switch (p.kind) {
          case 'letter':
            ctx.rotate(p.rot);
            ctx.font = 'bold ' + Math.round(this.scale * p.size * 0.8) + 'px ' + SUB_FONT; ctx.textAlign = 'center';
            ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.strokeText(p.text, 0, 0); ctx.fillStyle = '#fff'; ctx.fillText(p.text, 0, 0);
            break;
          case 'feather': ctx.rotate(p.rot); ctx.scale(k * 1.2, k * 1.2); S.drawFeather(ctx, p.color); break;
          case 'card':
            ctx.rotate(p.rot); ctx.fillStyle = '#d3aa6c'; ctx.strokeStyle = '#7a5a33'; ctx.lineWidth = 1.5;
            ctx.fillRect(-p.size * this.scale * 0.6, -p.size * this.scale * 0.4, p.size * this.scale * 1.2, p.size * this.scale * 0.8);
            ctx.strokeRect(-p.size * this.scale * 0.6, -p.size * this.scale * 0.4, p.size * this.scale * 1.2, p.size * this.scale * 0.8);
            break;
          case 'spark': ctx.fillStyle = p.color || '#ffe36b'; ctx.beginPath(); ctx.arc(0, 0, p.size * this.scale * 0.35, 0, TAU); ctx.fill(); break;
          case 'heart': ctx.fillStyle = '#ff4d6d'; ctx.font = 'bold ' + Math.round(this.scale * 0.6) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.fillText('♥', 0, 0); break;
          case 'dust': ctx.fillStyle = 'rgba(120,110,100,0.5)'; ctx.beginPath(); ctx.arc(0, 0, p.size * this.scale, 0, TAU); ctx.fill(); break;
          case 'chicken': ctx.rotate(p.rot); ctx.scale(k * 0.7, k * 0.7); S.drawChicken(ctx, { color: p.color, t: p.life * 10 }); break;
        }
        ctx.restore();
      }
    }

    drawPopups(game) {
      const ctx = this.ctx;
      for (const p of game.popups) {
        const sx = this.wx(p.x), sy = this.wy(p.y);
        const a = clamp(p.life / p.ttl, 0, 1);
        ctx.save(); ctx.globalAlpha = Math.min(1, a * 1.5); ctx.translate(sx, sy);
        ctx.font = '700 ' + Math.round(9 + 7 * p.size + this.scale * 0.15) + 'px ' + FONT; ctx.textAlign = 'center';
        ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(p.text, 0, 0);
        ctx.fillStyle = p.color; ctx.fillText(p.text, 0, 0);
        ctx.restore();
      }
    }

    // ---- subtitle bar ---------------------------------------------------------
    drawSubtitles(game) {
      const ctx = this.ctx, W = this.W, H = this.H;
      const base = H * 0.92;
      const px = Math.round(H * 0.055);
      const line = (text, y, scale, color) => {
        ctx.font = 'bold ' + Math.round(px * (scale || 1)) + 'px ' + SUB_FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.lineWidth = Math.max(3, px * 0.09); ctx.strokeStyle = '#000'; ctx.lineJoin = 'round'; ctx.strokeText(text, W / 2, y);
        ctx.fillStyle = color || '#fff'; ctx.fillText(text, W / 2, y);
      };
      if (game.state !== 'over') {
        if (game.subtitle && game.subtitle.text) {
          line(game.subtitle.text, base, game.subtitle.scale);
        } else if (game.screamN > 0) {
          const txt = game.screamText(game.screamN);
          if (txt) {
            // full-width glyphs: chars per line without measureText; stack upward, cap 3 lines
            const perLine = Math.max(4, Math.floor(W * 0.9 / px));
            const lines = [];
            for (let i = 0; i < txt.length && lines.length < 3; i += perLine) lines.push(txt.slice(i, i + perLine));
            if (txt.length > perLine * 3) game.subtitleOverflow = true;
            for (let i = 0; i < lines.length; i++) line(lines[i], base - (lines.length - 1 - i) * px * 1.1, 1);
          }
        }
        if (game.subNote && game.subNote.text) {
          ctx.font = '400 ' + Math.round(px * 0.5) + 'px ' + FONT; ctx.textAlign = 'center';
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(game.subNote.text, W / 2, H * 0.965);
          ctx.fillStyle = '#cfcfcf'; ctx.fillText(game.subNote.text, W / 2, H * 0.965);
        }
      }
      // repost watermark
      ctx.font = '400 ' + Math.round(px * 0.38) + 'px ' + FONT; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.strokeText('box horse', W - 10, H - 8); ctx.fillText('box horse', W - 10, H - 8);
      ctx.textAlign = 'left';
    }

    // image 3: a face too close to the camera, a small subtitle
    drawFaceCam(game) {
      if (!(game.faceCam > 0)) return;
      const ctx = this.ctx, W = this.W, H = this.H;
      const R = Math.min(W, H) * 0.3;
      const cx = W * 0.5, cy = H * 0.55;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, W, H);
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
      ctx.fillStyle = '#2a1f22'; ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
      ctx.translate(cx, cy + R * 0.25); ctx.scale(R / 30, R / 30);
      game.char.draw(ctx, { mouth: 'scream', upperOnly: true, arms: 'down', hat: game.hat });
      ctx.restore();
      ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
    }

    // ---- HUD ------------------------------------------------------------------
    drawHUD(game) {
      const ctx = this.ctx, W = this.W, H = this.H;
      const small = this.small;
      const pad = small ? 10 : 16;
      const Cg = BH.game.C;
      ctx.textBaseline = 'top';
      const txt = (t, x, y, size, color, align, weight) => {
        ctx.font = (weight || 700) + ' ' + size + 'px ' + FONT; ctx.textAlign = align || 'left';
        ctx.lineWidth = Math.max(2, size * 0.12); ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineJoin = 'round'; ctx.strokeText(t, x, y);
        ctx.fillStyle = color; ctx.fillText(t, x, y);
      };
      txt('♥ ' + game.likes.toLocaleString(), pad, pad, small ? 24 : 32, '#ff4d6d');
      txt('💬 ' + game.comments, pad, pad + (small ? 28 : 38), small ? 14 : 17, '#fff');
      if (game.combo > 0) txt('x' + game.combo + ' · ' + game.mult.toFixed(1) + '×', pad, pad + (small ? 46 : 60), small ? 13 : 15, game.combo >= 50 ? '#ffd34d' : '#cfcfcf');
      // right: distance, biome, speed
      txt(Math.round(game.distance).toLocaleString() + ' m', W - pad, pad, small ? 20 : 26, '#fff', 'right');
      const bname = BIOME_STYLE[game.biome].name + (game.tier > 0 ? ' · lap ' + (game.tier + 1) : '');
      txt(bname, W - pad, pad + (small ? 24 : 32), small ? 11 : 13, '#dddddd', 'right', 400);
      const spd = Math.hypot(game.rider.vx, game.rider.vy);
      const pauseAt = game.pauseThreshold;
      const feeding = spd >= pauseAt;
      txt(spd.toFixed(0) + ' m/s' + (feeding ? ' 🔥' : ''), W - pad, pad + (small ? 38 : 50), small ? 11 : 13, feeding ? '#ffb347' : '#cfcfcf', 'right', 400);
      // clout bar
      const bw = Math.min(W * 0.4, 360), bh = small ? 12 : 16;
      const bx = (W - bw) / 2, by = pad + 4;
      const cap = game.cloutCap;
      const frac = clamp(game.clout / Cg.CLOUT_MAX, 0, 1);
      const low = game.clout < Cg.CLOUT_LOW && !game.grace;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(bx - 3, by - 3, bw + 6, bh + 6);
      if (cap < Cg.CLOUT_MAX) { ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(bx + bw * cap / Cg.CLOUT_MAX, by, bw * (1 - cap / Cg.CLOUT_MAX), bh); }
      let col = frac > 0.6 ? '#4de37b' : '#ffd34d';
      if (low) col = (Math.floor(this.t * 6) & 1) ? '#ff2d55' : '#ff7a7a';
      if (feeding || game.drainFreeze > 0) col = '#ffffff';
      ctx.fillStyle = col; ctx.fillRect(bx, by, bw * frac, bh);
      const label = game.grace ? '' : feeding ? 'feeding the algorithm' : game.drainFreeze > 0 ? 'trending' : 'clout';
      txt(label, W / 2, by + bh + 3, small ? 10 : 11, feeding ? '#fff' : '#cfcfcf', 'center', 400);
      if (low && game.state !== 'over') txt('engagement is down · go faster · ' + Math.round(pauseAt) + ' m/s', W / 2, by + bh + (small ? 15 : 18), small ? 10 : 12, '#ff8a8a', 'center', 400);
      // perks row (emoji only)
      const pk = Object.keys(game.perks);
      if (pk.length) {
        ctx.font = (small ? 13 : 16) + 'px ' + FONT; ctx.textAlign = 'left'; ctx.globalAlpha = 0.85;
        let x = pad;
        for (const id of pk) { ctx.fillText(BH.game.PERK_BY_ID[id].emoji, x, H - pad - (small ? 14 : 18)); x += small ? 18 : 22; }
        ctx.globalAlpha = 1;
      }
      // grace: cancelled?
      if (game.grace && game.state !== 'over') {
        const f = clamp(game.grace.t / Cg.GRACE_TIME, 0, 1);
        ctx.font = '400 ' + Math.min(W * 0.08, 56) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText('(cancelled?)', W / 2, H * 0.32);
        ctx.fillStyle = '#eee'; ctx.fillText('(cancelled?)', W / 2, H * 0.32);
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(W / 2 - 80, H * 0.32 + 36, 160, 6);
        ctx.fillStyle = '#fff'; ctx.fillRect(W / 2 - 80, H * 0.32 + 36, 160 * f, 6);
        ctx.textBaseline = 'top';
      }
      // hint for the first runs
      if (game.hint > 0 && game.state === 'playing') {
        ctx.globalAlpha = Math.min(1, game.hint);
        txt(small ? 'hold = dive · release at the top to fly · hold in the air to flip' : 'hold to dive on downhills  ·  release at the crest to fly  ·  hold in the air to flip  ·  land flat', W / 2, H * 0.84, small ? 11 : 15, '#fff', 'center', 400);
        ctx.globalAlpha = 1;
      }
      // speed lines, subtle
      if (spd > 24 && game.state !== 'over') {
        ctx.save(); ctx.globalAlpha = clamp((spd - 24) / 20, 0, 0.35); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        for (let i = 0; i < 12; i++) {
          const y = (h32(i, 21) * H + this.t * 900 * (0.5 + h32(i, 22))) % H;
          const len = 40 + h32(i, 23) * 120;
          ctx.beginPath(); ctx.moveTo(W, y); ctx.lineTo(W - len, y); ctx.stroke();
        }
        ctx.restore();
      }
      if (low && game.state !== 'over') {
        const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.8);
        g.addColorStop(0, 'rgba(255,0,40,0)'); g.addColorStop(1, 'rgba(255,0,40,' + (0.22 + 0.12 * Math.sin(this.t * 8)) + ')');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      if (game.state === 'perk') { ctx.fillStyle = 'rgba(20,10,40,0.35)'; ctx.fillRect(0, 0, W, H); }
      ctx.textBaseline = 'alphabetic';
    }
  }

  BH.render = { Renderer, BIOME_STYLE, FONT, SUB_FONT };
})();
