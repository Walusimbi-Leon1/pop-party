/**
 * Discord Embedded App SDK integration for Pop Party.
 * Handles room/channel ID and player identity.
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

    // Authorize (scoped to identify)
    try {
      await discordSdk.commands.authorize({
        client_id: CLIENT_ID,
        response_type: "code",
        state: "",
        prompt: "none",
        scope: ["identify"],
      });
    } catch {
      // Authorization may be handled by Discord's embedded context
    }

    // Get channel ID for room sync
    let room = "lobby";
    try {
      const channel = await discordSdk.commands.getChannelId();
      if (channel && channel.channelId) room = channel.channelId;
    } catch {
      // Not in a channel context
    }

    // Try to get user info
    try {
      const { user } = await discordSdk.commands.authenticate({});
      if (user) {
        playerName = user.global_name || user.username || "Player";
        playerId = user.id || "discord-" + Math.random().toString(36).slice(2, 9);
      }
    } catch {
      // Authentication skipped — use defaults
      playerName = "Player " + Math.floor(Math.random() * 1000);
    }

    channelId = room;

    console.log("[Discord] Connected as " + playerName + " in room " + channelId);
    return { isDiscord: true, channelId, playerName, playerId };
  } catch (err) {
    console.warn("[Discord] Not in Discord:", err.message);
    // Fall back to browser mode
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
    // Best-effort
  }
}
