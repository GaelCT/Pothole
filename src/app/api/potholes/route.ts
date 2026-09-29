import { connection } from "next/server";
import { listPublicPotholes } from "@/lib/potholes";

/** Public, read-only list of records that pass the visibility rule. */
export async function GET() {
  // Read the database per request, never at build time.
  await connection();
  return Response.json(
    { potholes: listPublicPotholes() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
