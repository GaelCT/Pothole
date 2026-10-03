import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/session";
import { getPotholeRow } from "@/lib/potholes";
import { UUID_RE } from "@/lib/photo-files";
import { formatPacificDateTime } from "@/lib/public-display";
import { getOpenAttempt, listAttemptsFor, startBlockers } from "@/lib/filing";
import { parseSnapshot } from "@/lib/review-rules";
import {
  AbandonedForm,
  CopyField,
  ExistingForm,
  FilingControls,
  StartFilingForm,
  SubmittedForm,
  UnknownForm,
} from "./filing-controls";
import { AttemptTable } from "@/app/admin/reports/attempt-table";

export const metadata: Metadata = {
  title: "File with the city",
  robots: { index: false, follow: false },
};

const CITY_FORM_URL = "https://bakersfieldca.citysourced.com/servicerequests/create";

export default async function FilingPage(props: PageProps<"/admin/potholes/[id]/file">) {
  await requireAdminPage();
  const { id } = await props.params;
  if (!UUID_RE.test(id)) notFound();
  const row = getPotholeRow(id);
  if (!row) notFound();

  const open = getOpenAttempt(id);
  const attempts = listAttemptsFor(id);
  // While filing, show exactly what the attempt locked in; otherwise the approval.
  const snapshot = parseSnapshot(open?.snapshot ?? row.approved_snapshot);
  const status = row.report_status;
  const blockers = status === "approved_for_filing" ? startBlockers(row) : [];
  const fixture = row.is_fixture === 1;
  const ext = row.redacted_photo_path?.split(".").pop() ?? "jpg";

  const showDraft =
    snapshot !== null &&
    (status === "filing" || status === "outcome_unknown" || (status === "approved_for_filing" && blockers.length === 0));

  return (
    <main>
      <p>
        <Link href={`/admin/potholes/${id}`}>← Back to review</Link> · <Link href="/admin/reports">Reports</Link>
      </p>
      <h1>{fixture && <span className="badge fixture">DEV FIXTURE</span>} File with the city</h1>
      <p className="hint mono">{id}</p>
      {fixture && (
        <p className="map-error">
          Test data. Do not submit this to the city. You can practise the steps here, then record
          &ldquo;not sent&rdquo;.
        </p>
      )}

      <FilingControls key={id} potholeId={id}>
        {status === "submitted" ? (
          <section aria-labelledby="done-heading">
            <h2 id="done-heading">Reported to the city</h2>
            <p>
              Recorded {formatPacificDateTime(row.submitted_at) ?? row.submitted_at}.{" "}
              {row.city_request_id || row.city_request_url ? (
                <>
                  City request:{" "}
                  {row.city_request_url ? (
                    <a href={row.city_request_url} target="_blank" rel="noopener noreferrer">
                      {row.city_request_id ?? "view on the city site"}
                    </a>
                  ) : (
                    row.city_request_id
                  )}
                  .
                </>
              ) : (
                "The city did not show a request number."
              )}
            </p>
            <p className="hint">Reported does not mean repaired. The record stays locked.</p>
          </section>
        ) : !showDraft ? (
          <section aria-labelledby="notready-heading">
            <h2 id="notready-heading">Not ready to file</h2>
            <ul>
              {(blockers.length > 0 ? blockers : ["Approve the draft on the review page first."]).map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            <p>
              <Link href={`/admin/potholes/${id}`}>Go to the review page</Link>
            </p>
          </section>
        ) : (
          <>
            <section aria-labelledby="step-heading">
              <h2 id="step-heading">
                {status === "approved_for_filing"
                  ? "1. Start filing"
                  : status === "filing"
                    ? "Filing in progress"
                    : "Outcome unknown: check the city's history"}
              </h2>
              {status === "approved_for_filing" && (
                <>
                  <p>
                    Starting locks the record so it can&apos;t be filed twice or edited while you fill in
                    the city&apos;s form.
                  </p>
                  <StartFilingForm />
                </>
              )}
              {status === "filing" && open && (
                <p>
                  Started {formatPacificDateTime(open.started_at)}.{" "}
                  {!fixture && (
                    <a href={CITY_FORM_URL} target="_blank" rel="noopener noreferrer">
                      Open the city&apos;s request form (new tab)
                    </a>
                  )}
                </p>
              )}
              {status === "outcome_unknown" && (
                <p>
                  An earlier attempt has no confirmed result. Look for this report in your request
                  history on the city site, then record what you find. A new attempt can&apos;t start until
                  you do.
                </p>
              )}
            </section>

            <section aria-labelledby="draft-heading">
              <h2 id="draft-heading">The approved report, in the city form&apos;s order</h2>
              <p className="hint">
                Exactly as approved. The record is locked while filing is open, so this can&apos;t change
                under you.
              </p>
              <ol className="draft-list">
                <li>
                  <strong>Select a Report Type:</strong> choose the pothole category. The exact option
                  hasn&apos;t been confirmed, so this site doesn&apos;t name one.
                </li>
                <li>
                  <strong>Where is the request?</strong> Set it with the city&apos;s map, then check its pin
                  matches this location.
                  <CopyField id="f-loc" label="Street description" value={snapshot.locationDescription} />
                  <CopyField id="f-coords" label="Coordinates" value={`${snapshot.latitude}, ${snapshot.longitude}`} />
                </li>
                <li>
                  <strong>Tell us more details:</strong>
                  <CopyField id="f-details" label="Details" value={snapshot.details} multiline />
                </li>
                <li>
                  <strong>Add photos:</strong>{" "}
                  <a href={`/api/photos/${id}`} download={`pothole-${id.slice(0, 8)}.${ext}`}>
                    Download the approved photo
                  </a>{" "}
                  <span className="hint">(metadata removed, redactions applied)</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="filing-photo" src={`/api/photos/${id}`} alt="Approved photo to attach" width={320} height={240} />
                </li>
                <li>
                  <strong>Privacy:</strong>{" "}
                  {snapshot.keepCityRequestPrivate
                    ? "check “Keep this request private”."
                    : "leave “Keep this request private” unchecked."}
                </li>
                <li>
                  <strong>Notification prompt:</strong> your choice. This site doesn&apos;t store your
                  contact details.
                </li>
              </ol>
            </section>

            {(status === "filing" || status === "outcome_unknown") && (
              <section aria-labelledby="outcome-heading">
                <h2 id="outcome-heading">2. Record what happened</h2>
                <SubmittedForm heading={status === "filing" ? "The city confirmed it" : "I found it in the city's history"} />
                <ExistingForm heading="The city already had this pothole" />
                {status === "filing" && <UnknownForm />}
                <AbandonedForm afterUnknown={status === "outcome_unknown"} />
              </section>
            )}
          </>
        )}
      </FilingControls>

      <section aria-labelledby="attempts-heading">
        <h2 id="attempts-heading">Filing attempts for this record</h2>
        {attempts.length === 0 ? <p>None yet.</p> : <AttemptTable attempts={attempts} />}
      </section>
    </main>
  );
}
