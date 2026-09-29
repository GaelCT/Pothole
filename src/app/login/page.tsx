import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { listReportedPublicPotholes } from "@/lib/potholes";
import { getMapTilerKey, toMapPothole } from "@/lib/public-display";
import { ReportedPotholesMap } from "@/components/reported-potholes-map";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Administrator sign-in",
  robots: { index: false, follow: false },
};

export default async function LoginPage() {
  if (await getAdminSession()) redirect("/admin");

  const reported = listReportedPublicPotholes().map(toMapPothole);
  const mapKey = getMapTilerKey();

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
