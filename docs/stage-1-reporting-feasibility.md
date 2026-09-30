# Stage 1 — Confirm reporting feasibility

Stage 1 deliverable from the build plan, section 8. Produced September 28, 2026.

**Scope of this document:** a form-inspection checklist and an exact field map with unknowns recorded as unknowns. This document does not implement automation, does not contain selectors invented from guesswork, and does not authorize any submission to the City of Bakersfield.

**Stage 1 exit condition (from the plan):** unknown required fields and submission constraints are documented; live automation remains gated if unresolved.

**Current status: GATED.** See section 2. The gate is a permissions question, not a technical one.

---

## 1. Provider identity — CONFIRMED

Previously the reporting destination was described only by its hostname. It is now established:

| Item | Value | Basis |
| --- | --- | --- |
| Reporting portal | `bakersfieldca.citysourced.com` | Plan source [1] |
| Software product | Granicus **OneView** | Terms of Use page, self-identified |
| Operator of software | Granicus, Inc. | Terms of Use page |
| Operator of the service | City of Bakersfield, as a Granicus "Partner Entity" | Terms of Use page |
| Governing terms | OneView Terms of Use, last updated Nov 17, 2020 | Retrieved September 28, 2026 |
| Dispute terms | Arbitration in Austin, TX; governed by Texas law | Terms of Use page |

This matters for Stage 1 because it means there are **two** parties whose permission is potentially in scope: the City of Bakersfield (the service operator you are reporting to) and Granicus (the software owner whose interface the script would drive). The plan's launch condition asked about "the city/provider." The answer is that they are separate entities with separate terms.

Source: [OneView Terms of Use](https://bakersfieldca.citysourced.com/terms)

## 2. Permission gate — the plan's open question, now answered

The build plan, section 7, stated the terms page "could not be retrieved during this review; permission is not established." That page has now been retrieved in full. **This resolves the retrieval failure but does not resolve the permission question in your favor.**

Findings, paraphrased from the OneView Terms of Use (content rephrased for compliance with licensing restrictions):

| # | Clause topic | What it says, in substance | Bearing on this project |
| --- | --- | --- | --- |
| 2.1 | Restrictions on use | Users are not to employ the product's user interfaces or APIs for any purpose beyond consuming the services the Partner Entity offers. | **Closest thing to an automation clause.** Ambiguous. Filing a genuine pothole report is arguably "consuming the service"; driving the UI with a script is arguably a purpose beyond it. Not resolvable by reading. |
| 2.2 | Data extraction | Any form of data extraction or data mining requires prior written permission from an authorized Granicus officer. | Your script captures receipt evidence and a request ID. Whether reading back your own submission's confirmation counts as extraction is unclear. |
| 2.3 | Unusual demands | Use that places atypical load on the service, outside normal operation, is prohibited. | Supports the plan's existing no-bulk-submission, one-at-a-time design. A human-paced single report is unlikely to trip this. |
| 2.4 | Broad content restriction | A sweeping prohibition on copying, altering, transmitting, or republishing any part of the applications. | Written broadly enough to be read against scripted interaction. Probably aimed at cloning the product, but the text is not narrow. |
| 2.5 | Ownership of submissions | Content users submit becomes the property of Granicus and/or the Partner Entity; the submitting user gives up ownership claims. | **Decision point for you.** Every evidence photo you upload, you cease to own. Relevant to the plan's photo-redaction step in section 5. |
| 2.6 | Security testing | Vulnerability scanning, penetration testing, and load or stress testing are prohibited. | Not what this project does. Noted to confirm it is out of scope. |
| 2.7 | No warranty / liability limits | Service provided as-is; broad liability disclaimer. | Reinforces that a submission receipt is not a guarantee of anything, consistent with the plan's refusal to equate a receipt with a repair. |

### What is absent from the terms

There is **no** explicit clause addressing browser automation, scripting, bots, or robots by name. There is also **no** clause granting permission for it. No `robots.txt` allowance or developer-API term was found that would cover this use.

### Honest assessment

The terms neither clearly permit nor unambiguously forbid what the plan describes. They contain no automation prohibition by name, but clause 2.1 restricts interface use to service consumption, and clause 2.2 conditions some activity on prior written permission. That is not a green light.

Per the plan's own no-fallbacks rule, the correct outcome is that **live city automation stays disabled** until permission is established affirmatively, in writing, by a party with authority to grant it.

**This is not legal advice.** I am flagging contract language, not interpreting it authoritatively. The clauses above are paraphrased; read the source before acting on them.

### Resolution path — requires you, not code

- [ ] Contact the City of Bakersfield about assisted or scripted filing of genuine service requests by a resident. Public Works or the Report an Issue program owner is the entry point.
- [ ] Ask specifically whether a resident may use a browser script to populate the OneView form when a human reviews and approves each individual submission.
- [ ] If the city defers to the vendor, request written confirmation from an authorized Granicus officer, which clause 2.2 explicitly contemplates.
- [ ] Record the answer, the date, and who gave it, in section 8 of this document.
- [ ] Decide whether clause 2.5, the surrender of ownership in uploaded photos, is acceptable to you.

If permission is declined or never obtained, the plan still has a viable shape: the website does verification, deduplication, photo redaction, and draft preparation, and you file each report by hand using the generated draft. Stages 2 through 4 and stage 6 are unaffected. Only stage 5 is blocked.

## 3. What the readable form page establishes — CONFIRMED

Retrieved from the create-request page without interacting with any control and without submitting anything. These are visible labels and interface strings, **not selectors.**

| Observed interface text | Apparent role |
| --- | --- |
| "Service Requests" / "Submit a request" | Page heading |
| "Where is the request?" with a "Select one..." chooser | Appears twice. One instance accompanies a dropdown; the other accompanies a "Select Location" control. See the warning below. |
| "Select Location" | Location-selection entry point |
| "Back" | Step navigation, implying a multi-step wizard |
| "Tell us more details" | Free-text details step |
| "Add photos, videos, or audio" / "Attach a file." | Media step; accepts more than stills |
| "Privacy" / "Keep this request private" | Privacy checkbox, matching the plan's step 5 |
| "Would you like to subscribe to receive notifications when this ticket is updated?" / "No, Thank You." | **Notification-subscription prompt. Not in the plan's five-step map.** |
| "Log In to Account" | Authentication interface |
| "Sorry! The email submitted appears to be invalid." | Client-side email validation message |
| "Submitting Service Request..." / "Uploading Attachments..." / "Please don't close this window." | Progress states during submission |
| "Knowledge Base" with a "Loading..." region | Dynamically loaded panel, possibly the suggestion or possible-duplicate feature |

### Three findings that change the plan

**Finding A — there is a sixth step.** The plan maps five form steps. The page shows a notification-subscription prompt with a "No, Thank You." dismissal. The script's sequence in plan section 7 has no instruction for it, so it would stall there. The step map in section 6 needs a sixth row.

**Finding B — the media step may be mandatory.** The attachment step's label carries a required marker in the readable content. If media is genuinely required, then the plan's rule that a missing photo blocks reporting is not merely a self-imposed policy, it is a hard constraint of the destination form. Treat this as *apparent, unconfirmed*: required-field markers in statically read content are unreliable, since conditional logic and styling are not captured.

**Finding C — "Where is the request?" is ambiguous.** The same label appears twice, once near a generic chooser and once near location selection. Whether the category/type selector shares this label, or whether the readable content collapsed two distinct sections, cannot be determined without live inspection. The plan assumes a distinct "report type" step; that assumption is not yet verified.

### Update, September 29, 2026: screenshot of the live form

The operator shared a screenshot of the create-request page as rendered in a browser. It shows:

- Five numbered steps: **1. Select a Report Type** (required, opens a chooser), **2. Where is the request?** (required, Mapbox map with "Select Location" and a locate-me arrow), **3. Tell us more details** (required), **4. Add photos, videos, or audio** (attachment button, **no required marker**), **5. Privacy** ("Keep this request private"), then **SUBMIT**.
- **Finding C is resolved:** the report type is its own first step, separate from location.
- **Finding B is corrected:** in the rendered form the media step is optional. Requiring a photo is this project's policy, not the city's.
- **U4 is partly answered:** location is set on a map. No coordinate text field is visible.
- The notification prompt (Finding A) is not visible before submitting. It likely appears after SUBMIT; still unconfirmed.
- **U1 is still open:** the report-type options were not shown. The Stage 4 draft does not name a category for that reason.

## 4. What remains UNKNOWN

Nothing in this section may be guessed. Each item is answerable only by authorized inspection of the live flow.

| # | Unknown | Why it blocks implementation |
| --- | --- | --- |
| U1 | The exact pothole category label and its value, as offered in the live chooser | The script cannot select a category that has not been observed. No category ID may be invented. |
| U2 | Category-specific follow-up questions triggered by that selection | Unknown required questions mean unknown required answers. |
| U3 | Which fields are truly required, versus apparently required | Determines what the draft builder must guarantee before approval. |
| U4 | How the location control accepts input: address typing, map pin drag, geolocation, or some combination | The plan already warns against assuming pasted coordinates are accepted. Still unverified. |
| U5 | Whether a selected location can be read back for verification through the interface | Plan section 7 step 5 requires stopping if location cannot be confirmed. Feasibility of that check is unknown. |
| U6 | Accepted file formats, maximum file size, and maximum attachment count | Redaction and re-encoding must target real limits. |
| U7 | Whether an account is required to submit, or whether guest submission is permitted | Determines whether a saved authenticated session is needed at all. |
| U8 | Whether login involves MFA, CAPTCHA, or email verification | Any of these is a hard stop per the plan. |
| U9 | What the "Knowledge Base" panel loads, and whether it is the duplicate-warning mechanism | The plan requires stopping on a duplicate warning. The trigger must be identifiable. |
| U10 | The confirmation screen's content: whether a request number or link is actually shown | The plan forbids inventing a request ID. If none is displayed, `city_request_id` must stay null. |
| U11 | Whether the notification prompt is skippable and what dismissing it does | New, from Finding A. |
| U12 | Stable accessible roles and names for each control | Required by the plan's instruction to use inspected labels and roles, not guessed selectors. |
| U13 | Any rate limiting on submissions per account, per address, or per time window | Affects whether even human-paced use has a ceiling. |

## 5. Exact field map — template, unfilled

This is the Stage 1 artifact the plan calls for. It is deliberately unfilled in the selector column. Fill it only from authorized live observation.

Legend: `TBD-LIVE` means the value must come from inspection. Leaving a `TBD-LIVE` in place means stage 5 stays blocked for that field.

### Step 1 — Report type / category

| Attribute | Value |
| --- | --- |
| Source record field | none; fixed choice |
| Control type | `TBD-LIVE` |
| Accessible name | `TBD-LIVE` |
| Exact pothole option label | `TBD-LIVE` — do not invent |
| Option value / ID | `TBD-LIVE` |
| Required | Presumed yes; confirm |
| Triggers follow-up questions | `TBD-LIVE` (U2) |
| Verification after fill | Selected option's visible text equals the observed pothole label |

### Step 2 — Location

| Attribute | Value |
| --- | --- |
| Source record fields | `latitude`, `longitude`, `location_description` |
| Input method | `TBD-LIVE` (U4) |
| Accepts typed address | `TBD-LIVE` |
| Accepts raw coordinates | `TBD-LIVE` — plan says do not assume yes |
| Map pin adjustable | `TBD-LIVE` |
| Read-back available for verification | `TBD-LIVE` (U5) |
| Required | Yes, per visible required marker |
| Verification after fill | Location shown by the city form corresponds to the reviewer-verified pothole position. If unverifiable, **stop the attempt.** |

### Step 3 — Details

| Attribute | Value |
| --- | --- |
| Source | Deterministic description builder, plan section 6 |
| Accessible name | Observed label: "Tell us more details" |
| Control type | `TBD-LIVE`, presumed textarea |
| Maximum length | `TBD-LIVE` |
| Required | Yes, per visible required marker |
| Category-specific extra questions | `TBD-LIVE` (U2) |
| Verification after fill | Field content matches `approved_snapshot` exactly, character for character |

### Step 4 — Media

| Attribute | Value |
| --- | --- |
| Source record field | `photo_path`, redacted copy only |
| Accessible name | Observed label: "Add photos, videos, or audio" |
| Control type | File input, per "Attach a file." |
| Accepted formats | `TBD-LIVE` (U6) |
| Size limit | `TBD-LIVE` (U6) |
| Max count | `TBD-LIVE` (U6) |
| Required | **Apparently yes** — see Finding B; confirm |
| Verification after fill | The form visibly shows the attachment as successfully attached, not merely that the input accepted a path |

### Step 5 — Privacy

| Attribute | Value |
| --- | --- |
| Source record field | `keep_city_request_private` |
| Accessible name | Observed label: "Keep this request private" |
| Control type | Checkbox |
| Default state | `TBD-LIVE` |
| Required | No |
| Verification after fill | Checkbox state equals the approved value in the report preview. Note: the plan already records that this checkbox is not a guarantee of anonymity or legal confidentiality. Terms clause 2.5 reinforces that. |

### Step 6 — Notification subscription — NEW, from Finding A

| Attribute | Value |
| --- | --- |
| Source record field | none; project policy decision needed |
| Observed prompt | "Would you like to subscribe to receive notifications when this ticket is updated?" |
| Observed dismissal | "No, Thank You." |
| Control type | `TBD-LIVE` (U11) |
| Required | `TBD-LIVE` |
| Policy decision for you | Subscribing may be the only way to learn the city's status updates, which would feed reporting history. It also means supplying contact details, which the plan's data rules keep out of public records. Decide deliberately; do not let the script pick. |
| Verification after fill | Chosen state matches the recorded policy |

### Confirmation capture

| Attribute | Value |
| --- | --- |
| Confirmation indicator | `TBD-LIVE` (U10) |
| Request number displayed | `TBD-LIVE` — if absent, leave `city_request_id` null |
| Request URL displayed | `TBD-LIVE` |
| Receipt evidence to capture | Screenshot plus the confirmation's visible text |
| Ambiguous outcome handling | Record `outcome_unknown`, block resubmission, reconcile by hand. Never auto-retry. |

## 6. Inspection procedure — read-only, no submission

When you have permission per section 2, work through this once, by hand, with no script running.

1. Open the create-request page in an ordinary browser. Do not run Playwright for this pass.
2. Before touching anything, open developer tools and note whether the page is client-rendered. The readable content suggests controls are populated by script, which is why static reading could not answer U1.
3. Open the category chooser. Record **every** option label verbatim. Identify the pothole option exactly, including capitalization and any wording like "street" or "roadway" rather than "pothole."
4. Select it. Screenshot whatever new questions appear. That answers U2.
5. Work the location control. Try typing an address. Note whether coordinates are accepted anywhere. Note whether the resulting position can be read back as text. That answers U4 and U5.
6. Record the details field's control type and any character counter or length cap.
7. Inspect the file input's `accept` attribute and any stated size limit. Attach a harmless test image to observe the success state, but **do not submit.** That answers U6.
8. Note the privacy checkbox's default.
9. Note how the notification prompt appears and whether it can be dismissed. That answers U11.
10. Observe whether the Knowledge Base panel produces suggestions or duplicate warnings as you fill the form. That answers U9.
11. For each control, record its accessible role and name, the values Playwright would target. That answers U12.
12. Determine whether submission requires an account, and whether login presents MFA or CAPTCHA. That answers U7 and U8.
13. **Abandon the form without submitting.** Close the tab. Nothing in this procedure sends a request.
14. Transfer every observation into section 5, replacing `TBD-LIVE`. Leave anything still unobserved as `TBD-LIVE` rather than filling it with a plausible guess.

To learn the confirmation format at U10, the only honest route is the single, explicitly approved, genuine report the plan defers to stage 6. Do not file a fake report to discover the receipt format; the plan forbids it and it would put false data in the city's queue.

## 7. Stage 1 completion checklist

Documentation deliverables, which is what Stage 1 actually requires:

- [x] Provider and governing terms identified
- [x] Terms of Use retrieved and reviewed; the plan's retrieval gap closed
- [x] Permission question stated precisely, with a resolution path
- [x] Readable form content catalogued
- [x] Unknowns enumerated as U1 through U13, none guessed
- [x] Exact field map drafted with explicit unfilled slots
- [x] Read-only inspection procedure written
- [x] Discrepancies against the plan recorded: Findings A, B, C

Requiring you, and blocking stage 5 only:

- [ ] Written permission obtained, or automation formally abandoned in favor of manual filing
- [ ] Authorized account access confirmed
- [ ] Section 5 filled from live inspection
- [ ] Decision recorded on terms clause 2.5, ownership of uploaded photos
- [ ] Notification-subscription policy decided

**Stage 1 is complete as a documentation deliverable. Live automation remains gated, which is the outcome the plan's exit condition anticipated.** Stages 2, 3, 4, and 6 are not blocked by this and can proceed.

## 8. Permission determination record — to be filled

Leave blank until an actual answer exists. An empty section here means automation stays off.

| Field | Value |
| --- | --- |
| Date asked | |
| Party asked | |
| Contact name and role | |
| Question as posed | |
| Answer received | |
| Date answered | |
| Written evidence location | |
| Outcome | not yet sought |

## Sources

1. [OneView Terms of Use](https://bakersfieldca.citysourced.com/terms) — retrieved September 28, 2026. Previously unretrievable per the build plan. All clause summaries in section 2 paraphrase this page; content was rephrased for compliance with licensing restrictions.
2. [Bakersfield service-request form](https://bakersfieldca.citysourced.com/servicerequests/create) — readable content only. No control was operated and no request was submitted during this review.
3. [City of Bakersfield: Report an Issue](https://www.bakersfieldcity.us/report-an-issue) — official entry point, per the build plan.
