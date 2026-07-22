import {
  FatalError,
  GeneratedImage,
  ImageGenAdapter,
  ImageGenRequest,
  RetryableError,
  withRetry,
  type Logger,
} from "@ksp/shared";

/**
 * Concept image generation.
 *
 * Policy (mirrors the asset-rights rules): generated imagery is ILLUSTRATIVE ONLY.
 * Prompts are built exclusively by buildConceptImagePrompt(), which:
 *  - never includes the business name, address or any real-world identifier,
 *  - requests generic sector scenes with no identifiable people, no text, no logos,
 *  - varies style/seed per business so every concept looks distinct.
 * Every generated image is registered as an Asset with rightsStatus GENERATED and the
 * page carries a note that imagery is illustrative and replaced in a full build.
 */

interface SceneSpec {
  scenes: string[];
  style: string;
}

const SECTOR_SCENES: Record<string, SceneSpec> = {
  "dental-clinic": { scenes: ["bright modern dental clinic interior, empty treatment chair", "close-up of clean dental tools on a tray, shallow depth of field", "calm minimal clinic reception with plants"], style: "clean, clinical, reassuring, soft natural light" },
  "medical-clinic": { scenes: ["calm modern therapy room interior, treatment couch", "physiotherapy equipment in a bright studio", "minimal clinic reception, warm light"], style: "professional, calm, airy" },
  beauty: { scenes: ["elegant salon interior, styling chair and mirror with warm bulbs", "flat lay of premium beauty products on marble", "soft-focus salon workspace with fresh flowers"], style: "warm, luxurious, editorial" },
  restaurant: { scenes: ["beautifully plated seasonal dish on rustic table, overhead", "warm candle-lit restaurant interior, set tables", "fresh ingredients on a wooden chef's counter"], style: "appetising, warm, food-magazine quality" },
  cafe: { scenes: ["latte art coffee on wooden café table by a window", "cosy café interior with morning light", "fresh pastries on a counter display"], style: "cosy, inviting, natural light" },
  catering: { scenes: ["elegant buffet spread of canapés, event setting", "chef's hands plating fine food, close-up, no face", "beautifully set long event table"], style: "premium, celebratory" },
  "estate-agency": { scenes: ["attractive english brick house exterior with front garden, generic", "bright modern living room interior, staged", "cottage-lined village street in the english countryside, generic"], style: "aspirational, bright, editorial property photography" },
  "financial-services": { scenes: ["calm modern office desk with notebook and coffee, no screens readable", "warm consultation room with two empty chairs", "abstract architectural detail, glass and light"], style: "trustworthy, uncluttered, professional" },
  "professional-services": { scenes: ["tidy modern office workspace, notebook and pen, soft light", "abstract calm geometric architecture detail", "meeting room with empty chairs and plants"], style: "competent, calm, modern" },
  "legal-services": { scenes: ["classic study desk with fountain pen and paper, warm light", "law books on a shelf, shallow depth of field", "calm wood-panelled meeting room, empty"], style: "established, serious, warm" },
  "driving-school": { scenes: ["quiet suburban english road on a sunny day, empty", "car dashboard and steering wheel interior detail, generic vehicle", "country lane with hedgerows, driver's perspective, empty road"], style: "calm, confident, daylight" },
  trades: { scenes: ["neatly organised professional tools on a workbench", "fresh renovation interior, new plaster and natural light, empty room", "detail of quality brickwork and spirit level"], style: "capable, tidy, craftsmanship" },
  landscaping: { scenes: ["beautifully landscaped english garden with lawn and borders", "close-up of fresh planting and rich soil", "neat patio with stone paving and greenery"], style: "lush, fresh, golden-hour light" },
  cleaning: { scenes: ["sparkling clean bright kitchen interior, empty", "neat stack of fresh folded towels, minimal", "sunlit spotless living room, airy"], style: "fresh, bright, immaculate" },
  automotive: { scenes: ["clean modern vehicle workshop, generic car on a lift", "detail of alloy wheel and tyre, studio light", "mechanic's organised tool wall, no branding"], style: "capable, clean, industrial" },
  childcare: { scenes: ["bright colourful playroom with wooden toys, empty, no children", "children's art supplies neatly arranged on a table", "cosy reading corner with cushions and picture books, empty"], style: "warm, safe, playful — strictly no people" },
  education: { scenes: ["tidy study desk with open notebook and pencils", "warm reading corner with books, empty", "abstract chalkboard texture with soft light"], style: "encouraging, focused, warm" },
  "weddings-events": { scenes: ["elegant wedding table setting with flowers and candles", "romantic marquee interior with fairy lights, empty", "beautiful floral arch in a garden, no people"], style: "romantic, elegant, soft light" },
  "creative-services": { scenes: ["professional camera and lenses on a wooden desk", "studio lighting setup in an empty photography studio", "abstract bokeh light texture, artistic"], style: "artistic, contemporary" },
  fitness: { scenes: ["modern bright gym interior with equipment, empty", "kettlebells and yoga mats neatly arranged, studio light", "sunrise through large gym windows, empty space"], style: "energetic, clean, motivating — no people" },
  "care-services": { scenes: ["warm cosy living room with comfortable armchair and blanket, empty", "cup of tea and biscuits on a side table, homely", "sunlit garden bench with flowers, peaceful"], style: "gentle, dignified, homely — no people" },
  removals: { scenes: ["neatly stacked moving boxes in a bright empty room", "generic white removal van on a residential street, no branding", "new empty home interior with sunlight through windows"], style: "organised, optimistic, fresh start" },
  retail: { scenes: ["charming independent shop interior with wooden shelves, generic products", "artisan goods neatly displayed, warm light", "welcoming shop window with plants, no readable text"], style: "characterful, warm, independent" },
};

const GLOBAL_CONSTRAINTS =
  "photorealistic, professional photography, no people, no faces, no text, no words, no logos, no watermarks, no signage, generic illustrative scene not a real identifiable location";

const HUE_WORDS = ["warm golden", "cool blue-toned", "soft neutral", "rich green-tinted", "airy bright", "moody dusk"];

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 1_000_000;
}

export interface ConceptImagePlan {
  key: string; // "hero" | "service-0" | ...
  prompt: string;
  width: number;
  height: number;
  seed: number;
}

/** Build the image plan for a concept: one hero + up to three service images. */
export function buildConceptImagePlan(strategyKey: string, businessId: string, serviceCount: number): ConceptImagePlan[] {
  const spec = SECTOR_SCENES[strategyKey] ?? SECTOR_SCENES["professional-services"]!;
  const baseSeed = hashSeed(businessId);
  const hue = HUE_WORDS[baseSeed % HUE_WORDS.length]!;
  const plans: ConceptImagePlan[] = [];

  const scene = (i: number) => spec.scenes[i % spec.scenes.length]!;
  plans.push({
    key: "hero",
    prompt: `${scene(baseSeed % spec.scenes.length)}, ${spec.style}, ${hue} palette, ${GLOBAL_CONSTRAINTS}`,
    width: 1200,
    height: 700,
    seed: baseSeed,
  });
  for (let i = 0; i < Math.min(serviceCount, 3); i++) {
    plans.push({
      key: `service-${i}`,
      prompt: `${scene(baseSeed + i + 1)}, ${spec.style}, ${hue} palette, ${GLOBAL_CONSTRAINTS}`,
      width: 640,
      height: 400,
      seed: baseSeed + 17 * (i + 1),
    });
  }
  return plans;
}

/** Pollinations — free image generation, no API key. */
export class PollinationsImageAdapter implements ImageGenAdapter {
  readonly source = "pollinations";

  constructor(
    private readonly logger: Logger,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async generate(req: ImageGenRequest): Promise<GeneratedImage> {
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(req.prompt)}?width=${req.width}&height=${req.height}&seed=${req.seed}&nologo=true`;
    return withRetry(
      async () => {
        const res = await this.fetchImpl(url, { signal: AbortSignal.timeout(90_000) });
        if (res.status === 429 || res.status >= 500) {
          throw new RetryableError("IMAGE_TRANSIENT", `pollinations ${res.status}`);
        }
        if (!res.ok) throw new FatalError("IMAGE_ERROR", `pollinations ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 5000) throw new RetryableError("IMAGE_TOO_SMALL", "suspiciously small image response");
        this.logger.debug("image generated", { bytes: buf.length });
        return { data: buf, ext: "jpg", provider: this.source };
      },
      { maxAttempts: 3 },
    );
  }
}

/** Mock — deterministic styled SVG art, fully offline. */
export class MockImageGenAdapter implements ImageGenAdapter {
  readonly source = "mock-imagegen";

  async generate(req: ImageGenRequest): Promise<GeneratedImage> {
    const hue = req.seed % 360;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${req.width}" height="${req.height}" viewBox="0 0 ${req.width} ${req.height}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="hsl(${hue},45%,72%)"/><stop offset="100%" stop-color="hsl(${(hue + 40) % 360},50%,45%)"/>
</linearGradient></defs>
<rect width="${req.width}" height="${req.height}" fill="url(#g)"/>
<circle cx="${(req.seed * 7) % req.width}" cy="${(req.seed * 13) % req.height}" r="${req.height / 4}" fill="hsl(${(hue + 80) % 360},55%,60%)" opacity="0.45"/>
<circle cx="${(req.seed * 29) % req.width}" cy="${(req.seed * 5) % req.height}" r="${req.height / 6}" fill="#ffffff" opacity="0.25"/>
</svg>`;
    return { data: Buffer.from(svg), ext: "svg", provider: this.source };
  }
}
