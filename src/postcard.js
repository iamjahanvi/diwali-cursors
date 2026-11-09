import * as THREE from 'three';

// Card geometry in world units, same aspect as the illustrations.
const W = 1.6;
const H = W * 941 / 1672;
const NX = 56, NY = 12;
const HALF = W / 2;
const CAM_Z = 6, FOV = 30;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const damp = (k, ratio) => 2 * Math.sqrt(k) * ratio; // damping coefficient for a given damping ratio

/** A damped spring on a single value. Semi-implicit Euler, run in sub-steps. */
class Spring {
  constructor(x = 0, k = 120, ratio = 1) { this.x = x; this.v = 0; this.t = x; this.set(k, ratio); }
  set(k, ratio) { this.k = k; this.c = damp(k, ratio); return this; }
  step(dt) { this.v += (this.k * (this.t - this.x) - this.c * this.v) * dt; this.x += this.v * dt; }
  snap(x) { this.x = this.t = x; this.v = 0; }
}

function grainTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const d = g.createImageData(256, 256);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = 128 + (Math.random() - 0.5) * 70;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 5 * H / W);
  return t;
}

export class PostcardScene {
  constructor(canvas) {
    this.canvas = canvas;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.VSMShadowMap;
    this.maxAniso = r.capabilities.getMaxAnisotropy();

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 50);
    this.camera.position.set(0, 0, CAM_Z);

    this.scene.add(new THREE.HemisphereLight(0xfffaf2, 0xf0e2cf, 1.55));
    const key = (this.key = new THREE.DirectionalLight(0xfff4e6, 1.95));
    key.position.set(-2.2, 3.2, 5.5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.radius = 14;
    key.shadow.blurSamples = 20;
    key.shadow.bias = -0.0004;
    Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 20 });
    this.scene.add(key);

    // An invisible "tabletop" behind the card that only shows the shadow.
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.17 }));
    this.ground.position.z = -0.42;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    // One deformable sheet, drawn twice: front faces show the art, back faces show the writing.
    this.geo = new THREE.PlaneGeometry(W, H, NX, NY);
    this.base = this.geo.attributes.position.array.slice();
    const grain = grainTexture();
    const common = { roughness: 0.66, metalness: 0, bumpMap: grain, bumpScale: 0.35 };
    this.frontMat = new THREE.MeshStandardMaterial({ ...common, color: 0xffffff, side: THREE.FrontSide, shadowSide: THREE.DoubleSide });
    this.backMat = new THREE.MeshStandardMaterial({ ...common, color: 0xffffff, side: THREE.BackSide });
    this.front = new THREE.Mesh(this.geo, this.frontMat);
    this.back = new THREE.Mesh(this.geo, this.backMat);
    this.front.castShadow = true;
    this.card = new THREE.Group();
    this.card.add(this.front, this.back);
    this.card.visible = false;
    this.scene.add(this.card);

    // ---- physical state ----
    this.theta = new Spring(0, 55, 0.72);      // flip angle about the card's vertical axis
    this.bend = new Spring(0, 95, 0.32);        // S-bend from air drag while turning (under-damped = flutter)
    this.cup = new Spring(0, 80, 0.35);         // symmetric curl from moving through the air face-first
    this.twist = new Spring(0, 70, 0.4);        // diagonal twist when grabbed off-centre
    this.px = new Spring(0, 170, 0.9);
    this.py = new Spring(0, 170, 0.9);
    this.pz = new Spring(0, 120, 0.8);
    this.sc = new Spring(1, 170, 0.75);
    this.tiltX = new Spring(0, 60, 0.6);        // used by the arrival animation
    this.tiltZ = new Spring(0, 60, 0.55);
    this.hoverX = 0; this.hoverY = 0; this.hoverTX = 0; this.hoverTY = 0;
    this.grabY = 0;
    this.anchor = null;
    this.pad = 0.1;
    this.time = 0;
    this.interactive = false;
    this.onFlip = null;

    this._bindPointer();
    this._resize();
    window.addEventListener('resize', () => this._resize());
    if (new URLSearchParams(location.search).has('debug')) window.__pc = this;
    this.renderer.setAnimationLoop(() => this._frame());
    this._last = performance.now();
  }

  // ---------- public API ----------
  get side() { return Math.cos(this.theta.t) > 0 ? 'front' : 'back'; }

  setFront(image) {
    const tex = image.isTexture ? image : new THREE.Texture(image);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.maxAniso;
    tex.needsUpdate = true;
    if (this.frontMat.map && this.frontMat.map !== tex) this.frontMat.map.dispose();
    this.frontMat.map = tex;
    this.frontMat.needsUpdate = true;
  }

  setBack(canvas) {
    if (!this.backTex || this.backTex.image !== canvas) {
      this.backTex?.dispose();
      const t = (this.backTex = new THREE.CanvasTexture(canvas));
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = this.maxAniso;
      // Seen from behind, the sheet is mirrored, so mirror the texture back.
      t.wrapS = THREE.RepeatWrapping; t.repeat.x = -1; t.offset.x = 1;
      this.backMat.map = t;
      this.backMat.needsUpdate = true;
    }
    this.backTex.needsUpdate = true;
  }

  /** Follow a DOM element: the card fits inside its box. */
  follow(el, pad = 0.1) { this.anchor = el; this.pad = pad; }

  /** Jump the card to sit exactly over a DOM rect (e.g. the gallery thumbnail it came from). */
  placeOver(rect) {
    const p = this._rectToWorld(rect, 0, true);
    this.px.snap(p.x); this.py.snap(p.y); this.pz.snap(0); this.sc.snap(p.s);
    this.card.visible = true;
  }

  /** Card comes up off the table toward you, like being handed over. */
  arrive() {
    const p = this._anchorTarget();
    this.px.snap(p.x + 0.3); this.py.snap(p.y - 2.4); this.pz.snap(-2.2); this.sc.snap(p.s);
    this.tiltX.snap(-1.25); this.tiltZ.snap(0.22);
    this.theta.snap(0);
    this.tiltX.t = 0; this.tiltZ.t = 0; this.pz.t = 0;
    this.card.visible = true;
  }

  flipTo(side) {
    const n = Math.round(this.theta.t / Math.PI);
    const isFront = ((n % 2) + 2) % 2 === 0;
    if ((side === 'front') === isFront) return;
    this.theta.t = (n + 1) * Math.PI;
    this.theta.v += 0.6; // small push so it lifts off with intent
    this.onFlip?.(this.side);
  }
  toggle() { this.flipTo(this.side === 'front' ? 'back' : 'front'); }

  /** A soft "thunk", e.g. when the postmark lands. */
  thump() { this.sc.v -= 0.9 * this.sc.x; this.cup.v += 2.2; }

  hide() { this.card.visible = false; this.anchor = null; }

  // ---------- internals ----------
  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.wpp = (2 * CAM_Z * Math.tan(THREE.MathUtils.degToRad(FOV / 2))) / h; // world units per CSS px at z=0
  }

  _rectToWorld(r, pad = this.pad, exact = false) {
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let wPx = exact ? r.width : Math.min(r.width * (1 - pad), r.height * (1 - pad) * (W / H));
    return {
      x: (cx - window.innerWidth / 2) * this.wpp,
      y: -(cy - window.innerHeight / 2) * this.wpp,
      s: (wPx * this.wpp) / W,
    };
  }

  _anchorTarget() {
    if (!this.anchor) return { x: this.px.t, y: this.py.t, s: this.sc.t };
    return this._rectToWorld(this.anchor.getBoundingClientRect());
  }

  _bindPointer() {
    const el = this.canvas;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let drag = null;

    const hit = (e) => {
      ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
      return ray.intersectObjects([this.front, this.back])[0];
    };

    el.addEventListener('pointerdown', (e) => {
      if (!this.interactive || !this.card.visible) return;
      const h = hit(e);
      if (!h) return;
      el.setPointerCapture(e.pointerId);
      this.grabY = (h.uv.y - 0.5) * 2;
      drag = { x: e.clientX, t: performance.now(), theta0: this.theta.x, moved: 0, id: e.pointerId };
      this.theta.t = this.theta.x;
      this.theta.set(320, 0.9);
      el.style.cursor = 'grabbing';
    });

    el.addEventListener('pointermove', (e) => {
      // gentle parallax tilt toward the pointer
      this.hoverTX = ((e.clientY / window.innerHeight) - 0.5) * 0.12;
      this.hoverTY = ((e.clientX / window.innerWidth) - 0.5) * 0.16;
      if (drag && e.pointerId === drag.id) {
        const dx = e.clientX - drag.x;
        drag.moved = Math.max(drag.moved, Math.abs(dx));
        const cardPx = (W * this.sc.x) / this.wpp;
        this.theta.t = drag.theta0 + (dx / cardPx) * Math.PI * 1.15;
      } else if (this.interactive && this.card.visible) {
        el.style.cursor = hit(e) ? 'grab' : '';
      }
    });

    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const quick = performance.now() - drag.t < 350;
      this.theta.set(55, 0.72);
      if (drag.moved < 6 && quick) {
        this.toggle();
      } else {
        // land on whichever side the motion (plus fling) is heading to
        const projected = this.theta.x + this.theta.v * 0.16;
        const before = this.side;
        this.theta.t = Math.round(projected / Math.PI) * Math.PI;
        if (this.side !== before) this.onFlip?.(this.side);
      }
      drag = null;
      el.style.cursor = 'grab';
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointerleave', () => { this.hoverTX = this.hoverTY = 0; });
  }

  _deform() {
    const pos = this.geo.attributes.position.array;
    const base = this.base;
    const b = this.bend.x, c = this.cup.x, tw = this.twist.x;
    // Integrate the centre-line outward from the middle column. Each step keeps its length,
    // so bending never stretches the paper — the edges draw in as the sheet curls.
    const cols = NX + 1, mid = NX / 2, du = W / NX;
    const X = new Float32Array(cols), Z = new Float32Array(cols);
    const kappa = (u) => {
      const t = Math.min(1, Math.abs(u) / HALF);
      return b * Math.sign(u) * Math.pow(1 - t, 1.4) + c;
    };
    for (const dir of [1, -1]) {
      let phi = 0, x = 0, z = 0;
      for (let j = mid; j !== (dir > 0 ? NX : 0); j += dir) {
        const u = (j - mid) * du;
        const um = u + dir * du * 0.5;
        const phiMid = phi + kappa(um) * dir * du * 0.5;
        phi += kappa(um) * dir * du;
        x += dir * du * Math.cos(phiMid);
        z += dir * du * Math.sin(phiMid);
        X[j + dir] = x; Z[j + dir] = z;
      }
    }
    X[mid] = 0; Z[mid] = 0;
    for (let i = 0; i < pos.length; i += 3) {
      const j = Math.round((base[i] + HALF) / du);
      const y = base[i + 1];
      pos[i] = X[j];
      pos[i + 1] = y;
      pos[i + 2] = Z[j] + tw * X[j] * y;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
  }

  _frame() {
    const now = performance.now();
    let dt = Math.min((now - this._last) / 1000, 1 / 20);
    this._last = now;
    if (this.capturing) return; // a GIF export is driving the simulation
    if (this.paused) dt = 0; // debug: hold the current pose
    if (!this.card.visible) { this.renderer.render(this.scene, this.camera); return; }
    const tgt = this._anchorTarget();
    this.px.t = tgt.x; this.py.t = tgt.y; this.sc.t = tgt.s;
    this._step(dt);
    this.renderer.render(this.scene, this.camera);
  }

  /** Advance the physics by dt seconds and pose the card. */
  _step(dt) {
    if (!this.frozenTime) this.time += dt;
    const STEPS = 6, h = dt / STEPS;
    for (let i = 0; i < STEPS; i++) {
      this.theta.step(h);
      const w = this.theta.v;
      // Air drag on a turning sheet pushes each half against its own motion → an S-curve.
      this.bend.t = clamp(0.2 * w, -1.7, 1.7);
      // Grabbed off-centre, the far corner lags behind → a slight diagonal twist.
      this.twist.t = clamp(-0.07 * w * this.grabY, -0.5, 0.5);
      this.bend.step(h); this.twist.step(h);
      this.px.step(h); this.py.step(h); this.pz.step(h); this.sc.step(h);
      this.tiltX.step(h); this.tiltZ.step(h);
      // Moving face-first through air (arrival, the postmark thump) cups the sheet.
      const vFace = this.pz.v + this.tiltX.v * 0.4;
      this.cup.t = clamp(-0.22 * vFace, -0.9, 0.9);
      this.cup.step(h);
    }

    this.hoverX += (this.hoverTX - this.hoverX) * Math.min(1, dt * 4);
    this.hoverY += (this.hoverTY - this.hoverY) * Math.min(1, dt * 4);

    this._deform();

    const th = this.theta.x;
    const lift = 0.32 * Math.abs(Math.sin(th)); // a turning card rises off the table
    const breathe = 0.012 * Math.sin(this.time * 0.9);
    const s = this.sc.x;
    this.card.scale.setScalar(s);
    this.card.position.set(this.px.x, this.py.x, this.pz.x + lift * s);
    this.card.rotation.set(
      this.tiltX.x + this.hoverX + breathe - 0.05 * Math.sin(th) * Math.sign(this.theta.v || 1),
      th + this.hoverY * Math.cos(th),
      this.tiltZ.x + 0.006 * Math.sin(this.time * 0.7),
      'XYZ'
    );
    // shadow loosens as the card lifts
    this.ground.material.opacity = 0.17 - lift * 0.15;
  }

  /**
   * Record the card turning over and back as an animated GIF.
   * Runs the same physics at a fixed frame rate into an offscreen target, so it
   * looks identical to the live card and doesn't depend on how fast the device is.
   */
  async exportGif({ width = 600, height = 400, fps = 20, background = '#f1e7d8', onProgress } = {}) {
    const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
    const springs = ['theta', 'bend', 'cup', 'twist', 'px', 'py', 'pz', 'sc', 'tiltX', 'tiltZ'];
    const saved = {
      s: springs.map((k) => [this[k].x, this[k].v, this[k].t]),
      hover: [this.hoverX, this.hoverY, this.hoverTX, this.hoverTY],
      time: this.time, grabY: this.grabY, onFlip: this.onFlip,
      clear: this.renderer.getClearColor(new THREE.Color()), alpha: this.renderer.getClearAlpha(),
    };
    this.capturing = true;
    this.onFlip = null;

    const SS = 2; // render at 2× and scale down for clean edges
    const rt = new THREE.WebGLRenderTarget(width * SS, height * SS);
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    const cam = new THREE.PerspectiveCamera(FOV, width / height, 0.1, 50);
    cam.position.set(0, 0, CAM_Z);
    const viewW = 2 * CAM_Z * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * (width / height);
    const scale = (viewW * 0.7) / W;

    const big = new Uint8Array(width * SS * height * SS * 4);
    const bigCanvas = document.createElement('canvas');
    bigCanvas.width = width * SS; bigCanvas.height = height * SS;
    const bigCtx = bigCanvas.getContext('2d');
    const out = document.createElement('canvas');
    out.width = width; out.height = height;
    const outCtx = out.getContext('2d', { willReadFrequently: true });
    outCtx.imageSmoothingQuality = 'high';

    // start face-up and still
    this.theta.snap(0); this.bend.snap(0); this.cup.snap(0); this.twist.snap(0);
    this.px.snap(0); this.py.snap(-0.02); this.pz.snap(0); this.sc.snap(scale);
    this.tiltX.snap(0); this.tiltZ.snap(0);
    this.hoverX = this.hoverY = this.hoverTX = this.hoverTY = 0;
    this.time = 0; this.grabY = 0.25;
    this.frozenTime = true; // no idle 'breathing', so still frames are identical and can be merged

    // timeline (seconds): rest, turn to the message, read, turn back, settle
    const T_FLIP1 = 0.9, T_FLIP2 = 3.9, T_END = 6.3;
    const dt = 1 / fps;
    const total = Math.round(T_END * fps);
    const gif = GIFEncoder();
    const delay = Math.round(1000 / fps);
    let flipped1 = false, flipped2 = false;
    let prev = null;
    const flush = () => {
      if (!prev) return;
      const palette = quantize(prev.data, 256);
      gif.writeFrame(applyPalette(prev.data, palette), width, height, { palette, delay: prev.delay, repeat: 0 });
      prev = null;
    };
    const sameish = (a, b) => {
      let diff = 0;
      for (let i = 0; i < a.length; i += 16) if (Math.abs(a[i] - b[i]) > 2 && ++diff > 40) return false;
      return true;
    };

    try {
      this.renderer.setClearColor(background, 1);
      for (let f = 0; f < total; f++) {
        const t = f * dt;
        if (!flipped1 && t >= T_FLIP1) { this.flipTo('back'); flipped1 = true; }
        if (!flipped2 && t >= T_FLIP2) { this.flipTo('front'); flipped2 = true; }
        this._step(dt);
        this.renderer.setRenderTarget(rt);
        this.renderer.render(this.scene, cam);
        this.renderer.readRenderTargetPixels(rt, 0, 0, width * SS, height * SS, big);
        bigCtx.putImageData(new ImageData(new Uint8ClampedArray(big.buffer), width * SS, height * SS), 0, 0);
        // WebGL rows are bottom-up: flip while scaling down
        outCtx.save(); outCtx.scale(1, -1);
        outCtx.drawImage(bigCanvas, 0, -height, width, height);
        outCtx.restore();
        const { data } = outCtx.getImageData(0, 0, width, height);
        // hold still frames longer instead of repeating them — much smaller file
        if (prev && sameish(prev.data, data)) { prev.delay += delay; }
        else { flush(); prev = { data: data.slice(), delay }; }
        if (f % 6 === 0) { onProgress?.(f / total); await new Promise((r) => setTimeout(r)); }
      }
      flush();
      gif.finish();
      onProgress?.(1);
      return new Blob([gif.bytes()], { type: 'image/gif' });
    } finally {
      this.renderer.setRenderTarget(null);
      this.renderer.setClearColor(saved.clear, saved.alpha);
      rt.dispose();
      springs.forEach((k, i) => { [this[k].x, this[k].v, this[k].t] = saved.s[i]; });
      [this.hoverX, this.hoverY, this.hoverTX, this.hoverTY] = saved.hover;
      this.time = saved.time; this.grabY = saved.grabY; this.onFlip = saved.onFlip;
      this.frozenTime = false;
      this.capturing = false;
      this._last = performance.now();
    }
  }
}
