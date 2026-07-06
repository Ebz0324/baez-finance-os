import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { apiGet, apiPost } from "./api";

export type Scope = "me" | "partner" | "household";

export type User = {
  id: string;
  name: string;
  role: "operator" | "partner";
  defaultScope: Scope;
  quickAddCurrency: "USD" | "DOP" | null;
};

export async function getMe(): Promise<User | null> {
  try {
    const { user } = await apiGet<{ user: User }>("/auth/me");
    return user;
  } catch {
    return null;
  }
}

export async function setupPasskey(name: string): Promise<User> {
  const options = await apiPost<PublicKeyCredentialCreationOptionsJSON>("/auth/setup/options", {
    name,
  });
  const response = await startRegistration({ optionsJSON: options });
  await apiPost("/auth/setup/verify", { response });
  // Re-fetch through /me so the client always gets the full preference shape.
  const user = await getMe();
  if (!user) throw new Error("setup succeeded but session is missing");
  return user;
}

export async function loginWithPasskey(): Promise<User> {
  const options = await apiPost<PublicKeyCredentialRequestOptionsJSON>("/auth/login/options");
  const response = await startAuthentication({ optionsJSON: options });
  await apiPost("/auth/login/verify", { response });
  const user = await getMe();
  if (!user) throw new Error("login succeeded but session is missing");
  return user;
}

export async function logout(): Promise<void> {
  await apiPost("/auth/logout");
}

// Minimal structural types so this file doesn't need @simplewebauthn/server's
// Node-only types just to describe the wire shape of the options responses.
type PublicKeyCredentialCreationOptionsJSON = Parameters<typeof startRegistration>[0]["optionsJSON"];
type PublicKeyCredentialRequestOptionsJSON = Parameters<typeof startAuthentication>[0]["optionsJSON"];
