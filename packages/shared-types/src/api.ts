/**
 * Directory API (apps/directory-api) public response shapes.
 *
 * These intentionally do NOT mirror the DB row shape (see endpoints.ts /
 * providers.ts for that) — they mirror what
 * apps/directory-api/src/services/publicProjections.ts and searchService.ts
 * actually return today: camelCase, nested `{ endpoint, provider }`, with
 * internal/financial columns stripped. The Session 4 prompt's draft of this
 * file assumed a flat snake_case shape closer to the raw DB row
 * (`data_category`, `institution_name`, a merged single object, `total`
 * instead of `totalCount`) — that shape was never implemented and does not
 * match the real, tested API contract, so it is not reproduced here. Flagged
 * in the Session 4 report rather than silently "fixed" by changing a live
 * (tested) API contract to match an unverified draft.
 */
import type { CulturalSensitivity, DataCategory, HealthStatus, UpdateFrequency } from "./endpoints.js";
import type { InstitutionType, TrustTier } from "./providers.js";

export interface PublicProvider {
  id: string;
  institutionName: string;
  institutionType: InstitutionType;
  country: string;
  verifiedDomain: string | null;
  walletAddress: string | null;
  trustTier: TrustTier;
  verifiedGovernment: boolean;
  liveSince: string | null;
  totalQueriesServed: number;
}

export interface PublicEndpoint {
  id: string;
  providerId: string;
  dataCategory: DataCategory;
  dataSubCategory: string | null;
  title: string;
  description: string;
  geography: { countries: string[] | null; region: string | null };
  timePeriod: { start: number | null; end: number | null };
  updateFrequency: UpdateFrequency | null;
  spatialResolution: string | null;
  dataFormat: string | null;
  languages: string[] | null;
  pricingTiers: unknown;
  maxTierAtBronze: number;
  sampleResponse: unknown;
  queryParameters: unknown;
  rateLimit: string | null;
  responseTimeSla: string | null;
  sovereignty: {
    indigenousDataFlag: boolean;
    culturalSensitivity: CulturalSensitivity;
    permittedUseCases: string[] | null;
    attributionRequired: boolean;
    attributionFormat: string | null;
    commercialLicenceRequired: boolean;
    donorConditions: string | null;
  };
  competitionTag: string | null;
  skillsFileUrl: string | null;
  healthStatus: HealthStatus;
  totalQueries: number;
  isActive: boolean;
  pausedReason: string | null;
  endpointUrl: string | null;
  integrityUrl: string | null;
}

export interface DirectorySearchResultItem {
  endpoint: PublicEndpoint;
  provider: PublicProvider;
}

export interface DirectorySearchResult {
  results: DirectorySearchResultItem[];
  page: number;
  limit: number;
  totalCount: number;
}

export interface PublicProviderProfile {
  provider: PublicProvider;
  endpoints: PublicEndpoint[];
}

/** The actual shape apps/directory-api/src/middleware/errorHandler.ts sends —
 * two fields, not three. No `code` or `timestamp` field exists today. */
export interface ApiError {
  error: string;
  message: string;
}

/**
 * Session 17 (Decision 49) — internal, service-to-service directory-api
 * routes only. Never registered with PdcPaymentGate, never public. Callers
 * authenticate with the shared INTERNAL_API_KEY header (see
 * apps/directory-api/src/middleware/internalAuth.ts).
 */
import type { IntegrityCheckStatus, IntegrityCheckTrigger } from "./endpoints.js";

export interface CertifiedHashResponse {
  dataset_content_hash: string | null;
}

export interface IntegrityEventRequest {
  endpoint_id: string;
  check_trigger: IntegrityCheckTrigger;
  status: IntegrityCheckStatus;
  expected_hash: string | null;
  actual_hash: string | null;
  agent_id: string | null;
  transaction_blocked: boolean;
}

export interface IntegrityEventResponse {
  event_id: string;
  integrity_fail_count: number;
  integrity_flagged: boolean;
}
