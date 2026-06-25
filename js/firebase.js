/**
 * Firebase Realtime Database integration for Pop Party.
 * Syncs scores and player presence across the room in real-time.
 * Uses heartbeat-based presence for reliable behavior inside Discord's iframe.
 */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCF6ga46piBB7THekHNDZZmJZ2Q1httGcQ",
  authDomain: "pop-party-1.firebaseapp.com",
  databaseURL: "https://pop-party-1-default-rtdb.firebaseio.com",
  projectId: "pop-party-1",
  storageBucket: "pop-party-1.firebasestorage.app",
  messagingSenderId: "370649982813",
  appId: "1:370649982813:web:42aad8ff883ff0886c6ab4",
  measurementId: "G-8J0YDNLKP7"
};

// ── State ────────────────────────────────────────────────────────────────────
let db = null;
let dbMod = null;
let currentChannelId = "lobby";
let unsubscribers = [];
let heartbeatInterval = null;
let pollInterval = null;
let onPlayersUpdateCallback = null;
const HEARTBEAT_MS = 3000;      // ping every 3s
const POLL_MS = 3000;           // refresh player list every 3s
const STALE_MS = 12000;         // consider player offline after 12s no heartbeat
const CLEANUP_MS = 60000;       // remove stale players after 60s

function playerPath(playerId) {
  return "rooms/" + currentChannelId + "/players/" + playerId;
}

function allPlayersRef() {
  return dbMod.ref(db, "rooms/" + currentChannelId + "/players");
}

// ── Init ─────────────────────────────────────────────────────────────────────
export async function initFirebase(channelId) {
  const appMod = await import("https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js");
  dbMod = await import("https://www.gstatic.com/firebasejs/12.15.0/firebase-database.js");

  const app = appMod.initializeApp(FIREBASE_CONFIG);
  db = dbMod.getDatabase(app);
  currentChannelId = channelId.replace(/[^a-zA-Z0-9_-]/g, "") || "lobby";

  console.log("[Firebase] Connected. Room:", currentChannelId);
  return { db, currentChannelId };
}

// ── Join room ────────────────────────────────────────────────────────────────
export function joinRoom(playerId, playerName, onPlayersUpdate) {
  if (!db || !dbMod) return;

  onPlayersUpdateCallback = onPlayersUpdate;

  // Register this player in the room
  writePlayerData(playerId, playerName, 0);

  // ── Listener: real-time updates from Firebase ──
  const ref = allPlayersRef();
  const unsubscribe = dbMod.onValue(ref, (snapshot) => {
    const raw = snapshot.val();
    updatePlayerList(raw);
  });
  unsubscribers.push(unsubscribe);

  // ── Heartbeat: keep ourselves alive ──
  startHeartbeat(playerId, playerName);

  // ── Poll: fallback for environments where onValue misses updates ──
  startPoll(playerId, playerName);
}

// ── Write player data ────────────────────────────────────────────────────────
function writePlayerData(playerId, playerName, score) {
  if (!db || !dbMod) return;
  const ref = dbMod.ref(db, playerPath(playerId));
  dbMod.set(ref, {
    id: playerId,
    name: playerName,
    score: score || 0,
    joinedAt: Date.now(),
    lastActive: Date.now(),
    online: true
  });
}

// ── Heartbeat (keep our online flag alive) ──
function startHeartbeat(playerId, playerName) {
  stopHeartbeat();
  heartbeatInterval = setInterval(() => {
    if (!db || !dbMod) return;
    const ref = dbMod.ref(db, playerPath(playerId) + "/lastActive");
    dbMod.set(ref, Date.now());
  }, HEARTBEAT_MS);
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

// ── Poll (periodically re-read the player list) ──
function startPoll(playerId, playerName) {
  stopPoll();
  pollInterval = setInterval(() => {
    if (!db || !dbMod || !onPlayersUpdateCallback) return;
    // Do a single read of the player list
    const ref = allPlayersRef();
    dbMod.get(ref).then((snapshot) => {
      const raw = snapshot.val();
      updatePlayerList(raw);
    }).catch(() => {
      // Poll failed silently — onValue will catch updates when it can
    });
  }, POLL_MS);
}

function stopPoll() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// ── Process raw player data ──────────────────────────────────────────────────
function updatePlayerList(raw) {
  if (!onPlayersUpdateCallback) return;
  if (!raw) {
    onPlayersUpdateCallback([]);
    return;
  }

  const now = Date.now();
  const list = Object.values(raw)
    .filter(p => p && p.online && (now - (p.lastActive || 0)) < STALE_MS)
    .map(p => ({
      ...p,
      // Fix scores that may be null/undefined
      score: p.score || 0
    }));

  onPlayersUpdateCallback(list);
}

// ── Update score ─────────────────────────────────────────────────────────────
export function updateScore(playerId, score) {
  if (!db || !dbMod) return;

  const ref = dbMod.ref(db, playerPath(playerId) + "/score");
  dbMod.set(ref, score);
  // lastActive is handled by heartbeat
}

// ── Leave room ───────────────────────────────────────────────────────────────
export function leaveRoom(playerId) {
  stopHeartbeat();
  stopPoll();

  unsubscribers.forEach(fn => {
    try { fn(); } catch {}
  });
  unsubscribers = [];

  if (!db || !dbMod) return;

  // Mark offline
  const ref = dbMod.ref(db, playerPath(playerId));
  dbMod.update(ref, { online: false, lastActive: Date.now() });

  // Clean up data after a delay
  setTimeout(() => {
    dbMod.remove(ref);
  }, CLEANUP_MS);
}
