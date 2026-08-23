// Picks the entity a contact relationship (or outreach event) points at:
// campus / chapter / council / national org. Kept compact — a type toggle, a
// campus search, and a dependent select. Resolves to { entityType, entityId,
// campusId, councilSlug }.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchCampuses } from "@/lib/campus-overrides.functions";
import { listGrowthChapters, listGrowthOrgs } from "@/lib/growth-admin.functions";

export type PickedEntity = {
  entityType: "campus" | "chapter" | "council" | "org";
  entityId: string | null;
  campusId: string | null;
  councilSlug: string | null;
  label: string;
};

const TYPES = [
  { value: "campus", label: "Campus" },
  { value: "chapter", label: "Chapter" },
  { value: "council", label: "Council" },
  { value: "org", label: "National org" },
] as const;
const COUNCILS = [
  { value: "ifc", label: "IFC" },
  { value: "panhellenic", label: "Panhellenic" },
  { value: "nphc", label: "NPHC" },
  { value: "mgc", label: "MGC" },
  { value: "other", label: "Other" },
];

export function EntityPicker({
  value,
  onChange,
}: {
  value: PickedEntity | null;
  onChange: (v: PickedEntity | null) => void;
}) {
  const [type, setType] = useState<PickedEntity["entityType"]>(value?.entityType ?? "chapter");
  const [campusId, setCampusId] = useState<string | null>(value?.campusId ?? null);
  const [campusLabel, setCampusLabel] = useState<string>("");
  const [campusQ, setCampusQ] = useState("");
  const [dCampusQ, setDCampusQ] = useState("");
  const [councilSlug, setCouncilSlug] = useState<string>(value?.councilSlug ?? "ifc");
  const [entityId, setEntityId] = useState<string | null>(value?.entityId ?? null);
  const [orgQ, setOrgQ] = useState("");
  const [dOrgQ, setDOrgQ] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDCampusQ(campusQ), 250);
    return () => clearTimeout(t);
  }, [campusQ]);
  useEffect(() => {
    const t = setTimeout(() => setDOrgQ(orgQ), 250);
    return () => clearTimeout(t);
  }, [orgQ]);

  const campusHits = useQuery({
    queryKey: ["gpick-campus", dCampusQ],
    queryFn: () => searchCampuses({ data: { q: dCampusQ } }),
    enabled: dCampusQ.trim().length >= 2 && type !== "org",
  });
  const chapterHits = useQuery({
    queryKey: ["gpick-chapters", campusId],
    queryFn: () => listGrowthChapters({ data: { campusId: campusId!, pageSize: 200 } }),
    enabled: type === "chapter" && !!campusId,
  });
  const orgHits = useQuery({
    queryKey: ["gpick-orgs", dOrgQ],
    queryFn: () => listGrowthOrgs({ data: { q: dOrgQ || undefined, pageSize: 30 } }),
    enabled: type === "org" && dOrgQ.trim().length >= 2,
  });

  // emit resolved value
  useEffect(() => {
    if (type === "campus" && campusId)
      onChange({
        entityType: "campus",
        entityId: campusId,
        campusId,
        councilSlug: null,
        label: campusLabel,
      });
    else if (type === "council" && campusId)
      onChange({
        entityType: "council",
        entityId: null,
        campusId,
        councilSlug,
        label: `${councilSlug.toUpperCase()} · ${campusLabel}`,
      });
    else if (type === "chapter" && entityId)
      onChange({ entityType: "chapter", entityId, campusId, councilSlug: null, label: "chapter" });
    else if (type === "org" && entityId)
      onChange({ entityType: "org", entityId, campusId: null, councilSlug: null, label: "org" });
    else onChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, campusId, campusLabel, councilSlug, entityId]);

  const pick = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => {
              setType(t.value);
              setEntityId(null);
            }}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium ${type === t.value ? "border-primary bg-primary/5 text-primary" : "hover:bg-accent/40"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {type !== "org" && (
        <div>
          {campusId ? (
            <div className="flex items-center justify-between rounded-md border px-2 py-1.5 text-sm">
              <span className="truncate">{campusLabel || "Campus selected"}</span>
              <button
                type="button"
                onClick={() => {
                  setCampusId(null);
                  setCampusLabel("");
                  setEntityId(null);
                }}
                className="text-xs text-muted-foreground underline"
              >
                change
              </button>
            </div>
          ) : (
            <div>
              <input
                value={campusQ}
                onChange={(e) => setCampusQ(e.target.value)}
                placeholder="Search campus…"
                className={pick}
              />
              {campusHits.data && campusHits.data.length > 0 && (
                <div className="mt-1 max-h-40 overflow-y-auto rounded-md border">
                  {campusHits.data.map((c: { id: string; name: string }) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setCampusId(c.id);
                        setCampusLabel(c.name);
                        setCampusQ("");
                      }}
                      className="block w-full px-2 py-1.5 text-left text-sm hover:bg-accent/40"
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {type === "council" && campusId && (
        <select
          value={councilSlug}
          onChange={(e) => setCouncilSlug(e.target.value)}
          className={pick}
        >
          {COUNCILS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      )}

      {type === "chapter" && campusId && (
        <select
          value={entityId ?? ""}
          onChange={(e) => setEntityId(e.target.value || null)}
          className={pick}
        >
          <option value="">Select chapter…</option>
          {(chapterHits.data?.rows ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.chapterName}
              {c.letters ? ` (${c.letters})` : ""}
            </option>
          ))}
        </select>
      )}

      {type === "org" && (
        <div>
          {entityId ? (
            <div className="flex items-center justify-between rounded-md border px-2 py-1.5 text-sm">
              <span className="truncate">Org selected</span>
              <button
                type="button"
                onClick={() => setEntityId(null)}
                className="text-xs text-muted-foreground underline"
              >
                change
              </button>
            </div>
          ) : (
            <div>
              <input
                value={orgQ}
                onChange={(e) => setOrgQ(e.target.value)}
                placeholder="Search national org…"
                className={pick}
              />
              {orgHits.data && orgHits.data.rows.length > 0 && (
                <div className="mt-1 max-h-40 overflow-y-auto rounded-md border">
                  {orgHits.data.rows.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => {
                        setEntityId(o.id);
                        setOrgQ("");
                      }}
                      className="block w-full px-2 py-1.5 text-left text-sm hover:bg-accent/40"
                    >
                      {o.name}
                      {o.letters ? ` (${o.letters})` : ""}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
