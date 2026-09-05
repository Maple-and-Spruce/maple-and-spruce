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

**Two forms feed this webhook**, both in workspace `mJJjAd`. Everything in
this section applies to each of them:

| Form | Id | Banner | Meta dataset |
|---|---|---|---|
| Maple & Spruce Folk Arts | `0QPRq9` | `.pre-opening-banner` in the `maple-nav` component | M&S `1625932185289127` |
| Music Together Maple & Spruce Updates | `q4Qj8d` | `.mt-banner` in both MT headers | MT `1562555242035326` |

The function routes the Meta half by form id (`resolveFormAttribution` in
`tally-lead-webhook.ts`) and labels the GA4 half with `form_name` / `form_id`,
so both forms share one endpoint and one signing secret. A form id it doesn't
recognize is reported as a Maple & Spruce lead rather than dropped.

**Order matters when connecting a new form**: deploy the function first. If
you connect a form the deployed function doesn't know about, its leads land in
the Maple & Spruce dataset until the next deploy, and Meta has no way to move
them afterward.

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

Use the **same** signing secret for both forms — `TALLY_WEBHOOK_SECRET` is a
single value and the function has no per-form secret lookup.

### Browser / server deduplication

Both halves of every lead fire: the footer snippet on `Tally.FormSubmitted`,
this function on the webhook. They deduplicate on `tally-<submissionId>` —
Tally puts the same submission id in `payload.id` on the browser message and
`data.submissionId` on the webhook body (verified against a live submission:
both read `LDa8Kpv`).

Break the format on one side only and Meta counts every signup twice, which is
worse than it sounds for Music Together — the MT ad account would optimize
against lead volume that doesn't exist. The pairing is asserted by
`Browser/server deduplication` in the integration suite and by
`leadEventId` in the unit spec; the browser side lives in
`tools/webflow-tally-form-events.html`.

## 5. Webflow page snippet

The hidden fields above only fire if something writes to the Tally
iframe URL before the form loads. Tally has two embed modes and they
need slightly different handling — this snippet covers both:

- **Modal popup** (`<button data-tally-open="formId" data-tally-layout="modal">`):
  the embed library wires its own click handler that calls
  `Tally.openPopup(formId, options)` internally. We intercept the
  click in the capture phase, read the page cookies, and forward
  them as `hiddenFields` on a manual `Tally.openPopup` call. The
  existing `data-tally-*` attrs are replayed onto the options
  object so layout / emoji / etc. survive.
- **Inline iframe** (`<iframe data-tally-src="...">`): the embed
  library rewrites these on load. We pre-rewrite the `src` on
  DOMContentLoaded with the hidden-field params appended as query
  string args, so Tally picks them up before the form first paints.

Add this snippet to **Webflow Designer → Site Settings → Custom Code →
Head Code**, then publish the site. It is installed site-wide, not per page:
the Tally forms are embedded on `/suzuki`, `/music`, `/music-lessons` and
`/music-together`, and the popup path can be triggered from anywhere, so a
per-page install is a lead waiting to be dropped. (It was documented as a page
setting and installed site-wide; the site-wide install is the correct one.)

```html
<script>
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
      if (parts.length < 4) return '';
      return parts[2] + '.' + parts[3];
    }

    // The five UTMs the Tally forms declare. These arrive as query string
    // params on the ad click, NOT as cookies — which is why they were the
    // five fields sitting permanently empty while the cookie-derived five
    // worked (#824).
    var UTM_KEYS = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_content',
      'utm_term',
    ];
    var UTM_STORAGE_KEY = 'ms_utm';

    // A visitor can land on /suzuki?utm_source=... and then click around
    // before reaching the form, at which point location.search is empty and
    // the campaign is gone. Stash them for the session so a later page still
    // knows where the visit came from. Last touch wins: arriving fresh from a
    // second ad should re-attribute, not keep the first one forever.
    function utmParams() {
      var params = new URLSearchParams(window.location.search);
      var found = {};
      var any = false;
      UTM_KEYS.forEach(function (key) {
        var value = params.get(key);
        if (value) {
          found[key] = value;
          any = true;
        }
      });
      if (any) {
        try {
          sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(found));
        } catch (e) {
          // Private mode or storage disabled — the current page still works.
        }
        return found;
      }
      try {
        return JSON.parse(sessionStorage.getItem(UTM_STORAGE_KEY)) || {};
      } catch (e) {
        return {};
      }
    }

    function getHiddenFields() {
      var fields = {
        _ga_client_id: gaClientId(),
        _fbp: readCookie('_fbp'),
        _fbc: readCookie('_fbc'),
        referrer: document.referrer || '',
        landing_page: window.location.href,
      };
      var utms = utmParams();
      Object.keys(utms).forEach(function (key) {
        fields[key] = utms[key];
      });
      return fields;
    }

    function dataAttrToOption(attrCamel) {
      // dataset key "tallyLayout" → option key "layout".
      var key = attrCamel.replace(/^tally/, '');
      return key.charAt(0).toLowerCase() + key.slice(1);
    }

    // -- Modal popup path: intercept clicks on [data-tally-open] --------------
    document.addEventListener(
      'click',
      function (e) {
        var target = e.target;
        while (target && target !== document) {
          if (target.dataset && target.dataset.tallyOpen) break;
          target = target.parentElement;
        }
        if (!target || target === document) return;
        var formId = target.dataset.tallyOpen;
        if (!formId || !window.Tally || typeof window.Tally.openPopup !== 'function') return;

        var options = { hiddenFields: getHiddenFields() };
        Object.keys(target.dataset).forEach(function (key) {
          if (key === 'tallyOpen') return;
          options[dataAttrToOption(key)] = target.dataset[key];
        });

        e.preventDefault();
        e.stopImmediatePropagation();
        window.Tally.openPopup(formId, options);
      },
      true // capture phase — beats the embed library's bubble-phase handler
    );

    // -- Inline iframe path: rewrite [data-tally-src] before Tally loads it ---
    function appendParams(srcUrl) {
      var url = new URL(srcUrl, window.location.origin);
      var fields = getHiddenFields();
      Object.keys(fields).forEach(function (k) {
        if (fields[k]) url.searchParams.set(k, fields[k]);
      });
      return url.toString();
    }
    function rewriteInlineFrames() {
      var iframes = document.querySelectorAll(
        'iframe[data-tally-src], iframe[src*="tally.so/embed"], iframe[src*="tally.so/r/"]'
      );
      iframes.forEach(function (iframe) {
        if (iframe.dataset.tallyParamsApplied) return;
        iframe.dataset.tallyParamsApplied = '1';
        var src = iframe.dataset.tallySrc || iframe.src;
        if (iframe.dataset.tallySrc) {
          iframe.dataset.tallySrc = appendParams(src);
        } else {
          iframe.src = appendParams(src);
        }
      });
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', rewriteInlineFrames);
    } else {
      rewriteInlineFrames();
    }
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
