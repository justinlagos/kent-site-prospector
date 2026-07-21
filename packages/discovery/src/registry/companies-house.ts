import {
  CompanyMatch,
  CompanyRegistryAdapter,
  FatalError,
  LegalForm,
  RetryableError,
  withRetry,
  normaliseName,
  type Logger,
} from "@ksp/shared";

/** Companies House public search API (basic-auth API key, Open Government Licence). */

const BASE = "https://api.company-information.service.gov.uk";

const TYPE_TO_LEGAL_FORM: Record<string, LegalForm> = {
  ltd: "LTD",
  "private-limited-guarant-nsc": "LTD",
  "private-limited-guarant-nsc-limited-exemption": "LTD",
  "private-limited-shares-section-30-exemption": "LTD",
  plc: "PLC",
  llp: "LLP",
  "charitable-incorporated-organisation": "CHARITY",
  "registered-society-non-jurisdictional": "CHARITY",
  "industrial-and-provident-society": "CHARITY",
  "scottish-partnership": "PARTNERSHIP",
  "limited-partnership": "PARTNERSHIP",
};

interface ChSearchResponse {
  items?: Array<{
    company_number: string;
    title: string;
    company_type: string;
    company_status: string;
    address_snippet?: string;
    address?: { postal_code?: string };
  }>;
}

export class CompaniesHouseAdapter implements CompanyRegistryAdapter {
  readonly source = "companies-house";

  constructor(
    private readonly apiKey: string,
    private readonly logger: Logger,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async findCompany(name: string, postcode?: string): Promise<CompanyMatch | null> {
    const url = `${BASE}/search/companies?q=${encodeURIComponent(name)}&items_per_page=10`;
    const data = await withRetry(async () => {
      const res = await this.fetchImpl(url, {
        headers: { Authorization: `Basic ${Buffer.from(`${this.apiKey}:`).toString("base64")}` },
      });
      if (res.status === 429 || res.status >= 500) {
        throw new RetryableError("CH_TRANSIENT", `Companies House ${res.status}`);
      }
      if (!res.ok) {
        throw new FatalError("CH_ERROR", `Companies House ${res.status}: ${await res.text()}`);
      }
      return (await res.json()) as ChSearchResponse;
    });

    const target = normaliseName(name);
    const outward = postcode?.split(" ")[0]?.toUpperCase();

    let best: { item: NonNullable<ChSearchResponse["items"]>[number]; score: number } | null = null;
    for (const item of data.items ?? []) {
      if (item.company_status !== "active") continue;
      const candidate = normaliseName(item.title);
      let score = 0;
      if (candidate === target) score += 3;
      else if (candidate.includes(target) || target.includes(candidate)) score += 2;
      else {
        const overlap = candidate.split(" ").filter((w) => target.split(" ").includes(w)).length;
        if (overlap >= 2) score += 1;
        else continue;
      }
      const itemOutward = (item.address?.postal_code ?? item.address_snippet ?? "")
        .toUpperCase()
        .split(" ")[0];
      if (outward && itemOutward && itemOutward.startsWith(outward.slice(0, 2))) score += 1;
      if (!best || score > best.score) best = { item, score };
    }

    if (!best) {
      this.logger.info("companies house: no confident match", { name });
      return null;
    }

    const legalForm = TYPE_TO_LEGAL_FORM[best.item.company_type] ?? "UNKNOWN";
    return {
      companyNumber: best.item.company_number,
      legalName: best.item.title,
      legalForm,
      companyStatus: "active",
      registeredAddress: best.item.address_snippet,
      matchConfidence: best.score >= 4 ? "HIGH" : best.score >= 3 ? "MEDIUM" : "LOW",
      sourceUrl: `https://find-and-update.company-information.service.gov.uk/company/${best.item.company_number}`,
    };
  }
}

/**
 * Deterministic mock registry. Names containing "Ltd"/"Limited" resolve to active LTDs;
 * names containing "LLP" to LLPs; a marker word "soletrader" yields no incorporation;
 * everything else returns null (=> UNKNOWN legal form downstream).
 */
export class MockRegistryAdapter implements CompanyRegistryAdapter {
  readonly source = "mock-registry";

  async findCompany(name: string, _postcode?: string): Promise<CompanyMatch | null> {
    const lower = name.toLowerCase();
    if (lower.includes("soletrader")) return null;
    if (/\bllp\b/.test(lower)) {
      return {
        companyNumber: `OC${String(Math.abs(hash(name)) % 900000 + 100000)}`,
        legalName: name.toUpperCase(),
        legalForm: "LLP",
        companyStatus: "active",
        registeredAddress: "Registered Office, Kent",
        matchConfidence: "HIGH",
        sourceUrl: "https://find-and-update.company-information.service.gov.uk/company/mock",
      };
    }
    if (/\b(ltd|limited)\b/.test(lower)) {
      return {
        companyNumber: String(Math.abs(hash(name)) % 90000000 + 10000000),
        legalName: name.toUpperCase(),
        legalForm: "LTD",
        companyStatus: "active",
        registeredAddress: "Registered Office, Kent",
        matchConfidence: "HIGH",
        sourceUrl: "https://find-and-update.company-information.service.gov.uk/company/mock",
      };
    }
    return null;
  }
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h;
}
