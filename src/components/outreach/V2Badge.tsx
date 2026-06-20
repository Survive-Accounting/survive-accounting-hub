// Small badge marking UI that belongs to the new (V2) leadfinder system, so
// it's obvious at a glance you're working with the upgraded pipeline.
export function V2Badge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full bg-orange-100 px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none tracking-wider text-orange-700 ring-1 ring-inset ring-orange-200 ${className}`}
      title="New V2 scraper system"
    >
      V2
    </span>
  );
}

export default V2Badge;
