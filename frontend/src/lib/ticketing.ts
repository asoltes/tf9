export function ticketURL(endpoint: string | null | undefined, ticket: string | null | undefined): string | null {
  const base = endpoint?.trim();
  const value = ticket?.trim();
  if (!base || !value) return null;
  const encoded = encodeURIComponent(value);
  if (base.includes('{ticket}')) return base.split('{ticket}').join(encoded);
  return `${base.replace(/\/+$/, '')}/${encoded}`;
}
