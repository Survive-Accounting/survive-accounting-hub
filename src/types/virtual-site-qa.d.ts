// The QA change-detection version map, injected at build time by the Vite plugin
// scripts/vite-site-qa.ts.
declare module "virtual:site-qa-versions" {
  interface TemplateVersion {
    hash: string;
    changedAt: string | null;
  }
  interface SiteQaVersions {
    builtAt: string;
    templates: Record<string, TemplateVersion>;
  }
  const versions: SiteQaVersions;
  export default versions;
}
