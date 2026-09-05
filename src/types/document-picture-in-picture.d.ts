// The Document Picture-in-Picture API (Chrome/Edge 116+) — a real OS-level floating window
// that can hold arbitrary DOM, not just one <video>. Not yet in TypeScript's bundled DOM lib,
// so it's declared here rather than sprinkling `any`/`@ts-expect-error` at every call site.
// Used by the SHIPPED Recorder's pop-out bubble (Recorder.tsx).
export {};

declare global {
  interface DocumentPictureInPicture extends EventTarget {
    requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
    readonly window: Window | null;
  }
  interface Window {
    documentPictureInPicture?: DocumentPictureInPicture;
  }
}
