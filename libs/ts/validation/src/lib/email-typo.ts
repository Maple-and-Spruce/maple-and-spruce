/**
 * "Did you mean gmail.com?" for an email address someone is typing.
 *
 * WHY
 * ---
 * An address like `name@gnail.com` passes every format check, is accepted by
 * the sending mail server, and then bounces minutes later to the shop's inbox.
 * The customer never hears from us: a waitlist "a spot opened" email went
 * nowhere this way in 2026-11, and the seat stayed empty.
 *
 * WHAT IT DOES
 * ------------
 * Looks the domain up in a fixed list of known misspellings of the big mail
 * providers and returns the corrected address, or `undefined`.
 *
 * It is a lookup, not a "closest domain" guess, on purpose. Plenty of real
 * domains sit one letter from a big provider (`gmx.com`, `ymail.com`,
 * `mail.com`, `me.com`), and telling the owner of one that they mistyped is
 * worse than missing a rare typo. Add a domain here only when it cannot be a
 * provider people really use.
 *
 * This is a suggestion, never a validation error: forms show it and let the
 * person carry on with what they typed.
 */

/** Real domain -> the misspellings of it we recognise. All lowercase. */
const TYPOS_BY_DOMAIN: Readonly<Record<string, readonly string[]>> = {
  'gmail.com': [
    'gnail.com',
    'gmial.com',
    'gmai.com',
    'gmal.com',
    'gmil.com',
    'gamil.com',
    'gmaill.com',
    'gmaul.com',
    'gmali.com',
    'gmsil.com',
    'gmqil.com',
    'gmaik.com',
    'gmailcom',
    'gmail.con',
    'gmail.cmo',
    'gmail.ocm',
    'gmail.vom',
    'gmail.xom',
    'gmail.comm',
    'gmail.co',
    'gmail.cm',
    'gmail.om',
    'gmail.coom',
    'gmail.net',
  ],
  'googlemail.com': [
    'googlemail.con',
  ],
  'yahoo.com': [
    'yaho.com',
    'yahooo.com',
    'yhoo.com',
    'yhaoo.com',
    'yaoo.com',
    'tahoo.com',
    'uahoo.com',
    'yahoo.con',
    'yahoo.cmo',
    'yahoo.comm',
    'yahoo.cm',
    'yahoo.om',
  ],
  'hotmail.com': [
    'hotmial.com',
    'hotmai.com',
    'hotmal.com',
    'hotmil.com',
    'hotnail.com',
    'homail.com',
    'hotmaill.com',
    'hotmali.com',
    'htomail.com',
    'hotmail.con',
    'hotmail.cmo',
    'hotmail.comm',
    'hotmail.cm',
  ],
  'outlook.com': [
    'outlok.com',
    'outloo.com',
    'outlokk.com',
    'outllok.com',
    'oulook.com',
    'otlook.com',
    'outlook.con',
    'outlook.cmo',
    'outlook.comm',
  ],
  'icloud.com': [
    'iclod.com',
    'icoud.com',
    'iclould.com',
    'icloud.con',
    'icloud.cmo',
    'icloud.comm',
  ],
  'aol.com': [
    'aol.con',
    'aol.cmo',
    'aol.comm',
    'aool.com',
  ],
  'comcast.net': [
    'comcast.con',
    'comcast.ner',
    'comcas.net',
    'comcat.net',
    'concast.net',
  ],
  'live.com': [
    'live.con',
  ],
  'msn.com': [
    'msn.con',
  ],
};

/** Misspelled domain -> the domain it was meant to be. */
const DOMAIN_TYPOS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(TYPOS_BY_DOMAIN).flatMap(([domain, typos]) =>
    typos.map((typo) => [typo, domain])
  )
);

/**
 * The corrected address when `email`'s domain is a known misspelling of a big
 * mail provider; otherwise `undefined`.
 *
 * The part before the `@` is kept exactly as typed. Surrounding whitespace is
 * dropped. Anything that is not `something@domain` returns `undefined`, so it
 * is safe to call on every keystroke.
 */
export function suggestEmailCorrection(
  email: string | undefined | null
): string | undefined {
  if (!email) return undefined;
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at === trimmed.length - 1) return undefined;
  if (/\s/.test(trimmed)) return undefined;

  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1).toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(DOMAIN_TYPOS, domain)) {
    return undefined;
  }
  return `${local}@${DOMAIN_TYPOS[domain]}`;
}

/** Exposed for the spec, which checks the list against itself. */
export const KNOWN_EMAIL_DOMAIN_TYPOS: Readonly<Record<string, string>> =
  DOMAIN_TYPOS;
