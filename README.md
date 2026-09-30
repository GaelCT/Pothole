# Bakersfield pothole map

An independent website that maps reviewed pothole observations in Bakersfield, CA, and prepares
city service-request drafts that the operator files by hand. Not an official City of
Bakersfield service.

The build plan is in [`Bakersfield_Pothole_Website_Build_Plan.md`](Bakersfield_Pothole_Website_Build_Plan.md).
Stage 1 findings are in [`docs/stage-1-reporting-feasibility.md`](docs/stage-1-reporting-feasibility.md).

## Status

| Stage | State |
| --- | --- |
| 1. Reporting feasibility | Done. Decision: manual filing, no form automation |
| 2. App foundation | Done: database, private photos, admin sign-in, dev fixtures |
| 3. Map interface | Done: public map on `/` with filters, list and a detail panel; map of reported potholes on `/login`; CSP. Map tiles need `MAPTILER_KEY` |
| 4. Review and report drafting | Done: review page at `/admin/potholes/<id>` with photo redaction, pin editing, duplicates, decisions, draft and approval |
| 5. Manual filing support | Not started |
| 6. Test and deploy | Not started |

## Requirements

- Node.js 24 or newer (the scripts in `scripts/` run TypeScript directly with Node)
- npm

## Configure

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env.local`.

3. Generate the admin password hash. Input is hidden, and the password itself is never stored:

   ```sh
   npm run hash-password
   ```

   Paste the printed `ADMIN_PASSWORD_HASH=...` line into `.env.local`.

4. Generate a session secret and set `SESSION_SECRET` in `.env.local`:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```

5. Set `DATA_DIR`. `./data` is fine for local development. In production it must point at a
   persistent volume (see [Data and backups](#data-and-backups)).

The server validates all four values when it starts. If any is missing or malformed, it logs
every problem and serves nothing.

## Run locally

```sh
npm run db:seed-dev   # optional: load development fixtures
npm run dev           # http://localhost:3000
```

Sign in at `/login` and go to `/admin`.

## Reviewing a record (Stage 4)

On `/admin`, choose **Review** next to a record. Work through the page from top to bottom:

1. **Photo.** Drag on the original photo to cover faces, license plates, house numbers and so
   on with solid black boxes. There's also a keyboard option for adding a box by coordinates.
   **Save photo copy** creates the only version that is ever shown publicly or filed: EXIF
   orientation is applied, all metadata (EXIF, GPS, XMP, ICC) is removed, and the boxes are
   painted in. The original upload stays private and admin-only, so you can redo a redaction.
   Tick the confirmation once nothing identifying remains.
2. **Location and description.** Drag the pin, click the map, or type the coordinates. Nearby
   records appear as grey dots. Moving the pin clears the "location confirmed" decision, so
   you confirm it again.
3. **Duplicates.** Records within 150 m are listed with their photos. Linking one to a main
   record hides it from the map and blocks reporting it. Nothing is merged automatically.
   Chains aren't allowed: the main record can't itself be a duplicate, and a record that others
   point to can't become one.
4. **Review decisions.** Set the review status, confirm the pin and the city's responsibility
   for the road, choose city-request privacy, and choose whether to publish. The page lists
   what still keeps the record off the public map.
5. **City report draft.** Shown in the city form's order, with the description built from the
   plan's fixed template. Approving saves an exact snapshot, including a SHA-256 hash of the
   photo copy.
   - Any later change to the text, pin, privacy, review status or photo clears the approval.
     Toggling "publish on map" doesn't.
   - The page flags an approval that no longer matches the record or photo bytes.
   - Once filing starts (Stage 5), the record is locked.

The draft doesn't name the city's report category, because the exact option hasn't been
confirmed. You choose it on the city form.

## Development fixtures

`npm run db:seed-dev` loads eight records covering each visibility case: two public, one needing
review, one rejected, one duplicate, one private, and two public records marked as submitted to
the city (with no city request number, since none was ever issued). Their descriptions start with
`[DEV FIXTURE]`, and their photos are striped images stamped "DEV FIXTURE / NOT REAL". Verified
fixtures get a reviewed photo copy. Re-running the script also upgrades fixtures created by
older versions. Fixtures can't be approved for filing in production.

- The script refuses to run when `NODE_ENV=production`.
- Re-running it adds nothing new, because fixture IDs are fixed.
- In production the public site never shows fixtures, even when they are marked published.
- Never file a fixture with the city.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build (needs no secrets or database) |
| `npm run start` | Production server |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generate route types and run `tsc` |
| `npm run hash-password` | Create `ADMIN_PASSWORD_HASH` |
| `npm run db:seed-dev` | Load development fixtures |

## How access works

- **Visitors** can read `GET /api/potholes` and photos of records that pass the public
  visibility rule. A record is public only when all of these hold:
  - it is verified and not a duplicate
  - its pin has been confirmed
  - it is explicitly published
  - it is explicitly not private
  - it has a saved photo copy with the review confirmed
  - in production, it is not a fixture

  The rule is written twice: in SQL in `src/lib/potholes.ts` and as `publicBlockers` in
  `src/lib/review-rules.ts`. The two must stay in step. Visitors only ever get the reviewed photo
  copy. The original upload (`?variant=original`) is admin-only. Hidden and nonexistent records
  both return 404.
- **The administrator** signs in with the single account from `.env.local`.
  - Sessions are encrypted `HttpOnly` cookies that expire after 8 hours. In production they are
    also `Secure` and use the `__Host-` prefix.
  - Changing the password or `SESSION_SECRET` signs out existing sessions.
  - After 10 failed sign-ins within 15 minutes, all sign-ins are paused for the rest of that
    window.
- **Writes** are admin-only.
  - Route handlers check the session, then require a same-origin `Origin` header. A missing
    `Origin` is rejected.
  - Server Actions rely on Next.js's built-in Origin check.
  - Uploads are checked by their file content, not their claimed type (JPEG, PNG, or WebP),
    with a 10 MB limit, and are stored under generated file names.
- There is no public sign-up and no public reporting endpoint.

## Data and backups

Everything that has to persist lives in `DATA_DIR`:

- `pothole.db` is the SQLite database, in WAL mode. The `-wal` and `-shm` files next to it
  belong to it.
- `photos/` holds the private evidence photos. They are never served directly from disk.

Deploy to a single Node.js server over HTTPS, with `DATA_DIR` on a volume that survives restarts
and redeploys. Serverless or ephemeral filesystems will lose data. To take a consistent backup
while the server is running, use SQLite's backup (for example
`sqlite3 pothole.db ".backup backup.db"`) instead of copying the file mid-write.

Schema migrations are applied automatically at startup. The server refuses to open a database
written by a newer schema.

## Known gaps (planned for later stages)

- The review page needs JavaScript. With JavaScript off, most review forms hang when submitted
  instead of saving. Approving works either way.
- Redaction is manual black boxes only. There is no automatic face or plate detection, per the
  plan.
- Real map tiles have not been tested yet, because no MapTiler key is configured. Everything
  else on the map page works without a key and was tested.

## Content-Security-Policy

`src/proxy.ts` adds a per-request, nonce-based CSP to every HTML page, using the policy
defined in `src/lib/csp.ts`.

- **Scripts** run only if they carry the nonce, plus the chunks those scripts load.
- **Third parties:** the only one is `https://api.maptiler.com`, for map tile images and the
  key check. It is listed in `CSP_THIRD_PARTY_ORIGINS`; add any new origin there.
- **Inline styles** are allowed because Leaflet positions the map with them.
- **Production** adds `upgrade-insecure-requests`, and drops `'unsafe-eval'` (development
  only).
- **Pages render per request:** the root layout calls `connection()`, so every page is rendered
  for each request and gets a fresh nonce.
- **Excluded:** the proxy skips `/api/*` and static assets. Upload bodies never pass through it,
  so they are never truncated at the 10 MB proxy body limit. It also does no authentication.
