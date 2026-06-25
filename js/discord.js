/**
 * Discord Embedded App SDK integration for Pop Party.
 * Handles user identity via Discord's Activity auth context.
 *
 * Auth flow:
 *   In Discord Activity context, the SDK's authenticate() command returns
 *   user info directly — no OAuth code exchange needed. Discord transparently
 *   provides the auth context to the Activity iframe.
 *
 *   Requires the Activity URL to be set in Discord Developer Portal
 *   (Application → Settings → Activity → Activity URL).
 *   Discord shows the OAuth consent screen automatically on first launch.
 *
 *   If authenticate() fails (not in Discord, URL not configured), we fall
 *   back to a name input on the splash screen so players can set their name.
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

    // ── Get channel ID (doesn't require auth) ──
    let room = "lobby";
    try {
      const channel = await discordSdk.commands.getChannelId();
      if (channel && channel.channelId) room = channel.channelId;
    } catch {
      // Not in a voice channel
    }
    channelId = room;

    // ── Authenticate via Discord's Activity auth context ──
    // When the Activity URL is properly set in the Developer Portal,
    // Discord handles the OAuth consent flow transparently.
    // Users will see an authorization prompt from Discord on first launch.
    let user = null;
    try {
      const auth = await discordSdk.commands.authenticate();
      if (auth?.user) {
        user = auth.user;
        playerName = user.global_name || user.username || "Player";
        playerId = String(user.id);
        console.log("[Discord] Authenticated as:", playerName);
      }
    } catch (authErr) {
      console.warn("[Discord] auth failed:", authErr.message);
      // authenticate() failed. The SDK will attempt re-auth on next page load.
      // Player name will be set from the splash screen input instead.
    }

    console.log("[Discord] Connected. Room:", channelId, "Player:", playerName);
    return { isDiscord: true, channelId, playerName, playerId };
  } catch (err) {
    console.warn("[Discord] Not in Discord context:", err.message);
    // Browser mode — no Discord SDK available
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
