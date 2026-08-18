/**
 * Belt and braces alongside the X-Robots-Tag header in middleware.
 *
 * A well-behaved crawler reads this before requesting anything; the header
 * covers the ones that do not. Neither affects coderfact.com — search engines
 * treat subdomains as separate properties, so this host being hidden (or
 * offline while the laptop sleeps) has no bearing on the portfolio's ranking.
 */
export default function robots() {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
