# Bakersfield pothole map and city-reporting build plan

Prepared September 28, 2026.

## 1. Goal and boundaries

Build a website that shows verified potholes on a map, helps you review each location and photo, and prepares a city service request through the Bakersfield form. You approve the final submission. The website records the result.

This is a website implementation roadmap, not a model-training plan. Every software deliverable marked **[Claude Opus 5 — CREATE]** is assigned to your chosen coding assistant; no work has been sent to Claude or implemented by this document.

**Excluded:** model training, architecture changes, loading `best.pt`, inference, camera/video processing, GPS capture, image-to-GPS matching, and a detector-to-website connection. Your ML work stays separate. The website can be built and tested before the model is final.

**No fallbacks:** one stack, one map provider, one city-reporting route. Missing data or a broken dependency produces a visible error and stops that action. No alternate APIs, email reporting, automatic retries, fabricated coordinates, or simulated success. Human review is part of the normal workflow, not a backup route.

## 2. What the finished workflow looks like

The eventual system needs a pothole record containing a location, an observation time, and a real evidence photo. This plan starts at that record; producing it from the model is outside scope.

1. A record appears in the administrator's review list.
2. You inspect the photo and verify the actual pothole location and street description.
3. You check nearby existing records and identify duplicates.
4. A verified, publishable record appears as one map marker.
5. The website prepares a city-report draft from the verified information.
6. The reporting script fills the city's form for that one record.
7. You review the populated form and explicitly authorize one submission.
8. The script captures the visible outcome; the website records confirmed receipt or an unresolved outcome.

Reporting is not repair. A submitted ticket must never automatically turn into a “fixed” pothole.

Important input requirement: the coordinates must identify the pothole, not simply where the camera car was when it saw it. A detector's bounding box does not provide geographic coordinates. Location accuracy remains a separate project dependency; Claude must not invent that integration here.

## 3. One proposed stack

| Component | Choice | Purpose |
| --- | --- | --- |
| Website and server | Next.js with TypeScript | Map, admin pages, and application routes in one project |
| Interactive map | Leaflet with MapTiler raster tiles | Display roads, verified pins, and a pin-editing control [3][4] |
| Database | SQLite on a persistent server volume | Store potholes, review decisions, and report attempts |
| Photos | Private files on that same persistent volume | Serve only approved media through controlled application routes |
| Form automation | Playwright with TypeScript | Operate a visible browser on your computer [5] |
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
| `report_status` | Not sent, preparing, ready for approval, submitting, submitted, blocked, or outcome unknown |
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

The inspected page includes location selection, details, attachments, privacy, possible-duplicate handling, and login interfaces. The exact selectable pothole category and its category-specific questions were not established from the readable page. Claude must inspect that live flow before implementing its selectors. [1]

Stage 1 added three qualifications. The attachment step carries a required marker, so a photo may be mandatory at the destination rather than only by this project's policy; treat that as apparent and unconfirmed. The label "Where is the request?" appears twice in the readable content, so the assumption that report type and location are cleanly separate steps is not yet verified. A notification-subscription prompt exists that this section originally missed, now added as step 6. Full unknown list at U1–U13 in `docs/stage-1-reporting-feasibility.md`.

| City form step | What the script fills | What must be verified |
| --- | --- | --- |
| 1. Report type | The actual pothole category offered by the site | Exact current option, not an invented category ID |
| 2. Location | The approved street location and map pin | City's selected position matches the verified pothole location |
| 3. Details | A factual description assembled from the reviewed record | Every question required for that category has a real answer |
| 4. Media | The approved pothole photo | Current format/size restrictions and successful attachment display |
| 5. Privacy | The explicitly approved private/public setting | Checkbox state matches the report preview |
| 6. Notification subscription | The deliberately chosen subscribe-or-decline state | Added during Stage 1: the live page presents a notification-subscription prompt this five-step map omitted. Policy must be decided by the operator, not chosen by the script |

**[Claude Opus 5 — CREATE]** A deterministic description builder, using this pattern:

> Pothole observed on {observation date and time} at {verified street/intersection}. {Verified lane or direction, when provided}. Location: {latitude}, {longitude}. Photo attached. Please inspect the roadway condition.

Omit optional lane information when it was not supplied; never guess it. Do not claim the model measured depth, determined emergency severity, or proved vehicle damage. Claude writes the template; no runtime LLM is needed to generate reports.

## 7. City form automation

**[Claude Opus 5 — CREATE]** One Playwright command that takes a record ID and processes one report at a time. It runs locally in a visible browser; the website itself cannot directly control the unrelated city website through ordinary page JavaScript.

The script reads the approved snapshot through an authenticated administrator-only application route and records its progress through that same application. Those routes belong to website reporting; they are not a model integration.

### Execution sequence

1. Confirm that the approved record is verified, location-confirmed, city-service-confirmed, and not already submitted, duplicate, or unresolved from a previous attempt.
2. Claim that report in the database so two invocations cannot work on it simultaneously. Verify that the approval still matches the current record and photo.
3. Open the specified city form in the operator's browser session. Use the authorized city account; the operator handles login and any required human verification.
4. Select the inspected pothole category and fill the five steps above. Use the site's normal address/map controls. Do not assume it accepts pasted coordinates or substitute the operator's current location.
5. Verify the selected location through the available UI. If the location cannot be reliably set and checked through the supported controls, stop this reporting attempt.
6. If the city presents a possible duplicate, stop for review. Never automatically choose the option that dismisses all matches. Link a confirmed existing city request instead of creating another.
7. Display the completed report for final approval. Require a deliberate confirmation for this specific report before clicking Submit once.
8. Observe the confirmation for this actual attempt. Capture the receipt and any request number/link the site really provides. Do not treat a Submit click, an HTTP success response alone, or hidden confirmation markup as proof of acceptance.
9. Update the website to `submitted` only after clear receipt evidence. If the browser fails or the response is ambiguous after clicking Submit, record `outcome_unknown` and block resubmission until the operator reconciles the city's request history.

Use stable, inspected labels/roles and normal Playwright waits, not guessed selectors or hard-coded screen coordinates. Playwright supports field filling, checkboxes, selection, and uploads. [5] Keep any saved login session private and out of source control because it may contain credentials. [6]

### Launch conditions, not alternate implementations

- Confirm that the city/provider permits this automated form use before enabling it against the live service. The terms page has now been retrieved and reviewed; permission is **still not established**. The portal runs Granicus OneView, so two parties are potentially in scope: the City of Bakersfield and Granicus, Inc. The terms name no automation prohibition, but they restrict interface use to consuming the offered service and require prior written permission from an authorized Granicus officer for some activity. See `docs/stage-1-reporting-feasibility.md` section 2. [7]
- Stop on CAPTCHA, MFA, access denial, rate limiting, unsupported category, or changed/unrecognized form controls. Do not bypass them or switch to an undocumented endpoint.
- Use the site's actual duplicate review and your own local submission lock. These reduce duplicates; they do not create a guarantee of exactly-once delivery to a third-party site.
- No unattended bulk submissions or scheduler in this version. Automation removes repetitive form filling; you remain responsible for verifying and approving each report.

Until these conditions are satisfied, city automation stays disabled. The website can still be developed and tested locally. This plan does not authorize sending a report now.

## 8. Build order and ownership

| Stage | Claude Opus 5 creates | You provide or approve | Stage is finished when |
| --- | --- | --- | --- |
| 1. Confirm reporting feasibility — **documentation complete, automation gated** | Form-inspection checklist and exact field map → delivered in `docs/stage-1-reporting-feasibility.md` | Authorized account access and confirmation of permitted automation — **still outstanding** | Unknown required fields and submission constraints are documented; live automation remains gated if unresolved |
| 2. App foundation | Project, database, private photos, admin authentication, development-only fixtures | Map account configuration and chosen host | Records persist across restarts and public users cannot write |
| 3. Map interface | Map, filters/list, detail panel, status labels | Layout and displayed information | Each approved record appears at its stored position with the correct photo |
| 4. Review and report drafting | Pin editing, duplicate links, verification checks, draft builder, approval snapshots | Real location/evidence decisions and privacy choice | Invalid, duplicate, or unreviewed reports are blocked |
| 5. Browser script | One-record form filler, approval pause, receipt capture, attempt lock | Final approval for each real submission | Verified data survives all five steps and the actual outcome is recorded |
| 6. Test and deploy | Tests, deployment configuration, and a short operator guide | Approval of the tested website and one legitimate live report | Website and reporting workflow pass the checks below |

Do not add model work to any stage. “Connect the final detector” remains a separate future project decision, not a hidden deliverable in this plan.

## 9. Acceptance tests

**[Claude Opus 5 — CREATE]** Tests against local fixtures and a local test form; never send fake test reports to the city's production service. Fixture data is development-only and cannot enter live reporting.

1. A record's marker uses its exact latitude/longitude and opens its matching photo.
2. Unreviewed, rejected, duplicate, or private records are not publicly exposed.
3. Missing location, service confirmation, photo, or required details blocks reporting.
4. A duplicate is linked to one canonical record rather than producing another marker/report.
5. A double click or concurrent script run cannot start two active submissions for one record.
6. Editing any approved report field or photo invalidates the earlier approval.
7. A city duplicate warning, expired login, or unknown form control stops the script without bypassing it.
8. A lost response after Submit leaves `outcome_unknown`; it never retries automatically.
9. A confirmed receipt produces `submitted`; a request ID is stored only when actually available.
10. Unauthenticated users cannot access private photos, draft data, secrets, or write routes.

After these pass and live-use permission is confirmed, conduct one explicitly approved real report with accurate evidence. Record what the city actually returned. Do not claim the pothole has been repaired based solely on that receipt.

## 10. Instructions to carry into Claude

Build only the items marked **[Claude Opus 5 — CREATE]**, one stage at a time. Use the single stack and reporting route above. Do not create model integration, extra services, fallback providers, guessed city APIs, auto-retry submission logic, or new product features. Ask for missing real-world information instead of inventing it. Stop live city reporting until its launch conditions are satisfied. Deliver the website, reporting script, tests, and a concise setup guide—not another ML notebook.

## Sources and verification limits

The design choices and approval workflow are this plan's recommendations, not claims that Bakersfield requires this architecture.

1. [Bakersfield service-request form](https://bakersfieldca.citysourced.com/servicerequests/create) — readable form content checked for this plan; interactive category-specific controls were not exercised and no request was submitted.
2. [City of Bakersfield: Report an Issue](https://www.bakersfieldcity.us/report-an-issue) — official service-reporting entry point; service reporting is for non-emergency issues.
3. [Leaflet](https://leafletjs.com/) — interactive map library.
4. [MapTiler: Leaflet integration](https://docs.maptiler.com/leaflet/) — map-provider integration and API-key configuration.
5. [Playwright: Actions](https://playwright.dev/docs/input) — browser form actions and file inputs.
6. [Playwright: Authentication](https://playwright.dev/docs/auth) — saved browser sessions and credential-safety warning.
7. [Bakersfield portal: Terms](https://bakersfieldca.citysourced.com/terms) — retrieved September 28, 2026 during Stage 1. Identifies the platform as Granicus OneView and its terms as last updated Nov 17, 2020. Automated-use permission remains unverified; the terms neither clearly grant nor unambiguously forbid it. Clause-level review in `docs/stage-1-reporting-feasibility.md`.
8. [Next.js documentation](https://nextjs.org/docs/app) — application framework selected for this plan.
