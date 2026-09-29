import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Bakersfield pothole map (independent project)",
    template: "%s · Bakersfield pothole map",
  },
  description:
    "An independent map of reviewed pothole observations in Bakersfield, CA. Not an official City of Bakersfield service.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
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
