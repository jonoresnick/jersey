/* =====================================================================
   Hockey Uniform Builder — editable data
   ---------------------------------------------------------------------
   Everything the builder offers lives in this file: colour schemes,
   templates, stripe sets, fonts, and the list of colour zones.
   Add or change entries here and reload the page. There is no build step.

   A colour value anywhere in this file is either
     "p0" … "p4"  → a slot in the team palette (Primary … Extra), or
     "#rrggbb"    → a fixed colour that ignores the team palette.
   ===================================================================== */
window.UB = window.UB || {};

UB.PALETTE_SLOTS = ['Primary', 'Secondary', 'Accent', 'Trim', 'Extra'];

/* Ready-made team palettes (5 colours each, in slot order). */
UB.SCHEMES = [
  { name: 'Harbour Navy',   colors: ['#0B2545', '#FFFFFF', '#C8102E', '#8D99AE', '#4F9DDE'] },
  { name: 'Crimson & White', colors: ['#B5121B', '#FFFFFF', '#111111', '#9EA2A2', '#7A0019'] },
  { name: 'Black & Gold',   colors: ['#111111', '#FFB81C', '#FFFFFF', '#5C6670', '#A07A2C'] },
  { name: 'Royal Blue',     colors: ['#0038A8', '#FFFFFF', '#111111', '#8D9093', '#A6C9EC'] },
  { name: 'Forest & Gold',  colors: ['#154734', '#FFFFFF', '#EAAA00', '#111111', '#A2AAAD'] },
  { name: 'Flyer Orange',   colors: ['#F74902', '#FFFFFF', '#111111', '#A6A6A6', '#CF4520'] },
  { name: 'Pacific Teal',   colors: ['#006D75', '#FFFFFF', '#111111', '#EA7200', '#8E9090'] },
  { name: 'Purple & Gold',  colors: ['#55247A', '#FFFFFF', '#FDB927', '#111111', '#A2AAAD'] },
  { name: 'Steel & Gold',   colors: ['#333F48', '#FFFFFF', '#B4975A', '#C8102E', '#111111'] },
  { name: 'Burgundy & Blue', colors: ['#6F263D', '#FFFFFF', '#236192', '#A2AAAD', '#000000'] },
  { name: 'Deep Sea',       colors: ['#001628', '#99D9D9', '#FFFFFF', '#68A2B9', '#E9072B'] },
  { name: 'Fire & Ice',     colors: ['#C8102E', '#F1BE48', '#111111', '#FFFFFF', '#6CACE4'] },
];

/* Every part of the uniform you can colour. `group` decides where it is
   listed in the Colours tab. */
UB.ZONE_GROUPS = [
  { id: 'jersey',   label: 'Jersey' },
  { id: 'lettering', label: 'Name & number' },
  { id: 'crest',    label: 'Crest' },
  { id: 'pants',    label: 'Pants' },
  { id: 'socks',    label: 'Socks' },
  { id: 'helmet',   label: 'Helmet' },
  { id: 'gear',     label: 'Gloves, skates & stick' },
];
UB.ZONES = [
  { id: 'body',          label: 'Body',            group: 'jersey' },
  { id: 'sleeves',       label: 'Sleeves',         group: 'jersey' },
  { id: 'yoke',          label: 'Yoke',            group: 'jersey' },
  { id: 'yokeTrim',      label: 'Yoke trim',       group: 'jersey' },
  { id: 'stripe1',       label: 'Main stripe',     group: 'jersey' },
  { id: 'stripe2',       label: 'Accent stripe',   group: 'jersey' },
  { id: 'pattern',       label: 'Pattern',         group: 'jersey' },
  { id: 'collar',        label: 'Collar',          group: 'jersey' },
  { id: 'collarTrim',    label: 'Collar piping',   group: 'jersey' },
  { id: 'cuffs',         label: 'Cuffs',           group: 'jersey' },
  { id: 'laces',         label: 'Laces',           group: 'jersey' },
  { id: 'number',        label: 'Number',          group: 'lettering' },
  { id: 'numberOutline', label: 'Number outline',  group: 'lettering' },
  { id: 'numberOutline2', label: 'Outer outline',  group: 'lettering' },
  { id: 'name',          label: 'Name',            group: 'lettering' },
  { id: 'crestBg',       label: 'Crest field',     group: 'crest' },
  { id: 'crestRing',     label: 'Crest ring',      group: 'crest' },
  { id: 'crestText',     label: 'Crest lettering', group: 'crest' },
  { id: 'pants',         label: 'Pants',           group: 'pants' },
  { id: 'pantsStripe1',  label: 'Pants stripe',    group: 'pants' },
  { id: 'pantsStripe2',  label: 'Pants accent',    group: 'pants' },
  { id: 'socks',         label: 'Socks',           group: 'socks' },
  { id: 'sockStripe1',   label: 'Sock stripe',     group: 'socks' },
  { id: 'sockStripe2',   label: 'Sock accent',     group: 'socks' },
  { id: 'helmet',        label: 'Helmet shell',    group: 'helmet' },
  { id: 'helmetTrim',    label: 'Ear guard & strap', group: 'helmet' },
  { id: 'helmetDecal',   label: 'Helmet number',   group: 'helmet' },
  { id: 'gloves',        label: 'Gloves',          group: 'gear' },
  { id: 'glovesTrim',    label: 'Glove cuffs & rolls', group: 'gear' },
  { id: 'skates',        label: 'Skate boots',     group: 'gear' },
  { id: 'skatesTrim',    label: 'Skate accents',   group: 'gear' },
  { id: 'stick',         label: 'Stick',           group: 'gear' },
];

/* Default colour for each zone. Templates override the jersey and sock zones. */
UB.BASE_COLORS = {
  body: 'p0', sleeves: 'p0', yoke: 'p1', yokeTrim: 'p2', stripe1: 'p1', stripe2: 'p2',
  pattern: 'p2', collar: 'p1', collarTrim: 'p2', cuffs: 'p0', laces: 'p1',
  number: 'p1', numberOutline: 'p2', numberOutline2: 'p1', name: 'p1',
  crestBg: 'p1', crestRing: 'p2', crestText: 'p0',
  pants: 'p0', pantsStripe1: 'p1', pantsStripe2: 'p2',
  socks: 'p0', sockStripe1: 'p1', sockStripe2: 'p2',
  helmet: 'p0', helmetTrim: 'p0', helmetDecal: 'p1',
  gloves: 'p0', glovesTrim: 'p1', skates: '#17191C', skatesTrim: 'p0', stick: '#16181A',
};
/* Zones a template sets when you apply it (everything else keeps your choice). */
UB.TEMPLATE_ZONES = ['body', 'sleeves', 'yoke', 'yokeTrim', 'stripe1', 'stripe2', 'pattern',
  'collar', 'collarTrim', 'cuffs', 'laces', 'socks', 'sockStripe1', 'sockStripe2'];
/* Zones that swap Primary ↔ Secondary when a kit is set to a light (away) sweater. */
UB.SWAP_ZONES = new Set(['body', 'sleeves', 'yoke', 'yokeTrim', 'stripe1', 'stripe2', 'pattern',
  'collar', 'collarTrim', 'cuffs', 'laces', 'number', 'numberOutline', 'numberOutline2', 'name',
  'socks', 'sockStripe1', 'sockStripe2']);

/* Stripe sets, used for hem stripes, sleeve stripes and socks.
   Each band: at = distance from the stripe start line to the band's near edge,
   h = thickness, c = 1 (main stripe colour) or 2 (accent stripe colour).
   Later bands paint over earlier ones. Units are jersey pixels (sweater ≈ 400 wide). */
UB.STRIPE_SETS = {
  none:     { label: 'None', bands: [] },
  single:   { label: 'Single', bands: [{ at: 0, h: 22, c: 1 }] },
  double:   { label: 'Double', bands: [{ at: 0, h: 14, c: 1 }, { at: 22, h: 14, c: 1 }] },
  triple:   { label: 'Triple', bands: [{ at: 0, h: 10, c: 1 }, { at: 16, h: 10, c: 1 }, { at: 32, h: 10, c: 1 }] },
  classic3: { label: 'Thin–thick–thin', bands: [{ at: 0, h: 7, c: 1 }, { at: 13, h: 22, c: 1 }, { at: 41, h: 7, c: 1 }] },
  outlined: { label: 'Outlined', bands: [{ at: 0, h: 34, c: 2 }, { at: 5, h: 24, c: 1 }] },
  tricolor: { label: 'Tri-colour', bands: [{ at: 0, h: 12, c: 1 }, { at: 12, h: 12, c: 2 }, { at: 24, h: 12, c: 1 }] },
  wide:     { label: 'Wide band', bands: [{ at: 0, h: 46, c: 1 }] },
  banded:   { label: 'Band with pinlines', bands: [{ at: 0, h: 42, c: 1 }, { at: 8, h: 5, c: 2 }, { at: 29, h: 5, c: 2 }] },
  stepped:  { label: 'Stepped', bands: [{ at: 0, h: 20, c: 1 }, { at: 26, h: 10, c: 1 }, { at: 42, h: 5, c: 1 }] },
};

/* Fonts for numbers, names and crest initials (all from Google Fonts).
   w = average glyph width as a fraction of font size, size = scale to even out cap heights,
   gf = the Google Fonts family query used for PNG export. */
UB.FONTS = {
  graduate: { label: 'Varsity',  family: "'Graduate', serif",           weight: 400, w: 0.74, size: 1,    gf: 'Graduate' },
  alfa:     { label: 'Slab',     family: "'Alfa Slab One', serif",      weight: 400, w: 0.72, size: 0.95, gf: 'Alfa+Slab+One' },
  bebas:    { label: 'Tall',     family: "'Bebas Neue', sans-serif",    weight: 400, w: 0.44, size: 1.08, gf: 'Bebas+Neue' },
  teko:     { label: 'Athletic', family: "'Teko', sans-serif",          weight: 600, w: 0.46, size: 1.18, gf: 'Teko:wght@600' },
  staat:    { label: 'Block',    family: "'Staatliches', sans-serif",   weight: 400, w: 0.52, size: 1.05, gf: 'Staatliches' },
  stencil:  { label: 'Stencil',  family: "'Saira Stencil One', sans-serif", weight: 400, w: 0.62, size: 1, gf: 'Saira+Stencil+One' },
  ops:      { label: 'Military', family: "'Black Ops One', sans-serif", weight: 400, w: 0.70, size: 0.95, gf: 'Black+Ops+One' },
  russo:    { label: 'Modern',   family: "'Russo One', sans-serif",     weight: 400, w: 0.68, size: 0.95, gf: 'Russo+One' },
};

UB.COLLARS = { laceup: 'Lace-up', vneck: 'V-neck', crew: 'Crew' };
UB.YOKES = { none: 'None', straight: 'Straight', v: 'V', curved: 'Curved', arched: 'Arched' };
UB.PATTERN_AREAS = { body: 'Body only', all: 'Body & sleeves' };
UB.SWEATERS = { false: 'Dark (home)', true: 'Light (away)' };
UB.OUTLINES = { 0: 'None', 1: 'Single', 2: 'Double' };
UB.CAPTAIN = { none: 'None', C: 'C', A: 'A' };
UB.CREST_STYLES = { roundel: 'Roundel', shield: 'Shield', wordmark: 'Wordmark', initials: 'Initials', image: 'Your logo', none: 'None' };
UB.PATCHES = { none: 'None', mini: 'Mini crest', image: 'Your logo' };
UB.PANTS_STRIPES = { none: 'None', single: 'Single', outlined: 'Outlined', twin: 'Twin', hem: 'Leg bands' };
UB.SOCK_STYLES = Object.assign({ match: 'Match jersey hem' },
  Object.fromEntries(Object.entries(UB.STRIPE_SETS).map(([k, v]) => [k, v.label])));
UB.VIEWS = { player: 'Player', jersey: 'Jersey', flat: 'Flat sheet' };

/* Starting values for a jersey. Templates only list what they change. */
UB.DEFAULT_JERSEY = {
  collar: 'laceup',
  yoke: 'none', yokeDepth: 110, yokeTrim: 6,
  hem: { style: 'none', offset: 34, size: 1 },
  sleeve: { style: 'none', offset: 26, size: 1 },
  pattern: { type: 'none', size: 1, pos: 0, opacity: 1, area: 'body' },
};

/* Templates: a jersey style plus which palette slot goes where.
   jersey/socks/pants are merged over the defaults; colors over BASE_COLORS. */
UB.TEMPLATES = [
  {
    id: 'original', name: 'Original Six', note: 'Plain body, thin–thick–thin stripes',
    jersey: { collar: 'laceup', hem: { style: 'classic3', offset: 34 }, sleeve: { style: 'classic3', offset: 26 } },
    pants: { stripe: 'single' }, socks: { style: 'match' },
    colors: { stripe1: 'p1', stripe2: 'p2', collar: 'p1', cuffs: 'p0' },
  },
  {
    id: 'heritage', name: 'Heritage Yoke', note: 'Shoulder yoke with trim line',
    jersey: { collar: 'laceup', yoke: 'straight', yokeDepth: 108, yokeTrim: 6,
      hem: { style: 'double', offset: 30 }, sleeve: { style: 'double', offset: 24 } },
    pants: { stripe: 'outlined' }, socks: { style: 'match' },
    colors: { yoke: 'p2', yokeTrim: 'p1', stripe1: 'p1', stripe2: 'p2', collar: 'p2' },
  },
  {
    id: 'northern', name: 'Northern V', note: 'Pointed yoke, bold single stripes',
    jersey: { collar: 'vneck', yoke: 'v', yokeDepth: 104, yokeTrim: 5,
      hem: { style: 'single', offset: 26, size: 1.2 }, sleeve: { style: 'single', offset: 30 } },
    pants: { stripe: 'single' }, socks: { style: 'match' },
    colors: { yoke: 'p1', yokeTrim: 'p2', stripe1: 'p1', collar: 'p1' },
  },
  {
    id: 'chevron', name: 'Chevron', note: 'Big V across the chest',
    jersey: { collar: 'vneck', sleeve: { style: 'outlined', offset: 26 },
      pattern: { type: 'chevron', size: 1, pos: 0, opacity: 1, area: 'body' } },
    pants: { stripe: 'outlined' }, socks: { style: 'outlined' },
    colors: { pattern: 'p1', stripe1: 'p1', stripe2: 'p2', collar: 'p2' },
  },
  {
    id: 'sash', name: 'Sash', note: 'Diagonal band, shoulder to hip',
    jersey: { collar: 'crew', hem: { style: 'single', offset: 20, size: 0.8 }, sleeve: { style: 'single', offset: 30, size: 0.8 },
      pattern: { type: 'sash', size: 1, pos: 0, opacity: 1, area: 'body' } },
    pants: { stripe: 'single' }, socks: { style: 'match' },
    colors: { pattern: 'p1', stripe1: 'p1', collar: 'p1' },
  },
  {
    id: 'fade', name: 'Arena Fade', note: 'Colour fades in from the hem',
    jersey: { collar: 'vneck', sleeve: { style: 'outlined', offset: 30 },
      pattern: { type: 'fade', size: 1, pos: 0, opacity: 1, area: 'all' } },
    pants: { stripe: 'twin' }, socks: { style: 'outlined' },
    colors: { pattern: 'p2', stripe1: 'p1', stripe2: 'p2', collar: 'p2', cuffs: 'p2' },
  },
  {
    id: 'honeycomb', name: 'Honeycomb', note: 'Subtle hex texture all over',
    jersey: { collar: 'laceup', hem: { style: 'double', offset: 30 }, sleeve: { style: 'double', offset: 24 },
      pattern: { type: 'hex', size: 1, pos: 0, opacity: 0.3, area: 'all' } },
    pants: { stripe: 'twin' }, socks: { style: 'match' },
    colors: { pattern: 'p2', stripe1: 'p1', stripe2: 'p2' },
  },
  {
    id: 'camo', name: 'Camo Night', note: 'Fixed olive camo with team trim',
    jersey: { collar: 'crew', hem: { style: 'single', offset: 28 }, sleeve: { style: 'single', offset: 28 },
      pattern: { type: 'camo', size: 1, pos: 0, opacity: 1, area: 'all' } },
    pants: { stripe: 'none' }, socks: { style: 'match' },
    colors: { body: '#56623B', sleeves: '#56623B', pattern: '#2E3820', stripe1: 'p1', stripe2: 'p0',
      collar: '#2E3820', cuffs: '#2E3820', socks: '#56623B', sockStripe1: 'p1', sockStripe2: 'p0' },
  },
  {
    id: 'hoops', name: 'Hoops', note: 'Horizontal bands around the body',
    jersey: { collar: 'laceup', sleeve: { style: 'classic3', offset: 24 },
      pattern: { type: 'hoops', size: 1, pos: 0, opacity: 1, area: 'body' } },
    pants: { stripe: 'single' }, socks: { style: 'double' },
    colors: { pattern: 'p1', stripe1: 'p1', stripe2: 'p2', collar: 'p1' },
  },
  {
    id: 'pinstripe', name: 'Pinstripe', note: 'Fine vertical pinstripes',
    jersey: { collar: 'crew', hem: { style: 'single', offset: 30 }, sleeve: { style: 'single', offset: 28 },
      pattern: { type: 'pinstripe', size: 1, pos: 0, opacity: 0.4, area: 'all' } },
    pants: { stripe: 'single' }, socks: { style: 'match' },
    colors: { pattern: 'p1', stripe1: 'p1', collar: 'p1' },
  },
  {
    id: 'panels', name: 'Side Panels', note: 'Curved yoke and side panels',
    jersey: { collar: 'vneck', yoke: 'curved', yokeDepth: 100, yokeTrim: 0, sleeve: { style: 'tricolor', offset: 26 },
      pattern: { type: 'sidepanels', size: 1, pos: 0, opacity: 1, area: 'body' } },
    pants: { stripe: 'outlined' }, socks: { style: 'tricolor' },
    colors: { yoke: 'p2', pattern: 'p2', stripe1: 'p1', stripe2: 'p2', collar: 'p2' },
  },
  {
    id: 'speed', name: 'Speedline', note: 'Lines that thicken toward the hem',
    jersey: { collar: 'vneck', sleeve: { style: 'single', offset: 30 },
      pattern: { type: 'speed', size: 1, pos: 0, opacity: 1, area: 'body' } },
    pants: { stripe: 'twin' }, socks: { style: 'stepped' },
    colors: { pattern: 'p2', stripe1: 'p2', stripe2: 'p1', collar: 'p2' },
  },
];

/* The example team the builder opens with. Change it to your own team. */
UB.SAMPLE = {
  team: { name: 'Harbour Storm', palette: UB.SCHEMES[0].colors.slice() },
  player: { name: 'Lindqvist', number: '27', captain: 'C' },
  lettering: { numberFont: 'graduate', nameFont: 'graduate', outlines: 2, nameArch: true, sleeveNumbers: true, helmetNumber: true, pantsCrest: true, stick: true },
  crest: { style: 'roundel', initials: 'HS', wordmark: 'Storm', image: null, scale: 1, patch: 'mini', patchImage: null },
  kits: {
    home:  { template: 'original', swap: false },
    away:  { template: 'original', swap: true },
    third: { template: 'panels', swap: false,
      colors: { body: 'p4', sleeves: 'p4', yoke: 'p0', pattern: 'p0', stripe1: 'p1', stripe2: 'p0', collar: 'p0',
        numberOutline: 'p0', socks: 'p4', sockStripe1: 'p1', sockStripe2: 'p0' } },
  },
};
UB.KIT_NAMES = { home: 'Home', away: 'Away', third: 'Third' };
