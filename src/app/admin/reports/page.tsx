import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminPage } from "@/lib/session";
import { listAllAttempts, listByReportStatus } from "@/lib/filing";
import { formatPacificDateTime } from "@/lib/public-display";
import type { PotholeRow } from "@/lib/db-core";
import { AttemptTable } from "./attempt-table";

export const metadata: Metadata = {
  title: "Reports",
  robots: { index: false, follow: false },
};

function Queue({ id, title, empty, rows, hint }: { id: string; title: string; empty: string; rows: PotholeRow[]; hint?: string }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id}>
        {title} ({rows.length})
      </h2>
      {hint && <p className="hint">{hint}</p>}
      {rows.length === 0 ? (
        <p>{empty}</p>
      ) : (
        <ul>
          {rows.map((r) => (
            <li key={r.id}>
              {r.is_fixture === 1 && <span className="badge fixture">DEV FIXTURE</span>}{" "}
              <Link href={`/admin/potholes/${r.id}/file`}>{r.location_description}</Link>{" "}
              <span className="hint">updated {formatPacificDateTime(r.updated_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function ReportsPage() {
  await requireAdminPage();
  return (
    <main>
      <p>
        <Link href="/admin">← All records</Link>
      </p>
      <h1>Reports</h1>
      <Queue
        id="unknown-heading"
        title="Outcome unknown"
        rows={listByReportStatus("outcome_unknown")}
        empty="None."
        hint="Check the city's request history for each of these before anything else."
      />
      <Queue id="filing-heading" title="Filing in progress" rows={listByReportStatus("filing")} empty="None." />
      <Queue id="ready-heading" title="Ready to file" rows={listByReportStatus("approved_for_filing")} empty="No approved drafts." />
      <section aria-labelledby="history-heading">
        <h2 id="history-heading">History</h2>
        <p className="hint">
          Every filing attempt. Only &ldquo;Submitted&rdquo; and &ldquo;Existing city request linked&rdquo;
          count as reported. Reported does not mean repaired.
        </p>
        {(() => {
          const all = listAllAttempts();
          return all.length === 0 ? <p>No filing attempts yet.</p> : <AttemptTable attempts={all} showRecord />;
        })()}
      </section>
    </main>
  );
}
