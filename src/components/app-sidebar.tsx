"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
type Props={displayName:string;canManageAdmissions:boolean;canManageNexus:boolean};
export function AppSidebar({displayName,canManageAdmissions,canManageNexus}:Props){
  const pathname=usePathname();
  const nexusPath=pathname==="/nexus"||pathname.startsWith("/nexus/")||pathname.startsWith("/admin/nexus/");
  const [expanded,setExpanded]=useState(nexusPath);
  useEffect(()=>{if(nexusPath)setExpanded(true);},[nexusPath]);
  function child(path:string,label:string){const active=pathname===path;return <Link key={path} href={path} aria-current={active?"page":undefined} className={`sidebar-item sidebar-child${active?" active":""}`}>{label}</Link>;}
  return <aside className="app-sidebar" aria-label="Application navigation">
    <Link href="/" className="sidebar-brand" aria-label="IS home"><span className="brand-mark">IS</span><span><strong>Identity Service</strong><small>Control plane</small></span></Link>
    <nav className="sidebar-nav" aria-label="Main menu">
      <Link href="/" className={`sidebar-item${pathname==="/"?" active":""}`} aria-current={pathname==="/"?"page":undefined}><span aria-hidden="true">⌂</span> Home</Link>
      {canManageAdmissions&&<Link href="/admin/admissions" className={`sidebar-item${pathname==="/admin/admissions"?" active":""}`} aria-current={pathname==="/admin/admissions"?"page":undefined}><span aria-hidden="true">✉</span> Manage permitted emails</Link>}
      {canManageNexus&&<div className="sidebar-section"><div className="sidebar-parent">
        <Link href="/nexus" className={`sidebar-item sidebar-parent-link${nexusPath?" active":""}`} aria-current={pathname==="/nexus"?"page":undefined}><span aria-hidden="true">▦</span> Nexus</Link>
        <button type="button" className="sidebar-expander" onClick={()=>setExpanded(v=>!v)} aria-expanded={expanded} aria-label={expanded?"Collapse Nexus menu":"Expand Nexus menu"} aria-controls="nexus-menu"><span aria-hidden="true">{expanded?"▾":"▸"}</span></button>
      </div>{expanded&&<div className="sidebar-submenu" id="nexus-menu">
        {child("/admin/nexus/operators","Manage Operators")}
        {child("/nexus/applications","Applications")}
        {child("/nexus/tenants","Tenants")}
        {child("/nexus/entitlements","Entitlements")}
      </div>}</div>}
    </nav><div className="sidebar-user"><small>Signed in</small><span title={displayName}>{displayName}</span></div>
  </aside>;
}
