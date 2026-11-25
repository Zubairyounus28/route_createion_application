export function isQuotaError(err: unknown): boolean {
  if (!err) return false;
  const raw =
    err instanceof Error
      ? `${err.name} ${err.message}`
      : typeof err === 'object'
        ? JSON.stringify(err)
        : String(err);

  return (
    raw.includes('RESOURCE_EXHAUSTED') ||
    raw.includes('OVER_QUERY_LIMIT') ||
    raw.includes('OverQuotaMapError') ||
    raw.includes('QuotaExceededError') ||
    raw.includes('429')
  );
}

export function checkAndDispatchQuotaError(err: unknown): boolean {
  if (isQuotaError(err)) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    return true;
  }
  return false;
}
