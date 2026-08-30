// ONE COPY IMPLEMENTATION, because every share surface on this site depends on it working in the
// one browser it is hardest to work in.
//
// navigator.clipboard needs a secure context AND document focus, and the in-app browsers a
// GroupMe or Instagram DM opens links in give neither reliably. The textarea fallback is what
// makes "Copy" actually copy where these links are actually opened.
//
// IT RETURNS WHETHER IT WORKED, and callers must honour that: a success state shown for a copy
// that silently did nothing is worse than no button, because the person walks away believing the
// link is on their clipboard.

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch { /* fall through to the legacy path */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    // Off-screen but focusable. `display:none` would make execCommand a no-op.
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none;";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length); // iOS ignores select() alone
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
