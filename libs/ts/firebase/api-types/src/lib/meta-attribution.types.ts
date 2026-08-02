/**
 * Browser-captured Meta ad-attribution, threaded through the checkout callables.
 *
 * `_fbp` / `_fbc` only exist in the browser, so the public registration widgets
 * snapshot them at submit time. The server persists them on the registration
 * document, and the `Purchase` Conversions API triggers
 * (`sendRegistrationConversion` / `sendMusicTogetherConversion`) forward them to
 * Meta. `_fbc` in particular is the click-to-purchase link — without it Meta
 * falls back to email-hash matching alone and Events Manager match quality
 * stays low.
 *
 * Every field is optional and purely advisory: a missing or malformed value
 * degrades ad match quality and nothing else. NEVER authorize or price
 * anything off these values — they are client-supplied and trivially forged.
 */
export interface MetaAttributionPayload {
  /** `_fbp` first-party browser cookie written by the Meta Pixel. */
  fbp?: string;
  /**
   * `_fbc` click cookie, or `fb.1.<ms>.<fbclid>` synthesized by the widget
   * when the buyer arrived with an `fbclid` before the Pixel wrote the cookie.
   */
  fbc?: string;
  /** Page the buyer converted on, query string stripped. */
  eventSourceUrl?: string;
}
