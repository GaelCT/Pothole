import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { listReportedPublicPotholes } from "@/lib/potholes";
import { ReportedPotholesMap, type MapPothole } from "@/components/reported-potholes-map";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Administrator sign-in",
  robots: { index: false, follow: false },
};

// Bakersfield local time, formatted on the server so every visitor sees the same text.
const dateFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : `${dateFormat.format(time)} Pacific`;
}

/** Only http(s) links are rendered; anything else is dropped, not rewritten. */
function safeHttpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

export default async function LoginPage() {
  if (await getAdminSession()) redirect("/admin");

  const reported: MapPothole[] = listReportedPublicPotholes().map((p) => ({
    id: p.id,
    latitude: p.latitude,
    longitude: p.longitude,
    locationDescription: p.locationDescription,
    laneDirection: p.laneDirection,
    observedLabel: formatDate(p.observedAt) ?? p.observedAt,
    submittedLabel: formatDate(p.submittedAt),
    cityRequestId: p.cityRequestId,
    cityRequestUrl: safeHttpUrl(p.cityRequestUrl),
    photoUrl: p.photoUrl,
    isFixture: p.isFixture,
  }));
  // The key is public by design (it ships to the browser); restrict it to this
  // site's domains in the MapTiler dashboard.
  const mapKey = process.env.MAPTILER_KEY?.trim() || null;

  return (
    <>
      <main className="narrow">
        <h1>Administrator sign-in</h1>
        <p>
          This site has a single administrator account. There is no public sign-up, and visitors
          do not need an account to browse the map.
        </p>
        <LoginForm />
      </main>

      <section className="map-section" aria-labelledby="reported-heading">
        <h2 id="reported-heading">Potholes reported to the city</h2>
        <p className="hint">
          Reviewed potholes whose city service request was confirmed as submitted. A report is not
          a repair; this site does not track the city&apos;s work status.
        </p>
        <ReportedPotholesMap potholes={reported} mapKey={mapKey} />
      </section>
    </>
  );
}
