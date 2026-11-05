const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Validate and canonicalize a tenant UUID before binding it as a database setting. */
export function normalizeTenantId(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new TypeError("A valid organization UUID is required.");
  }
  return normalized;
}
