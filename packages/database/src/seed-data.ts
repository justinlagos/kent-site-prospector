/** Kent territory + category seed data. Editable in the dashboard after seeding. */

export interface TerritorySeed {
  localAuthority: string;
  town: string;
  district?: string;
  outwardPostcode: string;
  priority: number;
}

export const KENT_TERRITORIES: TerritorySeed[] = [
  { localAuthority: "Maidstone", town: "Maidstone", outwardPostcode: "ME14", priority: 10 },
  { localAuthority: "Maidstone", town: "Maidstone", outwardPostcode: "ME15", priority: 20 },
  { localAuthority: "Maidstone", town: "Maidstone", outwardPostcode: "ME16", priority: 30 },
  { localAuthority: "Ashford", town: "Ashford", outwardPostcode: "TN23", priority: 10 },
  { localAuthority: "Ashford", town: "Ashford", outwardPostcode: "TN24", priority: 20 },
  { localAuthority: "Ashford", town: "Tenterden", outwardPostcode: "TN30", priority: 40 },
  { localAuthority: "Canterbury", town: "Canterbury", outwardPostcode: "CT1", priority: 10 },
  { localAuthority: "Canterbury", town: "Canterbury", outwardPostcode: "CT2", priority: 20 },
  { localAuthority: "Canterbury", town: "Whitstable", outwardPostcode: "CT5", priority: 30 },
  { localAuthority: "Canterbury", town: "Herne Bay", outwardPostcode: "CT6", priority: 40 },
  { localAuthority: "Dartford", town: "Dartford", outwardPostcode: "DA1", priority: 10 },
  { localAuthority: "Dover", town: "Dover", outwardPostcode: "CT16", priority: 10 },
  { localAuthority: "Dover", town: "Dover", outwardPostcode: "CT17", priority: 20 },
  { localAuthority: "Dover", town: "Deal", outwardPostcode: "CT14", priority: 30 },
  { localAuthority: "Folkestone & Hythe", town: "Folkestone", outwardPostcode: "CT19", priority: 10 },
  { localAuthority: "Folkestone & Hythe", town: "Folkestone", outwardPostcode: "CT20", priority: 20 },
  { localAuthority: "Folkestone & Hythe", town: "Hythe", outwardPostcode: "CT21", priority: 30 },
  { localAuthority: "Gravesham", town: "Gravesend", outwardPostcode: "DA11", priority: 10 },
  { localAuthority: "Gravesham", town: "Gravesend", outwardPostcode: "DA12", priority: 20 },
  { localAuthority: "Sevenoaks", town: "Sevenoaks", outwardPostcode: "TN13", priority: 10 },
  { localAuthority: "Sevenoaks", town: "Swanley", outwardPostcode: "BR8", priority: 30 },
  { localAuthority: "Sevenoaks", town: "Edenbridge", outwardPostcode: "TN8", priority: 40 },
  { localAuthority: "Tonbridge & Malling", town: "Tonbridge", outwardPostcode: "TN9", priority: 10 },
  { localAuthority: "Tonbridge & Malling", town: "West Malling", outwardPostcode: "ME19", priority: 30 },
  { localAuthority: "Tonbridge & Malling", town: "Aylesford", outwardPostcode: "ME20", priority: 40 },
  { localAuthority: "Tunbridge Wells", town: "Tunbridge Wells", outwardPostcode: "TN1", priority: 10 },
  { localAuthority: "Tunbridge Wells", town: "Tunbridge Wells", outwardPostcode: "TN2", priority: 20 },
  { localAuthority: "Tunbridge Wells", town: "Tunbridge Wells", outwardPostcode: "TN4", priority: 30 },
  { localAuthority: "Medway", town: "Chatham", outwardPostcode: "ME4", priority: 10 },
  { localAuthority: "Medway", town: "Chatham", outwardPostcode: "ME5", priority: 20 },
  { localAuthority: "Medway", town: "Rochester", outwardPostcode: "ME1", priority: 10 },
  { localAuthority: "Medway", town: "Rochester", outwardPostcode: "ME2", priority: 30 },
  { localAuthority: "Medway", town: "Gillingham", outwardPostcode: "ME7", priority: 20 },
  { localAuthority: "Medway", town: "Gillingham", outwardPostcode: "ME8", priority: 40 },
  { localAuthority: "Swale", town: "Sittingbourne", outwardPostcode: "ME10", priority: 10 },
  { localAuthority: "Swale", town: "Faversham", outwardPostcode: "ME13", priority: 20 },
  { localAuthority: "Thanet", town: "Margate", outwardPostcode: "CT9", priority: 10 },
  { localAuthority: "Thanet", town: "Ramsgate", outwardPostcode: "CT11", priority: 20 },
  { localAuthority: "Thanet", town: "Broadstairs", outwardPostcode: "CT10", priority: 30 },
];

export interface CategorySeed {
  key: string;
  label: string;
  providerTypes: string[];
  strategyKey: string;
  priority: number;
}

export const BUSINESS_CATEGORIES: CategorySeed[] = [
  { key: "dentists", label: "Dentists", providerTypes: ["dentist", "dental_clinic"], strategyKey: "dental-clinic", priority: 10 },
  { key: "private-clinics", label: "Private clinics", providerTypes: ["doctor", "medical_lab", "wellness_center"], strategyKey: "medical-clinic", priority: 20 },
  { key: "physiotherapists", label: "Physiotherapists", providerTypes: ["physiotherapist"], strategyKey: "medical-clinic", priority: 20 },
  { key: "chiropractors", label: "Chiropractors", providerTypes: ["chiropractor"], strategyKey: "medical-clinic", priority: 30 },
  { key: "beauty-clinics", label: "Beauty clinics", providerTypes: ["beauty_salon", "spa"], strategyKey: "beauty", priority: 10 },
  { key: "hair-salons", label: "Hair salons", providerTypes: ["hair_salon"], strategyKey: "beauty", priority: 20 },
  { key: "barbers", label: "Barbers", providerTypes: ["barber_shop"], strategyKey: "beauty", priority: 30 },
  { key: "restaurants", label: "Restaurants", providerTypes: ["restaurant"], strategyKey: "restaurant", priority: 10 },
  { key: "cafes", label: "Cafés", providerTypes: ["cafe", "coffee_shop"], strategyKey: "cafe", priority: 20 },
  { key: "caterers", label: "Caterers", providerTypes: ["catering_service"], strategyKey: "catering", priority: 30 },
  { key: "estate-agents", label: "Estate agents", providerTypes: ["real_estate_agency"], strategyKey: "estate-agency", priority: 10 },
  { key: "mortgage-brokers", label: "Mortgage brokers", providerTypes: ["mortgage_broker", "finance"], strategyKey: "financial-services", priority: 20 },
  { key: "accountants", label: "Accountants", providerTypes: ["accounting"], strategyKey: "professional-services", priority: 10 },
  { key: "solicitors", label: "Solicitors", providerTypes: ["lawyer"], strategyKey: "legal-services", priority: 20 },
  { key: "driving-schools", label: "Driving schools", providerTypes: ["driving_school"], strategyKey: "driving-school", priority: 30 },
  { key: "builders", label: "Builders", providerTypes: ["general_contractor"], strategyKey: "trades", priority: 10 },
  { key: "electricians", label: "Electricians", providerTypes: ["electrician"], strategyKey: "trades", priority: 10 },
  { key: "plumbers", label: "Plumbers", providerTypes: ["plumber"], strategyKey: "trades", priority: 10 },
  { key: "roofers", label: "Roofers", providerTypes: ["roofing_contractor"], strategyKey: "trades", priority: 20 },
  { key: "landscapers", label: "Landscapers", providerTypes: ["landscaper"], strategyKey: "landscaping", priority: 20 },
  { key: "cleaning-companies", label: "Cleaning companies", providerTypes: ["cleaning_service", "house_cleaning_service"], strategyKey: "cleaning", priority: 30 },
  { key: "car-garages", label: "Car garages", providerTypes: ["car_repair"], strategyKey: "automotive", priority: 10 },
  { key: "tyre-centres", label: "Tyre centres", providerTypes: ["tire_shop"], strategyKey: "automotive", priority: 30 },
  { key: "vehicle-detailing", label: "Vehicle detailing", providerTypes: ["car_wash", "car_detailing_service"], strategyKey: "automotive", priority: 40 },
  { key: "nurseries", label: "Nurseries", providerTypes: ["child_care_agency", "preschool"], strategyKey: "childcare", priority: 20 },
  { key: "tutors", label: "Tutors", providerTypes: ["tutoring_service"], strategyKey: "education", priority: 30 },
  { key: "training-companies", label: "Training companies", providerTypes: ["training_center"], strategyKey: "education", priority: 40 },
  { key: "wedding-suppliers", label: "Wedding suppliers", providerTypes: ["wedding_venue", "florist"], strategyKey: "weddings-events", priority: 30 },
  { key: "photographers", label: "Photographers", providerTypes: ["photographer", "photography_studio"], strategyKey: "creative-services", priority: 30 },
  { key: "event-venues", label: "Event venues", providerTypes: ["event_venue", "banquet_hall"], strategyKey: "weddings-events", priority: 30 },
  { key: "gyms", label: "Gyms", providerTypes: ["gym", "fitness_center"], strategyKey: "fitness", priority: 20 },
  { key: "personal-trainers", label: "Personal trainers", providerTypes: ["personal_trainer"], strategyKey: "fitness", priority: 30 },
  { key: "care-providers", label: "Care providers", providerTypes: ["home_health_care_service"], strategyKey: "care-services", priority: 20 },
  { key: "removal-companies", label: "Removal companies", providerTypes: ["moving_company"], strategyKey: "removals", priority: 30 },
  { key: "independent-retailers", label: "Independent retailers", providerTypes: ["store"], strategyKey: "retail", priority: 40 },
];

/**
 * Rotation queue seeding. The first five pairings mirror the operating plan
 * (Maidstone+dentists, Canterbury+restaurants, Dartford+trades, Tunbridge Wells+beauty,
 * Medway+professional services); after that, territories and category groups interleave
 * with a coprime stride so no town or industry dominates consecutive days.
 */
export interface RotationSeedPair {
  townPostcode: [string, string]; // [town, outwardPostcode]
  categoryKey: string;
}

export const ROTATION_HEAD: RotationSeedPair[] = [
  { townPostcode: ["Maidstone", "ME14"], categoryKey: "dentists" },
  { townPostcode: ["Canterbury", "CT1"], categoryKey: "restaurants" },
  { townPostcode: ["Dartford", "DA1"], categoryKey: "builders" },
  { townPostcode: ["Tunbridge Wells", "TN1"], categoryKey: "beauty-clinics" },
  { townPostcode: ["Chatham", "ME4"], categoryKey: "accountants" },
];

export const DEFAULT_SETTINGS: Record<string, unknown> = {
  dailyFirstContactLimit: 2,
  sendDays: [1, 2, 3, 4, 5],
  sendWindowStartHour: 10,
  sendWindowEndHour: 15,
  minProspectScore: 60,
  minOpportunityScore: 50,
  previewExpiryDays: 30,
  followUpsEnabled: false,
  followUpMaxCount: 1,
  followUpDelayWorkingDays: 6,
  emailKillSwitch: false,
  openTrackingEnabled: false,
  openTrackingPurpose: null,
  qaMinAccessibilityScore: 90,
  qaMinLighthousePerformance: 85,
  chainBusinessesEnabled: false,
  publicBodiesEnabled: false,
  competitorMinDistanceSameDayMeters: 800,
  retentionRejectedDays: 90,
  notificationEmail: null,
};
