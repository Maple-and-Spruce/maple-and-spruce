# sync-registration-count

Firestore trigger that syncs registration count changes to Webflow CMS.

When a registration is created, updated, or deleted, this function:
1. Extracts the classId from the registration document
2. Looks up the class (skips if not published)
3. Counts active registrations
4. Re-syncs the class to Webflow with the updated spots-remaining count
