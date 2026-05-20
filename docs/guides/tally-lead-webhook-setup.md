# Tally Lead Webhook Setup

End-to-end setup for the `tallyLeadWebhook` Cloud Function — the server-side
replacement for Tally's paid GA4 / Meta Pixel integrations. The function
itself is in `libs/firebase/maple-functions/tally-lead-webhook/`. This guide
covers the manual configuration the function depends on:

1. Generate the GA4 Measurement Protocol API secret
2. Generate the Meta Conversions API access token
3. Set Firebase secrets and (optional) string overrides
4. Configure the Tally form: hidden fields + webhook + signing secret
5. Add the Webflow page snippet that populates hidden fields from cookies

You only need to do this once per environment (dev + prod). Re-do it any
time the GA4 stream or Meta pixel changes.

---

## What this fixes

- **GA4** showed zero `generate_lead` key events attributed to any
  source/medium because Tally never fires the event in the browser.
- **Meta** only saw browser-side Pixel `Lead` events, which iOS drops in
  attribution.

The function listens to the Tally form's webhook, validates the HMAC
signature, pulls attribution context out of hidden fields, and fans out
to GA4 Measurement Protocol (`generate_lead`) and Meta CAPI (`Lead`) in
parallel. Tally retries 5xx, so we always 200 once the payload is
validated; if either downstream fails, the other still runs.

---

## 1. Generate the GA4 Measurement Protocol API secret

1. Open GA4 → **Admin** → under the property, **Data Streams**.
2. Click the web stream for `mapleandsprucewv.com`.
3. Scroll to **Events** → **Measurement Protocol API secrets** →
   **Create**.
4. Nickname it `tally-lead-webhook`. Copy the secret value — you cannot
   view it again.

The Measurement ID from the same stream (looks like `G-XXXXXXXXXX`) is
the GA4 destination. The function defaults to `G-TY0E9X31V6`; override
via the `GA4_MEASUREMENT_ID` Firebase string param if the production
stream changes.

## 2. Generate the Meta Conversions API access token

1. Open Meta **Events Manager** → select the `mapleandsprucewv.com`
   pixel (id `1625932185289127`).
2. **Settings** → **Conversions API** → **Generate access token**.
3. Copy the token immediately — Events Manager hides it after the first
   view.

Pixel id and API version are configurable via `META_PIXEL_ID` and
`META_CAPI_API_VERSION` string params (defaults: `1625932185289127`,
`v20.0`). The function constructs the URL as
`/{META_CAPI_API_VERSION}/{META_PIXEL_ID}/events`.

## 3. Set the Firebase secrets

Run from a fresh terminal where `firebase login` succeeded — pasting
secrets while screen-sharing or with a clipboard manager open is a quick
way to leak them.

```bash
# Dev project
firebase use maple-and-spruce-dev
firebase functions:secrets:set TALLY_WEBHOOK_SECRET   # paste the value from Tally (step 4)
firebase functions:secrets:set GA4_API_SECRET         # value from step 1
firebase functions:secrets:set META_CAPI_TOKEN        # value from step 2

# Prod project
firebase use maple-and-spruce
firebase functions:secrets:set TALLY_WEBHOOK_SECRET
firebase functions:secrets:set GA4_API_SECRET
firebase functions:secrets:set META_CAPI_TOKEN
```

The function reads them at runtime via `defineSecret` and only mounts
them when the request actually invokes the function, so adding the
secrets does not require a redeploy of the entire codebase.

## 4. Configure the Tally form

The newsletter form lives in workspace `mJJjAd`. Open the form in
Tally's editor (the one wired into the `/newsletter` page on Webflow —
not the contact form).

### Hidden fields

Add the following **Hidden fields** (Form settings → Hidden fields).
Labels must match exactly — the webhook extracts values by label.

| Label | Populated by | Notes |
|---|---|---|
| `_ga_client_id` | JS snippet (step 5) | From the `_ga` cookie. GA4 stitches the lead to the existing session when this is present. |
| `_fbp` | JS snippet | First-party Meta browser cookie. |
| `_fbc` | JS snippet | Meta click id; only set when the visitor arrived from a Meta ad. |
| `utm_source` | URL param (Tally auto-populates) | Plus `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`. |
| `utm_medium` | URL param | |
| `utm_campaign` | URL param | |
| `utm_content` | URL param | |
| `utm_term` | URL param | |
| `referrer` | JS snippet | `document.referrer` at form load. |
| `landing_page` | JS snippet | `window.location.href` at form load. |

Tally's URL parameter mapping is "Settings → Get values from URL"; the
five `utm_*` fields plug straight in if you name them identically to the
query params. Hidden fields default to empty string when no value is
supplied — that is fine, the function treats empty as "no value".

### Webhook + signing secret

1. **Integrations** → **Webhooks** → **Connect**.
2. Endpoint URL:
   - Dev: `https://us-east4-maple-and-spruce-dev.cloudfunctions.net/tallyLeadWebhook`
   - Prod: `https://us-east4-maple-and-spruce.cloudfunctions.net/tallyLeadWebhook`
3. **Signing secret** → click "Add a signing secret" and paste a strong
   random string (this is the value you put into `TALLY_WEBHOOK_SECRET`
   in step 3 — it must match exactly).

The function verifies `tally-signature` against
`HMAC-SHA256(rawBody, secret)` (base64). A signature mismatch returns
401 and no downstream call is made.

## 5. Webflow page snippet

The hidden fields above only fire if something writes to the iframe
before submit. Add this snippet to the Webflow page that embeds the
Tally form. Use **Webflow Designer → page settings → Inside `<head>`
tag** (or a Custom Code block at the bottom of the page body):

```html
<script>
  // Populate Tally hidden fields with GA / Meta cookies + page context.
  //
  // Works with Tally's inline embed (the form is rendered as an iframe
  // hosted at tally.so). We listen for the iframe's "Tally.LoadedForm"
  // postMessage and inject a `?fieldName=value` query string back into
  // the iframe src — Tally reads URL params into the matching hidden
  // fields automatically.
  (function () {
    function readCookie(name) {
      var match = document.cookie.match(
        new RegExp('(?:^|;\\s*)' + name + '=([^;]*)')
      );
      return match ? decodeURIComponent(match[1]) : '';
    }

    // The `_ga` cookie value looks like `GA1.2.<clientId>` — GA4 wants
    // just the trailing clientId portion as `client_id`.
    function gaClientId() {
      var raw = readCookie('_ga');
      if (!raw) return '';
      var parts = raw.split('.');
      // Last two segments concatenated with a dot ARE the client id.
      if (parts.length < 4) return '';
      return parts[2] + '.' + parts[3];
    }

    var params = {
      _ga_client_id: gaClientId(),
      _fbp: readCookie('_fbp'),
      _fbc: readCookie('_fbc'),
      referrer: document.referrer || '',
      landing_page: window.location.href,
    };

    function appendParams(srcUrl) {
      var url = new URL(srcUrl, window.location.origin);
      Object.keys(params).forEach(function (key) {
        if (params[key]) url.searchParams.set(key, params[key]);
      });
      return url.toString();
    }

    // Tally posts a "Tally.LoadedForm" message once the iframe is ready.
    window.addEventListener('message', function (event) {
      if (
        !event.data ||
        typeof event.data !== 'object' ||
        event.data.type !== 'Tally.LoadedForm'
      ) {
        return;
      }
      var iframes = document.querySelectorAll('iframe[src*="tally.so"]');
      iframes.forEach(function (iframe) {
        if (!iframe.dataset.tallyParamsApplied) {
          iframe.dataset.tallyParamsApplied = '1';
          iframe.src = appendParams(iframe.src);
        }
      });
    });
  })();
</script>
```

UTM params are auto-passed by Tally when they exist in the page URL,
so the snippet does not need to forward them.

Once published, open the page in an incognito window with a UTM
appended (e.g. `?utm_source=test&utm_medium=manual`), submit the form
with a test email, and check:

- GA4 → **Realtime** → events should show `generate_lead` within ~30s.
- Meta Events Manager → **Test events** (with the Test Event Code set
  on the request body if you want to filter) shows a `Lead` event.

---

## Local testing

The function is covered by `apps/functions-integration-tests-tally-lead-webhook/`,
which redirects GA4 and Meta CAPI traffic to per-service mock servers
in `libs/firebase/ga4-test-mock-server/` and
`libs/firebase/meta-capi-test-mock-server/`. Run the suite with:

```bash
./tools/run-integration-tests.sh tally-lead-webhook
```

The mock servers expose `/_mock/reset`, `/_mock/requests`, and
`/_mock/failure-status` for tests to control state without restarting
the process.

## Tally retries

Tally retries 5xx but not 4xx, and the function does not deduplicate by
`submissionId`. A delivery + retry will produce two GA4 events and two
Meta events. Both platforms tolerate occasional duplicates, and the
alternative (Firestore write to dedupe) adds a hot-path round trip
without a real attribution benefit. If we ever see significant
duplicate volume in GA4, the dedupe key to use is
`payload.data.submissionId`.

## Dev / prod isolation

By default, the dev and prod Firebase projects both point at the **same**
production GA4 stream (`G-TY0E9X31V6`) and Meta pixel
(`1625932185289127`). Tokens are separate but destinations are not — so
dev test submissions land in production attribution and (worse) feed
Meta's ad-delivery algorithm if you ever optimize a campaign for the
`Lead` event.

Three ways to handle this, in order of how much work they are:

1. **Do nothing** — at low test volume the noise is rounding-error. Fine
   to defer until you actually start running Meta Lead-optimization
   campaigns.
2. **Separate dev pixel + dev GA4 stream** — best long-term setup,
   ~15 minutes:
   - Events Manager → Datasets → **Connect data** → create a pixel
     called "Maple & Spruce — Dev"; copy its ID.
   - Add the new pixel as a "Use events dataset" asset on the existing
     `Conversions API System User` (Business Settings → System users →
     Assigned assets → Add). The existing CAPI token will now write to
     either pixel based on the URL.
   - GA4 → Admin → Data Streams → Add stream for a dev hostname; copy
     the new Measurement ID; create a fresh Measurement Protocol API
     secret on it.
   - The function reads `GA4_MEASUREMENT_ID` and `META_PIXEL_ID` as
     `defineString` params with prod defaults baked into the code.
     Override for dev by adding the project-scoped `.env.maple-and-spruce-dev`
     file at the functions codebase root (`apps/functions/.env.maple-and-spruce-dev`)
     — Firebase auto-loads it on deploy to the dev project, and prod
     deploys keep the hard-coded defaults:

     ```ini
     # apps/functions/.env.maple-and-spruce-dev
     GA4_MEASUREMENT_ID=G-DEVXXXXXX
     META_PIXEL_ID=9999999999999999
     ```

     Then rotate the dev `GA4_API_SECRET` to the new stream's secret
     (the existing Meta CAPI token works against any pixel its system
     user has access to, so no token rotation needed there):

     ```bash
     firebase use maple-and-spruce-dev
     firebase functions:secrets:set GA4_API_SECRET   # paste dev secret
     ```
3. **`test_event_code` for interactive validation only** — Meta's
   Events Manager → Test events tab shows a code like `TEST14336` that
   excludes events from production attribution. **Don't** bake it into
   the dev env: per Meta's docs, the code rotates each time the tab is
   opened and expires on inactivity, so a stale code silently re-enters
   production attribution. Useful for sitting in front of Events
   Manager and watching events arrive in real-time during a debug
   session, not for a persistent dev environment.

## Operational notes

- The function is in the **maple-core** codebase. It has no heavy SDK
  dependencies — just `crypto`, `fetch`, and the Vest validation suite
  shared with the rest of the app.
- Region `us-east4`, concurrency `80`, memory `256MiB`. Cold start is
  small because the codebase is core.
- If GA4 / Meta credentials are rotated, only `firebase functions:secrets:set`
  is needed; no redeploy.
