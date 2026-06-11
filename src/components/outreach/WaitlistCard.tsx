// Waitlist signups from /start — new ones first, one-tap contact actions.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Loader2, MessageSquare, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchWaitlist, markWaitlistContacted, type WaitlistSignup } from "@/lib/outreach-api";

export function WaitlistCard() {
  const qc = useQueryClient();
  const { data: rows = [], isLoading, isError } = useQuery({
    queryKey: ["campus-waitlist"],
    queryFn: fetchWaitlist,
    retry: 1,
    refetchInterval: 60_000,
  });

  if (isError) return null; // table not migrated yet — stay out of the way
  const pending = rows.filter((r) => !r.contacted_at);
  const contacted = rows.filter((r) => r.contacted_at);

  const toggle = async (row: WaitlistSignup) => {
    try {
      await markWaitlistContacted(row.id, !row.contacted_at);
      qc.invalidateQueries({ queryKey: ["campus-waitlist"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Update failed");
    }
  };

  const copy = (v: string) => navigator.clipboard.writeText(v).then(() => toast.success("Copied"));

  const Row = ({ r }: { r: WaitlistSignup }) => (
    <div className={cn("flex flex-wrap items-center gap-2 px-3 py-2.5", r.contacted_at && "opacity-50")}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="font-medium">{r.name || "No name"}</span>
          {r.campus_text && <span className="text-muted-foreground">· {r.campus_text}</span>}
          {r.course_text && <Badge variant="outline" className="text-[10px] h-4 px-1 font-mono">{r.course_text}</Badge>}
          {r.wants_text && <Badge className="text-[10px] h-4 px-1.5 bg-[#14213D]">text back</Badge>}
          {r.wants_call && <Badge variant="outline" className="text-[10px] h-4 px-1.5">call back</Badge>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <button onClick={() => copy(r.email)} className="inline-flex items-center gap-1 hover:text-foreground" title="Copy email">
            {r.email} <Copy className="h-2.5 w-2.5" />
          </button>
          {r.phone && (
            <button onClick={() => copy(r.phone!)} className="inline-flex items-center gap-1 hover:text-foreground" title="Copy phone">
              {r.phone} <Copy className="h-2.5 w-2.5" />
            </button>
          )}
          <span>· {new Date(r.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
        </div>
      </div>
      <Button size="sm" variant={r.contacted_at ? "ghost" : "outline"} className="ml-auto h-7 text-xs" onClick={() => toggle(r)}>
        {r.contacted_at ? <><Undo2 className="h-3 w-3" /> Undo</> : <><Check className="h-3 w-3" /> Mark contacted</>}
      </Button>
    </div>
  );

  return (
    <Card className="overflow-hidden py-0 gap-0">
      <div className="flex items-center gap-2 border-b border-border p-3">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Campus Waitlist</h2>
        {pending.length > 0 && (
          <Badge className="bg-[#CE1126] text-[10px] h-4 px-1.5">{pending.length} new</Badge>
        )}
        {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      {rows.length === 0 ? (
        <div className="p-4 text-xs text-muted-foreground">
          No signups yet. Students who can't find their campus on /start land here — you also get a text the moment one arrives.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {pending.map((r) => <Row key={r.id} r={r} />)}
          {contacted.slice(0, 5).map((r) => <Row key={r.id} r={r} />)}
        </div>
      )}
    </Card>
  );
}

export default WaitlistCard;
