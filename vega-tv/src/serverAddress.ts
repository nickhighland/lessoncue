import { normalizeLessonCueServerUrl } from "./protocol/serverUrl.ts";

/**
 * Which LessonCue server this television belongs to.
 *
 * The player itself is served by that server and keeps its own pairing, so this
 * is the only thing the native shell has to remember. It is also the only thing
 * that can strand a television: an address that no longer answers leaves a
 * blank screen unless somebody is given a way to change it.
 */

export const STORAGE_KEY = "lessoncue.serverUrl";

/** Where a television looks first, before anybody has told it anything. */
export const DEFAULT_SERVER_URL = "http://lessoncue.local";

/** The player is served from the server's own origin, and fetches relative to it. */
export function playerUrlFor(serverUrl: string): string {
  return `${normalizeLessonCueServerUrl(serverUrl)}/player?kiosk`;
}

export function healthUrlFor(serverUrl: string): string {
  return `${normalizeLessonCueServerUrl(serverUrl)}/health`;
}

export interface Reachability {
  reachable: boolean;
  detail?: string;
}

/**
 * Whether the server answers, with a short patience.
 *
 * A server on the same network answers in milliseconds or not at all. Waiting
 * longer buys nothing and costs a television sitting on a blank screen, which
 * is the failure people report as the app being broken.
 */
export async function probeServer(
  serverUrl: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 2_500,
): Promise<Reachability> {
  let url: string;
  try {
    url = healthUrlFor(serverUrl);
  } catch (error) {
    return { reachable: false, detail: (error as Error).message };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    return response.ok
      ? { reachable: true }
      : { reachable: false, detail: `The server answered with ${response.status}.` };
  } catch (error) {
    const aborted = (error as Error)?.name === "AbortError";
    return {
      reachable: false,
      detail: aborted ? "The server did not answer in time." : "The server could not be reached.",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Somewhere to keep the address between launches. */
export interface AddressStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export async function loadServerUrl(store: AddressStore): Promise<string> {
  try {
    const saved = await store.getItem(STORAGE_KEY);
    if (!saved) return DEFAULT_SERVER_URL;
    // Validated on the way out as well as in: a value written by an older
    // version, or edited by hand, should not be able to send a device token
    // somewhere the policy would refuse today.
    return normalizeLessonCueServerUrl(saved);
  } catch {
    return DEFAULT_SERVER_URL;
  }
}

export async function saveServerUrl(store: AddressStore, value: string): Promise<string> {
  const normalized = normalizeLessonCueServerUrl(value);
  await store.setItem(STORAGE_KEY, normalized);
  return normalized;
}
