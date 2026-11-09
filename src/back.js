// Draws the reverse of the postcard onto a 2D canvas that becomes a three.js texture.
export const BACK_W = 2048;
export const BACK_H = Math.round(2048 * 941 / 1672); // 1153, same aspect as the illustrations

const PAPER = '#fbf6ec';
const INK = '#26304f';          // fountain-pen navy
const RULE = '#d6c8b4';
const MUTED = '#9a8a78';
const POSTMARK = 'rgba(122, 32, 52, 0.82)';

const SERIF = '"Cormorant Garamond", "Cormorant", Georgia, serif';
const SANS = '"Instrument Sans", "Helvetica Neue", Arial, sans-serif';

export async function loadBackFonts() {
  await Promise.all([
    document.fonts.load(`italic 500 60px ${SERIF}`),
    document.fonts.load(`italic 600 60px ${SERIF}`),
    document.fonts.load(`600 40px ${SERIF}`),
    document.fonts.load(`500 24px ${SANS}`),
    document.fonts.load(`600 24px ${SANS}`),
  ]).catch(() => {});
}

// Paper grain is random, so make it once and reuse it for every redraw.
let grain;
function paperGrain() {
  if (grain) return grain;
  grain = document.createElement('canvas');
  grain.width = BACK_W; grain.height = BACK_H;
  const g = grain.getContext('2d');
  g.fillStyle = PAPER; g.fillRect(0, 0, BACK_W, BACK_H);
  for (let i = 0; i < 26000; i++) {
    const a = Math.random() * 0.05;
    g.fillStyle = Math.random() < 0.5 ? `rgba(120,90,60,${a})` : `rgba(255,255,255,${a * 1.6})`;
    g.fillRect(Math.random() * BACK_W, Math.random() * BACK_H, 1 + Math.random() * 2.5, 1 + Math.random() * 2.5);
  }
  // a few long paper fibres
  g.lineWidth = 1.2;
  for (let i = 0; i < 140; i++) {
    const x = Math.random() * BACK_W, y = Math.random() * BACK_H, l = 10 + Math.random() * 40, r = Math.random() * Math.PI;
    g.strokeStyle = `rgba(150,120,90,${0.04 + Math.random() * 0.06})`;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(r) * l * 0.5 + 6, y + Math.sin(r) * l * 0.5, x + Math.cos(r) * l, y + Math.sin(r) * l); g.stroke();
  }
  // soft warm vignette
  const v = g.createRadialGradient(BACK_W / 2, BACK_H / 2, BACK_H * 0.35, BACK_W / 2, BACK_H / 2, BACK_W * 0.72);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(150,110,60,0.10)');
  g.fillStyle = v; g.fillRect(0, 0, BACK_W, BACK_H);
  return grain;
}

function spaced(ctx, text, x, y, spacing, align = 'left') {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  const prev = ctx.textAlign; ctx.textAlign = 'left';
  chars.forEach((c, i) => { ctx.fillText(c, cx, y); cx += widths[i] + spacing; });
  ctx.textAlign = prev;
  return total;
}

function wrap(ctx, text, maxW) {
  const lines = [];
  for (const para of text.split('\n')) {
    if (!para.trim()) { lines.push(''); continue; }
    let line = '';
    for (let word of para.split(/\s+/).filter(Boolean)) {
      // break words that are wider than the whole line
      while (ctx.measureText(word).width > maxW) {
        let i = word.length - 1;
        while (i > 1 && ctx.measureText(word.slice(0, i)).width > maxW) i--;
        if (line) { lines.push(line); line = ''; }
        lines.push(word.slice(0, i)); word = word.slice(i);
      }
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; }
      else line = test;
    }
    lines.push(line);
  }
  return lines;
}

function stamp(ctx, img, x, y, w, h) {
  ctx.save();
  ctx.shadowColor = 'rgba(80,50,20,0.18)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4;
  ctx.fillStyle = '#fffdf8';
  ctx.fillRect(x, y, w, h);
  ctx.restore();
  // perforations
  const r = 9, step = 26;
  ctx.fillStyle = PAPER;
  for (let px = x + step / 2; px < x + w; px += step) { dot(px, y); dot(px, y + h); }
  for (let py = y + step / 2; py < y + h; py += step) { dot(x, py); dot(x + w, py); }
  function dot(cx, cy) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); }
  // artwork: a portrait crop from the middle of the illustration
  const ix = x + 22, iy = y + 22, iw = w - 44, ih = h - 44;
  if (img) {
    const sh = img.naturalHeight, sw = sh * (iw / ih);
    ctx.drawImage(img, (img.naturalWidth - sw) / 2, 0, sw, sh, ix, iy, iw, ih);
  }
  ctx.strokeStyle = 'rgba(60,40,20,0.25)'; ctx.lineWidth = 2; ctx.strokeRect(ix, iy, iw, ih);
  // denomination
  ctx.save();
  ctx.fillStyle = '#fffdf8'; ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 6;
  ctx.font = `600 54px ${SERIF}`; ctx.textAlign = 'left'; ctx.fillText('₹5', ix + 14, iy + ih - 18);
  ctx.font = `600 17px ${SANS}`;
  spaced(ctx, 'DEEPAVALI', ix + iw - 14, iy + 34, 3.5, 'right');
  ctx.restore();
}

function postmark(ctx, cx, cy, date) {
  const R = 118;
  const layer = document.createElement('canvas');
  layer.width = 900; layer.height = 340;
  const g = layer.getContext('2d');
  const ox = 170, oy = 170; // circle centre inside the layer
  g.strokeStyle = POSTMARK; g.fillStyle = POSTMARK;
  g.lineWidth = 6; g.beginPath(); g.arc(ox, oy, R, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 3; g.beginPath(); g.arc(ox, oy, R - 46, 0, Math.PI * 2); g.stroke();
  // ring text
  g.font = `600 21px ${SANS}`;
  const ring = 'SENT WITH LIGHT  ✦  DIWALI POST  ✦  ';
  const chars = [...ring];
  const rr = R - 24;
  let a = -Math.PI / 2 - 1.95;
  const per = (Math.PI * 2) / chars.length;
  chars.forEach((c) => {
    g.save(); g.translate(ox + Math.cos(a) * rr, oy + Math.sin(a) * rr); g.rotate(a + Math.PI / 2);
    g.textAlign = 'center'; g.fillText(c, 0, 7); g.restore(); a += per;
  });
  // date
  g.textAlign = 'center';
  g.font = `600 30px ${SANS}`; g.fillText(date.day, ox, oy - 6);
  g.font = `600 22px ${SANS}`; g.fillText(date.rest, ox, oy + 26);
  // wavy cancellation lines across the stamp
  g.lineWidth = 6;
  for (let i = 0; i < 5; i++) {
    const y0 = oy - 80 + i * 40;
    g.beginPath();
    for (let x = ox + R + 22; x < 880; x += 4) {
      const y = y0 + Math.sin((x - ox) / 34) * 9;
      x === ox + R + 22 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
  }
  // uneven ink: knock out specks
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(0,0,0,${0.25 + Math.random() * 0.75})`;
    const s = Math.random() * 3.2;
    g.fillRect(Math.random() * 900, Math.random() * 340, s, s);
  }
  // one faded patch, like an unevenly inked rubber stamp
  const fade = g.createRadialGradient(ox + 120, oy + 90, 10, ox + 120, oy + 90, 200);
  fade.addColorStop(0, 'rgba(0,0,0,0.55)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = fade; g.fillRect(0, 0, 900, 340);

  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(-0.13);
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(layer, -ox, -oy);
  ctx.restore();
}

export function formatDate(iso) {
  const d = iso ? new Date(iso + 'T12:00:00') : new Date();
  const m = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][d.getMonth()];
  return { day: String(d.getDate()).padStart(2, '0') + ' ' + m, rest: String(d.getFullYear()) };
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{card, img, to, msg, from, posted, date, placeholders}} s
 */
export function drawBack(canvas, s) {
  canvas.width = BACK_W; canvas.height = BACK_H;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(paperGrain(), 0, 0);
  ctx.textBaseline = 'alphabetic';

  // header
  ctx.fillStyle = MUTED; ctx.font = `600 22px ${SANS}`;
  spaced(ctx, 'POST  CARD', BACK_W / 2, 118, 9, 'center');

  // divider
  const DIV = 1150;
  ctx.strokeStyle = RULE; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(DIV, 190); ctx.lineTo(DIV, 1000); ctx.stroke();

  // ---- left: message ----
  const L = 120, R = DIV - 90, TOP = 210, BOTTOM = 990;
  const hasMsg = s.msg && s.msg.trim();
  const msg = hasMsg ? s.msg.trim() : (s.placeholders ? 'Your message will appear here, in ink.' : '');
  const from = s.from && s.from.trim();

  let size = 86, lines, lh;
  for (; size >= 36; size -= 2) {
    ctx.font = `italic 500 ${size}px ${SERIF}`;
    lines = wrap(ctx, msg, R - L);
    lh = size * 1.32;
    const sig = from ? lh * 1.9 : 0;
    if (lines.length * lh + sig <= BOTTOM - TOP) break;
  }
  ctx.font = `italic 500 ${size}px ${SERIF}`;
  ctx.fillStyle = hasMsg ? INK : 'rgba(38,48,79,0.32)';
  ctx.textAlign = 'left';
  let y = TOP + size;
  for (const line of lines) { ctx.fillText(line, L, y); y += lh; }
  if (from) {
    ctx.fillStyle = INK;
    ctx.font = `italic 600 ${Math.round(size * 1.08)}px ${SERIF}`;
    ctx.textAlign = 'right';
    ctx.fillText('— ' + from, R, y + lh * 0.55);
    ctx.textAlign = 'left';
  }

  // footer caption
  ctx.fillStyle = MUTED; ctx.font = `500 19px ${SANS}`;
  spaced(ctx, `NO. ${s.card.no}  ·  ${s.card.title.toUpperCase()}`, L, 1070, 3.2);

  // ---- right: stamp, address ----
  const SW = 236, SH = 286, SX = BACK_W - 120 - SW, SY = 104;
  stamp(ctx, s.img, SX, SY, SW, SH);

  const AL = DIV + 90, AR = BACK_W - 120;
  ctx.fillStyle = MUTED; ctx.font = `600 22px ${SANS}`;
  spaced(ctx, 'TO', AL, 588, 6);
  ctx.strokeStyle = RULE; ctx.lineWidth = 2.5;
  [700, 812, 924].forEach((ly) => { ctx.beginPath(); ctx.moveTo(AL, ly); ctx.lineTo(AR, ly); ctx.stroke(); });
  const to = s.to && s.to.trim();
  if (to) {
    ctx.fillStyle = INK;
    let ts = 74;
    do { ctx.font = `italic 600 ${ts}px ${SERIF}`; ts -= 2; } while (ctx.measureText(to).width > AR - AL - 20 && ts > 30);
    ctx.fillText(to, AL + 10, 682);
  } else if (s.placeholders) {
    ctx.fillStyle = 'rgba(38,48,79,0.28)'; ctx.font = `italic 500 64px ${SERIF}`;
    ctx.fillText('Someone dear', AL + 10, 682);
  }

  if (s.posted) postmark(ctx, SX - 70, SY + 190, formatDate(s.date));
}
