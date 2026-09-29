import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Administrator sign-in",
  robots: { index: false, follow: false },
};

export default async function LoginPage() {
  if (await getAdminSession()) redirect("/admin");

  return (
    <main className="narrow">
      <h1>Administrator sign-in</h1>
      <p>
        This site has a single administrator account. There is no public sign-up, and visitors
        do not need an account to browse the map.
      </p>
      <LoginForm />
    </main>
  );
}
