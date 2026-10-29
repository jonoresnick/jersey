/* Colour helpers and zone colour lookup. */
(function () {
  const UB = window.UB;

  UB.hexToRgb = (hex) => {
    let h = String(hex).replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  UB.rgbToHex = (rgb) => '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

  /* amt < 0 darkens toward black, amt > 0 lightens toward white (−1 … 1). */
  UB.shade = (hex, amt) => {
    const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
    return UB.rgbToHex(UB.hexToRgb(hex).map((v) => v + (t - v) * p));
  };

  UB.luminance = (hex) => {
    const [r, g, b] = UB.hexToRgb(hex).map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  UB.contrast = (a, b) => {
    const la = UB.luminance(a), lb = UB.luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };

  UB.isHex = (v) => /^#[0-9a-f]{6}$/i.test(v);

  /* A light (away) sweater swaps Primary and Secondary in the swap zones. */
  UB.swapSlot = (kit, zone, v) => {
    if (!kit.swap || !UB.SWAP_ZONES.has(zone)) return v;
    return v === 'p0' ? 'p1' : v === 'p1' ? 'p0' : v;
  };

  /* The slot or hex a zone shows, after the light-sweater swap. */
  UB.zoneValue = (kit, zone) => UB.swapSlot(kit, zone, kit.colors[zone] ?? UB.BASE_COLORS[zone]);

  /* The final hex colour of a zone. */
  UB.color = (design, kit, zone) => {
    const v = UB.zoneValue(kit, zone);
    if (/^p\d$/.test(v)) return design.team.palette[+v[1]] || '#888888';
    return UB.isHex(v) ? v : '#888888';
  };
})();
