import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";

function humanizeKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function humanizeSlug(path: string): string {
  const segments = path.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? path;
  return humanizeKey(last);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Generic renderer (download page's fallback for every endpoint shape
 * other than samoa-entity-setup, per the build brief — "the download page
 * doesn't need to know every schema, a generic renderer that handles
 * strings, numbers, booleans, string arrays, and nested objects is
 * sufficient for competition"). Recurses on objects/arrays; never dumps
 * raw JSON.
 */
function GenericValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-gray-400">Not specified</span>;
  }
  if (typeof value === "boolean") {
    return <span>{value ? "Yes" : "No"}</span>;
  }
  if (typeof value === "number") {
    return <span>{value.toLocaleString()}</span>;
  }
  if (typeof value === "string") {
    if (/^https?:\/\//.test(value)) {
      return (
        <a href={value} target="_blank" rel="noreferrer" className="text-ocean hover:underline break-all">
          {value}
        </a>
      );
    }
    return <span className="whitespace-pre-wrap">{value}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-gray-400">None</span>;
    if (value.every((v) => typeof v === "string" || typeof v === "number")) {
      return (
        <ul className="list-disc pl-5 space-y-0.5">
          {value.map((v, i) => (
            <li key={i}>{String(v)}</li>
          ))}
        </ul>
      );
    }
    return (
      <div className="space-y-3">
        {value.map((item, i) => (
          <div key={i} className="rounded-md border border-gray-200 p-3">
            <GenericValue value={item} />
          </div>
        ))}
      </div>
    );
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return <span className="text-gray-400">—</span>;
    return (
      <dl className="space-y-2">
        {entries.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs font-medium text-gray-500">{humanizeKey(k)}</dt>
            <dd className="text-sm text-gray-800 mt-0.5">
              <GenericValue value={v} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return <span>{String(value)}</span>;
}

function GenericDataView({ data }: { data: unknown }) {
  // Top-level envelope fields common across this registry's endpoints
  // (Decision 61 — every response includes attribution/fetched_at/notices)
  // get a slightly different treatment than a plain nested object would,
  // but this still falls through to GenericValue for anything it doesn't
  // specifically recognise — this is a light touch-up on the generic
  // renderer, not a second special case to maintain.
  if (!isPlainObject(data)) {
    return <GenericValue value={data} />;
  }
  const { attribution, platform_context, fetched_at, ...rest } = data;
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <GenericValue value={rest} />
        </CardContent>
      </Card>
      {isPlainObject(attribution) && (
        <Alert variant="info" className="text-xs">
          <GenericValue value={attribution} />
        </Alert>
      )}
    </div>
  );
}

// ─── Samoa Entity Setup — special-cased per the build brief ───────────────

interface EntityRequirements {
  entity_type_label: string;
  governing_legislation: string;
  regulator: string;
  minimum_shareholders: number | null;
  minimum_directors: number | null;
  minimum_paid_up_capital_usd: number | null;
  nationality_restrictions: string;
  registered_agent_required: boolean;
  registered_office_samoa_required: boolean;
  annual_return_required: boolean;
  annual_audit_required: boolean;
  ubo_disclosure_threshold_pct: number;
  ubo_disclosure_to: string;
  ubo_disclosure_public: boolean;
  tax_treatment: string;
  formation_timeline_typical: string;
  annual_fee_usd_approx: number | null;
  formation_fee_usd_approx: number | null;
  key_restrictions: string[];
  key_benefits: string[];
  notes: string;
}

function isEntitySetupResult(data: unknown): data is {
  results: EntityRequirements[];
  aml_cfct_mandatory_notice: string;
  next_step_notice: string;
  official_documents: { title: string; url: string }[];
} {
  if (!isPlainObject(data)) return false;
  return Array.isArray(data.results) && typeof data.aml_cfct_mandatory_notice === "string";
}

function capitalUsd(amount: number | null): string {
  return amount === null ? "No statutory minimum" : `$${amount.toLocaleString()}`;
}

function EntityCard({ entity }: { entity: EntityRequirements }) {
  const fields: Array<[string, React.ReactNode]> = [
    ["Governing legislation", entity.governing_legislation],
    ["Regulator", entity.regulator],
    ["Minimum shareholders", entity.minimum_shareholders ?? "None specified"],
    ["Minimum directors", entity.minimum_directors ?? "None specified"],
    ["Minimum paid-up capital", capitalUsd(entity.minimum_paid_up_capital_usd)],
    ["Nationality restrictions", entity.nationality_restrictions],
    ["Registered agent required", entity.registered_agent_required ? "Yes" : "No"],
    ["Registered office in Samoa required", entity.registered_office_samoa_required ? "Yes" : "No"],
    ["Annual return required", entity.annual_return_required ? "Yes" : "No"],
    ["Annual audit required", entity.annual_audit_required ? "Yes" : "No"],
    ["UBO disclosure threshold", `${entity.ubo_disclosure_threshold_pct}%`],
    ["UBO disclosure to", entity.ubo_disclosure_to],
    ["UBO disclosure public", entity.ubo_disclosure_public ? "Yes" : "No"],
    ["Tax treatment", entity.tax_treatment],
    ["Formation timeline", entity.formation_timeline_typical],
    ["Annual fee (approx.)", entity.annual_fee_usd_approx !== null ? `$${entity.annual_fee_usd_approx.toLocaleString()}` : "Not specified"],
    ["Formation fee (approx.)", entity.formation_fee_usd_approx !== null ? `$${entity.formation_fee_usd_approx.toLocaleString()}` : "Not specified"],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{entity.entity_type_label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {fields.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-medium text-gray-500">{label}</dt>
              <dd className="text-sm text-gray-800 mt-0.5">{value}</dd>
            </div>
          ))}
        </dl>

        {entity.key_restrictions.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">Key restrictions</p>
            <ul className="list-disc pl-5 space-y-0.5 text-sm text-gray-800">
              {entity.key_restrictions.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        {entity.key_benefits.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">Key benefits</p>
            <ul className="list-disc pl-5 space-y-0.5 text-sm text-gray-800">
              {entity.key_benefits.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </div>
        )}

        {entity.notes && <p className="text-sm text-gray-600 italic">{entity.notes}</p>}
      </CardContent>
    </Card>
  );
}

function SamoaEntitySetupView({
  data,
}: {
  data: {
    results: EntityRequirements[];
    aml_cfct_mandatory_notice: string;
    next_step_notice: string;
    official_documents: { title: string; url: string }[];
  };
}) {
  return (
    <div className="space-y-4">
      {data.results.map((entity, i) => (
        <EntityCard key={i} entity={entity} />
      ))}

      <Alert variant="warning">{data.aml_cfct_mandatory_notice}</Alert>
      <Alert variant="info">{data.next_step_notice}</Alert>

      {data.official_documents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Official documents</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {data.official_documents.map((doc, i) => (
                <li key={i}>
                  <a href={doc.url} target="_blank" rel="noreferrer" className="text-ocean hover:underline text-sm">
                    {doc.title}
                  </a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function DataRenderer({ tierPath, data }: { tierPath: string; data: unknown }) {
  if (tierPath === "/pacific/samoa-entity-setup" && isEntitySetupResult(data)) {
    return <SamoaEntitySetupView data={data} />;
  }
  return <GenericDataView data={data} />;
}

export { humanizeSlug };
