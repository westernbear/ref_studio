"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";

const creatorLinks = [
  { name: "Workflow", href: "/workflow" },
  { name: "New Project", href: "/projects/new" },
] as const;
const adminLinks = [
  { name: "Dashboard", href: "/admin" },
  { name: "Tenants", href: "/admin/tenants" },
  { name: "Jobs", href: "/admin/jobs" },
  { name: "Workers", href: "/admin/workers" },
  { name: "Receipts", href: "/admin/receipts" },
  { name: "Quarantine", href: "/admin/quarantine" },
  { name: "Billing", href: "/admin/billing" },
  { name: "Audit", href: "/admin/audit" },
  { name: "AI Settings", href: "/admin/ai-settings" },
] as const;

export function BrandLogo({ ops = false }: { readonly ops?: boolean }) {
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
      {ops ? <span className="brand-logo-scope">/ OPS</span> : null}
    </span>
  );
}

function Navigation({
  links,
}: {
  readonly links: readonly { readonly name: string; readonly href: string }[];
}) {
  return (
    <nav aria-label="Primary navigation">
      {links.map((link) => (
        <a key={link.href} href={link.href}>
          {link.name}
        </a>
      ))}
    </nav>
  );
}

export function CreatorShell({ children }: { readonly children: ReactNode }) {
  return (
    <div className="shell shell-creator">
      <header data-landmark="app-header">
        <a
          className="brand-link"
          href="/"
          aria-label="Reference Video Studio home"
        >
          <BrandLogo />
        </a>
        <Navigation links={creatorLinks} />
      </header>
      <main>{children}</main>
      <footer className="shell-footer" data-landmark="footer">
        <span>Reference Video Studio</span>
        <span>2026</span>
      </footer>
    </div>
  );
}

export function AdminShell({ children }: { readonly children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const logout = async () => {
    await fetch("/api/logout", { method: "POST", credentials: "include" });
    window.location.assign("/admin/sign-in");
  };
  return (
    <div className="shell shell-admin">
      <header className="admin-mobile-header">
        <a
          className="brand-link"
          href="/admin"
          aria-label="Reference Video Studio admin home"
        >
          <BrandLogo ops />
        </a>
        <button
          className="admin-menu-button"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="admin-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          Menu
        </button>
      </header>
      <aside
        id="admin-navigation"
        className={menuOpen ? "admin-navigation-open" : ""}
        data-landmark="sidebar"
      >
        <a
          className="brand-link"
          href="/admin"
          aria-label="Reference Video Studio admin home"
        >
          <BrandLogo ops />
        </a>
        <p className="admin-scope">Platform scope · Operations</p>
        <a className="button button-primary admin-new-project" href="/projects/new">
          New Project
        </a>
        <Navigation links={adminLinks} />
        <div className="admin-utility">
          <a href="/docs">Docs</a>
          <a href="/support">Support</a>
          <button type="button" onClick={() => void logout()}>
            Log out
          </button>
        </div>
      </aside>
      <main>{children}</main>
    </div>
  );
}
