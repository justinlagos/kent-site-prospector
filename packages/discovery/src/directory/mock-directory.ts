import {
  BusinessDirectoryAdapter,
  DirectorySearchQuery,
  DiscoveredBusiness,
} from "@ksp/shared";

/**
 * Deterministic mock directory. Generates a stable, plausible set of fictional businesses
 * per (town, category) so the pipeline can run end-to-end without credentials.
 * All data is fictional; websites point at reserved example domains.
 */

function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

const FIRST_WORDS = ["Oakwood", "Riverside", "Kentish", "Harbour", "Priory", "Castle", "Meadow", "Orchard", "Weald", "Regency"];

export class MockDirectoryAdapter implements BusinessDirectoryAdapter {
  readonly source = "mock-directory";

  async search(query: DirectorySearchQuery): Promise<DiscoveredBusiness[]> {
    const rand = seededRandom(`${query.town}:${query.categoryLabel}`);
    const count = 8 + Math.floor(rand() * 4); // 8-11 businesses
    const results: DiscoveredBusiness[] = [];

    // Deterministic cycles guarantee unique names and a realistic quality mix in every
    // territory: weak sites, average sites, strong sites and no-website businesses.
    const QUALITY_CYCLE = ["weak", "average", "weak", "strong", "none", "weak", "average", "weak", "strong", "average", "weak"] as const;
    const SUFFIX_CYCLE = [" Ltd", " Limited", " Ltd", "", " Ltd", " Limited", " Ltd", " Ltd", "", " Limited", " Ltd"];

    for (let i = 0; i < count && i < query.maxResults; i++) {
      const word = FIRST_WORDS[i % FIRST_WORDS.length] ?? "Oakwood";
      const suffix = SUFFIX_CYCLE[i % SUFFIX_CYCLE.length] ?? "";
      const name = `${word} ${query.categoryLabel.replace(/s$/, "")}${suffix}`;
      const slugBase = `${word}-${query.categoryLabel}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const qualityMarker = QUALITY_CYCLE[i % QUALITY_CYCLE.length] ?? "weak";
      const hasWebsite = qualityMarker !== "none";
      const inward = `${1 + Math.floor(rand() * 9)}${"ABDEFGHJLN"[Math.floor(rand() * 10)]}${"ABDEFGHJLN"[Math.floor(rand() * 10)]}`;

      results.push({
        providerPlaceId: `mock-${slugBase}-${i}`,
        name,
        address: `${10 + Math.floor(rand() * 180)} High Street, ${query.town}`,
        postcode: `${query.outwardPostcode} ${inward}`,
        town: query.town,
        phone: `01${Math.floor(600 + rand() * 300)} ${Math.floor(100000 + rand() * 890000)}`,
        email: rand() > 0.3 ? `info@${slugBase}-${i}.example.com` : undefined,
        website: hasWebsite ? `https://www.${slugBase}-${i}.example.com/?mockquality=${qualityMarker}` : undefined,
        googleProfileUrl: `https://maps.example.com/place/mock-${slugBase}-${i}`,
        reviewCount: Math.floor(rand() * 220),
        reviewRating: Math.round((3 + rand() * 2) * 10) / 10,
        openingHours: { Monday: "9:00-17:30", Tuesday: "9:00-17:30", Wednesday: "9:00-17:30", Thursday: "9:00-17:30", Friday: "9:00-17:00" },
        businessStatus: rand() > 0.05 ? "OPERATIONAL" : "CLOSED_PERMANENTLY",
        sourceUrl: `https://maps.example.com/place/mock-${slugBase}-${i}`,
        confidence: "HIGH",
      });
    }
    return results;
  }
}
