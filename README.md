# Diwali Post

Sixteen illustrated Diwali postcards. Pick one, write on the back, post it, and send the link.

- **Paper that behaves like paper** — three.js sheet with spring physics: it bends in an S-curve from air drag while turning, twists when grabbed off-centre, cups as it moves toward you, and settles with a small flutter. Bending is length-preserving, so the edges draw in rather than stretch.
- **Drag or tap to turn** on both desktop and phones.
- **No backend.** The whole postcard (card id, to, message, from, date) is compressed into the link's `#p=` hash, so the message never reaches a server.
- Recipients see the card arrive, then it turns over by itself after 2 seconds.

## Run locally

```bash
npm install
npm run dev
```

## Deploy

Import this repo on [vercel.com/new](https://vercel.com/new). Vercel detects Vite automatically (build: `npm run build`, output: `dist`). No environment variables needed.

## Adding a card

Drop `name.webp` (1600px wide) and `name-t.webp` (640px wide) into `public/cards/`, then add `{ id: 'name', title: '…' }` to `src/cards.js`. Never rename an existing `id` — old links use it.

Add `?debug` to the URL to expose the scene as `window.__pc` for tinkering with the physics.
