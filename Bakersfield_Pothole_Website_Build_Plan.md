# Bakersfield pothole map and city-reporting build plan

Prepared September 28, 2026.

## 1. Goal and boundaries

Build a website that shows verified potholes on a map, helps you review each location and photo, and prepares a city service request through the Bakersfield form. You approve the final submission. The website records the result.

This is a website implementation roadmap, not a model-training plan. Every software deliverable marked **[Claude Opus 5 — CREATE]** is assigned to your chosen coding assistant; no work has been sent to Claude or implemented by this document.

**Excluded:** model training, architecture changes, loading `best.pt`, inference, camera/video processing, GPS capture, image-to-GPS matching, and a detector-to-website connection. Your ML work stays separate. The website can be built and tested before the model is final.

**Change after Stage 5 (operator decision):** the site now has an admin-only dashcam page (`/admin/detect`).
- It plays a local video against a GPX track and interpolates the car's position between real track points.
- It never invents a position: outside the track or across a gap over 10 s, there is none.
- Hand-marked frames go to the review queue as unverified records with coordinates, time and photo filled in.
- Automatic detection is still not connected. When it is, it will run an exported `best.onnx` in the browser with `onnxruntime-web`, scanning about 2 frames per second and grouping repeat detections. That approach is approved but not built.
- Model training stays out of scope. GPS gives the car's position, so the Stage 4 pin review is still required.

**No fallbacks:** one stack, one map provider, one city-reporting route. Missing data or a broken dependency produces a visible error and stops that action. No alternate APIs, email reporting, automatic retries, fabricated coordinates, or simulated success. Human review is part of the normal workflow, not a backup route.

## 2. What the finished workflow looks like

The eventual system needs a pothole record containing a location, an observation time, and a real evidence photo. This plan starts at that record; producing it from the model is outside scope.

1. A record appears in the administrator's review list.
2. You inspect the photo and verify the actual pothole location and street description.
3. You check nearby existing records and identify duplicates.
4. A verified, publishable record appears as one map marker.
5. The website prepares a city-report draft from the verified information.
6. You approve the draft, and the website locks that exact snapshot for filing.
7. You fill and submit the city's form by hand from the copy-ready draft.
8. You record the visible outcome; the website stores confirmed receipt or an unresolved outcome.

Reporting is not repair. A submitted ticket must never automatically turn into a “fixed” pothole.

Important input requirement: the coordinates must identify the pothole, not simply where the camera car was when it saw it. A detector's bounding box does not provide geographic coordinates. Location accuracy remains a separate project dependency; Claude must not invent that integration here.

## 3. One proposed stack

| Component | Choice | Purpose |
| --- | --- | --- |
| Website and server | Next.js with TypeScript | Map, admin pages, and application routes in one project |
| Interactive map | Leaflet with MapTiler raster tiles | Display roads, verified pins, and a pin-editing control [3][4] |
| Database | SQLite on a persistent server volume | Store potholes, review decisions, and report attempts |
| Photos | Private files on that same persistent volume | Serve only approved media through controlled application routes |
| Deployment | One persistent Node.js server with HTTPS | Keep the database and photos between restarts |

**[Claude Opus 5 — CREATE]** Set up this stack, a single administrator account using maintained session-authentication components, environment configuration, and setup instructions. Keep all write operations administrator-only. No public sign-up or public reporting endpoint in this version.

The public map key must be restricted to the site's domains, with required map attribution displayed. Use the configured MapTiler account and its usage limits; do not switch providers automatically. The hosting environment must preserve the database and photos, rather than treating them as temporary deployment files.

## 4. Website pages Claude will create

| Deliverable | What it does | Completion check |
| --- | --- | --- |
| **[Claude Opus 5 — CREATE] Map page** | Bakersfield-centered map, one marker per verified canonical pothole, status/date filters, and a matching list | Selecting a list item selects the same map pin |
| **[Claude Opus 5 — CREATE] Pothole detail panel** | Photo, street description, observation date, and clearly labeled local/reporting status | No invented severity, dimensions, or repair estimates |
| **[Claude Opus 5 — CREATE] Admin review page** | Inspect evidence, adjust the pin, edit the street description, verify or reject a record, and link duplicates | Unreviewed records cannot be published or reported |
| **[Claude Opus 5 — CREATE] Report draft page** | Preview the exact category, location, description, attachment, and privacy choice to be sent | Required information is checked before preparation |
| **[Claude Opus 5 — CREATE] Reporting history** | Show submission time, actual city reference/link when available, and unresolved attempts | A failed or uncertain attempt never appears as successfully reported |

Public visitors can browse approved records, but cannot edit pins or trigger city reports. Use text labels alongside marker colors. The website must identify itself as an independent project, not an official City of Bakersfield service.

## 5. Minimum data structure

**[Claude Opus 5 — CREATE]** Two related tables: `potholes` and `report_attempts`. Do not build a model-upload endpoint. Use clearly labeled development fixtures and an admin record editor to test the website.

| Record information | Meaning |
| --- | --- |
| `id` | Stable identifier for the physical pothole record |
| `latitude`, `longitude` | Reviewer-confirmed pothole location; named fields prevent coordinate-order confusion |
| `location_description` | Street, nearest intersection, and lane/direction when actually known |
| `observed_at`, `photo_path` | Observation time with timezone and the reviewed evidence photo |
| `review_status`, `duplicate_of` | Needs review, verified, rejected, or duplicate; duplicate links to the canonical record |
| `location_verified`, `city_service_verified` | Reviewer confirmations that the pin is correct and the issue belongs in this city's reporting route |
| `publish_on_map`, `keep_city_request_private` | Explicit visibility decisions, not inferred from each other |
| `report_status` | Not sent, approved for filing, filing, submitted, blocked, or outcome unknown |
| `approved_snapshot`, `approved_at` | Exact fields/photo approved for reporting; edits invalidate approval |
| `city_request_id`, `city_request_url`, `receipt_evidence`, `submitted_at` | Actual confirmation evidence; do not invent a city ID if none is displayed |

Keep contact details, browser sessions, and authentication secrets out of public records. A record marked private for city reporting must also remain off the project's public map unless you explicitly change that publication decision after review. The city's privacy checkbox is not a promise of anonymity or legal confidentiality.

Before approving a photo, check for identifiable faces, license plates, and unnecessary embedded metadata. Use a reviewed, redacted copy for publication and city upload. Do not add a new vision model to perform this task.

Reject missing or invalid coordinates and missing evidence instead of putting a marker at a default location. A Bakersfield mailing address alone is not proof that the city maintains that road; the reporting review must confirm service responsibility.

### Duplicate handling

**[Claude Opus 5 — CREATE]** Display nearby existing pins during review so you can identify repeat observations. Linking a duplicate keeps one canonical marker and blocks a second city report for it. Reusing the same record ID must not create another record.

Do not automatically merge everything within a fixed distance: two nearby potholes can be distinct. This is website-level review and repeat-report prevention, not model tracking or GPS deduplication.

## 6. Mapping your five form steps to website data

City destination: [Bakersfield service-request form](https://bakersfieldca.citysourced.com/servicerequests/create).

The inspected page includes location selection, details, attachments, privacy, possible-duplicate handling, and login interfaces. The exact selectable pothole category and its category-specific questions were not established from the readable page. The operator confirms them on the live form while filing; the draft must not name a category it has not seen. [1]

Stage 1 added three qualifications. The attachment step carries a required marker, so a photo may be mandatory at the destination rather than only by this project's policy; treat that as apparent and unconfirmed. The label "Where is the request?" appears twice in the readable content, so the assumption that report type and location are cleanly separate steps is not yet verified. A notification-subscription prompt exists that this section originally missed, now added as step 6. Full unknown list at U1–U13 in `docs/stage-1-reporting-feasibility.md`.

| City form step | What the draft provides for manual entry | What the operator verifies |
| --- | --- | --- |
| 1. Report type | The actual pothole category offered by the site | Exact current option, not an invented category ID |
| 2. Location | The approved street location and map pin | City's selected position matches the verified pothole location |
| 3. Details | A factual description assembled from the reviewed record | Every question required for that category has a real answer |
| 4. Media | The approved pothole photo | Current format/size restrictions and successful attachment display |
| 5. Privacy | The explicitly approved private/public setting | Checkbox state matches the report preview |
| 6. Notification subscription | The deliberately chosen subscribe-or-decline state | Added during Stage 1: the live page presents a notification-subscription prompt this five-step map omitted. Operator decides deliberately |

**[Claude Opus 5 — CREATE]** A deterministic description builder, using this pattern:

> Pothole observed on {observation date and time} at {verified street/intersection}. {Verified lane or direction, when provided}. Location: {latitude}, {longitude}. Photo attached. Please inspect the roadway condition.

Omit optional lane information when it was not supplied; never guess it. Do not claim the model measured depth, determined emergency severity, or proved vehicle damage. Claude writes the template; no runtime LLM is needed to generate reports.

## 7. City reporting: manual filing from website drafts

**Decision, September 28, 2026:** the operator files every city report by hand. Automation stops at producing the draft. No script drives the city's form, so there is no Playwright component, no saved city login session, and no dependence on the unresolved automation-permission question from Stage 1. This decision replaces the earlier browser-script design.

**[Claude Opus 5 — CREATE]** An administrator-only filing page for one approved record at a time. It presents the draft in the order the city form asks for it, each field copy-ready, plus a download of the approved, redacted photo. The operator opens the city form in their own browser and enters the information there.

### Filing sequence

1. Confirm that the approved record is verified, location-confirmed, city-service-confirmed, and not already submitted, duplicate, or unresolved from a previous attempt.
2. Verify that the approval snapshot still matches the current record and photo. Any edit since approval blocks filing until the record is re-approved.
3. The operator clicks "Start filing." This opens a report attempt and locks the record, so a second tab or double click cannot start a second attempt.
4. The operator fills the city form by hand from the draft: category, location, details, photo, privacy, and the notification prompt (see section 6). The operator uses the site's own address/map controls and checks that the city's selected position matches the verified pothole.
5. If the city presents a possible duplicate, the operator reviews it. A confirmed existing city request is linked to the record instead of filing another.
6. The operator submits on the city site and returns to record the actual outcome: `submitted` with the request number, link, and a receipt screenshot when the city actually shows them, or `outcome_unknown` when the result is unclear, or abandoned when nothing was sent.
7. `outcome_unknown` blocks a new attempt until the operator checks the city's request history and reconciles it. There is no automatic retry.

A request ID is stored only when the city actually displayed one. Local locking prevents double filing from this website; it cannot guarantee exactly-once delivery to a third-party site.

### Operator conditions

- File genuine, reviewed reports only. No bulk filing, no scheduler.
- Handle the city's login, CAPTCHA, or verification yourself as a normal user.
- Uploaded content becomes the property of Granicus and/or the city under the OneView terms (Stage 1, section 2, clause 2.5). Upload only the reviewed, redacted copy.

If automated form filling is ever reconsidered, it requires written permission first, per `docs/stage-1-reporting-feasibility.md` section 2. It is not part of this plan.

## 8. Build order and ownership

| Stage | Claude Opus 5 creates | You provide or approve | Stage is finished when |
| --- | --- | --- | --- |
| 1. Confirm reporting feasibility — **complete; automation dropped in favor of manual filing** | Form-inspection checklist and exact field map → delivered in `docs/stage-1-reporting-feasibility.md` | Decision made: file by hand, so automation permission is no longer needed | Unknown required fields and submission constraints are documented; live automation remains gated if unresolved |
| 2. App foundation — **complete** | Project, database, private photos, admin authentication, development-only fixtures → see `README.md` | Map account configuration and chosen host — **still needed before Stage 3 / 6** | Records persist across restarts and public users cannot write |
| 3. Map interface — **complete (real tiles pending a MapTiler key)** | Map, filters/list, detail panel, status labels, plus a nonce-based CSP | Layout and displayed information; MapTiler key — **still needed** | Each approved record appears at its stored position with the correct photo |
| 4. Review and report drafting — **complete** | Pin editing, duplicate links, verification checks, draft builder, approval snapshots, plus metadata stripping and manual black-box redaction (decided September 29, 2026) | Real location/evidence decisions and privacy choice | Invalid, duplicate, or unreviewed reports are blocked |
| 5. Manual filing support — **complete** | Copy-ready filing page, photo download, attempt lock, outcome recording, reporting history | Filing each real report by hand on the city site | Approved draft data is presented exactly, and the actual outcome is recorded |
| 6. Test and deploy | Tests, deployment configuration, and a short operator guide | Approval of the tested website and one legitimate live report | Website and reporting workflow pass the checks below |

Model training stays outside every stage. The dashcam page (section 1, "Change after Stage 5") is built for hand-marking. Connecting the detector to it is the next model step and needs the exported `best.onnx`.

## 9. Acceptance tests

**[Claude Opus 5 — CREATE]** Tests against local fixtures; never send fake test reports to the city's production service. Fixture data is development-only and cannot enter live reporting.

1. A record's marker uses its exact latitude/longitude and opens its matching photo.
2. Unreviewed, rejected, duplicate, or private records are not publicly exposed.
3. Missing location, service confirmation, photo, or required details blocks reporting.
4. A duplicate is linked to one canonical record rather than producing another marker/report.
5. A double click or a second tab cannot start two active filing attempts for one record.
6. Editing any approved report field or photo invalidates the earlier approval.
7. The filing page shows exactly the approved snapshot, not the live record.
8. An `outcome_unknown` attempt blocks a new attempt until reconciled; nothing retries automatically.
9. A confirmed receipt produces `submitted`; a request ID is stored only when actually available.
10. Unauthenticated users cannot access private photos, draft data, secrets, or write routes.

After these pass and live-use permission is confirmed, conduct one explicitly approved real report with accurate evidence. Record what the city actually returned. Do not claim the pothole has been repaired based solely on that receipt.

## 10. Instructions to carry into Claude

Build only the items marked **[Claude Opus 5 — CREATE]**, one stage at a time. Use the single stack and reporting route above. Do not create model integration, extra services, fallback providers, guessed city APIs, auto-retry submission logic, or new product features. Ask for missing real-world information instead of inventing it. Do not build anything that operates the city's form; the operator files by hand. Deliver the website, manual-filing support, tests, and a concise setup guide—not another ML notebook.

## Sources and verification limits

The design choices and approval workflow are this plan's recommendations, not claims that Bakersfield requires this architecture.

1. [Bakersfield service-request form](https://bakersfieldca.citysourced.com/servicerequests/create) — readable form content checked for this plan; interactive category-specific controls were not exercised and no request was submitted.
2. [City of Bakersfield: Report an Issue](https://www.bakersfieldcity.us/report-an-issue) — official service-reporting entry point; service reporting is for non-emergency issues.
3. [Leaflet](https://leafletjs.com/) — interactive map library.
4. [MapTiler: Leaflet integration](https://docs.maptiler.com/leaflet/) — map-provider integration and API-key configuration.
5. (Removed: Playwright source, no longer used after the manual-filing decision.)
6. (Removed: Playwright authentication source, no longer used.)
7. [Bakersfield portal: Terms](https://bakersfieldca.citysourced.com/terms) — retrieved September 28, 2026 during Stage 1. Identifies the platform as Granicus OneView and its terms as last updated Nov 17, 2020. Automated-use permission remains unverified; the terms neither clearly grant nor unambiguously forbid it. Clause-level review in `docs/stage-1-reporting-feasibility.md`.
8. [Next.js documentation](https://nextjs.org/docs/app) — application framework selected for this plan.
