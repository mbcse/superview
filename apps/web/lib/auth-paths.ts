export const PROTECTED_PREFIXES = [
  "/app/compose",
  "/app/pockets",
  "/app/wallet",
  "/app/settings",
  "/app/collections",
  "/app/circles",
  "/app/profile",
  "/app/order",
  "/app/admin",
  "/app/trending",
  "/app/notifications"
];

export function requiresAuth(pathname: string) {
  if (pathname === "/app") return true;
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function loginHref(next?: string) {
  if (!next || next === "/") return "/login";
  return `/login?next=${encodeURIComponent(next)}`;
}

export function signupHref(next?: string) {
  if (!next || next === "/") return "/signup";
  return `/signup?next=${encodeURIComponent(next)}`;
}
