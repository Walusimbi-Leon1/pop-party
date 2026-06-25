/**
 * Discord Embedded App SDK integration for Pop Party.
 * Handles OAuth2 authorization, user identity, and activity updates.
 *
 * Auth flow:
 *   1. Try silent authenticate() — works if user already authorized previously
 *   2. If that fails, call authorize() — shows Discord's OAuth consent modal
 *      (the user scrolls down and clicks "Authorize")
 *   3. Exchange the authorization code for an access token via /api/exchange
 *   4. Call authenticate({ access_token }) to get user info
 *   5. Use real Discord user ID and name for the game
 */

const CLIENT_ID = "1517048814513422467";

// ── State ────────────────────────────────────────────────────────────────────
export let discordSdk = null;
export let isDiscord = false;
export let channelId = "lobby";
export let playerName = "Player";
export let playerId = "anon-" + Math.random().toString(36).slice(2, 9);

// ── Init ─────────────────────────────────────────────────────────────────────
export async function initDiscord() {
  try {
    const mod = await import("https://cdn.jsdelivr.net/npm/@discord/embedded-app-sdk@1.8.0/+esm");
    const { DiscordSDK } = mod;

    discordSdk = new DiscordSDK(CLIENT_ID);
    await discordSdk.ready();

    isDiscord = true;

    // ── Get channel (doesn't require auth) ──
    let room = "lobby";
    try {
      const channel = await discordSdk.commands.getChannelId();
      if (channel && channel.channelId) room = channel.channelId;
    } catch {
      // Not in a voice channel
    }
    channelId = room;

    // ── Try silent authentication (works if already authorized this session) ──
    let user = null;
    try {
      const auth = await discordSdk.commands.authenticate();
      user = auth.user;
      console.log("[Discord] Authenticated (silent):", user?.username);
    } catch {
      // Silent auth failed — user hasn't authorized yet (or session expired)
      // Show the OAuth consent screen
      console.log("[Discord] Showing OAuth consent screen...");

      try {
        // 🚀 This opens Discord's OAuth modal inside the Discord client.
        // The user sees the permissions listed and must scroll down
        // to click the "Authorize" button. This is the key missing piece.
        const { code } = await discordSdk.commands.authorize({
          client_id: CLIENT_ID,
          response_type: "code",
          state: crypto.randomUUID(),
          scope: ["identify"],
          // No prompt parameter = always shows the consent screen
        });

        // Exchange the authorization code for an access token
        // Uses a Cloudflare Pages Function to keep the client_secret safe
        const tokenResp = await fetch("/api/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });

        if (tokenResp.ok) {
          const { access_token } = await tokenResp.json();

          // Authenticate with the obtained token to get user info
          const auth = await discordSdk.commands.authenticate({
            access_token,
          });
          user = auth.user;
          console.log("[Discord] Authorized:", user?.username);
        } else {
          console.warn("[Discord] Token exchange failed:", await tokenResp.text());
        }
      } catch (authErr) {
        console.warn("[Discord] Authorization cancelled or failed:", authErr.message);
      }
    }

    // ── Set player identity from Discord user info ──
    if (user) {
      playerName = user.global_name || user.username || "Player";
      playerId = String(user.id);
      console.log("[Discord] Player:", playerName, "(ID:", playerId + ")");
    } else {
      // Fallback — user denied authorization or exchange failed
      playerName = "Player " + Math.floor(Math.random() * 1000);
      playerId = "discord-anon-" + Math.random().toString(36).slice(2, 9);
      console.log("[Discord] Using fallback identity:", playerName);
    }

    return { isDiscord: true, channelId, playerName, playerId };
  } catch (err) {
    console.warn("[Discord] Not in Discord context:", err.message);
    // Browser mode — no Discord SDK
    isDiscord = false;
    channelId = "lobby";
    playerName = "Guest " + Math.floor(Math.random() * 1000);
    playerId = "guest-" + Math.random().toString(36).slice(2, 9);
    return { isDiscord: false, channelId: "lobby", playerName, playerId };
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
