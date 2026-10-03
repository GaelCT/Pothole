import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { requireAdminPage } from "@/lib/session";
import { listAllPotholesForAdmin, type AdminPothole } from "@/lib/potholes";
import { logout } from "@/app/actions/auth";
import { CreateRecordForm } from "./create-record-form";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

const REVIEW_LABELS: Record<AdminPothole["reviewStatus"], string> = {
  needs_review: "Needs review",
  verified: "Verified",
  rejected: "Rejected",
  duplicate: "Duplicate",
};

const REPORT_LABELS: Record<AdminPothole["reportStatus"], string> = {
  not_sent: "Not sent",
  approved_for_filing: "Approved for filing",
  filing: "Filing in progress",
  submitted: "Submitted",
  blocked: "Blocked",
  outcome_unknown: "Outcome unknown",
};

function privacyLabel(value: boolean | null): string {
  if (value === null) return "Undecided";
  return value ? "Private" : "Public";
}

export default async function AdminPage() {
  const admin = await requireAdminPage();
  const potholes = listAllPotholesForAdmin();

  return (
    <main>
      <header className="admin-header">
        <h1>Admin</h1>
        <nav aria-label="Admin">
          <Link href="/admin/reports">Reports</Link>
        </nav>
        <form action={logout}>
          <span className="hint">Signed in as {admin.username} </span>
          <button type="submit" className="secondary">
            Sign out
          </button>
        </form>
      </header>

      <section aria-labelledby="records-heading">
        <h2 id="records-heading">Records ({potholes.length})</h2>
        <p className="hint">
          Open a record to review its photo, pin, duplicates, and report draft. Rows marked DEV
          FIXTURE are development test data and must never be filed with the city.
        </p>
        {potholes.length === 0 ? (
          <p>No records yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Photo</th>
                  <th scope="col">Location</th>
                  <th scope="col">Coordinates</th>
                  <th scope="col">Observed</th>
                  <th scope="col">Review</th>
                  <th scope="col">City privacy</th>
                  <th scope="col">Public map</th>
                  <th scope="col">Report</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {potholes.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {/* unoptimized: the optimizer fetches without the admin
                          cookie, which would 404 on unpublished photos. */}
                      <Image
                        src={p.photoUrl}
                        alt={`Evidence photo: ${p.locationDescription}`}
                        width={96}
                        height={72}
                        unoptimized
                      />
                    </td>
                    <td>
                      {p.isFixture && <span className="badge fixture">DEV FIXTURE</span>}{" "}
                      {p.locationDescription}
                      {p.laneDirection && <div className="hint">{p.laneDirection}</div>}
                      <div className="hint mono">{p.id}</div>
                    </td>
                    <td className="mono">
                      {p.latitude}, {p.longitude}
                    </td>
                    <td className="mono">{p.observedAt}</td>
                    <td>
                      {REVIEW_LABELS[p.reviewStatus]}
                      {p.duplicateOf && (
                        <div className="hint mono">of {p.duplicateOf.slice(0, 8)}</div>
                      )}
                    </td>
                    <td>{privacyLabel(p.keepCityRequestPrivate)}</td>
                    <td>{p.isPublic ? "Shown" : "Hidden"}</td>
                    <td>{REPORT_LABELS[p.reportStatus]}</td>
                    <td>
                      <Link href={`/admin/potholes/${p.id}`}>
                        Review<span className="visually-hidden">: {p.locationDescription}</span>
                      </Link>
                      {p.reportStatus !== "not_sent" && p.reportStatus !== "blocked" && (
                        <>
                          {" · "}
                          <Link href={`/admin/potholes/${p.id}/file`}>
                            File<span className="visually-hidden">: {p.locationDescription}</span>
                          </Link>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="create-heading">
        <h2 id="create-heading">Add a record</h2>
        <p className="hint">
          New records enter the review queue unverified, unpublished, and with no privacy decision.
        </p>
        <CreateRecordForm />
      </section>
    </main>
  );
}
