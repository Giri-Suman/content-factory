export const USER_EMAIL_HEADER = "x-factory-user-email";
export const USER_ROLE_HEADER = "x-factory-user-role";
export const AUTH_MODE_HEADER = "x-factory-auth-mode";

export function identityFromRequest(request) {
  const email = String(request?.headers?.get(USER_EMAIL_HEADER) || "portal").trim().toLowerCase();
  const role = request?.headers?.get(USER_ROLE_HEADER) === "owner" ? "owner" : "member";
  const mode = String(request?.headers?.get(AUTH_MODE_HEADER) || "unknown");
  return { email, role, mode, isOwner: role === "owner" };
}

export function ownerRequired(request) {
  const identity = identityFromRequest(request);
  if (identity.isOwner) return { identity, response: null };
  return {
    identity,
    response: new Response(JSON.stringify({ ok: false, error: "Only the workspace owner can perform this action." }), {
      status: 403,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    }),
  };
}
