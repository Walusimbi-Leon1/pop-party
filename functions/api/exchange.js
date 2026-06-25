/**
 * Cloudflare Pages Function — OAuth2 Token Exchange
 *
 * Proxies the authorization code → access_token exchange with Discord.
 * Keeps the client_secret server-side so it's never exposed to users.
 *
 * Environment variables (set in Cloudflare Pages dashboard):
 *   DISCORD_CLIENT_ID      — OAuth2 Client ID
 *   DISCORD_CLIENT_SECRET  — OAuth2 Client Secret
 *   DISCORD_REDIRECT_URI   — OAuth2 Redirect URI (the Activity URL)
 */

export async function onRequest(context) {
  const { request, env } = context;

  // Only accept POST
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", "Allow": "POST" },
    });
  }

  // Parse request body
  let code;
  try {
    const body = await request.json();
    code = body.code;
    if (!code || typeof code !== "string") {
      throw new Error("Missing or invalid code");
    }
  } catch {
    return new Response(JSON.stringify({ error: "Bad request — code required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Check required env vars
  const clientId = env.DISCORD_CLIENT_ID || "1517048814513422467";
  const clientSecret = env.DISCORD_CLIENT_SECRET;
  const redirectUri = env.DISCORD_REDIRECT_URI || "https://pop-party.pages.dev/";

  if (!clientSecret) {
    return new Response(
      JSON.stringify({ error: "Server configuration error — DISCORD_CLIENT_SECRET not set" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  try {
    // Exchange the code with Discord's OAuth2 token endpoint
    const bodyParams = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code: code,
      redirect_uri: redirectUri,
    });

    const resp = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: bodyParams.toString(),
    });

    const data = await resp.json();

    if (!resp.ok) {
      console.error("[Exchange] Discord error:", data.error, data.error_description);
      return new Response(
        JSON.stringify({ error: data.error, description: data.error_description }),
        {
          status: resp.status,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Return the access token to the client
    return new Response(JSON.stringify({ access_token: data.access_token }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[Exchange] Internal error:", err.message);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
