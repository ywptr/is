"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type Props = {
  displayName: string;
  canManageAdmissions: boolean;
  canManageNexus: boolean;
};

export function AppSidebar({ displayName, canManageAdmissions, canManageNexus }: Props) {
  const pathname = usePathname();
  const [nexusExpanded, setNexusExpanded] = useState(() =>
    pathname === "/nexus" || pathname.startsWith("/admin/nexus/")
  );
  useEffect(() => {
    if (pathname === "/nexus" || pathname.startsWith("/admin/nexus/")) setNexusExpanded(true);
  }, [pathname]);

  const homeActive = pathname === "/";
  const admissionActive = pathname.startsWith("/admin/admissions");
  const nexusActive = pathname === "/nexus" || pathname.startsWith("/admin/nexus/");

  return (
    <aside className="app-sidebar" aria-label="Application navigation">
      <Link href="/" className="sidebar-brand" aria-label="IS home">
        <span className="brand-mark">IS</span>
        <span><strong>Identity Service</strong><small>Control plane</small></span>
      </Link>
      <nav className="sidebar-nav" aria-label="Main menu">
        <Link href="/" aria-current={homeActive ? "page" : undefined} className={`sidebar-item${homeActive ? " active" : ""}`}>
          <span aria-hidden="true">⌂</span> Home
        </Link>
        {canManageAdmissions && (
          <Link href="/admin/admissions" aria-current={admissionActive ? "page" : undefined} className={`sidebar-item${admissionActive ? " active" : ""}`}>
            <span aria-hidden="true">✉</span> Manage permitted emails
          </Link>
        )}
        {canManageNexus && (
          <div className="sidebar-section">
            <div className="sidebar-parent">
              <Link href="/nexus" aria-current={pathname === "/nexus" ? "page" : undefined} className={`sidebar-item sidebar-parent-link${nexusActive ? " active" : ""}`}>
                <span aria-hidden="true">▦</span> Nexus
              </Link>
              <button type="button" className="sidebar-expander" onClick={() => setNexusExpanded(v => !v)} aria-expanded={nexusExpanded} aria-label={nexusExpanded ? "Collapse Nexus menu" : "Expand Nexus menu"} aria-controls="nexus-menu">
                <span aria-hidden="true">{nexusExpanded ? "▾" : "▸"}</span>
              </button>
            </div>
            {nexusExpanded && (
              <div className="sidebar-submenu" id="nexus-menu">
                <Link href="/admin/nexus/operators" aria-current={pathname === "/admin/nexus/operators" ? "page" : undefined} className={`sidebar-item sidebar-child${pathname === "/admin/nexus/operators" ? " active" : ""}`}>
                  Manage Operators
                </Link>
              </div>
            )}
          </div>
        )}
      </nav>
      <div className="sidebar-user"><small>Signed in</small><span title={displayName}>{displayName}</span></div>
    </aside>
  );
}
