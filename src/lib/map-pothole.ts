/**
 * Client-safe shape and labels for public map records. No server imports:
 * this module ships to the browser.
 */
import type { ReportStatus } from "./db-core.ts";

/**
 * What the public is told about city reporting. Internal filing states
 * (approved_for_filing, filing, blocked) are not exposed; they all read as
 * "not yet reported". An unconfirmed attempt (outcome_unknown) is its own
 * category and is never counted as reported.
 */
export const REPORT_CATEGORIES = ["reported", "unconfirmed", "not_reported"] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
  reported: "Reported to the city",
  unconfirmed: "Report outcome not yet confirmed",
  not_reported: "Not yet reported",
};

export function reportCategoryFor(status: ReportStatus): ReportCategory {
  if (status === "submitted") return "reported";
  if (status === "outcome_unknown") return "unconfirmed";
  return "not_reported";
}

/** Display-ready record. Dates are formatted on the server to avoid hydration drift. */
export type MapPothole = {
  id: string;
  latitude: number;
  longitude: number;
  locationDescription: string;
  laneDirection: string | null;
  observedLabel: string;
  /** Pacific calendar date of the observation (YYYY-MM-DD), or null if unparseable. */
  observedDate: string | null;
  reportCategory: ReportCategory;
  /** Only set for records confirmed as reported. */
  submittedLabel: string | null;
  /** Only what the city actually displayed, and only for reported records. */
  cityRequestId: string | null;
  /** Already checked on the server to be an http(s) URL. */
  cityRequestUrl: string | null;
  photoUrl: string;
  isFixture: boolean;
};
