/**
 * A real 404 page — which exists mainly so the route can be edge.
 *
 * Next generates a `/_not-found` route whether or not you write one, and the
 * generated one does NOT inherit `runtime` from the root layout: the build
 * emitted it as a Node function while every other route was edge, and
 * next-on-pages refuses to build with even one Node route left. Writing the file
 * ourselves is what makes the segment config apply to it.
 */

export const runtime = process.env.FACTORY_TARGET === "pages" ? "edge" : "nodejs";

export default function NotFound() {
  return (
    <div style={{ padding: "48px 0" }}>
      <h1>Not here</h1>
      <p className="sub">That page does not exist in the factory.</p>
      <a className="btn" href="/">
        Back to Mission Control
      </a>
    </div>
  );
}
