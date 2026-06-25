/**
 * Discord Embedded App SDK integration for Pop Party.
 * Handles OAuth2 authorization, user identity, and activity updates.
 *
 * Auth flow (in Discord Activity context):
 *   1. Try silent authenticate() — works if already authorized this session
 *   2. If that fails, call authorize() — this opens Discord's OAuth consent
 *      modal INSIDE the Discord client (the user sees the "Authorize" screen
 *      with scrolled-down "Authorize" button)
 *   3. Exchange the authorization code for an access token via our serverless
 *      Cloudflare Pages Function (/api/exchange)
 *   4. Call authenticate({ access_token }) to get real Discord user info
 *   5. Use real Discord username + stable snowflake ID
 *
 * Outside Discord (browser mode) — uses anonymous IDs with name input.
 */

const CLIENT_ID = "1517048814513422467";

// ── State ────────────────────────────────────────────────────────────────────
export let discordSdk = null;
export let isDiscord = false;
export let isAuthorizing = false;
export let authError = null;
export let channelId = "lobby";
export let playerName = "Player";
export let playerId = "anon-" + Math.random().toString(36).slice(2, 9);

// ── Init Discord SDK ─────────────────────────────────────────────────────────
export async function initDiscord() {
  try {
    const mod = await import("https://cdn.jsdelivr.net/npm/@discord/embedded-app-sdk@1.8.0/+esm");
    const { DiscordSDK } = mod;

    discordSdk = new DiscordSDK(CLIENT_ID);
    await discordSdk.ready();

    isDiscord = true;

    // ── Get channel ID (doesn't require auth) ──
    let room = "lobby";
    try {
      const channel = await discordSdk.commands.getChannelId();
      if (channel && channel.channelId) room = channel.channelId;
    } catch {
      // Not in a voice channel
    }
    channelId = room;

    // ── Try silent authentication first ──
    // This works if the user already authorized the app (session cached)
    let user = null;
    try {
      const auth = await discordSdk.commands.authenticate();
      if (auth?.user) {
        user = auth.user;
        playerName = user.global_name || user.username || "Player";
        playerId = String(user.id);
        console.log("[Discord] Authenticated (silent):", playerName);
        return { isDiscord: true, channelId, playerName, playerId, authorized: true };
      }
    } catch {
      // Silent auth failed — need to show consent screen via authorize()
      console.log("[Discord] Silent auth failed — authorize() needed");
    }

    // Set a flag so the app knows to show an Authorize button
    // We don't call authorize() automatically here because it throws a modal
    // that can be jarring. Instead we let the user click "Authorize" when ready.
    // But we also auto-trigger it after a short delay for convenience.
    return { isDiscord: true, channelId, playerName, playerId, authorized: false };
  } catch (err) {
    console.warn("[Discord] Not in Discord context:", err.message);
    // Browser mode — no Discord SDK
    isDiscord = false;
    channelId = "lobby";
    playerName = "Guest " + Math.floor(Math.random() * 1000);
    playerId = "guest-" + Math.random().toString(36).slice(2, 9);
    return { isDiscord: false, channelId: "lobby", playerName, playerId, authorized: false };
  }
}

// ── Authorize (show the OAuth consent modal) ────────────────────────────────
export async function authorizeDiscord() {
  if (!discordSdk || isAuthorizing) return false;
  isAuthorizing = true;
  authError = null;

  try {
    // 🚀 This opens Discord's OAuth consent modal inside the client.
    // The user sees the app's name and permissions listed. They must
    // scroll down and click "Authorize". This is the consent screen.
    console.log("[Discord] Opening OAuth consent screen...");

    const { code } = await discordSdk.commands.authorize({
      client_id: CLIENT_ID,
      response_type: "code",
      state: crypto.randomUUID(),
      scope: ["identify"],
    });

    // Exchange the code for an access token via Cloudflare Function
    console.log("[Discord] Exchanging code for token...");
    const tokenResp = await fetch("/api/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    if (!tokenResp.ok) {
      const errText = await tokenResp.text();
      console.warn("[Discord] Token exchange failed:", errText);
      authError = "Authorization failed (token exchange). Try again.";
      isAuthorizing = false;
      return false;
    }

    const { access_token } = await tokenResp.json();

    // Authenticate with the real token to get user info
    const auth = await discordSdk.commands.authenticate({
      access_token,
    });

    if (auth?.user) {
      const user = auth.user;
      playerName = user.global_name || user.username || "Player";
      playerId = String(user.id);
      console.log("[Discord] Authorized as:", playerName);
      isAuthorizing = false;
      return true;
    }

    authError = "Could not get user info from Discord.";
    isAuthorizing = false;
    return false;
  } catch (err) {
    console.warn("[Discord] Authorization cancelled or failed:", err.message);
    authError = err.message.includes("cancelled") ? "Authorization cancelled." : "Authorization failed: " + err.message;
    isAuthorizing = false;
    return false;
  }
}

// ── Update activity status ───────────────────────────────────────────────────
export async function updateActivity(score) {
  if (!discordSdk) return;
  try {
    await discordSdk.commands.setActivity({
      activity: {
        type: 4,
        state: "Score: " + score,
        details: "🎈 Popping balloons!",
      },
    });
  } catch {
    // Best-effort — activity display is optional
  }
}
