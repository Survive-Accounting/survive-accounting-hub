// Lightweight passcode gate for admin surfaces (/outreach, /ceq) while the
// app is in playground mode (no real auth yet). This is a deterrent, not
// real security — replace with Supabase auth before storing anything truly
// sensitive. Passcode lives in ADMIN_PASSCODE below.
import { useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ADMIN_PASSCODE = "1000students";
const STORAGE_KEY = "sa-admin-unlocked";

export function AdminGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_KEY) === "yes"; } catch { return false; }
  });
  const [code, setCode] = useState("");
  const [shake, setShake] = useState(false);

  if (unlocked) return <>{children}</>;

  const tryUnlock = () => {
    if (code.trim() === ADMIN_PASSCODE) {
      try { localStorage.setItem(STORAGE_KEY, "yes"); } catch { /* ignore */ }
      setUnlocked(true);
    } else {
      setShake(true);
      setTimeout(() => setShake(false), 400);
    }
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6">
      <div className={`w-full max-w-xs rounded-xl border border-border bg-card p-6 text-center shadow-sm ${shake ? "animate-pulse" : ""}`}>
        <Lock className="mx-auto h-6 w-6 text-muted-foreground" />
        <h1 className="mt-2 text-sm font-semibold">Team access</h1>
        <p className="mt-1 text-xs text-muted-foreground">Enter the passcode to continue.</p>
        <Input
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && tryUnlock()}
          className="mt-3 h-9 text-center"
          autoFocus
        />
        <Button onClick={tryUnlock} className="mt-2 w-full h-9">Unlock</Button>
      </div>
    </div>
  );
}

export default AdminGate;
