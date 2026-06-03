import {
  fetchGarminUserPermissionsForToken,
  GarminIntegrationError,
  garminAccessTokenExpiresAt,
  isGarminOAuthStateExpired,
  encryptGarminToken,
  getGarminOAuthRedirectUri,
  normalizeGarminTokenType,
  readGarminEnv
} from "@/lib/garmin";
import { prisma } from "@/lib/prisma";

type TokenPayload = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  garmin_user_id?: string;
  user_id?: string;
};

type SuccessfulTokenPayload = TokenPayload & {
  access_token: string;
};

type UserIdPayload = {
  userId?: string;
};

function getRedirectUri(request: Request) {
  return getGarminOAuthRedirectUri(request.url);
}

async function exchangeCodeForToken(
  request: Request,
  code: string,
  codeVerifier: string
): Promise<SuccessfulTokenPayload> {
  const tokenUrl =
    readGarminEnv("GARMIN_OAUTH_TOKEN_URL") ??
    "https://connectapi.garmin.com/di-oauth2-service/oauth/token";
  const clientId = readGarminEnv("GARMIN_CLIENT_ID");
  const clientSecret = readGarminEnv("GARMIN_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    throw new GarminIntegrationError(
      "Ustaw GARMIN_CLIENT_ID i GARMIN_CLIENT_SECRET po otrzymaniu dostepu Garmin.",
      501
    );
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: getRedirectUri(request),
    client_id: clientId,
    client_secret: clientSecret,
    code_verifier: codeVerifier
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    body
  });
  const payload = (await response.json()) as TokenPayload;

  if (!response.ok || !payload.access_token) {
    throw new GarminIntegrationError("Nie udalo sie wymienic kodu Garmin OAuth na token.", 502);
  }

  return payload as SuccessfulTokenPayload;
}

async function fetchGarminUserId(accessToken: string, tokenType = "Bearer") {
  const userIdUrl =
    readGarminEnv("GARMIN_USER_ID_URL") ?? "https://apis.garmin.com/wellness-api/rest/user/id";
  const response = await fetch(userIdUrl, {
    headers: {
      Authorization: `${tokenType} ${accessToken}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as UserIdPayload;
  return payload.userId ?? null;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const appUrl = new URL("/", request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const oauthError = requestUrl.searchParams.get("error");

  if (oauthError) {
    appUrl.searchParams.set("garmin", "oauth-error");
    return Response.redirect(appUrl, 302);
  }

  if (!code || !state) {
    appUrl.searchParams.set("garmin", "missing-code");
    return Response.redirect(appUrl, 302);
  }

  const savedState = await prisma.garminOAuthState.findUnique({
    where: { state }
  });

  if (!savedState) {
    appUrl.searchParams.set("garmin", "invalid-state");
    return Response.redirect(appUrl, 302);
  }

  if (isGarminOAuthStateExpired(savedState.expiresAt) || !savedState.codeVerifier) {
    await prisma.garminOAuthState.delete({ where: { id: savedState.id } });
    appUrl.searchParams.set("garmin", "invalid-state");
    return Response.redirect(appUrl, 302);
  }

  try {
    const token = await exchangeCodeForToken(request, code, savedState.codeVerifier);
    const tokenType = normalizeGarminTokenType(token.token_type);
    const providerUserId =
      token.garmin_user_id ??
      token.user_id ??
      (await fetchGarminUserId(token.access_token, tokenType));
    if (!providerUserId) {
      throw new GarminIntegrationError("Nie udalo sie pobrac API userId Garmin.", 502);
    }
    const expiresAt = garminAccessTokenExpiresAt(token.expires_in);
    const permissions = await fetchGarminUserPermissionsForToken(token.access_token, tokenType);
    const permissionData =
      permissions === null
        ? {}
        : {
            permissions: permissions.join(" ")
          };

    await prisma.$transaction([
      prisma.garminConnection.upsert({
        where: { userId: savedState.userId },
        update: {
          mode: "oauth",
          providerUserId,
          accessToken: encryptGarminToken(token.access_token),
          refreshToken: encryptGarminToken(token.refresh_token),
          tokenType,
          expiresAt,
          scopes: token.scope ?? null,
          ...permissionData,
          connectedAt: new Date()
        },
        create: {
          userId: savedState.userId,
          mode: "oauth",
          providerUserId,
          accessToken: encryptGarminToken(token.access_token),
          refreshToken: encryptGarminToken(token.refresh_token),
          tokenType,
          expiresAt,
          scopes: token.scope ?? null,
          permissions: permissions?.join(" ") ?? null
        }
      }),
      prisma.garminOAuthState.deleteMany({ where: { userId: savedState.userId } })
    ]);

    appUrl.searchParams.set("garmin", "connected");
    return Response.redirect(appUrl, 302);
  } catch {
    appUrl.searchParams.set("garmin", "token-error");
    return Response.redirect(appUrl, 302);
  }
}
