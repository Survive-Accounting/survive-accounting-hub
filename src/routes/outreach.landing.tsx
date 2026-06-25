// /outreach/landing — minimal admin editor for the public homepage:
// show/hide each section + an intro-video field. Persists to site_settings
// (one row); the homepage reads it at load. No full CMS — toggles + video only.
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  getSiteSettings, updateSiteSettings, DEFAULT_SITE_SETTINGS,
  type SectionKey, type SiteSettings,
} from "@/lib/site-settings.functions";

export const Route = createFileRoute("/outreach/landing")({
  component: LandingEditor,
});

const SECTION_LABELS: { key: SectionKey; label: string; note?: string }[] = [
  { key: "hero", label: "Hero" },
  { key: "painHook", label: "Pain hook" },
  { key: "whoIAm", label: "Who I Am" },
  { key: "dualWelcome", label: "Dual welcome" },
  { key: "howItWorks", label: "How it works" },
  { key: "plans", label: "Plans (pricing)" },
  { key: "freeExplainers", label: "Free Explainers", note: "off until videos exist" },
  { key: "beyondExam", label: "Beyond the Exam", note: "off until content exists" },
  { key: "questions", label: "Questions / Text Lee" },
];

function LandingEditor() {
  const qc = useQueryClient();
  const getFn = useServerFn(getSiteSettings);
  const saveFn = useServerFn(updateSiteSettings);

  const { data, isLoading } = useQuery({
    queryKey: ["site-settings"],
    queryFn: () => getFn(),
  });

  const [draft, setDraft] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);
  useEffect(() => { if (data) setDraft(data); }, [data]);

  const save = useMutation({
    mutationFn: () => saveFn({ data: draft }),
    onSuccess: async () => {
      toast.success("Saved — homepage updated.");
      await qc.invalidateQueries({ queryKey: ["site-settings"] });
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const setSection = (k: SectionKey, v: boolean) =>
    setDraft((d) => ({ ...d, sections: { ...d.sections, [k]: v } }));

  return (
    <div className="mx-auto w-full max-w-2xl p-4 sm:p-6">
      <div className="mb-5">
        <h1 className="text-lg font-semibold">Landing page</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Show or hide each homepage section and set the hero intro video. Changes go live on{" "}
          <a href="/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
            the homepage <ExternalLink className="h-3 w-3" />
          </a>{" "}after you Save.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Sections</h2>
          <div className="mt-3 divide-y divide-border">
            {SECTION_LABELS.map(({ key, label, note }) => (
              <div key={key} className="flex items-center justify-between py-2.5">
                <Label htmlFor={`sec-${key}`} className="text-sm">
                  {label}
                  {note && <span className="ml-2 text-[11px] text-muted-foreground">({note})</span>}
                </Label>
                <Switch id={`sec-${key}`} checked={draft.sections[key]}
                  onCheckedChange={(v) => setSection(key, v)} />
              </div>
            ))}
          </div>

          <Separator className="my-5" />

          <h2 className="text-sm font-semibold">Hero intro video</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Paste a YouTube/Vimeo link or YouTube ID. When shown, it renders right under the hero CTAs.
          </p>
          <div className="mt-3 space-y-3">
            <Input
              value={draft.introVideo.url}
              placeholder="https://youtu.be/…  or  a video ID"
              onChange={(e) => setDraft((d) => ({ ...d, introVideo: { ...d.introVideo, url: e.target.value } }))}
            />
            <div className="flex items-center justify-between">
              <Label htmlFor="video-show" className="text-sm">Show intro video in hero</Label>
              <Switch id="video-show" checked={draft.introVideo.show}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, introVideo: { ...d.introVideo, show: v } }))} />
            </div>
          </div>

          <Separator className="my-5" />

          <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-1.5">
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
        </Card>
      )}
    </div>
  );
}
