"use client";

import { useRef, useState } from "react";
import type { ComponentProps } from "react";

type SignInMode = "creator" | "admin";
type FormSubmitEvent = Parameters<
  NonNullable<ComponentProps<"form">["onSubmit"]>
>[0];

const SAFE_ERROR = "The identifier or secret could not be verified.";
const API_PREFIX = process.env.NEXT_PUBLIC_API_URL || "/api";

const isSafeReturnUrl = (value: string | null): value is string =>
  value !== null &&
  value.startsWith("/") &&
  !value.startsWith("//") &&
  !value.includes("\\");

export function SignInForm({ mode }: { readonly mode: SignInMode }) {
  const identifierRef = useRef<HTMLInputElement>(null);
  const secretRef = useRef<HTMLInputElement>(null);
  const [identifier, setIdentifier] = useState("");
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isAdmin = mode === "admin";
  const returnUrl =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("returnTo");
  const destination = isSafeReturnUrl(returnUrl)
    ? returnUrl
    : isAdmin
      ? "/admin"
      : "/workflow";

  const submit = async (event: FormSubmitEvent): Promise<void> => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    if (!identifier.trim()) {
      setError("Enter your identifier.");
      identifierRef.current?.focus();
      return;
    }
    if (!secret) {
      setError("Enter your secret.");
      secretRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(
        `${API_PREFIX}${isAdmin ? "/admin/sign-in" : "/sign-in"}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: identifier.trim(), password: secret }),
        },
      );
      if (!response.ok) {
        setError(SAFE_ERROR);
        setSecret("");
        secretRef.current?.focus();
        return;
      }
      window.location.assign(destination);
    } catch {
      setError(SAFE_ERROR);
      setSecret("");
      secretRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page" aria-labelledby="sign-in-title">
      <section className="auth-content">
        <header className="auth-heading">
          <span className="auth-mark" aria-hidden="true">
            ⌁
          </span>
          <h1 id="sign-in-title">CREATOR STUDIO</h1>
          <p>
            {isAdmin
              ? "Admin Authorization Required"
              : "Creator workspace access"}
          </p>
        </header>
        <section
          className="auth-card"
          aria-label={`${isAdmin ? "Admin" : "Creator"} sign in`}
        >
          <form
            data-control-id={`${isAdmin ? "admin_sign_in" : "admin_sign_in"}:1`}
            onSubmit={submit}
            noValidate
          >
            <div className="auth-field">
              <label htmlFor="identifier">Identifier</label>
              <input
                data-control-id="admin_sign_in:2"
                ref={identifierRef}
                id="identifier"
                name="identifier"
                type="email"
                autoComplete="username"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                aria-invalid={error !== null && !identifier.trim()}
              />
            </div>
            <div className="auth-field">
              <label htmlFor="secret">Secret</label>
              <div className="secret-input">
                <input
                  data-control-id="admin_sign_in:3"
                  ref={secretRef}
                  id="secret"
                  name="secret"
                  type={showSecret ? "text" : "password"}
                  autoComplete="current-password"
                  value={secret}
                  onChange={(event) => setSecret(event.target.value)}
                  aria-invalid={error !== null && !secret}
                />
                <button
                  className="reveal-button"
                  type="button"
                  onClick={() => setShowSecret((visible) => !visible)}
                  aria-pressed={showSecret}
                >
                  {showSecret ? "Hide" : "Reveal"}
                </button>
              </div>
            </div>
            <div
              className="auth-error"
              aria-label="Sign-in error"
              aria-live="polite"
              role="alert"
            >
              {error}
            </div>
            <button
              data-control-id="admin_sign_in:4"
              className="auth-submit"
              type="submit"
              disabled={busy}
            >
              {busy ? "Signing in..." : "Sign in"}
            </button>
          </form>
          <div className="auth-support">
            <a data-control-id="admin_sign_in:5" href="/support">
              Forgot Secret?
            </a>
            <a data-control-id="admin_sign_in:6" href="/support">
              Support
            </a>
          </div>
        </section>
      </section>
      <footer className="auth-footer">
        <span>© 2026 REFERENCE VIDEO STUDIO</span>
        <nav aria-label="Legal and service links">
          <a data-control-id="admin_sign_in:7" href="/privacy">
            Privacy
          </a>
          <a data-control-id="admin_sign_in:8" href="/legal">
            Legal
          </a>
          <a data-control-id="admin_sign_in:9" href="/api">
            API Status
          </a>
          <a data-control-id="admin_sign_in:10" href="/support">
            Security
          </a>
        </nav>
      </footer>
    </main>
  );
}
