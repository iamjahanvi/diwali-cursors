import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/500-italic.css';
import '@fontsource/cormorant-garamond/600-italic.css';
import '@fontsource/cormorant-garamond/700.css';
import '@fontsource/cormorant-garamond/700-italic.css';
import '@fontsource/instrument-sans/400.css';
import '@fontsource/instrument-sans/500.css';
import '@fontsource/instrument-sans/600.css';
import '@fontsource/gloock/400.css';
import './style.css';
import { CARDS, byId } from './cards.js';
import { PostcardScene } from './postcard.js';
import { drawBack, loadBackFonts } from './back.js';
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
  if (scene) scene.interactive = name !== 'gallery';
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
const counter = $('#count');
const postBtn = $('#postBtn');
const shareBox = $('#shareBox');
const linkField = $('#link');

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
  scene.follow($('#stage'), innerWidth < 560 ? 0.05 : 0.14);
  if (flightFrom?.id === card.id) scene.placeOver(flightFrom.rect);
  else scene.arrive();
  flightFrom = null;
  scene.theta.snap(0);
  draft.img = await loadImage(card.thumb);
  paintBack(draft, true);
  setArt(card).then((full) => { draft.img = full; paintBack(draft, true); });
}

let paintQueued = false;
function onInput() {
  draft.to = f.to.value; draft.msg = f.msg.value; draft.from = f.from.value;
  counter.textContent = `${draft.msg.length}/${f.msg.maxLength}`;
  if (draft.posted) updatePosted(false);
  if (!paintQueued) {
    paintQueued = true;
    requestAnimationFrame(() => { paintQueued = false; paintBack(draft, true); });
  }
}
Object.values(f).forEach((el) => {
  el.addEventListener('input', onInput);
  el.addEventListener('focus', () => scene?.flipTo('back'));
});

$('#flipBtn').addEventListener('click', () => scene?.toggle());

function updatePosted(posted) {
  draft.posted = posted;
  shareBox.hidden = !posted;
  postBtn.hidden = posted;
  if (!posted && draft.card) paintBack(draft, true);
}

postBtn.addEventListener('click', async () => {
  if (!draft.msg.trim()) {
    f.msg.focus();
    f.msg.closest('.field').classList.add('nudge');
    setTimeout(() => f.msg.closest('.field').classList.remove('nudge'), 600);
    return;
  }
  postBtn.disabled = true;
  const wasFront = scene?.side === 'front';
  scene?.flipTo('back');
  draft.date = today();
  const code = await encodeCard({ card: draft.card.id, to: draft.to.trim(), msg: draft.msg.trim(), from: draft.from.trim(), date: draft.date });
  await new Promise((r) => setTimeout(r, wasFront ? 900 : 250));
  draft.posted = true;
  paintBack(draft, true);
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
