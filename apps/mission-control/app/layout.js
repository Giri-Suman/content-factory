import "./globals.css";
import { Nav } from "../components/Nav.js";

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
