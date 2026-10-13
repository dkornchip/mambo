/* BOX HORSE — procedural chibi sprites. Canvas primitives only, no assets.
 * All draw functions use a local space where the head center is (0,0),
 * head radius is 24 px, +y is DOWN (screen space). Caller handles transform.
 */
(function () {
  'use strict';
  const BH = (window.BH = window.BH || {});
  const R = 24;
  const TAU = Math.PI * 2;

  function circle(ctx, x, y, r, fill, stroke, lw) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 2; ctx.stroke(); }
  }
  function ellipse(ctx, x, y, rx, ry, rot, fill, stroke, lw) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 2; ctx.stroke(); }
  }
  function rrect(ctx, x, y, w, h, r, fill, stroke, lw) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 2; ctx.stroke(); }
  }
  function poly(ctx, pts, fill, stroke, lw) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 2; ctx.stroke(); }
  }

  const SKIN = '#ffe6d2', SKIN_LINE = '#c98b6b', LINE = '#3b2a2a';

  // ---- shared face bits ---------------------------------------------------
  function drawEye(ctx, x, y, iris, iris2, o) {
    const blink = o && o.blink;
    const w = 9, h = blink ? 2 : 13;
    if (blink) {
      ctx.strokeStyle = LINE; ctx.lineWidth = 2.5; ctx.beginPath();
      ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x, y + 4, x + w, y); ctx.stroke();
      return;
    }
    // sclera
    ellipse(ctx, x, y, w, h, 0, '#fff', LINE, 2.5);
    // iris
    ctx.save(); ctx.beginPath(); ctx.ellipse(x, y, w, h, 0, 0, TAU); ctx.clip();
    ellipse(ctx, x, y + 2, 7, 10, 0, iris);
    ellipse(ctx, x, y + 6, 5, 6, 0, iris2);
    ellipse(ctx, x, y + 1, 3.2, 5, 0, '#241a1a');
    ellipse(ctx, x - 2.5, y - 4, 2.6, 3, 0, '#fff');
    ellipse(ctx, x + 2.5, y + 5, 1.4, 1.6, 0, '#fff');
    ctx.restore();
    // upper lash
    ctx.strokeStyle = LINE; ctx.lineWidth = 3; ctx.beginPath();
    ctx.moveTo(x - w, y - 2); ctx.quadraticCurveTo(x, y - h - 3, x + w, y - 2); ctx.stroke();
  }
  function drawMouth(ctx, kind, x, y) {
    switch (kind) {
      case 'scream': // big open D mouth
        ctx.beginPath(); ctx.moveTo(x - 9, y - 3); ctx.quadraticCurveTo(x, y - 6, x + 9, y - 3);
        ctx.quadraticCurveTo(x + 10, y + 14, x, y + 15); ctx.quadraticCurveTo(x - 10, y + 14, x - 9, y - 3); ctx.closePath();
        ctx.fillStyle = '#b8304a'; ctx.fill(); ctx.strokeStyle = LINE; ctx.lineWidth = 2; ctx.stroke();
        ellipse(ctx, x, y + 10, 5, 3.5, 0, '#f27a9a');
        break;
      case 'oh':
        ellipse(ctx, x, y + 4, 6, 7, 0, '#b8304a', LINE, 2);
        ellipse(ctx, x, y + 7, 3.5, 2.5, 0, '#f27a9a');
        break;
      case 'smug':
        ctx.strokeStyle = LINE; ctx.lineWidth = 2.2; ctx.beginPath();
        ctx.moveTo(x - 7, y + 2); ctx.quadraticCurveTo(x, y + 8, x + 8, y); ctx.stroke();
        break;
      case 'grin':
        ctx.beginPath(); ctx.moveTo(x - 8, y); ctx.quadraticCurveTo(x, y + 12, x + 8, y); ctx.closePath();
        ctx.fillStyle = '#b8304a'; ctx.fill(); ctx.strokeStyle = LINE; ctx.lineWidth = 2; ctx.stroke();
        break;
      case 'flat':
        ctx.strokeStyle = LINE; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(x - 5, y + 3); ctx.lineTo(x + 5, y + 3); ctx.stroke();
        break;
      default: // smile
        ctx.strokeStyle = LINE; ctx.lineWidth = 2.2; ctx.beginPath();
        ctx.moveTo(x - 6, y + 2); ctx.quadraticCurveTo(x, y + 8, x + 6, y + 2); ctx.stroke();
    }
  }
  function drawBlush(ctx) {
    ctx.globalAlpha = 0.55;
    ellipse(ctx, -14, 10, 6, 3.2, 0, '#ff9fb0');
    ellipse(ctx, 14, 10, 6, 3.2, 0, '#ff9fb0');
    ctx.globalAlpha = 1;
  }
  function drawEar(ctx, x, y, rot, outer, inner) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    poly(ctx, [[-6, 0], [0, -20], [6, 0]], outer, LINE, 2);
    poly(ctx, [[-3, -2], [0, -14], [3, -2]], inner);
    ctx.restore();
  }
  function drawHead(ctx) {
    circle(ctx, 0, 2, R, SKIN, LINE, 2.5);
  }

  // ---- hats (cosmetics) ---------------------------------------------------
  // Hats always sit ON TOP of whatever the character already wears. That is the gag.
  function drawHat(ctx, name) {
    switch (name) {
      case 'secondbox': // a smaller cardboard box. on your head.
        ctx.save(); ctx.translate(0, -44); ctx.scale(0.42, 0.42);
        drawBoxBack(ctx); drawBoxFront(ctx, { label: '社会' });
        ctx.restore();
        break;
      case 'kepi': // the smug one's hat. she did not notice.
        ctx.save(); ctx.translate(2, -44); ctx.rotate(0.08);
        rrect(ctx, -22, -14, 44, 22, 4, '#8a5a3a', LINE, 2.5);
        rrect(ctx, -22, 4, 44, 5, 2, '#5a3620', LINE, 2);
        rrect(ctx, -22, -14, 44, 5, 2, '#a97a52');
        circle(ctx, 0, -3, 7, '#e3b94a', '#8a6a10', 1.5);
        ctx.restore();
        break;
      case 'friedegg':
        ctx.save(); ctx.translate(0, -36);
        ctx.beginPath(); ctx.moveTo(-20, 0); ctx.quadraticCurveTo(-24, -12, -8, -12); ctx.quadraticCurveTo(0, -18, 10, -12);
        ctx.quadraticCurveTo(24, -10, 20, 2); ctx.quadraticCurveTo(10, 8, -4, 5); ctx.quadraticCurveTo(-18, 8, -20, 0); ctx.closePath();
        ctx.fillStyle = '#fffaf0'; ctx.fill(); ctx.strokeStyle = '#c9b48a'; ctx.lineWidth = 1.5; ctx.stroke();
        circle(ctx, 0, -4, 7, '#f5b62a', '#c98a10', 1.5); ellipse(ctx, -2, -6, 2, 1.5, 0, '#fff0b0');
        ctx.restore();
        break;
      case 'zero': // a tiny red bubble above your head. it says 0 0 0.
        ctx.save(); ctx.translate(0, -58);
        rrect(ctx, -26, -9, 52, 18, 5, '#e8332f');
        poly(ctx, [[-4, 9], [4, 9], [0, 14]], '#e8332f');
        ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('💬0 ♥0 👤0', 0, 3); ctx.textAlign = 'left';
        ctx.restore();
        break;
      case 'live': // nobody is watching.
        ctx.save(); ctx.translate(0, -58);
        rrect(ctx, -18, -8, 36, 16, 3, '#e8332f');
        circle(ctx, -11, 0, 2.5, '#fff');
        ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('LIVE', 3, 4); ctx.textAlign = 'left';
        ctx.restore();
        break;
      case 'eyepatch': break; // handled on the face
      case 'crown':
        poly(ctx, [[-16, -18], [-12, -34], [-5, -24], [0, -38], [5, -24], [12, -34], [16, -18]], '#f5c542', '#8a6a10', 2);
        circle(ctx, -8, -24, 2, '#e03a3a'); circle(ctx, 8, -24, 2, '#3a7ae0');
        break;
      case 'tophat':
        rrect(ctx, -22, -22, 44, 6, 2, '#222', '#000', 1.5);
        rrect(ctx, -14, -48, 28, 28, 3, '#222', '#000', 1.5);
        rrect(ctx, -14, -28, 28, 5, 1, '#c23a52');
        break;
      case 'propeller':
        rrect(ctx, -16, -30, 32, 12, 6, '#e8534a', LINE, 2);
        ctx.strokeStyle = LINE; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(0, -38); ctx.stroke();
        ellipse(ctx, 0, -39, 16, 2.5, 0, '#4ab0e0', LINE, 1.5);
        break;
      case 'halo':
        ctx.strokeStyle = '#ffe36b'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(0, -36, 18, 5, 0, 0, TAU); ctx.stroke();
        break;
      case 'cone':
        poly(ctx, [[-18, -16], [0, -56], [18, -16]], '#ff7a1a', LINE, 2);
        poly(ctx, [[-10, -34], [10, -34], [12, -28], [-12, -28]], '#fff');
        break;
      case 'bucket':
        poly(ctx, [[-20, -18], [-16, -46], [16, -46], [20, -18]], '#8ea0ad', LINE, 2);
        rrect(ctx, -22, -50, 44, 6, 2, '#6e7f8a', LINE, 1.5);
        break;
      case 'chicken':
        // a tiny chicken sitting on the head
        ctx.save(); ctx.translate(0, -38); ctx.scale(0.55, 0.55); drawChicken(ctx, { color: 'white', t: 0 }); ctx.restore();
        break;
      default: break;
    }
  }

  // ---- Tannhauser -----------------------------------------------------------
  // o: {mouth, eyepatch, blink, hat, arms:'up'|'down'|'cheer', upperOnly}
  function drawTannhauser(ctx, o) {
    o = o || {};
    const HAIR = '#8f5e46', HAIR_D = '#6e4432', STREAK = '#f3dadb';
    // back hair + twin side tails
    ctx.save();
    ellipse(ctx, 0, 6, 31, 30, 0, HAIR_D, LINE, 2.5);
    // side tails
    poly(ctx, [[-30, 0], [-36, 30], [-30, 56], [-20, 52], [-20, 20]], HAIR, LINE, 2.5);
    poly(ctx, [[30, 0], [36, 30], [30, 56], [20, 52], [20, 20]], HAIR, LINE, 2.5);
    ctx.restore();
    // body
    if (!o.upperOnly) {
      // skirt (navy with stars)
      poly(ctx, [[-16, 30], [16, 30], [22, 52], [-22, 52]], '#2d3570', LINE, 2.5);
      ctx.fillStyle = '#9ea9ff'; ctx.font = 'bold 9px sans-serif'; ctx.fillText('✦', -14, 46); ctx.fillText('✦', 6, 44);
      // legs
      rrect(ctx, -12, 50, 8, 12, 3, '#3a2b2b'); rrect(ctx, 4, 50, 8, 12, 3, '#3a2b2b');
    }
    // torso: white sailor top
    rrect(ctx, -16, 24, 32, 16, 5, '#fbfbff', LINE, 2.5);
    poly(ctx, [[-16, 26], [-12, 36], [12, 36], [16, 26]], '#7c86d8');
    // bow
    circle(ctx, 0, 30, 3, '#5c63c8');
    poly(ctx, [[0, 30], [-9, 25], [-9, 35]], '#6f78d8', LINE, 1.5);
    poly(ctx, [[0, 30], [9, 25], [9, 35]], '#6f78d8', LINE, 1.5);
    // arms
    const arms = o.arms || 'up';
    ctx.strokeStyle = LINE; ctx.lineWidth = 2.5;
    if (arms === 'up') {
      rrect(ctx, -32, 8, 10, 22, 5, SKIN, LINE, 2.5); rrect(ctx, 22, 8, 10, 22, 5, SKIN, LINE, 2.5);
    } else if (arms === 'cheer') {
      rrect(ctx, -34, 0, 10, 24, 5, SKIN, LINE, 2.5); rrect(ctx, 24, -4, 10, 24, 5, SKIN, LINE, 2.5);
    } else {
      rrect(ctx, -26, 26, 10, 18, 5, SKIN, LINE, 2.5); rrect(ctx, 16, 26, 10, 18, 5, SKIN, LINE, 2.5);
    }
    // head
    drawHead(ctx);
    // ear (right) pokes out of the hair
    drawEar(ctx, 20, -12, 0.45, HAIR, '#f0a6b8');
    // bangs
    ctx.beginPath();
    ctx.moveTo(-26, -2); ctx.quadraticCurveTo(-28, -30, 0, -26); ctx.quadraticCurveTo(28, -30, 27, -2);
    ctx.lineTo(24, 2); ctx.lineTo(18, -8); ctx.lineTo(12, 0); ctx.lineTo(4, -10); ctx.lineTo(-4, 0);
    ctx.lineTo(-12, -9); ctx.lineTo(-18, 0); ctx.lineTo(-24, -6); ctx.closePath();
    ctx.fillStyle = HAIR; ctx.fill(); ctx.strokeStyle = LINE; ctx.lineWidth = 2.5; ctx.stroke();
    // light streak on the left bang
    ctx.beginPath(); ctx.moveTo(-22, -14); ctx.quadraticCurveTo(-14, -26, -2, -22);
    ctx.quadraticCurveTo(-10, -18, -18, -6); ctx.closePath(); ctx.fillStyle = STREAK; ctx.fill();
    // eyes
    drawEye(ctx, -11, 4, '#e8912c', '#f7c842', o);
    drawEye(ctx, 11, 4, '#e8912c', '#f7c842', o);
    if (o.eyepatch || o.hat === 'eyepatch') {
      circle(ctx, -11, 4, 11, '#111', '#000', 1);
      ctx.strokeStyle = '#111'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-20, -4); ctx.lineTo(-27, -12); ctx.moveTo(-2, -4); ctx.lineTo(10, -20); ctx.stroke();
    }
    drawBlush(ctx);
    drawMouth(ctx, o.mouth || 'scream', 0, 14);
    // red hair clips (right side)
    ctx.save(); ctx.translate(20, -4); ctx.rotate(-0.35);
    rrect(ctx, -8, -5, 16, 3.5, 1.5, '#e23b3b', '#8a1c1c', 1);
    rrect(ctx, -8, 1, 16, 3.5, 1.5, '#e23b3b', '#8a1c1c', 1);
    ctx.restore();
    // the beret is always there. hats go on top of it.
    ctx.save(); ctx.translate(-4, -24); ctx.rotate(-0.12);
    ellipse(ctx, 0, 0, 30, 15, 0, '#7a7ed8', LINE, 2.5);
    ellipse(ctx, -8, -5, 14, 6, -0.3, '#a9ace9');
    rrect(ctx, -24, 6, 44, 6, 3, '#6b6fc9', LINE, 2);
    circle(ctx, 8, -12, 3.5, '#4cc3e3', LINE, 1.5);
    circle(ctx, 2, -14, 3.5, '#e5423c', LINE, 1.5);
    ctx.restore();
    if (o.hat && o.hat !== 'none') { ctx.save(); ctx.translate(0, -6); drawHat(ctx, o.hat); ctx.restore(); }
  }

  // ---- Gold Ship --------------------------------------------------------------
  function drawGoldShip(ctx, o) {
    o = o || {};
    const HAIR = '#d9d0f2', HAIR_D = '#b8ace0';
    if (!o.headOnly) {
      // long back hair
      poly(ctx, [[-32, -6], [-36, 40], [-26, 60], [26, 60], [36, 40], [32, -6]], HAIR_D, LINE, 2.5);
      // body: red top
      if (!o.upperOnly) {
        poly(ctx, [[-16, 30], [16, 30], [20, 54], [-20, 54]], '#d4312f', LINE, 2.5);
        rrect(ctx, -12, 52, 8, 12, 3, '#fff', LINE, 2); rrect(ctx, 4, 52, 8, 12, 3, '#fff', LINE, 2);
      }
      rrect(ctx, -16, 24, 32, 16, 5, '#d4312f', LINE, 2.5);
      circle(ctx, -5, 32, 2, '#f5c542'); circle(ctx, 5, 32, 2, '#f5c542');
      // arms crossed (smug)
      rrect(ctx, -26, 26, 40, 9, 4, '#fff', LINE, 2.5);
      rrect(ctx, -30, 20, 10, 16, 5, '#fff', LINE, 2.5);
    }
    drawHead(ctx);
    // ears
    drawEar(ctx, -22, -14, -0.5, HAIR, '#f0a6b8');
    drawEar(ctx, 22, -14, 0.5, HAIR, '#f0a6b8');
    // hime-cut bangs: straight across
    ctx.beginPath(); ctx.moveTo(-27, 2); ctx.quadraticCurveTo(-28, -30, 0, -28); ctx.quadraticCurveTo(28, -30, 27, 2);
    ctx.lineTo(27, -4); ctx.lineTo(-27, -4); ctx.closePath(); ctx.fillStyle = HAIR; ctx.fill(); ctx.strokeStyle = LINE; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.strokeStyle = LINE; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-26, -3); ctx.lineTo(26, -3); ctx.stroke();
    // side locks
    poly(ctx, [[-27, -4], [-30, 24], [-22, 22], [-20, -4]], HAIR, LINE, 2);
    poly(ctx, [[27, -4], [30, 24], [22, 22], [20, -4]], HAIR, LINE, 2);
    // eyes: half-lidded smug pink
    drawEye(ctx, -11, 5, '#e67ec9', '#f6b7e3', o);
    drawEye(ctx, 11, 5, '#e67ec9', '#f6b7e3', o);
    // lids for smugness
    ctx.fillStyle = SKIN; ctx.fillRect(-21, -9, 20, 8); ctx.fillRect(1, -9, 20, 8);
    ctx.strokeStyle = LINE; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-20, -1); ctx.lineTo(-2, -1); ctx.moveTo(2, -1); ctx.lineTo(20, -1); ctx.stroke();
    drawBlush(ctx);
    drawMouth(ctx, o.mouth || 'smug', 0, 14);
    // blue bow on the left
    poly(ctx, [[-26, -14], [-36, -22], [-34, -8]], '#3f3fd8', LINE, 1.5);
    poly(ctx, [[-26, -14], [-20, -26], [-16, -12]], '#3f3fd8', LINE, 1.5);
    // brown kepi hat with gold emblem
    ctx.save(); ctx.translate(0, -30);
    rrect(ctx, -22, -14, 44, 22, 4, '#8a5a3a', LINE, 2.5);
    rrect(ctx, -22, 4, 44, 5, 2, '#5a3620', LINE, 2);
    rrect(ctx, -22, -14, 44, 5, 2, '#a97a52');
    circle(ctx, 0, -3, 7, '#e3b94a', '#8a6a10', 1.5);
    ctx.strokeStyle = '#8a6a10'; ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.moveTo(0, -9); ctx.lineTo(0, 3); ctx.moveTo(-6, -3); ctx.lineTo(6, -3); ctx.stroke();
    ctx.restore();
    if (o.eyepatch || o.hat === 'eyepatch') circle(ctx, -11, 5, 11, '#111', '#000', 1);
    if (o.hat && o.hat !== 'none') { ctx.save(); ctx.translate(0, -26); drawHat(ctx, o.hat); ctx.restore(); }
  }

  // ---- Tokai Teio ------------------------------------------------------------
  function drawTeio(ctx, o) {
    o = o || {};
    const HAIR = '#7a4b36', HAIR_D = '#5c3726', STREAK = '#f6d9df';
    // twin tails curling up
    poly(ctx, [[-30, 0], [-44, 10], [-40, 34], [-26, 30], [-22, 10]], HAIR_D, LINE, 2.5);
    poly(ctx, [[30, 0], [44, 10], [40, 34], [26, 30], [22, 10]], HAIR_D, LINE, 2.5);
    ellipse(ctx, 0, 4, 30, 29, 0, HAIR_D, LINE, 2.5);
    if (!o.upperOnly) {
      poly(ctx, [[-14, 30], [14, 30], [18, 50], [-18, 50]], '#eef3ff', LINE, 2.5);
      rrect(ctx, -11, 48, 8, 12, 3, '#fff', LINE, 2); rrect(ctx, 3, 48, 8, 12, 3, '#fff', LINE, 2);
    }
    rrect(ctx, -15, 24, 30, 14, 5, '#f6f9ff', LINE, 2.5);
    poly(ctx, [[-15, 26], [-10, 34], [10, 34], [15, 26]], '#f08cb0');
    rrect(ctx, -5, 32, 10, 3, 1, '#4a90e8');
    // arms cheering
    rrect(ctx, -34, -6, 10, 24, 5, SKIN, LINE, 2.5); rrect(ctx, 24, -6, 10, 24, 5, SKIN, LINE, 2.5);
    drawHead(ctx);
    drawEar(ctx, -22, -14, -0.5, HAIR, '#f0a6b8');
    drawEar(ctx, 22, -14, 0.5, HAIR, '#f0a6b8');
    // bangs
    ctx.beginPath(); ctx.moveTo(-27, 0); ctx.quadraticCurveTo(-28, -30, 0, -27); ctx.quadraticCurveTo(28, -30, 27, 0);
    ctx.lineTo(20, -6); ctx.lineTo(14, 2); ctx.lineTo(6, -8); ctx.lineTo(0, 0); ctx.lineTo(-8, -8); ctx.lineTo(-16, 0); ctx.lineTo(-22, -6); ctx.closePath();
    ctx.fillStyle = HAIR; ctx.fill(); ctx.strokeStyle = LINE; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(6, -24); ctx.quadraticCurveTo(14, -24, 20, -8); ctx.quadraticCurveTo(12, -14, 4, -18); ctx.closePath(); ctx.fillStyle = STREAK; ctx.fill();
    drawEye(ctx, -11, 4, '#4fb5ec', '#9fe0ff', o);
    drawEye(ctx, 11, 4, '#4fb5ec', '#9fe0ff', o);
    drawBlush(ctx);
    drawMouth(ctx, o.mouth || 'grin', 0, 14);
    // pink bow on top
    ctx.save(); ctx.translate(-10, -26);
    poly(ctx, [[0, 0], [-14, -10], [-12, 6]], '#f28ab8', LINE, 1.5);
    poly(ctx, [[0, 0], [14, -10], [12, 6]], '#f28ab8', LINE, 1.5);
    circle(ctx, 0, 0, 3.5, '#ff5fa0', LINE, 1.5);
    ctx.restore();
    if (o.eyepatch || o.hat === 'eyepatch') circle(ctx, -11, 4, 11, '#111', '#000', 1);
    if (o.hat && o.hat !== 'none') { ctx.save(); ctx.translate(0, -8); drawHat(ctx, o.hat); ctx.restore(); }
  }

  // ---- cardboard box (the vehicle) ------------------------------------------
  // Box is 64 wide, 44 tall; origin is box center. Draw back then front around the rider.
  function drawBoxBack(ctx) {
    rrect(ctx, -32, -22, 64, 44, 3, '#b58c58', '#7a5a33', 2.5);
    // inner shadow
    rrect(ctx, -28, -18, 56, 36, 2, '#8f6b3f');
  }
  function drawBoxFront(ctx, o) {
    o = o || {};
    rrect(ctx, -32, -6, 64, 28, 3, '#d3aa6c', '#7a5a33', 2.5);
    // tape
    ctx.fillStyle = '#efe0b8'; ctx.fillRect(-4, -6, 8, 28);
    // flap
    poly(ctx, [[-32, -6], [-40, -16], [-22, -16], [-20, -6]], '#c79c5f', '#7a5a33', 2);
    // label
    ctx.fillStyle = '#5a3f22'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(o.label || '社会', 14, 10);
    ctx.textAlign = 'left';
    if (o.smashed) {
      ctx.strokeStyle = '#7a5a33'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(-10, 10); ctx.lineTo(-14, 18); ctx.stroke();
    }
  }
  function drawBoxStackUnit(ctx, w, h, seed) {
    rrect(ctx, -w / 2, -h, w, h, 3, '#d3aa6c', '#7a5a33', 2.5);
    ctx.fillStyle = '#efe0b8'; ctx.fillRect(-4, -h, 8, h);
    ctx.fillStyle = '#5a3f22'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(['FRAGILE', '社会', '↑↑', 'TOP'][seed % 4], w / 4 + 2, -h / 2 + 3);
    ctx.textAlign = 'left';
  }

  // ---- chicken --------------------------------------------------------------
  // o: {color:'brown'|'white', t: walk phase (seconds), flip: facing}
  function drawChicken(ctx, o) {
    o = o || {};
    const body = o.color === 'white' ? '#f6f2e6' : '#b8562f';
    const bodyD = o.color === 'white' ? '#d9d2c0' : '#8c3f20';
    const t = o.t || 0;
    const legA = Math.sin(t * 14) * 5;
    // legs
    ctx.strokeStyle = '#e4a21a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-5, 10); ctx.lineTo(-5 + legA, 22); ctx.moveTo(5, 10); ctx.lineTo(5 - legA, 22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-9 + legA, 22); ctx.lineTo(-1 + legA, 22); ctx.moveTo(1 - legA, 22); ctx.lineTo(9 - legA, 22); ctx.stroke();
    // tail
    poly(ctx, [[-14, 4], [-26, -10], [-20, -2], [-28, -2], [-18, 6]], bodyD, LINE, 2);
    // body
    ellipse(ctx, 0, 2, 17, 12, 0, body, LINE, 2.5);
    ellipse(ctx, -4, 4, 9, 6, 0.3, bodyD);
    // head
    circle(ctx, 14, -10, 8, body, LINE, 2.5);
    // comb + wattle
    poly(ctx, [[10, -17], [12, -24], [15, -18], [18, -25], [20, -17]], '#e23b3b', LINE, 1.5);
    ellipse(ctx, 17, -2, 2.5, 4, 0, '#e23b3b');
    // beak + eye
    poly(ctx, [[20, -11], [29, -8], [20, -5]], '#f0b429', LINE, 1.5);
    circle(ctx, 15, -12, 2, '#1a1a1a');
  }

  function drawEgg(ctx, o) {
    o = o || {};
    if (o.golden) {
      ellipse(ctx, 0, 0, 10, 13, 0, '#f5c542', '#a67c00', 2);
      ellipse(ctx, -3, -5, 3, 4, -0.4, '#fff3b0');
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(10, -14); ctx.lineTo(16, -14); ctx.moveTo(13, -17); ctx.lineTo(13, -11); ctx.stroke();
    } else {
      ellipse(ctx, 0, 0, 9, 12, 0, '#fbf4e4', '#b9a98a', 2);
      ellipse(ctx, -3, -4, 2.5, 3.5, -0.4, '#fff');
    }
  }

  function drawFeather(ctx, color) {
    ellipse(ctx, 0, 0, 3, 7, 0.4, color || '#f6f2e6', '#a89f8a', 1);
  }

  // Player-facing names stay deadpan nicknames. glyph: the character the subtitle bar screams with
  // ('' = she does not scream). Stats are explicit, not "mass".
  const CHARACTERS = {
    tann: { name: 'box horse', draw: drawTannhauser, mass: 1.0, landWindow: 35, perfectWindow: 12, airGrav: 1.0, glyph: '啊', latin: 'A', desc: 'Screams the whole way down. The protagonist.' },
    gold: { name: 'the smug one', draw: drawGoldShip, mass: 1.15, landWindow: 30, perfectWindow: 12, airGrav: 1.1, glyph: '', latin: '', desc: 'Dives harder. Lands worse. Does not scream. Does not care.' },
    teio: { name: 'the cheerleader', draw: drawTeio, mass: 0.85, landWindow: 40, perfectWindow: 14, airGrav: 0.85, glyph: '加油', latin: 'go', desc: 'Lighter. Floats longer. Forgiving landings. Can and will.' },
  };

  BH.sprites = { R, drawTannhauser, drawGoldShip, drawTeio, drawBoxBack, drawBoxFront, drawBoxStackUnit, drawChicken, drawEgg, drawFeather, drawHat, CHARACTERS, helpers: { circle, ellipse, rrect, poly } };
})();
