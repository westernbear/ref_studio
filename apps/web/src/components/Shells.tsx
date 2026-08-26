"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Link } from "../i18n/navigation";

const creatorLinks = [
  { key: "workflow", href: "/workflow" },
  { key: "newProject", href: "/projects/new" },
] as const;
const adminLinks = [
  { key: "dashboard", href: "/admin" },
  { key: "tenants", href: "/admin/tenants" },
  { key: "jobs", href: "/admin/jobs" },
  { key: "workers", href: "/admin/workers" },
  { key: "receipts", href: "/admin/receipts" },
  { key: "quarantine", href: "/admin/quarantine" },
  { key: "billing", href: "/admin/billing" },
  { key: "audit", href: "/admin/audit" },
  { key: "aiSettings", href: "/admin/ai-settings" },
] as const;

export function BrandLogo({ ops = false }: { readonly ops?: boolean }) {
  const t = useTranslations("Shells");
  return (
    <span className="brand-logo" data-testid="brand-logo">
      <span className="brand-logo-frame">
        <Image
          className="brand-logo-image"
          src="/logo.png"
          alt=""
          width={1024}
          height={1024}
          sizes="128px"
        />
      </span>
      {ops ? <span className="brand-logo-scope">{t("opsScope")}</span> : null}
    </span>
  );
}

function Navigation({
  links,
}: {
  readonly links: readonly { readonly key: string; readonly href: string }[];
}) {
  const t = useTranslations("Shells.nav");
  return (
    <nav aria-label={t("ariaLabel")}>
      {links.map((link) => (
        <Link key={link.href} href={link.href}>
          {t(link.key)}
        </Link>
      ))}
    </nav>
  );
}

export function CreatorShell({ children }: { readonly children: ReactNode }) {
  const t = useTranslations("Shells");
  return (
    <div className="shell shell-creator">
      <header data-landmark="app-header">
        <Link className="brand-link" href="/" aria-label={t("homeAriaLabel")}>
          <BrandLogo />
        </Link>
        <Navigation links={creatorLinks} />
      </header>
      <main>{children}</main>
      <footer className="shell-footer" data-landmark="footer">
        <span>{t("brandName")}</span>
        <span>{t("year")}</span>
      </footer>
    </div>
  );
}

export function AdminShell({ children }: { readonly children: ReactNode }) {
  const t = useTranslations("Shells");
  const tAdmin = useTranslations("Shells.admin");
  const [menuOpen, setMenuOpen] = useState(false);
  const logout = async () => {
    await fetch("/api/logout", { method: "POST", credentials: "include" });
    window.location.assign("/admin/sign-in");
  };
  return (
    <div className="shell shell-admin">
      <header className="admin-mobile-header">
        <Link
          className="brand-link"
          href="/admin"
          aria-label={t("adminHomeAriaLabel")}
        >
          <BrandLogo ops />
        </Link>
        <button
          className="admin-menu-button"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="admin-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {tAdmin("menu")}
        </button>
      </header>
      <aside
        id="admin-navigation"
        className={menuOpen ? "admin-navigation-open" : ""}
        data-landmark="sidebar"
      >
        <Link
          className="brand-link"
          href="/admin"
          aria-label={t("adminHomeAriaLabel")}
        >
          <BrandLogo ops />
        </Link>
        <p className="admin-scope">{tAdmin("scope")}</p>
        <Link
          className="button button-primary admin-new-project"
          href="/projects/new"
        >
          {tAdmin("newProject")}
        </Link>
        <Navigation links={adminLinks} />
        <div className="admin-utility">
          <a href="/docs">{tAdmin("docs")}</a>
          <a href="/support">{tAdmin("support")}</a>
          <button type="button" onClick={() => void logout()}>
            {tAdmin("logOut")}
          </button>
        </div>
      </aside>
      <main>{children}</main>
    </div>
  );
}
