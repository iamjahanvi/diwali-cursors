// The postcard catalogue. `id` is what goes into share links, so never rename one.
export const CARDS = [
  { id: 'bazaar',       title: 'The Bazaar' },
  { id: 'chai',         title: 'Chai & Mithai' },
  { id: 'sparklers',    title: 'Courtyard Sparklers' },
  { id: 'home',         title: 'Home, Lit Up' },
  { id: 'rangoli',      title: 'Rangoli Afternoon' },
  { id: 'cosy-corner',  title: 'Cosy Corner' },
  { id: 'still-life',   title: 'Still Life with Diyas' },
  { id: 'ghats',        title: 'Lights on the Ghats' },
  { id: 'terrace',      title: 'Terrace Rangoli' },
  { id: 'lamplighters', title: 'The Lamplighters' },
  { id: 'diya',         title: 'One Small Diya' },
  { id: 'first-flame',  title: 'First Flame' },
  { id: 'haveli',       title: 'Little Haveli' },
  { id: 'evening-walk', title: 'Evening Walk' },
  { id: 'the-table',    title: 'The Festive Table' },
  { id: 'rooftop',      title: 'Rooftop Night' },
].map((c, i) => ({
  ...c,
  no: String(i + 1).padStart(2, '0'),
  full: `cards/${c.id}.webp`,
  thumb: `cards/${c.id}-t.webp`,
}));

export const byId = (id) => CARDS.find((c) => c.id === id);
