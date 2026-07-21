import {
  BusinessDirectoryAdapter,
  DirectorySearchQuery,
  DiscoveredBusiness,
  FatalError,
  RetryableError,
  withRetry,
  type Logger,
} from "@ksp/shared";

/**
 * Google Places API (New) adapter — places:searchText.
 * Licensed API usage only; no scraping. Field mask limited to what the data model stores.
 */

const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.postalAddress",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.googleMapsUri",
  "places.rating",
  "places.userRatingCount",
  "places.businessStatus",
  "places.regularOpeningHours",
  "places.primaryTypeDisplayName",
].join(",");

interface PlacesTextResponse {
  places?: Array<{
    id: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    postalAddress?: { postalCode?: string; locality?: string };
    nationalPhoneNumber?: string;
    websiteUri?: string;
    googleMapsUri?: string;
    rating?: number;
    userRatingCount?: number;
    businessStatus?: string;
    regularOpeningHours?: { weekdayDescriptions?: string[] };
  }>;
}

export class GooglePlacesAdapter implements BusinessDirectoryAdapter {
  readonly source = "google-places";

  constructor(
    private readonly apiKey: string,
    private readonly logger: Logger,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async search(query: DirectorySearchQuery): Promise<DiscoveredBusiness[]> {
    const textQuery = `${query.categoryLabel} in ${query.town} ${query.outwardPostcode}, Kent, UK`;
    const body = {
      textQuery,
      includedType: query.providerTypes[0],
      maxResultCount: Math.min(query.maxResults, 20),
      regionCode: "GB",
    };

    const data = await withRetry(async () => {
      const res = await this.fetchImpl(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.apiKey,
          "X-Goog-FieldMask": FIELD_MASK,
        },
        body: JSON.stringify(body),
      });
      if (res.status === 429 || res.status >= 500) {
        throw new RetryableError("PLACES_TRANSIENT", `Places API ${res.status}`);
      }
      if (!res.ok) {
        throw new FatalError("PLACES_ERROR", `Places API ${res.status}: ${await res.text()}`);
      }
      return (await res.json()) as PlacesTextResponse;
    });

    const results: DiscoveredBusiness[] = [];
    for (const place of data.places ?? []) {
      const name = place.displayName?.text;
      const address = place.formattedAddress;
      if (!name || !address) continue;
      const postcode =
        place.postalAddress?.postalCode ??
        /([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})/i.exec(address)?.[1] ??
        "";
      if (!postcode) continue; // cannot territorise without a postcode

      const statusMap: Record<string, DiscoveredBusiness["businessStatus"]> = {
        OPERATIONAL: "OPERATIONAL",
        CLOSED_TEMPORARILY: "CLOSED_TEMPORARILY",
        CLOSED_PERMANENTLY: "CLOSED_PERMANENTLY",
      };

      results.push({
        providerPlaceId: place.id,
        name,
        address,
        postcode: postcode.toUpperCase(),
        town: place.postalAddress?.locality ?? query.town,
        phone: place.nationalPhoneNumber,
        website: place.websiteUri,
        googleProfileUrl: place.googleMapsUri,
        reviewCount: place.userRatingCount,
        reviewRating: place.rating,
        openingHours: place.regularOpeningHours?.weekdayDescriptions
          ? Object.fromEntries(
              place.regularOpeningHours.weekdayDescriptions.map((d) => {
                const [day, ...rest] = d.split(": ");
                return [day ?? d, rest.join(": ")];
              }),
            )
          : undefined,
        businessStatus: statusMap[place.businessStatus ?? ""] ?? "UNKNOWN",
        sourceUrl: place.googleMapsUri,
        confidence: "HIGH",
      });
    }

    this.logger.info("places search complete", {
      textQuery,
      returned: results.length,
    });
    return results;
  }
}
