
function TestAutoScrapeButton({ campusId, onDone }: { campusId: string; onDone: () => void }) {
  const [running, setRunning] = useState(false);
  const handleClick = async () => {
    setRunning(true);
    try {
      const r = await testAutoScrapeCampus({ data: { campusId } }) as {
        scraped: number; tagged: number; urls: number;
      };
      toast.success(
        `Test scrape complete · ${r.scraped} new from ${r.urls} URL${r.urls === 1 ? "" : "s"} · ${r.tagged} auto-tagged`,
        { duration: 4500 },
      );
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test scrape failed");
    } finally {
      setRunning(false);
    }
  };
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleClick}
      disabled={running}
      className="h-7 gap-1.5 px-2.5 text-[11px]"
    >
      {running
        ? <><Loader2 className="h-3 w-3 animate-spin" /> Testing…</>
        : <><Sparkles className="h-3 w-3" /> Test Automated Scrape</>}
    </Button>
  );
}
