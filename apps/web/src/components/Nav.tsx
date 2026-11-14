"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { setToken } from "@/lib/api";

const links = [
  ["/", "Dashboard"],
  ["/transactions", "Transactions"],
  ["/recalls", "Recalls"],
  ["/simulate", "What-if"],
  ["/import", "Import CSV"],
];

export function Nav() {
  const path = usePathname();
  const router = useRouter();
  if (path === "/login") return null;
  return (
    <nav>
      <span className="brand">FinOS</span>
      {links.map(([href, label]) => (
        <Link key={href} href={href} className={path === href ? "on" : ""}>{label}</Link>
      ))}
      <span className="sp" />
      <a href="#" onClick={(e) => { e.preventDefault(); setToken(null); router.push("/login"); }}>Sign out</a>
    </nav>
  );
}
