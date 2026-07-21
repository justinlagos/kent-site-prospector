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
const LTD_SUFFIXES = [" Ltd", " Limited", "", "", ""];

export class MockDirectoryAdapter implements BusinessDirectoryAdapter {
  readonly source = "mock-directory";

  async search(query: DirectorySearchQuery): Promise<DiscoveredBusiness[]> {
    const rand = seededRandom(`${query.town}:${query.categoryLabel}`);
    const count = 6 + Math.floor(rand() * 6); // 6-11 businesses
    const results: DiscoveredBusiness[] = [];

    for (let i = 0; i < count && i < query.maxResults; i++) {
      const word = FIRST_WORDS[Math.floor(rand() * FIRST_WORDS.length)] ?? "Oakwood";
      const suffix = LTD_SUFFIXES[Math.floor(rand() * LTD_SUFFIXES.length)] ?? "";
      const name = `${word} ${query.categoryLabel.replace(/s$/, "")}${suffix}`;
      const slugBase = `${word}-${query.categoryLabel}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const hasWebsite = rand() > 0.25;
      const websiteQuality = rand(); // used by mock auditor via URL marker
      const qualityMarker = websiteQuality < 0.5 ? "weak" : websiteQuality < 0.8 ? "average" : "strong";
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
