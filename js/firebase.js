/**
 * Firebase Realtime Database integration for Pop Party.
 * Syncs scores and player presence across the room in real-time.
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
let lastHeartbeat = 0;

function playerPath(playerId) {
  return "rooms/" + currentChannelId + "/players/" + playerId;
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

  // Register this player
  const data = {
    id: playerId,
    name: playerName,
    score: 0,
    joinedAt: Date.now(),
    lastActive: Date.now(),
    online: true
  };

  const pRef = dbMod.ref(db, playerPath(playerId));
  dbMod.set(pRef, data);

  // Listen for all players in the room using onValue (modular SDK)
  const allPlayersRef = dbMod.ref(db, "rooms/" + currentChannelId + "/players");
  const unsubscribe = dbMod.onValue(allPlayersRef, (snapshot) => {
    const raw = snapshot.val();
    if (raw) {
      const list = Object.values(raw).filter(p => p && p.online);
      onPlayersUpdate(list);
    } else {
      onPlayersUpdate([]);
    }
  });

  unsubscribers.push(unsubscribe);
}

// ── Update score ─────────────────────────────────────────────────────────────
export function updateScore(playerId, score) {
  if (!db || !dbMod) return;

  const ref = dbMod.ref(db, playerPath(playerId) + "/score");
  dbMod.set(ref, score);
  const ref2 = dbMod.ref(db, playerPath(playerId) + "/lastActive");
  dbMod.set(ref2, Date.now());
}

// ── Leave room ───────────────────────────────────────────────────────────────
export function leaveRoom(playerId) {
  unsubscribers.forEach(fn => fn());
  unsubscribers = [];

  if (!db || !dbMod) return;
  const ref = dbMod.ref(db, playerPath(playerId));
  dbMod.update(ref, { online: false, lastActive: Date.now() });

  // Clean up after 30s
  setTimeout(() => {
    dbMod.remove(ref);
  }, 30000);
}
