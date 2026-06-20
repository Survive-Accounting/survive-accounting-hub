// Vite supports importing file contents as a raw string via the `?raw` suffix.
// This ambient declaration lets TypeScript know about it (e.g. the in-app
// "Download context" button imports SCRAPER_CONTEXT.md?raw).
declare module "*?raw" {
  const content: string;
  export default content;
}
