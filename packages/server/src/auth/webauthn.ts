import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import { config } from "../config.js";

const CHALLENGE_COOKIE = "wa_challenge";
const CHALLENGE_TTL_SECONDS = 120;

type ChallengePayload = { challenge: string; userId?: string };

export function setChallengeCookie(c: Context, payload: ChallengePayload) {
  setCookie(c, CHALLENGE_COOKIE, Buffer.from(JSON.stringify(payload)).toString("base64url"), {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "Lax",
    path: "/",
    maxAge: CHALLENGE_TTL_SECONDS,
  });
}

export function readChallengeCookie(c: Context): ChallengePayload | null {
  const raw = getCookie(c, CHALLENGE_COOKIE);
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function clearChallengeCookie(c: Context) {
  deleteCookie(c, CHALLENGE_COOKIE, { path: "/" });
}

export async function buildRegistrationOptions(userId: string, userName: string) {
  return generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpId,
    userID: new TextEncoder().encode(userId),
    userName,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "preferred",
    },
  });
}

export async function checkRegistration(
  response: RegistrationResponseJSON,
  expectedChallenge: string,
) {
  return verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: config.origin,
    expectedRPID: config.rpId,
  });
}

export async function buildAuthenticationOptions() {
  // No allowCredentials: this is a discoverable-credential (usernameless) login —
  // the platform authenticator itself prompts the household member to pick a passkey.
  return generateAuthenticationOptions({
    rpID: config.rpId,
    userVerification: "preferred",
  });
}

export async function checkAuthentication(
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
  credential: { id: string; publicKey: Buffer; counter: number; transports?: string[] },
) {
  return verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: config.origin,
    expectedRPID: config.rpId,
    credential: {
      id: credential.id,
      publicKey: Uint8Array.from(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports as never,
    },
  });
}
