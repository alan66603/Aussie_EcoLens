export const USE_MOCK = false;

export const API_URL = "https://ugercq42f6.execute-api.us-east-1.amazonaws.com";

export const COGNITO_CONFIG = {
    region: "us-east-1",
    userPoolId: "us-east-1_z9tbqMpuu",
    clientId: "346ic6jl3fiu96igg5p1ri7i03",
    hostedUiUrl: "https://ecolens-best-team-work-ass2.auth.us-east-1.amazoncognito.com",
    redirectUri: `${window.location.origin}/callback`,
    logoutUri: window.location.origin,
    responseType: "code",
    scopes: ["openid", "email", "profile"],
};

export const AUTH_CONFIG = {
    headerPrefix: "Bearer",
    tokenStorageKey: "idToken",
};