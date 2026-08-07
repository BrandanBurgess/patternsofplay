// The one search matcher every browse surface uses (Patterns, Formations,
// Identity, and the Sessions picker each had their own identical copy).
//
// Matching is HYPHEN-INSENSITIVE on both sides. The tactical content is
// full of hyphenated names ("Third-Man Run", "Slide-Rule Through Ball",
// "Up-Back-Through", "False-9 Drop") and a coach types what they say out
// loud: "third man", not "third-man". Before this, the Brief's own demo
// narrative ("opens Patterns, searches 'third man'") found nothing.
// Hyphens are still allowed in the query and still match, so nothing that
// worked before stops working.

function normalize(value: string): string {
  return value.toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

export function matchesSearch(
  haystack: (string | undefined | null)[],
  query: string
): boolean {
  const q = normalize(query);
  if (!q) return true;
  return haystack.some((h) => (h ? normalize(h).includes(q) : false));
}
