import { connection } from "next/server";
import { listPublicPotholes } from "@/lib/potholes";
import { getMapTilerKey, toMapPothole } from "@/lib/public-display";
import { PotholeExplorer } from "@/components/pothole-explorer";

export default async function Home() {
  // better-sqlite3 is synchronous: without this the query would run once at
  // build time and the page would never show new records.
  await connection();
  const potholes = listPublicPotholes().map(toMapPothole);
  const mapKey = getMapTilerKey();

  return (
    <main>
      <div className="intro">
        <h1>Bakersfield pothole map</h1>
        <p>
          An independent project that maps reviewed pothole observations in Bakersfield,
          California. It is not an official City of Bakersfield service.
        </p>
        <p>
          To report a pothole to the city yourself, use the city&apos;s{" "}
          <a href="https://www.bakersfieldcity.us/report-an-issue" rel="noopener noreferrer">
            Report an Issue
          </a>{" "}
          page.
        </p>
      </div>
      <PotholeExplorer potholes={potholes} mapKey={mapKey} />
    </main>
  );
}
