// Shared searchable campus picker for the outreach dashboards (reddit,
// parent-groups, greek-orgs) — replaces the long campus tab-pill rows. Value is a
// campus id or null (= all). Self-contained; no extra deps.
import { useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";

export interface ComboItem {
  id: string;
  name: string;
}

export function CampusCombobox({
  items,
  value,
  onChange,
  allLabel = "All campuses",
  placeholder = "Search campuses…",
  className = "",
}: {
  items: ComboItem[];
  value: string | null;
  onChange: (id: string | null) => void;
  allLabel?: string;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedName = value ? (items.find((i) => i.id === value)?.name ?? allLabel) : allLabel;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;
  }, [items, query]);

  function pick(id: string | null) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="flex h-8 min-w-[200px] items-center justify-between gap-2 rounded-md border border-input bg-background px-2 text-sm"
      >
        <span className={value ? "font-medium" : "text-muted-foreground"}>{selectedName}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 w-[280px] rounded-md border border-border bg-popover shadow-md">
            <div className="flex items-center gap-1 border-b border-border px-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={placeholder}
                className="h-8 w-full bg-transparent text-sm outline-none"
              />
            </div>
            <div className="max-h-64 overflow-y-auto py-1 text-sm">
              <Option label={allLabel} active={!value} onClick={() => pick(null)} />
              {filtered.map((i) => (
                <Option
                  key={i.id}
                  label={i.name}
                  active={value === i.id}
                  onClick={() => pick(i.id)}
                />
              ))}
              {filtered.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">No matches.</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Option({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted ${
        active ? "font-medium text-primary" : ""
      }`}
    >
      <Check className={`h-3.5 w-3.5 shrink-0 ${active ? "opacity-100" : "opacity-0"}`} />
      <span className="truncate">{label}</span>
    </button>
  );
}
