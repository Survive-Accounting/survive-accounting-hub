// Shows the full payload from a single-campus clean-professor test run:
// accepted leads, rejected candidates + reason, the prompt that was used,
// and a raw model-output preview. Nothing is auto-imported.
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CleanProfessorTestResult } from "@/lib/outreach-api";

export function CleanRunTestResultModal({
  open, onOpenChange, result, campusName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  result: CleanProfessorTestResult | null;
  campusName: string;
}) {
  if (!result) return null;
  const { debug } = result;
  const accepted = debug.accepted_preview ?? [];
  const rejected = debug.rejected_samples ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Clean Professor Test · {campusName}</DialogTitle>
          <DialogDescription>
            Synchronous single-campus run. Results saved as pending suggestions tagged
            <code className="ml-1 text-[11px]">{debug.research_label}</code>.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 border-b pb-3 text-xs">
          <Badge variant="outline">Model: <strong className="ml-1">{debug.model}</strong></Badge>
          <Badge variant="outline" className="bg-emerald-50">
            Accepted: <strong className="ml-1">{debug.parsed_lead_count}</strong>
          </Badge>
          <Badge variant="outline" className="bg-rose-50">
            Rejected: <strong className="ml-1">{debug.rejected_count}</strong>
          </Badge>
          <Badge variant="outline">
            Inserted: <strong className="ml-1">{result.inserted_count}</strong>
          </Badge>
          <Badge variant="outline">
            Dup-skipped: <strong className="ml-1">{result.skipped_duplicate_count}</strong>
          </Badge>
          <Badge variant="outline">Raw count: <strong className="ml-1">{debug.raw_suggestion_count}</strong></Badge>
        </div>

        <Tabs defaultValue="accepted" className="flex-1 flex flex-col min-h-0">
          <TabsList>
            <TabsTrigger value="accepted">Accepted ({accepted.length})</TabsTrigger>
            <TabsTrigger value="rejected">Rejected ({rejected.length})</TabsTrigger>
            <TabsTrigger value="raw">Raw AI output</TabsTrigger>
            <TabsTrigger value="prompt">Prompt</TabsTrigger>
          </TabsList>

          <TabsContent value="accepted" className="flex-1 overflow-auto rounded border">
            {accepted.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No leads accepted.</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/70">
                  <tr>
                    <th className="px-2 py-2 text-left">Name</th>
                    <th className="px-2 py-2 text-left">Title</th>
                    <th className="px-2 py-2 text-left">Email</th>
                    <th className="px-2 py-2 text-left">Type</th>
                    <th className="px-2 py-2 text-left">Conf</th>
                    <th className="px-2 py-2 text-left">Teaches</th>
                    <th className="px-2 py-2 text-left">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {accepted.map((s: any, i: number) => (
                    <tr key={i} className="align-top hover:bg-muted/20">
                      <td className="px-2 py-1 font-medium">{[s.first_name, s.last_name].filter(Boolean).join(" ") || "—"}</td>
                      <td className="px-2 py-1">{s.title ?? "—"}</td>
                      <td className="px-2 py-1 font-mono text-[11px]">{s.email ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-2 py-1">{s.lead_type}</td>
                      <td className="px-2 py-1">{Number(s.confidence ?? 0).toFixed(2)}</td>
                      <td className="px-2 py-1 text-[11px]">
                        {[
                          s.teaches_intro_1 && "I1",
                          s.teaches_intro_2 && "I2",
                          s.teaches_intermediate_1 && "IA1",
                          s.teaches_intermediate_2 && "IA2",
                        ].filter(Boolean).join(", ") || "—"}
                      </td>
                      <td className="px-2 py-1">
                        {s.source_url ? (
                          <a href={s.source_url} target="_blank" rel="noreferrer"
                             className="text-primary underline truncate inline-block max-w-[200px]">link</a>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </TabsContent>

          <TabsContent value="rejected" className="flex-1 overflow-auto rounded border">
            {rejected.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No rejections.</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/70">
                  <tr>
                    <th className="px-2 py-2 text-left">Reason</th>
                    <th className="px-2 py-2 text-left">Candidate</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rejected.map((r, i) => (
                    <tr key={i} className="align-top">
                      <td className="px-2 py-1 font-mono text-[11px] text-rose-700">{r.reason}</td>
                      <td className="px-2 py-1 text-[11px]">
                        <pre className="whitespace-pre-wrap">{JSON.stringify(r.sample, null, 2)}</pre>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </TabsContent>

          <TabsContent value="raw" className="flex-1 overflow-auto rounded border p-3">
            <pre className="text-[11px] whitespace-pre-wrap font-mono">
              {debug.raw_response_preview || "(empty)"}
            </pre>
          </TabsContent>

          <TabsContent value="prompt" className="flex-1 overflow-auto rounded border p-3">
            <pre className="text-[11px] whitespace-pre-wrap font-mono">
              {debug.prompt_preview || "(empty)"}
            </pre>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
