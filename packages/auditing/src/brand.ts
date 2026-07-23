import type { BrandProfile } from "./types.js";

/**
 * Raw brand signals read from the business's live homepage (computed styles + logo src).
 * Kept as plain strings so the DOM-reading step stays a single self-contained page.evaluate;
 * all interpretation happens here in `deriveBrandProfile`, which is pure and unit-tested.
 */
export interface BrandRaw {
  headerBg?: string;
  buttonBg?: string;
  linkColor?: string;
  bodyBg?: string;
  bodyText?: string;
  headingFont?: string;
  bodyFont?: string;
  logoSrc?: string;
}

const GENERIC_FONTS = new Set([
  "serif", "sans-serif", "monospace", "system-ui", "-apple-system", "cursive", "fantasy",
  "ui-serif", "ui-sans-serif", "ui-monospace", "inherit", "initial", "blinkmacsystemfont",
]);

/** Parse rgb()/rgba()/#hex into [r,g,b] or null (transparent / unparseable → null). */
export function parseColour(input?: string): [number, number, number] | null {
  if (!input) return null;
  const s = input.trim().toLowerCase();
  const rgba = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/.exec(s);
  if (rgba) {
    const a = rgba[4] === undefined ? 1 : Number(rgba[4]);
    if (a === 0) return null;
    return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])];
  }
  const hex6 = /^#?([0-9a-f]{6})$/.exec(s);
  if (hex6) {
    const h = hex6[1]!;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const hex3 = /^#?([0-9a-f]{3})$/.exec(s);
  if (hex3) {
    const h = hex3[1]!;
    return [parseInt(h[0]! + h[0]!, 16), parseInt(h[1]! + h[1]!, 16), parseInt(h[2]! + h[2]!, 16)];
  }
  return null;
}

const toHex = ([r, g, b]: [number, number, number]): string =>
  `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;

function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return [h, s, l];
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

const lightnessOf = (c: [number, number, number]) => rgbToHsl(c)[2];
const satOf = (c: [number, number, number]) => rgbToHsl(c)[1];
/** A usable brand colour: not near-white, not near-black, and not fully grey. */
function isUsable(c: [number, number, number] | null): c is [number, number, number] {
  if (!c) return false;
  const l = lightnessOf(c);
  return l > 0.08 && l < 0.9 && satOf(c) > 0.12;
}

function firstFontFamily(raw?: string): string | undefined {
  if (!raw) return undefined;
  const first = raw.split(",")[0]?.trim().replace(/^["']|["']$/g, "");
  if (!first) return undefined;
  if (GENERIC_FONTS.has(first.toLowerCase())) return undefined;
  // Return the named font with safe fallbacks so the concept never renders a missing font.
  return `"${first}", system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
}

function resolveUrl(src?: string, baseUrl?: string): string | undefined {
  if (!src) return undefined;
  const s = src.trim();
  if (!s || s.startsWith("data:")) return undefined;
  try {
    return new URL(s, baseUrl).href;
  } catch {
    return undefined;
  }
}

/**
 * Turn raw homepage signals into a BrandProfile the renderer can use directly. Colours are
 * only emitted when a usable primary is found; otherwise the field is omitted and the
 * renderer falls back to its per-business hue-shifted sector palette. Never throws.
 */
export function deriveBrandProfile(raw: BrandRaw, baseUrl?: string): BrandProfile {
  const profile: BrandProfile = {};

  const candidates = [raw.buttonBg, raw.linkColor, raw.headerBg].map((c) => parseColour(c));
  const primary = candidates.find(isUsable) ?? null;

  if (primary) {
    const [h, s, l] = rgbToHsl(primary);
    // dark: the site header if it's genuinely dark, else a darker shade of the primary.
    const headerC = parseColour(raw.headerBg);
    const dark = headerC && lightnessOf(headerC) < 0.35 ? headerC : hslToRgb(h, Math.min(1, s + 0.05), Math.max(0.12, l - 0.28));
    // accent: the link colour if it's a distinct usable colour, else a hue-shifted primary.
    const linkC = parseColour(raw.linkColor);
    const accent = linkC && isUsable(linkC) && Math.abs(rgbToHsl(linkC)[0] - h) > 20 ? linkC : hslToRgb(h + 32, Math.min(1, s + 0.1), Math.min(0.62, l + 0.08));
    const light = hslToRgb(h, Math.min(0.5, s), 0.96);
    profile.colours = { primary: toHex(primary), accent: toHex(accent), dark: toHex(dark), light: toHex(light) };
  }

  const heading = firstFontFamily(raw.headingFont);
  const body = firstFontFamily(raw.bodyFont);
  if (heading) profile.headingFont = heading;
  if (body) profile.bodyFont = body;

  const logo = resolveUrl(raw.logoSrc, baseUrl);
  if (logo) profile.logoUrl = logo;

  return profile;
}
