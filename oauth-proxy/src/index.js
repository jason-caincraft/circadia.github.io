const COOKIE_NAME = "circadia_decap_oauth_state";
const STATE_TTL_SECONDS = 600;
const JSON_HEADERS = {
  "Cache-Control": "no-store"
};

function getCookie(request, name) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const cookies = cookieHeader.split(/;\s*/).filter(Boolean);

  for (const cookie of cookies) {
    const separatorIndex = cookie.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = cookie.slice(0, separatorIndex);
    const value = cookie.slice(separatorIndex + 1);

    if (key === name) {
      return decodeURIComponent(value);
    }
  }

  return "";
}

function buildCookie(name, value, maxAgeSeconds) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`
  ].join("; ");
}

function textResponse(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      ...JSON_HEADERS,
      ...headers
    }
  });
}

function htmlResponse(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

function callbackPage(status, payload, cookieHeader) {
  const serializedPayload = JSON.stringify(payload);
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Circadia OAuth</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #f4efe6;
        color: #1d1a16;
        font: 16px/1.5 Georgia, "Times New Roman", serif;
      }

      main {
        width: min(92vw, 32rem);
        padding: 1.5rem;
        border: 1px solid rgba(81, 66, 48, 0.16);
        border-radius: 1rem;
        background: rgba(255, 252, 246, 0.96);
        box-shadow: 0 1rem 2rem rgba(41, 30, 15, 0.08);
      }

      h1 {
        margin: 0 0 0.75rem;
        font-size: 1.5rem;
      }

      p {
        margin: 0;
        color: #5f554b;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${status === "success" ? "Login complete" : "Login failed"}</h1>
      <p id="message">${status === "success"
        ? "You can close this window if it does not close automatically."
        : "Return to the admin page and try again after checking the OAuth settings."}</p>
    </main>
    <script>
      const payload = ${serializedPayload};
      const status = ${JSON.stringify(status)};
      const message = document.getElementById("message");

      function sendResult(targetOrigin) {
        if (!window.opener) {
          return;
        }

        const data = "authorization:github:" + status + ":" + JSON.stringify(payload);
        window.opener.postMessage(data, targetOrigin);
      }

      function receiveMessage(event) {
        sendResult(event.origin);
        window.removeEventListener("message", receiveMessage, false);
        window.close();
      }

      if (window.opener) {
        window.addEventListener("message", receiveMessage, false);
        window.opener.postMessage("authorizing:github", "*");
      } else if (status === "success") {
        message.textContent = "GitHub returned successfully, but no CMS window was found to receive the login result.";
      }
    </script>
  </body>
</html>`;

  const headers = cookieHeader ? { "Set-Cookie": cookieHeader } : {};
  return htmlResponse(html, status === "success" ? 200 : 400, headers);
}

async function exchangeCodeForToken(code, redirectUri, env) {
  const body = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    client_secret: env.GITHUB_CLIENT_SECRET,
    code,
    redirect_uri: redirectUri
  });

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const payload = await response.json();

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      payload
    };
  }

  if (payload.error || !payload.access_token) {
    return {
      ok: false,
      status: 400,
      payload
    };
  }

  return {
    ok: true,
    status: 200,
    payload
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const redirectUri = `${url.origin}/callback`;

    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
      return textResponse("Missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET.", 500);
    }

    if (request.method !== "GET") {
      return textResponse("Method not allowed.", 405, {
        Allow: "GET"
      });
    }

    if (url.pathname === "/" || url.pathname === "") {
      return textResponse(
        "Circadia OAuth proxy is running. Use /auth to start the GitHub sign-in flow.",
        200
      );
    }

    if (url.pathname === "/auth") {
      const state = crypto.randomUUID();
      const scope = env.GITHUB_SCOPE || "public_repo";
      const allowSignup = (env.GITHUB_ALLOW_SIGNUP || "false").toLowerCase();
      const authorizeUrl = new URL("https://github.com/login/oauth/authorize");

      authorizeUrl.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
      authorizeUrl.searchParams.set("redirect_uri", redirectUri);
      authorizeUrl.searchParams.set("scope", scope);
      authorizeUrl.searchParams.set("state", state);
      authorizeUrl.searchParams.set("allow_signup", allowSignup === "true" ? "true" : "false");

      return new Response(null, {
        status: 302,
        headers: {
          Location: authorizeUrl.toString(),
          "Set-Cookie": buildCookie(COOKIE_NAME, state, STATE_TTL_SECONDS),
          "Cache-Control": "no-store"
        }
      });
    }

    if (url.pathname === "/callback") {
      const stateFromQuery = url.searchParams.get("state") || "";
      const stateFromCookie = getCookie(request, COOKIE_NAME);
      const clearCookie = buildCookie(COOKIE_NAME, "", 0);
      const oauthError = url.searchParams.get("error");
      const oauthErrorDescription = url.searchParams.get("error_description");

      if (oauthError) {
        return callbackPage("error", {
          error: oauthError,
          error_description: oauthErrorDescription || "GitHub rejected the authorization request."
        }, clearCookie);
      }

      if (!stateFromQuery || !stateFromCookie || stateFromQuery !== stateFromCookie) {
        return callbackPage("error", {
          error: "state_mismatch",
          error_description: "The OAuth state check failed. Start the login flow again."
        }, clearCookie);
      }

      const code = url.searchParams.get("code");
      if (!code) {
        return callbackPage("error", {
          error: "missing_code",
          error_description: "GitHub did not return an authorization code."
        }, clearCookie);
      }

      const tokenResult = await exchangeCodeForToken(code, redirectUri, env);
      if (!tokenResult.ok) {
        return callbackPage("error", {
          error: tokenResult.payload.error || "token_exchange_failed",
          error_description:
            tokenResult.payload.error_description ||
            "GitHub did not return an access token."
        }, clearCookie);
      }

      return callbackPage("success", {
        token: tokenResult.payload.access_token,
        provider: "github"
      }, clearCookie);
    }

    return textResponse("Not found.", 404);
  }
};
