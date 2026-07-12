"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  ["/", "Trends"],
  ["/scripts", "Scripts"],
  ["/math", "Math"],
  ["/renders", "Renders"],
  ["/analytics", "Analytics"],
  ["/settings", "Settings"],
];

export function Nav() {
  const pathname = usePathname();
  return (
    <>
      {LINKS.map(([href, label]) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link key={href} href={href} className={`nav-link${active ? " active" : ""}`}>
            {label}
          </Link>
        );
      })}
    </>
  );
}
