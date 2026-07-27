/** Shared institution-name -> slug helper — used by the self-hosted ZIP
 * filename (Step 6) and the Step 7 listing URL preview. */
export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || "provider"
  );
}
