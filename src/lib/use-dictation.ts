// THE BROWSER'S OWN DICTATION (Chrome's SpeechRecognition) — shared by the Illustrator's
// "Speak" button and the SHIPPED recorder's live captions. Continuous, interim results on,
// so words land as they're spoken; `onWords(final, interim)` fires on every result event —
// the caller decides whether that means "append to a textarea" or "show a caption line".
// Unsupported browsers (anything but Chrome/Edge) get `supported: false`; recording or typing
// must keep working either way, so callers never gate a REQUIRED action on this.
import { useEffect, useRef, useState } from "react";

interface SpeechRec {
  continuous: boolean; interimResults: boolean; lang: string;
  start: () => void; stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

export function dictationSupported(): boolean {
  return typeof window !== "undefined" && !!((window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);
}

export function useDictation(onWords: (final: string, interim: string) => void) {
  const recRef = useRef<SpeechRec | null>(null);
  const [on, setOn] = useState(false);
  const supported = dictationSupported();

  function stop() { recRef.current?.stop(); recRef.current = null; setOn(false); }

  function start() {
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.continuous = true; rec.interimResults = true; rec.lang = "en-US";
    rec.onresult = (e) => {
      let final = "", interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) final += r[0].transcript + " "; else interim += r[0].transcript; }
      onWords(final, interim);
    };
    // Chrome ends a session after a silence — restart it while `on` so long-running captions
    // (a whole SHIPPED take) don't just quietly stop after a pause in speech.
    rec.onend = () => { if (recRef.current === rec) { try { rec.start(); } catch { recRef.current = null; setOn(false); } } };
    rec.onerror = () => { recRef.current = null; setOn(false); };
    rec.start();
    recRef.current = rec;
    setOn(true);
  }

  useEffect(() => () => { if (recRef.current) { const r = recRef.current; r.onend = null; r.stop(); } }, []);
  return { supported, on, start, stop };
}
