/**
 * Light formatting for a class's full description.
 *
 * The description is typed into a plain text box in the admin app and stored
 * as typed. Staff can use:
 *
 * - a blank line to start a new paragraph
 * - a single line break to start a new line
 * - `**bold**`
 * - `*italic*` or `_italic_`
 *
 * The Webflow class page shows the description in a Rich Text field, which
 * takes HTML. Sent as typed, the line breaks are plain whitespace and the
 * browser folds them into one paragraph. `classDescriptionToHtml` builds the
 * HTML that field needs. Everywhere else (Square, the calendar, the catalog
 * feed) shows plain text, so `classDescriptionToPlainText` takes the markers
 * back out and leaves the line breaks alone.
 */

// `***bold italic***`, matched first so the inner pair is not split.
const BOLD_ITALIC = /\*\*\*(?=[^\s*])([^*\n]*?[^\s*])\*\*\*/g;
// `**bold**`: the markers hug the text, and it stays on one line.
const BOLD = /\*\*(?=\S)([^\n]*?\S)\*\*/g;
// `*italic*`: not part of a word or another asterisk run, so "2 * 3 * 4" and a
// lone footnote asterisk are left as typed.
const ITALIC_STAR = /(?<![*\w])\*(?![\s*])([^*\n]*?[^\s*])\*(?![*\w])/g;
// `_italic_`: not inside a word, so snake_case and file_names are left alone.
const ITALIC_UNDERSCORE = /(?<!\w)_(?![\s_])([^_\n]*?[^\s_])_(?!\w)/g;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function normalizeLines(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

function applyInline(
  text: string,
  bold: (inner: string) => string,
  italic: (inner: string) => string
): string {
  return text
    .replace(BOLD_ITALIC, (_match, inner: string) => bold(italic(inner)))
    .replace(BOLD, (_match, inner: string) => bold(inner))
    .replace(ITALIC_STAR, (_match, inner: string) => italic(inner))
    .replace(ITALIC_UNDERSCORE, (_match, inner: string) => italic(inner));
}

/**
 * The description as HTML for a rich text field: one `<p>` per paragraph,
 * `<br>` for a line break inside one, `<strong>` and `<em>` for the markers.
 * Anything that looks like HTML in the source is escaped, not rendered.
 */
export function classDescriptionToHtml(description: string): string {
  const normalized = normalizeLines(description);
  if (!normalized) return '';

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => {
      const html = applyInline(
        escapeHtml(paragraph),
        (inner) => `<strong>${inner}</strong>`,
        (inner) => `<em>${inner}</em>`
      ).replace(/\n/g, '<br>');
      return `<p>${html}</p>`;
    })
    .join('');
}

/**
 * The description with the bold and italic markers removed, for the places
 * that show plain text. Line breaks are kept.
 */
export function classDescriptionToPlainText(description: string): string {
  return applyInline(
    normalizeLines(description),
    (inner) => inner,
    (inner) => inner
  );
}
