"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  ["/", "Today"],
  ["/trends", "Trends"],
  ["/youtube", "YouTube"],
  ["/wishlist", "Wishlist"],
  ["/briefs", "Briefs"],
  ["/production", "Production"],
  ["/packaging", "Packaging"],
  ["/publish", "Publish"],
  ["/lab", "Lab"],
  ["/keywords", "Keywords"],
  ["/ideas", "Ideas"],
  ["/catalog", "Catalog"],
  ["/qc", "QC"],
  ["/lessons", "Lessons"],
  ["/playbooks", "Playbooks"],
  ["/scripts", "Scripts"],
  ["/math", "Math"],
  ["/footage", "Footage"],
  ["/renders", "Renders"],
  ["/analytics", "Analytics"],
  ["/cost", "Cost"],
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
