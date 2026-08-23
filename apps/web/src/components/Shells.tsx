"use client"

import { useState, type ReactNode } from "react"
import { Panel } from "./Primitives"

const creatorLinks = [{ name: "Workflow", href: "/workflow" }, { name: "New Project", href: "/projects/new" }, { name: "Docs", href: "/docs" }, { name: "Support", href: "/support" }] as const
const adminLinks = [{ name: "Dashboard", href: "/admin" }, { name: "Tenants", href: "/admin/tenants" }, { name: "Jobs", href: "/admin/jobs" }, { name: "Receipts", href: "/admin/receipts" }, { name: "Quarantine", href: "/admin/quarantine" }, { name: "Billing", href: "/admin/billing" }, { name: "Audit", href: "/admin/audit" }] as const

function Navigation({ links }: { readonly links: readonly { readonly name: string; readonly href: string }[] }) {
  return <nav aria-label="Primary navigation">{links.map((link) => <a key={link.href} href={link.href}>{link.name}</a>)}</nav>
}

export function CreatorShell({ children }: { readonly children: ReactNode }) {
  return <div className="shell shell-creator"><header><a href="/workflow" aria-label="Reference Video Studio home">RVS</a><Navigation links={creatorLinks} /></header><main>{children}</main></div>
}

export function AdminShell({ children }: { readonly children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false)
  return <div className="shell shell-admin"><button className="admin-menu-button" type="button" aria-expanded={menuOpen} aria-controls="admin-navigation" onClick={() => setMenuOpen((open) => !open)}>Menu</button><aside id="admin-navigation" className={menuOpen ? "admin-navigation-open" : ""}><a href="/admin" aria-label="Reference Video Studio admin home">RVS / OPS</a><p className="admin-scope">Platform scope · Operations</p><Navigation links={adminLinks} /><div className="admin-utility"><a href="/projects/new">New Project</a><a href="/docs">Docs / Support</a><button type="button" onClick={() => setMenuOpen(false)}>Log out</button></div></aside><main>{children}</main></div>
}

export function EmptySurface({ title, description }: { readonly title: string; readonly description: string; readonly children?: ReactNode }) {
  return <Panel aria-labelledby="surface-title"><h1 id="surface-title">{title}</h1><p>{description}</p></Panel>
}
