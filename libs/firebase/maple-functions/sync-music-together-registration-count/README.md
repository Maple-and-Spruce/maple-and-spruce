# sync-music-together-registration-count

Firestore trigger that keeps the Webflow CMS `spots-remaining` / `spots-display`
fields on a Music Together section in step with real enrollment.

The Music Together mirror of `sync-registration-count` (which does the same job
for classes). Without it, a section's spot count in Webflow only refreshes when
the *section document itself* is edited — so a family registering left the
public card advertising stale availability until someone re-saved the section in
admin.

When a Music Together registration is created, updated, or deleted, this
function:

1. Skips writes that can't change the family count (see `COUNT_RELEVANT_FIELDS`) —
   the registration document doubles as the per-family bookkeeping channel, so
   reminder stamps and payment-method swaps land on it too
2. Extracts the `sectionId` from the registration document
3. Looks up the section (skips if missing or not visible)
4. Counts enrolled families (`MT_CAPACITY_STATUSES`)
5. Re-syncs the section to Webflow with the updated count, which also refreshes
   the derived `status` field (`open` → `full`)
