/** Fixed by the Pulse integration contract; the API key is the configurable value. */
export const PULSE_URL = "http://192.168.1.121:7655";

export const PULSE_PUBLIC_ENDPOINTS = [
  "/api/health",
  "/api/version",
  "/api/security/status",
] as const;

export const PULSE_RESOURCES_PATH = "/api/resources" as const;

export function pulsePublicUrl(path: string): string {
  return `${PULSE_URL}${path}`;
}
