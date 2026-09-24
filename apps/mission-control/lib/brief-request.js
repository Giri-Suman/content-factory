/** Preserve the exact source selected in Today, Trends, or Wishlist. */
export function briefRequest(body = {}) {
  const choices = ["clusterId", "wishlistId", "topic"].filter((key) => body[key] != null && String(body[key]).trim());
  if (choices.length > 1) throw new Error("Choose one cluster, wishlist entry, or topic for a brief.");
  if (!choices.length) return { cmd: "brief", arg: "" };

  const key = choices[0];
  const arg = String(body[key]).trim();
  if (key !== "topic" && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/.test(arg)) {
    throw new Error(`Invalid ${key}.`);
  }
  if (key === "clusterId") return { cmd: "brief-cluster", arg, collection: "clusters" };
  if (key === "wishlistId") return { cmd: "brief-wishlist", arg, collection: "wishlist" };
  return { cmd: "brief-topic", arg };
}
