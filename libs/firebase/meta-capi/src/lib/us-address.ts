/**
 * Best-effort US address parsing for Meta's `ct` / `st` / `zp` match keys.
 *
 * Several of our forms collect a mailing address as ONE free-text field (the
 * Music Together registration widget's `address`, for instance). Meta indexes
 * city, state, and ZIP as three separate hashed fields, so that string is worth
 * nothing for matching until it is split.
 *
 * This is deliberately CONSERVATIVE. A wrong city hash is not neutral — it is a
 * field that matches nobody while looking to Events Manager like we supplied
 * one, which is worse than sending nothing. So every part is returned only when
 * the shape is unambiguous:
 *
 *   - `zip` only from a trailing 5-digit (or ZIP+4) group
 *   - `state` only from a recognized 2-letter code or a full state name
 *   - `city` only from the segment immediately before a recognized state
 *
 * Anything else yields `{}` and the caller simply sends fewer match keys.
 */

/** Two-letter USPS codes, including DC and the inhabited territories. */
const US_STATE_CODES = new Set([
  'al', 'ak', 'az', 'ar', 'ca', 'co', 'ct', 'de', 'fl', 'ga',
  'hi', 'id', 'il', 'in', 'ia', 'ks', 'ky', 'la', 'me', 'md',
  'ma', 'mi', 'mn', 'ms', 'mo', 'mt', 'ne', 'nv', 'nh', 'nj',
  'nm', 'ny', 'nc', 'nd', 'oh', 'ok', 'or', 'pa', 'ri', 'sc',
  'sd', 'tn', 'tx', 'ut', 'vt', 'va', 'wa', 'wv', 'wi', 'wy',
  'dc', 'pr', 'vi', 'gu', 'as', 'mp',
]);

/**
 * Spelled-out names -> USPS code. Families type "West Virginia" as often as
 * "WV", and Meta wants the abbreviation, so the long form must be mapped
 * rather than hashed as-is.
 */
const US_STATE_NAMES: Record<string, string> = {
  alabama: 'al', alaska: 'ak', arizona: 'az', arkansas: 'ar',
  california: 'ca', colorado: 'co', connecticut: 'ct', delaware: 'de',
  florida: 'fl', georgia: 'ga', hawaii: 'hi', idaho: 'id',
  illinois: 'il', indiana: 'in', iowa: 'ia', kansas: 'ks',
  kentucky: 'ky', louisiana: 'la', maine: 'me', maryland: 'md',
  massachusetts: 'ma', michigan: 'mi', minnesota: 'mn', mississippi: 'ms',
  missouri: 'mo', montana: 'mt', nebraska: 'ne', nevada: 'nv',
  'new hampshire': 'nh', 'new jersey': 'nj', 'new mexico': 'nm',
  'new york': 'ny', 'north carolina': 'nc', 'north dakota': 'nd',
  ohio: 'oh', oklahoma: 'ok', oregon: 'or', pennsylvania: 'pa',
  'rhode island': 'ri', 'south carolina': 'sc', 'south dakota': 'sd',
  tennessee: 'tn', texas: 'tx', utah: 'ut', vermont: 'vt',
  virginia: 'va', washington: 'wa', 'west virginia': 'wv',
  wisconsin: 'wi', wyoming: 'wy', 'district of columbia': 'dc',
  'puerto rico': 'pr',
};

export interface UsAddressParts {
  /** City name as written, unnormalized — `buildUserData` hashes it. */
  city?: string;
  /** Two-letter USPS code, lowercased. */
  state?: string;
  /** 5-digit ZIP (a ZIP+4 is truncated). */
  zip?: string;
}

/** How confident we are that a token really is a state. */
type StateMatch = { code: string; fromFullName: boolean };

/** Resolve a token to a USPS code, or undefined when it isn't a state. */
function toStateCode(token: string): StateMatch | undefined {
  const value = token.trim().toLowerCase().replace(/\.$/, '');
  if (US_STATE_CODES.has(value)) return { code: value, fromFullName: false };
  const named = US_STATE_NAMES[value];
  return named ? { code: named, fromFullName: true } : undefined;
}

/**
 * Pull city / state / ZIP out of a single-line US address.
 *
 * Handles the two shapes people actually type:
 *   `123 Main St, Morgantown, WV 26505`  (comma-delimited)
 *   `123 Main St Morgantown WV 26505`    (run-on)
 *
 * and the partial forms of each (`Morgantown, WV`, `WV 26505`).
 */
export function parseUsAddress(address: string | null | undefined): UsAddressParts {
  const raw = (address ?? '').trim();
  if (!raw) return {};

  const parts: UsAddressParts = {};

  // 1. Trailing ZIP / ZIP+4. Anchored to the end so a street number can never
  //    be mistaken for a postal code.
  let remainder = raw;
  const zipMatch = remainder.match(/[\s,]*\b(\d{5})(?:-\d{4})?\s*$/);
  if (zipMatch) {
    parts.zip = zipMatch[1];
    remainder = remainder.slice(0, zipMatch.index ?? remainder.length);
  }

  // 2. State: the last comma-delimited segment, or the last whitespace token.
  const segments = remainder
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (segments.length === 0) return parts;

  const lastSegment = segments[segments.length - 1];
  let match = toStateCode(lastSegment);
  let citySource: string | undefined;
  // A two-letter code sitting alone in its own comma group, with something
  // before it, is a state (`Morgantown, WV`). One found mid-run is not.
  let codeIsDelimited = false;

  if (match) {
    // `…, Morgantown, WV` — the city is the segment before the state.
    citySource = segments.length >= 2 ? segments[segments.length - 2] : undefined;
    codeIsDelimited = segments.length >= 2;
  } else {
    // `…, Morgantown WV` or the fully run-on form: peel tokens off the end.
    const tokens = lastSegment.split(/\s+/);
    // A two-word state name ("New York") needs the last two tokens.
    for (const take of [2, 1]) {
      if (tokens.length <= take) continue;
      const candidate = toStateCode(tokens.slice(-take).join(' '));
      if (candidate) {
        match = candidate;
        citySource = tokens.slice(0, -take).join(' ');
        break;
      }
    }
  }

  if (!match) return parts;

  // Guard against the two-letter English words that collide with USPS codes —
  // `me`, `in`, `or`, `ok`, `hi`, `la`, `pa`, `id`. Left unchecked, a free-text
  // scrap like "ask me" parses as Maine and ships a state hash for a family in
  // West Virginia. A bare code is only believed when the string also carried a
  // ZIP, or when the code stood alone in its own comma group. A spelled-out
  // state name is unambiguous and always believed.
  if (!match.fromFullName && !parts.zip && !codeIsDelimited) return parts;

  parts.state = match.code;

  // 3. City. Only trusted when it sits directly before the state and does not
  //    still look like a street line (a leading house number is the tell).
  const city = citySource?.trim();
  if (city && !/^\d/.test(city) && /[a-z]/i.test(city)) {
    parts.city = city;
  }
  return parts;
}
