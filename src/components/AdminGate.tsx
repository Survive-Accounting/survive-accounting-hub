// Lightweight passcode + identity gate for admin surfaces (/outreach, /ceq).
// Identity (Lee vs King) is stored in localStorage and used for claim
// attribution in the campus queue. This is a deterrent, not real security.
import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const ADMIN_PASSCODE = "1000students";
const STORAGE_KEY = "sa-admin-unlocked";
const WHO_KEY = "sa-admin-who";

export type AdminWho = "lee" | "king";

export function getAdminWho(): AdminWho | null {
  try {
    const v = localStorage.getItem(WHO_KEY);
    return v === "lee" || v === "king" ? v : null;
  } catch {
    return null;
  }
}

export function adminEmailFor(who: AdminWho): string {
  return who === "lee" ? "lee@surviveaccounting.com" : "king@surviveaccounting.com";
}

export function AdminGate({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [who, setWho] = useState<AdminWho | null>(null);
  const [code, setCode] = useState("");
  const [shake, setShake] = useState(false);

  useEffect(() => {
    try {
      setUnlocked(localStorage.getItem(STORAGE_KEY) === "yes");
      setWho(getAdminWho());
    } catch {
      /* ignore */
    }
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="min-h-[70vh]" suppressHydrationWarning />;
  }

  const tryUnlock = () => {
    if (code.trim() === ADMIN_PASSCODE) {
      try {
        localStorage.setItem(STORAGE_KEY, "yes");
      } catch {
        /* ignore */
      }
      setUnlocked(true);
    } else {
      setShake(true);
      setTimeout(() => setShake(false), 400);
    }
  };

  const pickWho = (w: AdminWho) => {
    try {
      localStorage.setItem(WHO_KEY, w);
    } catch {
      /* ignore */
    }
    setWho(w);
  };

  if (unlocked && who) return <>{children}</>;

  if (unlocked && !who) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-6">
        <div className="w-full max-w-xs rounded-xl border border-border bg-card p-6 text-center shadow-sm">
          <h1 className="text-sm font-semibold">Who's working?</h1>
          <p className="mt-1 text-xs text-muted-foreground">Used to attribute campus claims.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => pickWho("lee")}>
              Lee
            </Button>
            <Button variant="outline" onClick={() => pickWho("king")}>
              King
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6">
      <div
        className={`w-full max-w-xs rounded-xl border border-border bg-card p-6 text-center shadow-sm ${shake ? "animate-pulse" : ""}`}
      >
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
        <Button onClick={tryUnlock} className="mt-2 w-full h-9">
          Unlock
        </Button>
      </div>
    </div>
  );
}

export default AdminGate;
