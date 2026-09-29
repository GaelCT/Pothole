import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Bakersfield pothole map (independent project)",
    template: "%s · Bakersfield pothole map",
  },
  description:
    "An independent map of reviewed pothole observations in Bakersfield, CA. Not an official City of Bakersfield service.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The CSP from src/proxy.ts carries a per-request nonce that Next.js stamps
  // onto its <script> tags while rendering. A prerendered (static) page would
  // ship un-nonced scripts that the policy blocks, so every page under this
  // layout, including the built-in not-found page, must render per request.
  await connection();

  return (
    <html lang="en">
      <body>
        <a href="#content" className="skip-link">
          Skip to content
        </a>
        <div id="content">{children}</div>
        <footer className="site-footer">
          <p>
            Independent community project. Not affiliated with, endorsed by, or operated by the
            City of Bakersfield. <Link href="/login">Admin</Link>
          </p>
        </footer>
      </body>
    </html>
  );
}
