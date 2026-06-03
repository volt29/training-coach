import { createHash, randomBytes, randomUUID } from "crypto";

import { apiError, requireApiUser } from "@/lib/api";
import {
  GarminIntegrationError,
  garminOAuthStateExpiresAt,
  getGarminOAuthRedirectUri,
  readGarminEnv
} from "@/lib/garmin";
import { prisma } from "@/lib/prisma";

function getRedirectUri(request: Request) {
  return getGarminOAuthRedirectUri(request.url);
}

function base64Url(value: Buffer) {
  return value
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createPkcePair() {
  const codeVerifier = base64Url(randomBytes(64));
  const codeChallenge = base64Url(createHash("sha256").update(codeVerifier).digest());

  return {
    codeVerifier,
    codeChallenge
  };
}

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  try {
    const authorizeUrl =
      readGarminEnv("GARMIN_OAUTH_AUTHORIZE_URL") ?? "https://connect.garmin.com/oauth2Confirm";
    const clientId = readGarminEnv("GARMIN_CLIENT_ID");

    if (!clientId) {
      throw new GarminIntegrationError(
        "Ustaw GARMIN_CLIENT_ID po otrzymaniu dostepu Garmin.",
        501
      );
    }

    const state = randomUUID();
    const pkce = createPkcePair();
    const now = new Date();
    await prisma.garminOAuthState.deleteMany({
      where: {
        OR: [
          { userId: auth.userId },
          {
            expiresAt: {
              lte: now
            }
          }
        ]
      }
    });
    await prisma.garminOAuthState.create({
      data: {
        userId: auth.userId,
        state,
        codeVerifier: pkce.codeVerifier,
        expiresAt: garminOAuthStateExpiresAt(now)
      }
    });

    const redirect = new URL(authorizeUrl);
    redirect.searchParams.set("response_type", "code");
    redirect.searchParams.set("client_id", clientId);
    redirect.searchParams.set("redirect_uri", getRedirectUri(request));
    const requestedScopes = readGarminEnv("GARMIN_OAUTH_SCOPES");
    if (requestedScopes) {
      redirect.searchParams.set("scope", requestedScopes);
    }
    redirect.searchParams.set("state", state);
    redirect.searchParams.set("code_challenge", pkce.codeChallenge);
    redirect.searchParams.set("code_challenge_method", "S256");

    return Response.redirect(redirect, 302);
  } catch (error) {
    return apiError(error);
  }
}
