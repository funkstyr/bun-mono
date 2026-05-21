export type LoginSearch = { redirect?: string };

// Same-origin path only. Rejects external URLs, protocol-relative paths
// (`//evil.com`, which the History API resolves to a remote origin), and
// the rarer `/\\evil.com` form some browsers also coerce.
export function validateLoginSearch(search: Record<string, unknown>): LoginSearch {
  const r = search["redirect"];
  if (typeof r !== "string") return {};
  if (!r.startsWith("/")) return {};
  if (r.startsWith("//") || r.startsWith("/\\")) return {};
  return { redirect: r };
}
