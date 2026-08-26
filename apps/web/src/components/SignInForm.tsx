"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import type { ComponentProps } from "react";
import { BrandLogo } from "./Shells";

type SignInMode = "creator" | "admin";
type FormSubmitEvent = Parameters<
  NonNullable<ComponentProps<"form">["onSubmit"]>
>[0];
type ErrorKey = "missingIdentifier" | "missingSecret" | "safeError";

const API_PREFIX = process.env.NEXT_PUBLIC_API_URL || "/api";

const isSafeReturnUrl = (value: string | null): value is string =>
  value !== null &&
  value.startsWith("/") &&
  !value.startsWith("//") &&
  !value.includes("\\");

export function SignInForm({ mode }: { readonly mode: SignInMode }) {
  const t = useTranslations("SignInForm");
  const identifierRef = useRef<HTMLInputElement>(null);
  const secretRef = useRef<HTMLInputElement>(null);
  const [identifier, setIdentifier] = useState("");
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);
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
      : "/";

  const submit = async (event: FormSubmitEvent): Promise<void> => {
    event.preventDefault();
    if (busy) return;
    setErrorKey(null);
    if (!identifier.trim()) {
      setErrorKey("missingIdentifier");
      identifierRef.current?.focus();
      return;
    }
    if (!secret) {
      setErrorKey("missingSecret");
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
        setErrorKey("safeError");
        setSecret("");
        secretRef.current?.focus();
        return;
      }
      window.location.assign(destination);
    } catch {
      setErrorKey("safeError");
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
          <BrandLogo />
          <h1 id="sign-in-title">{t("title")}</h1>
          <p>{isAdmin ? t("adminSubtitle") : t("creatorSubtitle")}</p>
        </header>
        <section
          className="auth-card"
          aria-label={isAdmin ? t("adminAriaLabel") : t("creatorAriaLabel")}
        >
          <form
            data-control-id={`${isAdmin ? "admin_sign_in" : "admin_sign_in"}:1`}
            onSubmit={submit}
            noValidate
          >
            <div className="auth-field">
              <label htmlFor="identifier">{t("identifierLabel")}</label>
              <input
                data-control-id="admin_sign_in:2"
                ref={identifierRef}
                id="identifier"
                name="identifier"
                type="email"
                autoComplete="username"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                aria-invalid={errorKey !== null && !identifier.trim()}
              />
            </div>
            <div className="auth-field">
              <label htmlFor="secret">{t("secretLabel")}</label>
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
                  aria-invalid={errorKey !== null && !secret}
                />
                <button
                  className="reveal-button"
                  type="button"
                  onClick={() => setShowSecret((visible) => !visible)}
                  aria-pressed={showSecret}
                >
                  {showSecret ? t("hide") : t("reveal")}
                </button>
              </div>
            </div>
            <div
              className="auth-error"
              aria-label={t("errorAriaLabel")}
              aria-live="polite"
              role="alert"
            >
              {errorKey ? t(errorKey) : null}
            </div>
            <button
              data-control-id="admin_sign_in:4"
              className="auth-submit"
              type="submit"
              disabled={busy}
            >
              {busy ? t("signingIn") : t("signIn")}
            </button>
          </form>
          <div className="auth-card-links">
            <a href="/forgot-secret">{t("forgotSecret")}</a>
            <a href="/support">{t("nodeSupport")}</a>
          </div>
        </section>
      </section>
      <footer className="auth-footer">
        <span>{t("copyright")}</span>
        <nav aria-label={t("legalNavAriaLabel")}>
          <a href="/privacy">{t("privacy")}</a>
          <a href="/terms">{t("terms")}</a>
          <a href="/status">{t("apiStatus")}</a>
          <a href="/security">{t("security")}</a>
        </nav>
      </footer>
    </main>
  );
}
