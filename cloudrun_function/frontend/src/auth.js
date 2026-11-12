import { AUTH_CONFIG, COGNITO_CONFIG } from "./config";

const PKCE_VERIFIER_KEY = "pkce_code_verifier";
const OAUTH_STATE_KEY = "oauth_state";

function buildQuery(params) {
    return new URLSearchParams(params).toString();
}

function generateRandomString(length = 64) {
    const charset =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    const randomValues = new Uint8Array(length);

    window.crypto.getRandomValues(randomValues);

    return Array.from(randomValues)
        .map((value) => charset[value % charset.length])
        .join("");
}

function base64UrlEncode(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";

    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });

    return window
        .btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

async function sha256(value) {
    const encoder = new TextEncoder();
    const data = encoder.encode(value);
    return window.crypto.subtle.digest("SHA-256", data);
}

async function createCodeChallenge(codeVerifier) {
    const hashed = await sha256(codeVerifier);
    return base64UrlEncode(hashed);
}

export async function buildCognitoUrl(mode = "signin") {
    const endpoint = mode === "signup" ? "signup" : "login";

    const codeVerifier = generateRandomString(96);
    const codeChallenge = await createCodeChallenge(codeVerifier);
    const state = generateRandomString(32);

    sessionStorage.setItem(PKCE_VERIFIER_KEY, codeVerifier);
    sessionStorage.setItem(OAUTH_STATE_KEY, state);

    const query = buildQuery({
        client_id: COGNITO_CONFIG.clientId,
        response_type: COGNITO_CONFIG.responseType,
        scope: COGNITO_CONFIG.scopes.join(" "),
        redirect_uri: COGNITO_CONFIG.redirectUri,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
    });

    return `${COGNITO_CONFIG.hostedUiUrl}/${endpoint}?${query}`;
}

export async function redirectToCognito(mode = "signin") {
    const url = await buildCognitoUrl(mode);
    window.location.href = url;
}

export async function parseCallbackTokens() {
    const params = new URLSearchParams(window.location.search);

    const error = params.get("error");
    const errorDescription = params.get("error_description");

    if (error) {
        throw new Error(errorDescription || error);
    }

    const code = params.get("code");
    const returnedState = params.get("state");

    if (!code) {
        return null;
    }

    const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY);

    if (!expectedState || returnedState !== expectedState) {
        throw new Error("Invalid OAuth state. Please try signing in again.");
    }

    const codeVerifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);

    if (!codeVerifier) {
        throw new Error("Missing PKCE code verifier. Please try signing in again.");
    }

    const tokenEndpoint = `${COGNITO_CONFIG.hostedUiUrl}/oauth2/token`;

    const body = buildQuery({
        grant_type: "authorization_code",
        client_id: COGNITO_CONFIG.clientId,
        code,
        redirect_uri: COGNITO_CONFIG.redirectUri,
        code_verifier: codeVerifier,
    });

    const response = await fetch(tokenEndpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
    }

    const tokens = await response.json();

    if (tokens.id_token) {
        localStorage.setItem("idToken", tokens.id_token);
    }

    if (tokens.access_token) {
        localStorage.setItem("accessToken", tokens.access_token);
    }

    if (tokens.refresh_token) {
        localStorage.setItem("refreshToken", tokens.refresh_token);
    }

    if (tokens.expires_in) {
        const expiryTime = Date.now() + Number(tokens.expires_in) * 1000;
        localStorage.setItem("tokenExpiry", String(expiryTime));
    }

    if (tokens.token_type) {
        localStorage.setItem("tokenType", tokens.token_type);
    }

    sessionStorage.removeItem(PKCE_VERIFIER_KEY);
    sessionStorage.removeItem(OAUTH_STATE_KEY);

    return tokens;
}

export function decodeJwt(token) {
    if (!token) {
        return null;
    }

    try {
        const payload = token.split(".")[1];

        if (!payload) {
            return null;
        }

        const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
        const jsonPayload = decodeURIComponent(
            window
                .atob(base64)
                .split("")
                .map((char) => {
                    return "%" + ("00" + char.charCodeAt(0).toString(16)).slice(-2);
                })
                .join("")
        );

        return JSON.parse(jsonPayload);
    } catch (error) {
        console.error("Failed to decode JWT:", error);
        return null;
    }
}

export function getUserProfile() {
    const idToken = localStorage.getItem("idToken");
    const claims = decodeJwt(idToken);

    if (!claims) {
        return null;
    }

    const email = claims.email || "";
    const username = claims["cognito:username"] || claims.username || "";

    const name =
        claims.name ||
        [claims.given_name, claims.family_name].filter(Boolean).join(" ") ||
        username ||
        email ||
        "User";

    const initials = name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase();

    return {
        name,
        email,
        username,
        initials: initials || "U",
        claims,
    };
}

export function getAuthToken() {
    return localStorage.getItem(AUTH_CONFIG.tokenStorageKey);
}

export function getTokenExpiryTime() {
    const idToken = localStorage.getItem("idToken");
    const claims = decodeJwt(idToken);

    if (claims && claims.exp) {
        return claims.exp * 1000;
    }

    const storedExpiry = localStorage.getItem("tokenExpiry");

    if (storedExpiry) {
        return Number(storedExpiry);
    }

    return null;
}

export function getTokenTimeRemainingText() {
    const expiryTime = getTokenExpiryTime();

    if (!expiryTime) {
        return "Session unknown";
    }

    const remainingMs = expiryTime - Date.now();

    if (remainingMs <= 0) {
        return "Session expired";
    }

    const remainingMinutes = Math.floor(remainingMs / 60000);

    if (remainingMinutes < 1) {
        return "Session <1 min";
    }

    return `Session ${remainingMinutes} min`;
}

export function isAuthenticated() {
    const token = getAuthToken();
    const expiryTime = getTokenExpiryTime();

    if (!token) {
        return false;
    }

    if (expiryTime && Date.now() > expiryTime) {
        clearAuthTokens();
        return false;
    }

    return true;
}

export function clearAuthTokens() {
    localStorage.removeItem("idToken");
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("tokenExpiry");
    localStorage.removeItem("tokenType");
    localStorage.removeItem("mockToken");

    sessionStorage.removeItem(PKCE_VERIFIER_KEY);
    sessionStorage.removeItem(OAUTH_STATE_KEY);
}

export function logoutFromCognito() {
    clearAuthTokens();

    const query = buildQuery({
        client_id: COGNITO_CONFIG.clientId,
        logout_uri: COGNITO_CONFIG.logoutUri,
    });

    window.location.href = `${COGNITO_CONFIG.hostedUiUrl}/logout?${query}`;
}

export function getAuthorizationHeader() {
    const token = getAuthToken();

    if (!token) {
        return "";
    }

    return `${AUTH_CONFIG.headerPrefix} ${token}`;
}