import { compactId } from './format';

const PUBLIC_CITATION_PROTOCOLS = new Set(['http:', 'https:']);

export function safeCitationHref(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return PUBLIC_CITATION_PROTOCOLS.has(parsed.protocol) ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function citationLabel(url: string | undefined, sourceDocumentId: string): string {
  const href = safeCitationHref(url);
  if (!href) return compactId(sourceDocumentId);
  return new URL(href).hostname;
}
