// Single source of truth for who may operate the admin workspaces.
//
// This used to be copy-pasted into ~11 server modules; the copies drifted (some
// listed king@, some listed lee@survivestudios.com, some both), which is exactly
// the kind of allow-list skew that quietly grants or denies access. Import this
// list instead of re-declaring it.
//
// The list itself is not a secret — knowing an admin address grants nothing.
// Access still requires a valid Supabase session (verified JWT) for one of these
// addresses; every gate checks the JWT's email against this list.
export const ADMIN_EMAILS: string[] = [
  "lee@surviveaccounting.com",
  "king@surviveaccounting.com",
  "lee@survivestudios.com",
];

/** True when `email` (any case / surrounding space) is an admin identity. */
export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
