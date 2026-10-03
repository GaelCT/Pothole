import Link from "next/link";
import type { ReportAttemptRow } from "@/lib/db-core";
import { formatPacificDateTime } from "@/lib/public-display";

type Row = ReportAttemptRow & { location_description?: string; is_fixture?: 0 | 1 };

export function outcomeLabel(a: ReportAttemptRow): string {
  if (a.outcome === "submitted") return a.linked_existing ? "Existing city request linked" : "Submitted";
  if (a.outcome === "in_progress") return "In progress";
  if (a.outcome === "outcome_unknown") return "Outcome unknown";
  return "Not sent";
}

/** Attempt history. A failed or uncertain attempt is never labeled as reported. */
export function AttemptTable({ attempts, showRecord = false }: { attempts: Row[]; showRecord?: boolean }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {showRecord && <th scope="col">Record</th>}
            <th scope="col">Started</th>
            <th scope="col">Finished</th>
            <th scope="col">Outcome</th>
            <th scope="col">City reference</th>
            <th scope="col">Receipt</th>
            <th scope="col">Notes</th>
          </tr>
        </thead>
        <tbody>
          {attempts.map((a) => (
            <tr key={a.id}>
              {showRecord && (
                <td>
                  {a.is_fixture === 1 && <span className="badge fixture">DEV FIXTURE</span>}{" "}
                  <Link href={`/admin/potholes/${a.pothole_id}/file`}>{a.location_description}</Link>
                </td>
              )}
              <td>{formatPacificDateTime(a.started_at) ?? a.started_at}</td>
              <td>{a.finished_at ? (formatPacificDateTime(a.finished_at) ?? a.finished_at) : "—"}</td>
              <td>{outcomeLabel(a)}</td>
              <td>
                {a.city_request_url ? (
                  <a href={a.city_request_url} target="_blank" rel="noopener noreferrer">
                    {a.city_request_id ?? "Link"}
                  </a>
                ) : (
                  (a.city_request_id ?? (a.outcome === "submitted" ? "None shown" : "—"))
                )}
              </td>
              <td>
                {a.receipt_evidence ? (
                  <a href={`/api/admin/receipts/${a.id}`} target="_blank" rel="noopener noreferrer">
                    View
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td className="notes-cell">{a.notes ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
