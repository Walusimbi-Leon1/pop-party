/**
 * Pop Party — Main Application
 * Orchestrates Discord SDK, Firebase sync, and the game engine.
 */

import { initDiscord, isDiscord, channelId, playerName, playerId, updateActivity } from "./discord.js";
import { initFirebase, joinRoom, updateScore, leaveRoom } from "./firebase.js";
import { PopGame } from "./game.js";

// ── State ────────────────────────────────────────────────────────────────────
let game = null;
let players = [];
let playerScore = 0;
let playerScoreBcast = 0;
let hasJoinedRoom = false;

// ── DOM refs ─────────────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const splash = $("#splash");
const gameScreen = $("#gameScreen");
const playBtn = $("#playBtn");
const splashStatus = $("#splashStatus");
const canvas = $("#gameCanvas");
const scoreDisplay = $("#scoreDisplay");
const comboDisplay = $("#comboDisplay");
const sbList = $("#sbList");
const playerCountEl = $("#playerCount");
const onlineNum = $("#onlineNum");
const tapHint = $("#tapHint");

// ── Start ────────────────────────────────────────────────────────────────────
async function startApp() {
  // 1. Init Discord
  splashStatus.textContent = "Connecting to Discord...";
  const discordInfo = await initDiscord();
  console.log("[App] Discord:", discordInfo);

  splashStatus.textContent = discordInfo.isDiscord
    ? "Connected! 🎉"
    : "Browser mode — tap Play!";

  // 2. Init Firebase
  splashStatus.textContent = "Setting up game...";
  await initFirebase(discordInfo.channelId);

  splashStatus.textContent = "Ready!";
}

// ── Play ─────────────────────────────────────────────────────────────────────
async function startGame() {
  // Transition screen
  splash.classList.remove("active");
  gameScreen.classList.add("active");

  // Make canvas full size
  resizeCanvas();

  // Create game
  game = new PopGame(canvas);
  game.onScoreChange = (score) => {
    playerScore = score;
    scoreDisplay.textContent = score;
    updateScore(playerId, score);
    updateLeaderboard(); // Refresh leaderboard instantly on our own score change
    // Update Discord activity
    updateActivity(score);
  };
  game.onPop = (earned, combo, x, y, isGolden) => {
    // Show combo
    if (combo >= 3) {
      comboDisplay.textContent = combo + "x COMBO! +" + (Math.floor(combo / 3) * 5);
      comboDisplay.classList.remove("hidden");
      setTimeout(() => comboDisplay.classList.add("hidden"), 600);
    }

    // Show +points floating text
    showPopText(x, y, "+" + earned, isGolden ? "#FFD700" : "#fff");
  };

  // Join Firebase room (only once)
  if (!hasJoinedRoom) {
    hasJoinedRoom = true;
    joinRoom(playerId, playerName, (updatedPlayers) => {
      players = updatedPlayers;
      updateLeaderboard();
    });
  }

  // Show leaderboard immediately with just the local player
  updateLeaderboard();

  // Start game loop
  game.start();

  // Show tap hint briefly on mobile
  if ("ontouchstart" in window) {
    tapHint.classList.remove("hidden");
    setTimeout(() => tapHint.classList.add("hidden"), 4000);
  }
}

// ── Floating pop text ────────────────────────────────────────────────────────
function showPopText(x, y, text, color) {
  const el = document.createElement("div");
  el.className = "pop-text";
  el.textContent = text;
  el.style.left = x + "px";
  el.style.top = y + "px";
  el.style.color = color;
  el.style.position = "absolute";
  el.style.pointerEvents = "none";
  el.style.fontWeight = "800";
  el.style.fontSize = Math.min(28, 16 + text.length * 2) + "px";
  el.style.textShadow = "0 2px 8px rgba(0,0,0,0.3)";
  el.style.zIndex = "100";
  gameScreen.appendChild(el);
  setTimeout(() => el.remove(), 800);
}

// ── Leaderboard ──────────────────────────────────────────────────────────────
function updateLeaderboard() {
  // Build player list: local player + others from Firebase
  const sorted = [...players].sort((a, b) => (b.score || 0) - (a.score || 0));
  const otherPlayers = sorted.filter(p => p.id !== playerId);
  const totalPlayers = otherPlayers.length + 1;
  
  playerCountEl.textContent = totalPlayers;
  if (onlineNum) onlineNum.textContent = totalPlayers;

  const allPlayers = [
    { id: playerId, name: playerName, score: playerScore, isYou: true },
    ...otherPlayers.map(p => ({ ...p, isYou: false })),
  ].sort((a, b) => b.score - a.score);

  // Find your rank (1-indexed)
  const yourRank = allPlayers.findIndex(p => p.isYou) + 1;

  sbList.innerHTML = allPlayers.slice(0, 10).map((p, i) => {
    const rankClass = i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : "";
    const youLabel = p.isYou ? '<span class="sb-you-tag">YOU</span>' : "";
    return `
      <div class="sb-row ${p.isYou ? 'is-you' : ''}">
        <span class="sb-rank ${rankClass}">${i + 1}</span>
        <span class="sb-name">${escapeHtml(p.name)}${youLabel}</span>
        <span class="sb-score">${p.score}</span>
      </div>
    `;
  }).join("");

  // Subtle flash on your row when score changes
  const yourRow = sbList?.querySelector('.is-you');
  if (yourRow && playerScore > 0) {
    yourRow.classList.add('score-changed');
    setTimeout(() => yourRow.classList.remove('score-changed'), 400);
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ── Canvas resize ────────────────────────────────────────────────────────────
function resizeCanvas() {
  canvas.width = window.innerWidth * (window.devicePixelRatio || 1);
  canvas.height = window.innerHeight * (window.devicePixelRatio || 1);
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
}

// ── Init ─────────────────────────────────────────────────────────────────────
startApp();

// Play button
playBtn.addEventListener("click", startGame);

// Handle resize
window.addEventListener("resize", () => {
  if (game) {
    game._resize();
  }
});

// ── Cleanup handlers (multiple fallbacks for Discord iframe) ──

function cleanup() {
  if (game) game.destroy();
  if (hasJoinedRoom) {
    leaveRoom(playerId);
    hasJoinedRoom = false;
  }
}

// Standard page unload
window.addEventListener("beforeunload", () => {
  cleanup();
});

// pagehide is more reliable than beforeunload in iframes
window.addEventListener("pagehide", () => {
  cleanup();
});
