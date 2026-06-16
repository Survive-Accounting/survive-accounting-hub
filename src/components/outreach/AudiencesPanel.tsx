// Audiences tab: list saved audiences and create / edit / delete them.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Copy, Users, Lock, Share2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import {
  listAudiences, createAudience, deleteAudience, type Audience,
} from "@/lib/outreach-api";
import { applyAudienceFilters, normalizeAudienceFilters } from "@/lib/audience-filters";
import type { Campus } from "@/lib/outreach-mock";
import { AudienceEditorModal } from "./AudienceEditorModal";

export function AudiencesPanel({ campuses }: { campuses: Campus[] }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["audiences"], queryFn: listAudiences });
  const [editing, setEditing] = useState<Audience | null>(null);
  const [creating, setCreating] = useState(false);

  const audiences = q.data ?? [];

  const sizeFor = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of audiences) {
      if (a.pinned_campus_ids && a.pinned_campus_ids.length) {
        m.set(a.id, a.pinned_campus_ids.length);
      } else {
        const f = normalizeAudienceFilters(a.filters_json);
        m.set(a.id, applyAudienceFilters(campuses, f).length);
      }
    }
    return m;
  }, [audiences, campuses]);

  const duplicateMut = useMutation({
    mutationFn: async (a: Audience) => createAudience({
      name: `${a.name} (copy)`,
      description: a.description,
      filters_json: a.filters_json,
      pinned_campus_ids: a.pinned_campus_ids ?? null,
      is_shared: a.is_shared,
    }),
    onSuccess: () => {
      toast.success("Duplicated");
      qc.invalidateQueries({ queryKey: ["audiences"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteAudience(id),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["audiences"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Users className="h-4 w-4" /> Audiences
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Save reusable campus lists (with filters) you can pick from any campaign.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-1" /> New audience
        </Button>
      </div>

      {q.isLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : audiences.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground border rounded-md bg-muted/20">
          No audiences yet. Click <strong>New audience</strong> to build one from filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Mode</th>
                <th className="px-3 py-2 text-left">Campuses</th>
                <th className="px-3 py-2 text-left">Visibility</th>
                <th className="px-3 py-2 text-left">Last used</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {audiences.map((a) => {
                const pinned = !!(a.pinned_campus_ids && a.pinned_campus_ids.length);
                const size = sizeFor.get(a.id) ?? 0;
                return (
                  <tr key={a.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2">
                      <div className="font-medium">{a.name}</div>
                      {a.description && (
                        <div className="text-[11px] text-muted-foreground">{a.description}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {pinned ? (
                        <Badge variant="outline" className="text-[10px]">Pinned</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] bg-emerald-50">Dynamic</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs tabular-nums">{size}</td>
                    <td className="px-3 py-2 text-xs">
                      {a.is_shared
                        ? <span className="inline-flex items-center gap-1"><Share2 className="h-3 w-3" /> Shared</span>
                        : <span className="inline-flex items-center gap-1 text-muted-foreground"><Lock className="h-3 w-3" /> Private</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {a.last_used_at ? new Date(a.last_used_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex gap-1">
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditing(a)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2"
                          onClick={() => duplicateMut.mutate(a)} disabled={duplicateMut.isPending}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-rose-600"
                          onClick={() => {
                            if (confirm(`Delete audience "${a.name}"?`)) deleteMut.mutate(a.id);
                          }}
                          disabled={deleteMut.isPending}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AudienceEditorModal
        open={creating || !!editing}
        onOpenChange={(v) => { if (!v) { setCreating(false); setEditing(null); } }}
        campuses={campuses}
        audience={editing}
      />
    </Card>
  );
}
