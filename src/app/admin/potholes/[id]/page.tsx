import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/session";
import { getConfig } from "@/lib/config";
import { getPotholeRow, listDuplicatesOf, listNearbyPotholes } from "@/lib/potholes";
import { readPhoto, UUID_RE } from "@/lib/photo-files";
import { orientedSize, sha256Hex } from "@/lib/photo-processing";
import { formatPacificDateTime, getMapTilerKey } from "@/lib/public-display";
import {
  approvalBlockers,
  buildReportDescription,
  editLockReason,
  parseSnapshot,
  publicBlockers,
  snapshotMatches,
  type RedactionBox,
} from "@/lib/review-rules";
import { DetailsForm } from "./details-form";
import { RedactionEditor } from "./redaction-editor";
import {
  ApprovalControls,
  DecisionsForm,
  DuplicateByIdForm,
  DuplicateControls,
  MarkDuplicateButton,
  UnlinkDuplicateButton,
} from "./review-controls";

export const metadata: Metadata = {
  title: "Review record",
  robots: { index: false, follow: false },
};

const REVIEW_LABELS = {
  needs_review: "Needs review",
  verified: "Verified",
  rejected: "Rejected",
  duplicate: "Duplicate",
} as const;

function parseBoxes(json: string | null): RedactionBox[] {
  if (!json) return [];
  try {
    const value = JSON.parse(json);
    return Array.isArray(value) ? (value as RedactionBox[]) : [];
  } catch {
    return [];
  }
}

export default async function ReviewPage(props: PageProps<"/admin/potholes/[id]">) {
  await requireAdminPage();
  const { id } = await props.params;
  if (!UUID_RE.test(id)) notFound();
  const row = getPotholeRow(id);
  if (!row) notFound();

  const { dataDir, isProduction } = getConfig();
  const original = readPhoto(dataDir, row.photo_path).bytes;
  const size = await orientedSize(original);
  const currentSha = row.redacted_photo_path ? sha256Hex(readPhoto(dataDir, row.redacted_photo_path).bytes) : null;

  const lock = editLockReason(row);
  const nearby = listNearbyPotholes(row);
  const duplicates = listDuplicatesOf(row.id);
  const canonical = row.duplicate_of ? getPotholeRow(row.duplicate_of) : undefined;
  const publicReasons = publicBlockers(row, isProduction);
  const approvalReasons = approvalBlockers(row, isProduction);
  const snapshot = parseSnapshot(row.approved_snapshot);
  const snapshotStillValid = snapshot ? snapshotMatches(snapshot, row, currentSha) : false;
  const draftText = buildReportDescription({
    observedAt: row.observed_at,
    locationDescription: row.location_description,
    laneDirection: row.lane_direction,
    latitude: row.latitude,
    longitude: row.longitude,
  });
  const shown = snapshot ?? null;
  const reviewedUrl = row.redacted_photo_path
    ? `/api/photos/${row.id}?v=${encodeURIComponent(row.redacted_photo_path)}`
    : null;

  const decisionsDisabled =
    lock ?? (row.review_status === "duplicate" ? "This record is a duplicate. Unlink it to change its review decisions." : null);

  return (
    <main>
      <p>
        <Link href="/admin">← All records</Link>
      </p>
      <h1>
        {row.is_fixture === 1 && <span className="badge fixture">DEV FIXTURE</span>} Review record
      </h1>
      <p className="hint mono">{row.id}</p>
      <dl className="summary-list">
        <dt>Review</dt>
        <dd>{REVIEW_LABELS[row.review_status]}</dd>
        <dt>Observed</dt>
        <dd>{formatPacificDateTime(row.observed_at) ?? row.observed_at}</dd>
        <dt>Public map</dt>
        <dd>{publicReasons.length === 0 ? "Shown" : "Hidden"}</dd>
        <dt>Report</dt>
        <dd>{row.report_status.replaceAll("_", " ")}</dd>
      </dl>
      {row.is_fixture === 1 && (
        <p className="map-error">Development fixture. Never file this record with the city.</p>
      )}
      {lock && <p className="map-error">{lock}</p>}

      <section aria-labelledby="photo-heading">
        <h2 id="photo-heading">1. Photo</h2>
        <RedactionEditor
          potholeId={row.id}
          originalUrl={`/api/photos/${row.id}?variant=original`}
          reviewedUrl={reviewedUrl}
          width={size.width}
          height={size.height}
          initialBoxes={parseBoxes(row.redaction_boxes)}
          initiallyReviewed={row.photo_reviewed === 1}
          locked={lock !== null}
        />
      </section>

      <section aria-labelledby="location-heading">
        <h2 id="location-heading">2. Location and description</h2>
        <DetailsForm
          potholeId={row.id}
          initial={{
            latitude: row.latitude,
            longitude: row.longitude,
            locationDescription: row.location_description,
            laneDirection: row.lane_direction,
          }}
          nearby={nearby.map((n) => ({
            id: n.id,
            latitude: n.latitude,
            longitude: n.longitude,
            label: n.locationDescription,
          }))}
          mapKey={getMapTilerKey()}
          locked={lock !== null}
        />
      </section>

      <section aria-labelledby="duplicates-heading">
        <h2 id="duplicates-heading">3. Duplicates</h2>
        {/* One wrapper around both branches keeps the result message mounted. */}
        <DuplicateControls key={row.id} potholeId={row.id}>
        {row.review_status === "duplicate" ? (
          <div className="stack wide">
            <p>
              Duplicate of{" "}
              {canonical ? (
                <Link href={`/admin/potholes/${canonical.id}`}>{canonical.location_description}</Link>
              ) : (
                <span className="mono">{row.duplicate_of}</span>
              )}
              . It stays off the map and cannot be reported.
            </p>
            <UnlinkDuplicateButton disabled={lock !== null} />
          </div>
        ) : (
          <div className="stack wide">
            {duplicates.length > 0 && (
              <>
                <p>This is the main record for:</p>
                <ul>
                  {duplicates.map((d) => (
                    <li key={d.id}>
                      <Link href={`/admin/potholes/${d.id}`}>{d.locationDescription}</Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="hint">
              Records within 150 m. Nothing is merged automatically: two nearby potholes can be
              different potholes. Compare the photos before linking.
            </p>
            {nearby.length === 0 ? (
              <p>No other records nearby.</p>
            ) : (
              <ul className="nearby-list">
                {nearby.map((n) => {
                  const cannot =
                    n.duplicateOf !== null
                      ? "It is itself a duplicate."
                      : n.reviewStatus === "rejected"
                        ? "It is rejected."
                        : duplicates.length > 0
                          ? "Other records are linked to this one."
                          : null;
                  return (
                    <li key={n.id}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={n.photoUrl} alt={`Photo of nearby record: ${n.locationDescription}`} width={120} height={90} />
                      <div className="stack">
                        <span>
                          {n.isFixture && <span className="badge fixture">DEV FIXTURE</span>}{" "}
                          <Link href={`/admin/potholes/${n.id}`}>{n.locationDescription}</Link>
                        </span>
                        <span className="hint">
                          {n.distanceMeters} m away · {REVIEW_LABELS[n.reviewStatus]}
                        </span>
                        {cannot ? (
                          <span className="hint">Cannot be the main record: {cannot}</span>
                        ) : (
                          <MarkDuplicateButton
                            canonicalId={n.id}
                            label="this record"
                            disabled={lock !== null}
                          />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <details>
              <summary>Link to a record by id</summary>
              <DuplicateByIdForm disabled={lock !== null || duplicates.length > 0} />
            </details>
          </div>
        )}
        </DuplicateControls>
      </section>

      <section aria-labelledby="decisions-heading">
        <h2 id="decisions-heading">4. Review decisions</h2>
        <DecisionsForm
          potholeId={row.id}
          disabledReason={decisionsDisabled}
          initial={{
            reviewStatus: row.review_status === "duplicate" ? "needs_review" : row.review_status,
            locationVerified: row.location_verified === 1,
            cityServiceVerified: row.city_service_verified === 1,
            publishOnMap: row.publish_on_map === 1,
            keepCityRequestPrivate:
              row.keep_city_request_private === null ? null : row.keep_city_request_private === 1,
          }}
        />
        <h3>Public map</h3>
        {publicReasons.length === 0 ? (
          <p className="success">Shown on the public map.</p>
        ) : (
          <>
            <p>Hidden from the public map because:</p>
            <ul>
              {publicReasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section aria-labelledby="draft-heading">
        <h2 id="draft-heading">5. City report draft</h2>
        {snapshot && (
          <p className={snapshotStillValid ? "success" : "map-error"}>
            {snapshotStillValid
              ? `Approved ${formatPacificDateTime(row.approved_at) ?? ""}. Shown below exactly as approved.`
              : "The saved approval no longer matches this record or its photo. It cannot be filed."}
          </p>
        )}
        <p className="hint">In the order the city&apos;s form asks for it. Nothing here is sent anywhere.</p>
        <ol className="draft-list">
          <li>
            <strong>Report type:</strong> choose the pothole category on the city form. The exact
            option has not been confirmed yet, so the draft does not name one.
          </li>
          <li>
            <strong>Where is the request?</strong> {shown?.locationDescription ?? row.location_description}{" "}
            <span className="mono">
              ({shown?.latitude ?? row.latitude}, {shown?.longitude ?? row.longitude})
            </span>
            . Set it with the city map and check the city&apos;s pin matches.
          </li>
          <li>
            <strong>Tell us more details:</strong>
            <blockquote className="draft-text">{shown?.details ?? draftText}</blockquote>
          </li>
          <li>
            <strong>Photo:</strong>{" "}
            {row.redacted_photo_path ? "the saved, metadata-stripped copy above" : "no reviewed copy saved yet"}
          </li>
          <li>
            <strong>Privacy:</strong>{" "}
            {(shown ? shown.keepCityRequestPrivate : row.keep_city_request_private === 1)
              ? "check “Keep this request private”"
              : row.keep_city_request_private === null && !shown
                ? "not decided yet"
                : "leave “Keep this request private” unchecked"}
          </li>
        </ol>

        {row.report_status !== "approved_for_filing" && approvalReasons.length > 0 && (
          <>
            <p>Before this draft can be approved:</p>
            <ul>
              {approvalReasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </>
        )}
        <ApprovalControls
          potholeId={row.id}
          approved={row.report_status === "approved_for_filing"}
          canApprove={approvalReasons.length === 0}
          locked={lock !== null}
        />
      </section>
    </main>
  );
}
