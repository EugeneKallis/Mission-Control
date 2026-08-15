export const PULSE_URL = "http://192.168.1.121:7655";

export type PulseViewState = "loading" | "available" | "unavailable" | "fallback";

interface PulsePageProps {
  /**
   * Pulse currently disallows framing, so the production page uses the
   * direct-open fallback. The other states keep the view's behavior explicit
   * and testable if the verified integration path changes later.
   */
  state?: PulseViewState;
}

function DirectPulseLink() {
  return (
    <a
      href={PULSE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-button)] bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-opacity hover:opacity-90"
    >
      <span className="material-symbols-outlined text-base">open_in_new</span>
      Open Pulse directly
    </a>
  );
}

export function PulsePage({ state = "fallback" }: PulsePageProps) {
  if (state === "available") {
    return (
      <section className="flex h-full min-h-0 flex-col" aria-label="Pulse">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-outline-variant/30 bg-surface px-4 py-3 sm:px-6">
          <h1 className="text-base font-semibold text-on-surface">Pulse</h1>
          <a
            href={PULSE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-primary hover:underline"
          >
            Open separately
          </a>
        </div>
        <iframe
          src={PULSE_URL}
          title="Pulse monitoring UI"
          className="block min-h-0 w-full flex-1 border-0"
        />
      </section>
    );
  }

  const isLoading = state === "loading";
  const isUnavailable = state === "unavailable";

  return (
    <section className="flex h-full min-h-0 items-center justify-center overflow-y-auto p-4 sm:p-6" aria-label="Pulse">
      <div
        className="w-full max-w-xl rounded-[var(--radius-card)] border border-outline-variant/40 bg-surface p-6 shadow-lg sm:p-8"
        role={isLoading ? "status" : "alert"}
      >
        <div className="mb-4 flex items-center gap-3">
          <span className="material-symbols-outlined text-3xl text-primary">
            {isLoading ? "progress_activity" : isUnavailable ? "cloud_off" : "monitor_heart"}
          </span>
          <h1 className="text-xl font-semibold text-on-surface">
            {isLoading ? "Loading Pulse" : isUnavailable ? "Pulse is unavailable" : "Pulse is available separately"}
          </h1>
        </div>
        <p className="mb-6 text-sm leading-6 text-on-surface-variant">
          {isLoading
            ? "Checking the Pulse monitoring view…"
            : isUnavailable
              ? "Pulse could not be reached from this browser. You can still open the instance directly."
              : "Pulse currently disallows embedded views. Open its existing monitoring UI directly to preserve its authentication and WebSocket behavior."}
        </p>
        <DirectPulseLink />
      </div>
    </section>
  );
}
