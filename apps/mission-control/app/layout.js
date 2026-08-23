import "./globals.css";
import { Nav } from "../components/Nav.js";

/**
 * Everything in this app runs on the edge.
 *
 * Cloudflare Pages has no Node.js runtime, and `next-on-pages` refuses to build
 * if a single route or page is left on it. Declaring it once on the root layout
 * covers every segment — including the two Next generates for you, `/_not-found`
 * and the dynamic `/scripts/[id]`, neither of which has a file you can annotate.
 *
 * The trade: edge runtime turns off static prerendering, so each page is
 * rendered per request instead of served as a file. That costs nothing here —
 * every page in this portal is a "use client" shell that fetches its data after
 * mount, so the prerendered HTML was an empty frame anyway.
 */
export const runtime = process.env.FACTORY_TARGET === "pages" ? "edge" : "nodejs";

export const metadata = {
  title: "Mission Control — Content Factory",
  description: "Trend radar, script studio, render queue — the whole factory in one portal.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <aside className="sidebar">
            <div className="brand">
              CONTENT FACTORY
              <small>mission control</small>
            </div>
            <Nav />
            <div className="sidebar-foot">local · review gate on</div>
          </aside>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
