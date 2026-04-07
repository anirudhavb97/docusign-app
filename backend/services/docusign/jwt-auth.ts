/**
 * DocuSign JWT Bearer Token Authentication
 *
 * Automatically fetches and refreshes the DocuSign access token using JWT.
 * Token is valid for 8 hours; we refresh it 5 minutes before expiry.
 *
 * Setup required (one-time):
 *   1. Upload the public key (backend/keys/docusign_public.pem) to your DocuSign
 *      developer account: Settings → Apps & Keys → your app → Add RSA Keypair
 *   2. Grant consent: visit the consentUrl printed on server startup
 */
import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const AUTH_SERVER  = () => process.env.DOCUSIGN_AUTH_SERVER  || "account-d.docusign.com";
const CLIENT_ID    = () => process.env.DOCUSIGN_CLIENT_ID!;
const USER_ID      = () => process.env.DOCUSIGN_USER_ID || "c6762933-19c9-4345-9a11-cdc134605cd4";
const PRIVATE_KEY_PATH = path.join(__dirname, "../../keys/docusign_private.pem");

interface TokenCache {
  accessToken: string;
  expiresAt: number; // ms since epoch
}

let tokenCache: TokenCache | null = null;
let refreshTimer: NodeJS.Timeout | null = null;

// ── JWT builder ──────────────────────────────────────────────────────────────

function buildJwt(): string {
  // Prefer env var (production/Railway), fall back to file (local dev)
  const privateKey = process.env.DOCUSIGN_PRIVATE_KEY
    ? process.env.DOCUSIGN_PRIVATE_KEY.replace(/\\n/g, "\n")
    : fs.readFileSync(PRIVATE_KEY_PATH, "utf8");
  const now = Math.floor(Date.now() / 1000);

  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: CLIENT_ID(),
    sub: USER_ID(),
    aud: AUTH_SERVER(),
    iat: now,
    exp: now + 3600,
    scope: "signature impersonation",
  })).toString("base64url");

  const signing = `${header}.${payload}`;
  const signature = crypto
    .createSign("SHA256")
    .update(signing)
    .sign(privateKey, "base64url");

  return `${signing}.${signature}`;
}

// ── Token fetch ──────────────────────────────────────────────────────────────

async function fetchToken(): Promise<TokenCache> {
  const jwt = buildJwt();

  const response = await axios.post(
    `https://${AUTH_SERVER()}/oauth/token`,
    new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  const { access_token, expires_in } = response.data;
  const expiresAt = Date.now() + (expires_in - 300) * 1000; // refresh 5 min early

  return { accessToken: access_token, expiresAt };
}

// ── Auto-refresh loop ────────────────────────────────────────────────────────

function scheduleRefresh(expiresAt: number) {
  if (refreshTimer) clearTimeout(refreshTimer);
  const delay = Math.max(expiresAt - Date.now(), 0);
  refreshTimer = setTimeout(async () => {
    try {
      console.log("[jwt-auth] Refreshing DocuSign access token...");
      tokenCache = await fetchToken();
      // Update env so all services pick it up
      process.env.DOCUSIGN_ACCESS_TOKEN = tokenCache.accessToken;
      console.log("[jwt-auth] Token refreshed — valid until", new Date(tokenCache.expiresAt).toLocaleTimeString());
      scheduleRefresh(tokenCache.expiresAt);
    } catch (err: any) {
      console.error("[jwt-auth] Token refresh failed:", err.message);
      // Retry in 60s
      setTimeout(() => scheduleRefresh(Date.now()), 60_000);
    }
  }, delay);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns a valid access token, fetching one if needed.
 */
export async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.accessToken;
  }
  tokenCache = await fetchToken();
  process.env.DOCUSIGN_ACCESS_TOKEN = tokenCache.accessToken;
  scheduleRefresh(tokenCache.expiresAt);
  return tokenCache.accessToken;
}

/**
 * Call once on server startup. Fetches the first token and starts the refresh loop.
 * Prints the consent URL if JWT auth hasn't been consented yet.
 */
export async function initJwtAuth(): Promise<boolean> {
  // Check key is available (env var or file)
  if (!process.env.DOCUSIGN_PRIVATE_KEY && !fs.existsSync(PRIVATE_KEY_PATH)) {
    console.warn("[jwt-auth] No private key found (DOCUSIGN_PRIVATE_KEY env var or file) — using static token from .env");
    return false;
  }

  try {
    console.log("[jwt-auth] Initializing JWT authentication...");
    tokenCache = await fetchToken();
    process.env.DOCUSIGN_ACCESS_TOKEN = tokenCache.accessToken;
    scheduleRefresh(tokenCache.expiresAt);
    console.log("[jwt-auth] ✓ JWT auth active — token auto-refreshes every ~8 hours");
    return true;
  } catch (err: any) {
    if (err.response?.data?.error === "consent_required") {
      const consentUrl = `https://${AUTH_SERVER()}/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=${CLIENT_ID()}&redirect_uri=https://developers.docusign.com/platform/auth/consent`;
      console.warn("\n[jwt-auth] ⚠️  Consent required — open this URL in your browser and click Allow:");
      console.warn("\n  " + consentUrl + "\n");
      console.warn("[jwt-auth] After granting consent, restart the server.\n");
    } else {
      console.error("[jwt-auth] JWT init failed:", err.response?.data || err.message);
      console.warn("[jwt-auth] Falling back to static token from .env");
    }
    return false;
  }
}
