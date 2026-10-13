# sync-music-together-demo-rsvp-count

Firestore trigger that keeps the Webflow CMS `spots-remaining` / `spots-display`
fields on a Music Together demo class in step with real RSVPs.

The demo mirror of `sync-music-together-registration-count` (sections) and
`sync-registration-count` (classes). RSVPs live in the demo's `rsvps`
subcollection, which the demo sync trigger never sees, so without this function
a demo's spot count in Webflow only refreshed when the demo itself was edited.

When an RSVP under `musicTogetherDemos/{demoId}/rsvps/{rsvpId}` is created,
updated, or deleted, this function:

1. Skips updates that don't change `status` (only `confirmed` RSVPs take a spot)
2. Looks up the demo (skips if missing, hidden, or past)
3. Counts confirmed RSVPs
4. Re-syncs the demo to Webflow with the updated count, which also refreshes the
   derived `status` field (`open` → `full`)
