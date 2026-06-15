import { Component, type ReactNode } from "react";
import { toast } from "sonner";

type Props = { children: ReactNode; onReset?: () => void };
type State = { error: Error | null; info: string | null };

export class ResearchErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, info: null };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    // eslint-disable-next-line no-console
    console.error("[ResearchErrorBoundary] caught:", error, info?.componentStack);
    this.setState({ error, info: info?.componentStack ?? null });
  }

  reset = () => {
    this.setState({ error: null, info: null });
    this.props.onReset?.();
  };

  copy = async () => {
    const { error, info } = this.state;
    const text = `${error?.name ?? "Error"}: ${error?.message ?? ""}\n\nSTACK:\n${error?.stack ?? "(no stack)"}\n\nCOMPONENT STACK:\n${info ?? "(none)"}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied error details");
    } catch {
      toast.error("Clipboard blocked — open console for details");
    }
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="max-w-lg w-full rounded-md border bg-background p-5 shadow-lg space-y-3">
          <div className="text-sm font-semibold text-destructive">
            The campus modal crashed
          </div>
          <div className="text-xs text-muted-foreground">
            The partial debug log was saved to the campus row before the crash —
            re-open the modal and expand <em>Research Debug</em> to see the last state.
          </div>
          <pre className="max-h-48 overflow-auto rounded bg-muted p-2 text-[11px] leading-snug">
            {this.state.error.message || String(this.state.error)}
          </pre>
          <div className="flex gap-2 justify-end">
            <button
              className="text-xs px-3 py-1.5 rounded border hover:bg-accent"
              onClick={this.copy}
            >
              Copy details
            </button>
            <button
              className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90"
              onClick={this.reset}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ResearchErrorBoundary;
