"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/actions/auth";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, undefined);

  return (
    <form action={formAction} className="stack" aria-describedby="login-error">
      <div className="field">
        <label htmlFor="username">Username</label>
        <input id="username" name="username" type="text" autoComplete="username" required />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <p id="login-error" className="error" role="alert" aria-live="assertive">
        {state?.error ?? ""}
      </p>
      <button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
