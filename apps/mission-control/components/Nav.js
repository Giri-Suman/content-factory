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
  ["/publish", "Publish"],
  ["/lab", "Lab"],
  ["/keywords", "Keywords"],
  ["/ideas", "Ideas"],
  ["/qc", "QC"],
  ["/lessons", "Lessons"],
  ["/scripts", "Scripts"],
  ["/math", "Math"],
  ["/footage", "Footage"],
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
