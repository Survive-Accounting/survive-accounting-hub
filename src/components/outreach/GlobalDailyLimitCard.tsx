// Global daily send limit for cold professor outreach.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Gauge, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fetchGlobalDailyLimit, setGlobalDailyLimit } from "@/lib/outreach-api";

export function GlobalDailyLimitCard() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["global-daily-limit"], queryFn: fetchGlobalDailyLimit });
  const [value, setValue] = useState<number>(50);

  useEffect(() => { if (typeof q.data === "number") setValue(q.data); }, [q.data]);

  const m = useMutation({
    mutationFn: () => setGlobalDailyLimit(value),
    onSuccess: () => {
      toast.success(`Global daily limit set to ${value}`);
      qc.invalidateQueries({ queryKey: ["global-daily-limit"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dirty = q.data != null && value !== q.data;

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <Gauge className="h-5 w-5 text-primary mt-0.5" />
        <div className="flex-1">
          <div className="text-sm font-semibold">Global Daily Send Limit</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Maximum cold outreach emails per day across <em>all</em> active campaigns.
            Scheduling a campaign fills business days up to this limit, then rolls to the next day.
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Input
              type="number"
              min={1}
              value={value}
              onChange={(e) => setValue(Math.max(1, Number(e.target.value) || 1))}
              className="h-9 w-32"
            />
            <Button onClick={() => m.mutate()} disabled={!dirty || m.isPending}>
              {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
            {q.isLoading && <span className="text-xs text-muted-foreground">Loading…</span>}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default GlobalDailyLimitCard;
