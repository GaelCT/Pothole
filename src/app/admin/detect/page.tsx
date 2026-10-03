import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminPage } from "@/lib/session";
import { getMapTilerKey } from "@/lib/public-display";
import { DetectWorkspace } from "./detect-workspace";

export const metadata: Metadata = {
  title: "Dashcam",
  robots: { index: false, follow: false },
};

export default async function DetectPage() {
  await requireAdminPage();
  return (
    <main>
      <p>
        <Link href="/admin">← All records</Link>
      </p>
      <h1>Dashcam footage</h1>
      <p>
        Load a drive&apos;s video and GPS track, line up their clocks, and mark potholes. Each marked
        frame goes to the review queue with its position, time and photo filled in. This page needs
        JavaScript.
      </p>
      <DetectWorkspace mapKey={getMapTilerKey()} />
    </main>
  );
}
