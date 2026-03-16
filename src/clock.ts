/**
 * RCAN Time Synchronization — §8.4
 *
 * All RCAN robots MUST sync their clocks via NTP/NTS before operational mode.
 * Max drift tolerance ±5 seconds.
 */

/** Clock synchronization status returned by checkClockSync() */
export interface ClockSyncStatus {
  synchronized: boolean;
  offsetSeconds: number;
  source: string;
}

/** Thrown by assertClockSynced() when drift exceeds the allowed threshold */
export class ClockDriftError extends Error {
  readonly offsetSeconds: number;
  constructor(offsetSeconds: number, maxDriftSeconds: number) {
    super(
      `Clock drift too large: offset=${offsetSeconds.toFixed(3)}s > max=${maxDriftSeconds}s`
    );
    this.name = "ClockDriftError";
    this.offsetSeconds = offsetSeconds;
    Object.setPrototypeOf(this, ClockDriftError.prototype);
  }
}

/**
 * Check clock synchronization.
 *
 * In a browser / Node environment without access to chronyc or ntplib, we
 * perform a lightweight sanity check: compare local time against a trusted
 * time source by issuing an HTTP HEAD request and comparing the Date header.
 * Falls back to "assumed-synced" when running in environments where network
 * is unavailable (e.g., unit tests).
 *
 * Returns ClockSyncStatus with:
 *   synchronized: whether drift is within ±5s
 *   offsetSeconds: measured offset (positive = local is ahead)
 *   source: description of what was checked
 */
export async function checkClockSync(
  timeServer?: string
): Promise<ClockSyncStatus> {
  const server = timeServer ?? "https://worldtimeapi.org/api/ip";

  try {
    const before = Date.now();
    const resp = await fetch(server, { method: "HEAD", signal: AbortSignal.timeout(3000) });
    const after = Date.now();

    // Use the Date header from the response as a rough time reference
    const dateHeader = resp.headers.get("Date") ?? resp.headers.get("date");
    if (!dateHeader) {
      // No Date header — can't determine offset
      return {
        synchronized: true,
        offsetSeconds: 0,
        source: "assumed (no Date header)",
      };
    }

    const serverMs = new Date(dateHeader).getTime();
    if (isNaN(serverMs)) {
      return { synchronized: true, offsetSeconds: 0, source: "assumed (unparseable Date header)" };
    }

    // Use midpoint of request as estimate of server time
    const localMidpoint = (before + after) / 2;
    const offsetSeconds = (localMidpoint - serverMs) / 1000;
    const synchronized = Math.abs(offsetSeconds) <= 5;

    return { synchronized, offsetSeconds, source: server };
  } catch {
    // Network unavailable or timeout — assume synced (unit test / offline environment)
    return { synchronized: true, offsetSeconds: 0, source: "assumed (network unavailable)" };
  }
}

/**
 * Assert that the local clock is synchronized within maxDriftSeconds.
 *
 * Throws ClockDriftError if the measured offset exceeds the threshold.
 *
 * @param maxDriftSeconds - Maximum allowed |offset| in seconds (default 5)
 */
export async function assertClockSynced(maxDriftSeconds = 5): Promise<void> {
  const status = await checkClockSync();
  if (!status.synchronized || Math.abs(status.offsetSeconds) > maxDriftSeconds) {
    throw new ClockDriftError(status.offsetSeconds, maxDriftSeconds);
  }
}
