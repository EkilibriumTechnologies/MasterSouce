"use client";

import { useEffect, useState } from "react";

type CallbackState = "verifying" | "error";

export default function AuthCallbackPage() {
  const [state, setState] = useState<CallbackState>("verifying");
  const [message, setMessage] = useState("Signing you in…");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hash.get("access_token");
      const errorDescription = hash.get("error_description");

      if (errorDescription) {
        if (!cancelled) {
          setState("error");
          setMessage(errorDescription);
        }
        return;
      }

      if (!accessToken) {
        if (!cancelled) {
          setState("error");
          setMessage("This sign-in link is invalid or expired.");
        }
        return;
      }

      try {
        const res = await fetch("/api/auth/complete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ accessToken })
        });
        const payload = (await res.json()) as { error?: string };
        if (!res.ok) {
          throw new Error(payload.error ?? "Unable to sign in.");
        }
        window.history.replaceState({}, "", "/projects");
        window.location.assign("/projects");
      } catch (error) {
        if (!cancelled) {
          setState("error");
          setMessage(error instanceof Error ? error.message : "Unable to sign in.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-black px-6 py-24 text-white">
      <div className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center">
        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">
          MasterSauce Account
        </div>
        <h1 className="mt-3 text-3xl font-semibold">
          {state === "verifying" ? "Verifying your sign-in" : "Sign-in link problem"}
        </h1>
        <p className="mt-4 text-sm leading-6 text-white/65">{message}</p>
        {state === "error" ? (
          <a
            href="/projects"
            className="mt-7 inline-flex rounded-full bg-white px-5 py-3 text-sm font-semibold text-black"
          >
            Back to My Songs
          </a>
        ) : null}
      </div>
    </main>
  );
}
