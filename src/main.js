import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/500-italic.css';
import '@fontsource/cormorant-garamond/600-italic.css';
import '@fontsource/cormorant-garamond/700.css';
import '@fontsource/cormorant-garamond/700-italic.css';
import '@fontsource/instrument-sans/400.css';
import '@fontsource/instrument-sans/500.css';
import '@fontsource/instrument-sans/600.css';
import '@fontsource/shippori-mincho-b1/latin-700.css';
import './style.css';
import { CARDS, byId } from './cards.js';
import { PostcardScene } from './postcard.js';
import { drawBack, loadBackFonts, fitMessage, BACK_W, MSG, SIG, TO } from './back.js';
import { encodeCard, decodeCard, shareUrl } from './share.js';

const $ = (s) => document.querySelector(s);
const screens = { gallery: $('#gallery'), editor: $('#editor'), viewer: $('#viewer') };
const glCanvas = $('#gl');
const backCanvas = document.createElement('canvas');
const fontsReady = loadBackFonts();
const today = () => new Date().toLocaleDateString('en-CA'); // yyyy-mm-dd, local

let scene;
try { scene = new PostcardScene(glCanvas); }
catch (e) { document.body.classList.add('no-webgl'); console.error(e); }

// ---------- image cache ----------
const imgs = new Map();
function loadImage(src) {
  if (!imgs.has(src)) {
    imgs.set(src, new Promise((res, rej) => {
      const i = new Image(); i.decoding = 'async';
      i.onload = () => res(i); i.onerror = rej; i.src = src;
    }));
  }
  return imgs.get(src);
}

// ---------- gallery ----------
const grid = $('#grid');
grid.innerHTML = CARDS.map((c) => `
  <li>
    <a class="pc" href="#/${c.id}" data-id="${c.id}" aria-label="Choose ${c.title}">
      <span class="pc-frame"><img src="${c.thumb}" alt="" width="640" height="360" loading="lazy" decoding="async"></span>
      <span class="pc-cap"><span class="pc-no">${c.no}</span> ${c.title}</span>
    </a>
  </li>`).join('');

let flightFrom = null;
grid.addEventListener('click', (e) => {
  const a = e.target.closest('.pc');
  if (!a) return;
  flightFrom = { id: a.dataset.id, rect: a.querySelector('img').getBoundingClientRect() };
  CARDS.forEach((c) => c.id === a.dataset.id && loadImage(c.full));
});
// warm the cache for full-size art once the page is idle
setTimeout(() => CARDS.slice(0, 4).forEach((c) => loadImage(c.full)), 1500);

// ---------- state ----------
const draft = { card: null, img: null, to: '', msg: '', from: '', posted: false, date: today() };
let galleryScroll = 0;
let autoFlipTimer = 0;

function show(name) {
  for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
  document.body.dataset.screen = name;
  if (scene) { scene.interactive = name !== 'gallery'; scene.calm = name === 'editor'; }
  if (name !== 'editor') setInk(false);
}

function paintBack(state, placeholders) {
  drawBack(backCanvas, { ...state, placeholders });
  scene?.setBack(backCanvas);
}

async function setArt(card) {
  // show the thumbnail immediately, then swap in the full-size art
  const thumb = await loadImage(card.thumb).catch(() => null);
  if (thumb && draft.card === card) scene?.setFront(thumb);
  const full = await loadImage(card.full);
  if (draft.card !== card && view.card !== card) return full;
  scene?.setFront(full);
  return full;
}

// ---------- editor ----------
const f = { to: $('#to'), msg: $('#msg'), from: $('#from') };
const ink = $('#ink');
const sig = ink.querySelector('.sig');
const hint = $('#hint');
const postBtn = $('#postBtn');
const shareBox = $('#shareBox');
const linkField = $('#link');
const coarse = matchMedia('(pointer: coarse)').matches;
let inkOn = false;
let exporting = false;

async function openEditor(card) {
  const sameCard = draft.card === card;
  if (screens.gallery.hidden === false) galleryScroll = window.scrollY;
  draft.card = card;
  if (!sameCard) { draft.posted = false; draft.img = null; }
  $('#cardTitle').textContent = card.title;
  $('#cardNo').textContent = card.no;
  show('editor');
  window.scrollTo(0, 0);
  updatePosted(false);
  await fontsReady;
  if (!scene) return;
  scene.follow($('#stage'), innerWidth < 560 ? 0.02 : 0.1);
  if (flightFrom?.id === card.id) scene.placeOver(flightFrom.rect);
  else scene.arrive();
  flightFrom = null;
  scene.theta.snap(0);
  draft.img = await loadImage(card.thumb);
  paintBack(draft, true);
  setArt(card).then((full) => { draft.img = full; repaint(); });
}

// Phones zoom into text fields smaller than 16px, so never let the ink get smaller than that on screen.
const minInk = (k) => (coarse ? 16 / k : 0);

function repaint() {
  if (!draft.card) return;
  const k = scene ? scene.screenRect().w / BACK_W : 1;
  paintBack({ ...draft, hideText: inkOn, minSize: minInk(k) }, true);
}

function setInk(on) {
  if (on === inkOn) return;
  inkOn = on;
  ink.hidden = !on;
  if (on) { placeInk(); if (!coarse && !draft.msg) f.msg.focus({ preventScroll: true }); }
  else document.activeElement?.blur?.();
  repaint();
}

/** Lay the live inputs exactly over the back of the card, scaled to its size on screen. */
function placeInk() {
  const r = scene.screenRect();
  const k = r.w / BACK_W;
  ink.style.left = r.x + 'px'; ink.style.top = r.y + 'px';
  ink.style.width = r.w + 'px'; ink.style.height = r.h + 'px';

  const { size } = fitMessage(draft.msg.trim() || 'x', minInk(k));
  const px = (v) => v * k + 'px';
  Object.assign(f.msg.style, {
    left: px(MSG.left), top: px(MSG.top + size * 0.02), width: px(MSG.right - MSG.left),
    height: px(MSG.bottom - MSG.top), fontSize: px(size),
  });
  const sigSize = Math.max(SIG.size, minInk(k));
  Object.assign(sig.style, {
    left: px(MSG.left), width: px(MSG.right - MSG.left), top: px(SIG.baseline - sigSize * 0.98), fontSize: px(sigSize),
  });
  f.from.style.fontSize = px(sigSize);
  f.from.style.width = Math.max(measure(f.from.value || f.from.placeholder, sigSize) + 4, 40) * k + 'px';
  const toSize = Math.max(TO.size, minInk(k));
  Object.assign(f.to.style, {
    left: px(TO.left), top: px(TO.baseline - toSize * 0.98), width: px(TO.right - TO.left), fontSize: px(toSize),
  });
}

let measureCtx;
function measure(text, size) {
  measureCtx ||= document.createElement('canvas').getContext('2d');
  measureCtx.font = `italic 600 ${size}px "Cormorant Garamond", Georgia, serif`;
  return measureCtx.measureText(text).width;
}

// keep the ink glued to the card; show it only while the back lies still
(function track() {
  requestAnimationFrame(track);
  if (!scene || document.body.dataset.screen !== 'editor' || exporting || window.__ink?.hold) return;
  const on = scene.settledOn('back');
  if (on !== inkOn) setInk(on);
  else if (on) placeInk();
  hint.textContent = scene.side === 'back'
    ? 'Write right on the card. Tap the card or “Turn over” to see the art.'
    : 'Tap the card to turn it over and write on the back.';
})();

if (new URLSearchParams(location.search).has('debug')) window.__ink = { setInk, get on() { return inkOn; } };

function onInput() {
  draft.to = f.to.value; draft.msg = f.msg.value; draft.from = f.from.value;
  if (draft.posted) updatePosted(false);
  placeInk();
}
Object.values(f).forEach((el) => el.addEventListener('input', onInput));
f.msg.addEventListener('keydown', (e) => {
  // stop at the bottom of the writing area instead of spilling past the signature
  if (e.key === 'Enter' && f.msg.scrollHeight > f.msg.clientHeight + 2) e.preventDefault();
});

$('#flipBtn').addEventListener('click', () => scene?.toggle());

function updatePosted(posted) {
  draft.posted = posted;
  shareBox.hidden = !posted;
  postBtn.hidden = posted;
  if (draft.card) repaint();
}

postBtn.addEventListener('click', async () => {
  if (!draft.msg.trim()) {
    scene?.flipTo('back');
    hint.textContent = 'Add a few lines first — write right on the card.';
    hint.classList.add('nudge');
    setTimeout(() => hint.classList.remove('nudge'), 600);
    const wait = setInterval(() => { if (inkOn) { clearInterval(wait); f.msg.focus(); } }, 100);
    setTimeout(() => clearInterval(wait), 3000);
    return;
  }
  postBtn.disabled = true;
  document.activeElement?.blur?.();
  const wasFront = scene?.side === 'front';
  scene?.flipTo('back');
  draft.date = today();
  const code = await encodeCard({ card: draft.card.id, to: draft.to.trim(), msg: draft.msg.trim(), from: draft.from.trim(), date: draft.date });
  await new Promise((r) => setTimeout(r, wasFront ? 900 : 250));
  draft.posted = true;
  repaint();
  scene?.thump();
  linkField.value = shareUrl(code);
  $('#preview').href = shareUrl(code);
  updatePosted(true);
  postBtn.disabled = false;
});

$('#copyBtn').addEventListener('click', async () => {
  const btn = $('#copyBtn');
  try { await navigator.clipboard.writeText(linkField.value); }
  catch { linkField.select(); document.execCommand('copy'); }
  btn.textContent = 'Copied';
  setTimeout(() => (btn.textContent = 'Copy link'), 1600);
});

// Inside claude.ai the page runs sandboxed and must ask the host to save files;
// everywhere else (e.g. on Vercel) a normal link download works.
async function saveFile(blob, filename) {
  const downloads = window.claude?.use ? await window.claude.use('downloads').catch(() => null) : null;
  if (downloads) {
    try { await downloads.save({ filename, data: blob }); return true; }
    catch (e) { if (e?.code === 'declined') return false; console.warn('host save failed', e); }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}

const gifBtn = $('#gifBtn');
gifBtn.addEventListener('click', async () => {
  if (!scene || gifBtn.disabled) return;
  gifBtn.disabled = true;
  exporting = true;
  setInk(false); // bake the writing into the card texture for the recording
  try {
    const blob = await scene.exportGif({
      onProgress: (p) => (gifBtn.textContent = `Making GIF… ${Math.round(p * 100)}%`),
    });
    gifBtn.textContent = 'Saving…';
    const ok = await saveFile(blob, `diwali-postcard-${draft.card.id}.gif`);
    gifBtn.textContent = ok ? 'Downloaded ✓' : 'Download cancelled';
  } catch (e) {
    console.error(e);
    gifBtn.textContent = 'Couldn’t make GIF';
  }
  exporting = false;
  setTimeout(() => { gifBtn.textContent = 'Download GIF'; gifBtn.disabled = false; }, 2200);
});

const shareBtn = $('#shareBtn');
if (navigator.share) {
  shareBtn.hidden = false;
  shareBtn.addEventListener('click', () => {
    const name = draft.from.trim();
    navigator.share({
      title: 'A Diwali postcard',
      text: name ? `${name} sent you a Diwali postcard ✦` : 'You have a Diwali postcard ✦',
      url: linkField.value,
    }).catch(() => {});
  });
}

// ---------- recipient view ----------
const view = { card: null };

async function openViewer(code) {
  show('viewer');
  window.scrollTo(0, 0);
  clearTimeout(autoFlipTimer);
  let data;
  try {
    data = await decodeCard(code);
    view.card = byId(data.card);
    if (!view.card) throw new Error('missing card');
  } catch (e) {
    console.error(e);
    screens.viewer.classList.add('lost');
    scene?.hide();
    return;
  }
  screens.viewer.classList.remove('lost');
  $('#fromLine').textContent = data.from ? `A postcard from ${data.from}` : 'Someone sent you a postcard';
  $('#toLine').textContent = data.to ? `for ${data.to}` : '';
  document.title = data.from ? `A Diwali postcard from ${data.from}` : 'A Diwali postcard for you';

  await fontsReady;
  if (!scene) return;
  const [full] = await Promise.all([loadImage(view.card.full)]);
  scene.setFront(full);
  paintBack({ ...data, card: view.card, img: full, posted: true }, false);
  scene.follow($('#vstage'), innerWidth < 560 ? 0.02 : 0.08);
  scene.arrive();

  // Turn over by itself after 2s — unless they've already flipped it.
  let flipped = false;
  scene.onFlip = () => { flipped = true; screens.viewer.classList.add('seen'); };
  autoFlipTimer = setTimeout(() => { if (!flipped) scene.flipTo('back'); }, 2000);
}

// ---------- router ----------
function route() {
  const h = location.hash;
  clearTimeout(autoFlipTimer);
  if (scene) scene.onFlip = null;
  if (h.startsWith('#p=')) return openViewer(h.slice(3));
  const card = h.startsWith('#/') && byId(h.slice(2));
  if (card) return openEditor(card);
  document.title = 'Diwali Post — send a little light';
  scene?.hide();
  show('gallery');
  requestAnimationFrame(() => window.scrollTo(0, galleryScroll));
}
window.addEventListener('hashchange', route);
route();
