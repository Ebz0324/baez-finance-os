import { startRegistration, startAuthentication } from "@simplewebauthn/browser";

export type User = { id: string; name: string; role: "operator" | "partner" };

async function api<T>(path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method: "POST", credentials: "include" };
  if (body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`/api${path}`, init);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `request failed: ${res.status}`);
  return data as T;
}

export async function getMe(): Promise<User | null> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  if (!res.ok) return null;
  const { user } = await res.json();
  return user;
}

export async function setupPasskey(name: string): Promise<User> {
  const options = await api<PublicKeyCredentialCreationOptionsJSON>("/auth/setup/options", { name });
  const response = await startRegistration({ optionsJSON: options });
  const { user } = await api<{ user: User }>("/auth/setup/verify", { response });
  return user;
}

export async function loginWithPasskey(): Promise<User> {
  const options = await api<PublicKeyCredentialRequestOptionsJSON>("/auth/login/options");
  const response = await startAuthentication({ optionsJSON: options });
  const { user } = await api<{ user: User }>("/auth/login/verify", { response });
  return user;
}

export async function logout(): Promise<void> {
  await api("/auth/logout");
}

// Minimal structural types so this file doesn't need @simplewebauthn/server's
// Node-only types just to describe the wire shape of the options responses.
type PublicKeyCredentialCreationOptionsJSON = Parameters<typeof startRegistration>[0]["optionsJSON"];
type PublicKeyCredentialRequestOptionsJSON = Parameters<typeof startAuthentication>[0]["optionsJSON"];
