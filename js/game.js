/**
 * Pop Party — Balloon Game Engine
 * Canvas-based rendering with balloons, pop effects, and score tracking.
 */

// ── Constants ─────────────────────────────────────────────────────────────────
const BALLOON_COLORS = [
  "#ff4757", "#ff6b81", "#ffa502", "#ffd93d",
  "#7bed9f", "#2ed573", "#70a1ff", "#5352ed",
  "#e84393", "#fd79a8", "#00cec9", "#a29bfe",
  "#ff6348", "#1e90ff", "#ff69b4", "#fdcb6e",
];
const BALLOON_SHAPES = ["oval", "round", "teardrop"];
const MAX_BALLOONS = 30;
const SPAWN_INTERVAL = 800; // ms between spawns
const GOLDEN_CHANCE = 0.08; // 8% chance per spawn
const NORMAL_POINTS = 10;
const GOLDEN_POINTS = 50;
const COMBO_WINDOW = 1000; // ms
const POP_PARTICLES = 12;

// ── Balloon ──────────────────────────────────────────────────────────────────
function createBalloon(canvasW, canvasH) {
  const isGolden = Math.random() < GOLDEN_CHANCE;
  const sizeVariation = 14 + Math.random() * 16; // 14-30px radius
  const wobbleSpeed = 0.5 + Math.random() * 1.5;
  const wobbleAmount = 10 + Math.random() * 20;
  const driftSpeed = -0.3 + Math.random() * 0.6; // horizontal drift
  const stringLen = 20 + Math.random() * 30;

  return {
    x: 40 + Math.random() * (canvasW - 80),
    y: canvasH + sizeVariation + 10, // start below screen
    radius: isGolden ? sizeVariation * 1.2 : sizeVariation,
    speed: 40 + Math.random() * 60 + (isGolden ? 15 : 0), // px/sec upward
    color: isGolden ? "#FFD700" : BALLOON_COLORS[Math.floor(Math.random() * BALLOON_COLORS.length)],
    isGolden,
    wobblePhase: Math.random() * Math.PI * 2,
    wobbleSpeed,
    wobbleAmount,
    driftSpeed,
    stringLen,
    popped: false,
    popTime: 0,
    opacity: 1,
    shape: BALLOON_SHAPES[Math.floor(Math.random() * BALLOON_SHAPES.length)],
  };
}

// ── Particles ────────────────────────────────────────────────────────────────
function createParticles(x, y, color, count) {
  const particles = [];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const speed = 80 + Math.random() * 160;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 40,
      radius: 2 + Math.random() * 4,
      color: color,
      life: 1,
      decay: 1.5 + Math.random() * 1.5,
    });
  }
  return particles;
}

// ── Game class ────────────────────────────────────────────────────────────────
export class PopGame {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.balloons = [];
    this.particles = [];
    this.score = 0;
    this.combo = 0;
    this.lastPopTime = 0;
    this.lastSpawnTime = 0;
    this.lastFrame = 0;
    this.dpr = 1;
    this.running = false;
    this.raf = null;
    this.onScoreChange = null; // callback
    this.onPop = null; // callback(score, combo)
    this.totalPops = 0;

    // Bind pointer events
    this._handlePointer = this._handlePointer.bind(this);
    this.canvas.addEventListener("pointerdown", this._handlePointer);
    this.canvas.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
  }

  // ── Resize ────────────────────────────────────────────────────────────────
  _resize() {
    this.dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (this.canvas.width !== w * this.dpr || this.canvas.height !== h * this.dpr) {
      this.canvas.width = w * this.dpr;
      this.canvas.height = h * this.dpr;
    }
    this.w = w;
    this.h = h;
  }

  // ── Start / Stop ─────────────────────────────────────────────────────────
  start() {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    this.lastSpawnTime = performance.now();
    this._resize();
    this._loop(performance.now());
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener("pointerdown", this._handlePointer);
  }

  // ── Pointer handling ────────────────────────────────────────────────────
  _handlePointer(e) {
    const rect = this.canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * this.dpr;
    const py = (e.clientY - rect.top) * this.dpr;

    // Check collision from top (closest first)
    // Go in reverse order so visually on-top balloons are hit first
    for (let i = this.balloons.length - 1; i >= 0; i--) {
      const b = this.balloons[i];
      if (b.popped) continue;

      const dx = (px / this.dpr - b.x) * this.dpr;
      const dy = (py / this.dpr - b.y) * this.dpr;
      const distSq = dx * dx + dy * dy;

      if (distSq < (b.radius * this.dpr + 8) ** 2) {
        this._popBalloon(b);
        return;
      }
    }
  }

  // ── Pop balloon ──────────────────────────────────────────────────────────
  _popBalloon(b) {
    b.popped = true;
    b.popTime = performance.now();

    const now = Date.now();
    if (now - this.lastPopTime < COMBO_WINDOW) {
      this.combo++;
    } else {
      this.combo = 0;
    }
    this.lastPopTime = now;

    const points = b.isGolden ? GOLDEN_POINTS : NORMAL_POINTS;
    const comboBonus = Math.floor(this.combo / 3) * 5;
    const earned = points + comboBonus;

    this.score += earned;
    this.totalPops++;
    this.lastPopTime = Date.now();

    // Particles
    const p = createParticles(b.x, b.y, b.color, POP_PARTICLES + (b.isGolden ? 8 : 0));
    if (b.isGolden) {
      // Add gold sparkle particles
      p.push(...createParticles(b.x, b.y, "#fffacd", 6).map(pp => ({ ...pp, color: "#fffacd" })));
    }
    this.particles.push(...p);

    // Callback
    if (this.onScoreChange) this.onScoreChange(this.score);
    if (this.onPop) this.onPop(earned, this.combo, b.x, b.y, b.isGolden);

    // Play a pop sound
    this._playPopSound(b.isGolden);
  }

  // ── Simple pop sound via AudioContext ────────────────────────────────────
  _playPopSound(isGolden) {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(isGolden ? 800 : 600, ac.currentTime);
      osc.frequency.exponentialRampToValueAtTime(isGolden ? 1200 : 200, ac.currentTime + 0.15);
      gain.gain.setValueAtTime(0.15, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ac.currentTime + 0.15);
      osc.start(ac.currentTime);
      osc.stop(ac.currentTime + 0.15);
    } catch {
      // Audio not available — no big deal
    }
  }

  // ── Spawn new balloons ───────────────────────────────────────────────────
  _spawnBalloons() {
    if (this.balloons.filter(b => !b.popped).length >= MAX_BALLOONS) return;
    this.balloons.push(createBalloon(this.w, this.h));
  }

  // ── Main loop ────────────────────────────────────────────────────────────
  _loop(now) {
    if (!this.running) return;

    this._resize();
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;

    // Spawn
    if (now - this.lastSpawnTime > SPAWN_INTERVAL) {
      this.lastSpawnTime = now;
      this._spawnBalloons();
    }

    // Update
    this._update(dt);
    this._render();

    this.raf = requestAnimationFrame((t) => this._loop(t));
  }

  // ── Update physics ───────────────────────────────────────────────────────
  _update(dt) {
    const now = performance.now();

    // Update balloons
    this.balloons = this.balloons.filter(b => {
      if (b.popped) {
        // Keep popped balloons for a brief moment for visual effect
        return (now - b.popTime) < 300;
      }

      // Move upward
      b.y -= b.speed * dt;

      // Wobble
      b.wobblePhase += b.wobbleSpeed * dt;
      b.x += Math.sin(b.wobblePhase) * b.wobbleAmount * dt * 0.5;

      // Drift
      b.x += b.driftSpeed * dt * 20;

      // Remove if off screen (top or sides)
      if (b.y < -b.radius * 2 || b.x < -100 || b.x > this.w + 100) {
        return false;
      }

      return true;
    });

    // Update particles
    this.particles = this.particles.filter(p => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 200 * dt; // gravity
      p.life -= p.decay * dt;
      return p.life > 0;
    });
  }

  // ── Render ───────────────────────────────────────────────────────────────
  _render() {
    const ctx = this.ctx;
    const dpr = this.dpr;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // ── Background gradient ──
    const grad = ctx.createLinearGradient(0, 0, 0, this.h);
    grad.addColorStop(0, "#87CEEB");
    grad.addColorStop(0.25, "#B0E0E6");
    grad.addColorStop(0.5, "#E0F0FF");
    grad.addColorStop(0.7, "#F0FFF0");
    grad.addColorStop(0.85, "#90EE90");
    grad.addColorStop(1, "#7CCD7C");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.w, this.h);

    // Draw grass at bottom
    ctx.fillStyle = "#5DAA5D";
    ctx.beginPath();
    ctx.moveTo(0, this.h);
    for (let x = 0; x <= this.w; x += 5) {
      ctx.lineTo(x, this.h - 15 - Math.sin(x * 0.03 + this.lastFrame * 0.001) * 4);
    }
    ctx.lineTo(this.w, this.h);
    ctx.fill();

    // ── Draw balloons ──
    for (const b of this.balloons) {
      if (b.popped) continue;

      const alpha = Math.max(0, Math.min(1, (b.y) / 100));
      ctx.globalAlpha = alpha;

      // String
      ctx.strokeStyle = "rgba(100,100,100,0.3)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(b.x - 2, b.y + b.radius);
      ctx.quadraticCurveTo(
        b.x - 8 + Math.sin(b.wobblePhase + 1) * 4,
        b.y + b.radius + b.stringLen * 0.5,
        b.x - 6 + Math.sin(b.wobblePhase + 2) * 3,
        b.y + b.radius + b.stringLen
      );
      ctx.stroke();

      // Balloon body
      ctx.fillStyle = b.isGolden ? "#FFD700" : b.color;

      // Highlight / shine
      ctx.shadowColor = b.isGolden ? "rgba(255,215,0,0.3)" : "transparent";
      ctx.shadowBlur = b.isGolden ? 15 : 0;

      ctx.beginPath();
      if (b.shape === "round") {
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      } else {
        // Teardrop / oval shape
        const stretch = b.shape === "teardrop" ? 1.3 : 1.15;
        ctx.ellipse(b.x, b.y, b.radius, b.radius * stretch, 0, 0, Math.PI * 2);
      }
      ctx.fill();

      ctx.shadowBlur = 0;

      // Shine highlight
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.beginPath();
      ctx.ellipse(b.x - b.radius * 0.25, b.y - b.radius * 0.3, b.radius * 0.2, b.radius * 0.15, -0.5, 0, Math.PI * 2);
      ctx.fill();

      // Knot at bottom
      ctx.fillStyle = "rgba(0,0,0,0.15)";
      ctx.beginPath();
      ctx.moveTo(b.x - 3, b.y + b.radius - 2);
      ctx.lineTo(b.x, b.y + b.radius + 3);
      ctx.lineTo(b.x + 3, b.y + b.radius - 2);
      ctx.fill();

      // Golden sparkles
      if (b.isGolden) {
        for (let s = 0; s < 3; s++) {
          const sx = b.x + Math.sin(b.wobblePhase + s * 2) * b.radius * 0.7;
          const sy = b.y + Math.cos(b.wobblePhase * 1.3 + s * 2.5) * b.radius * 0.6;
          ctx.fillStyle = "rgba(255,255,200," + (0.5 + Math.sin(b.wobblePhase * 2 + s) * 0.3) + ")";
          ctx.beginPath();
          ctx.arc(sx, sy, 1.5 + Math.sin(b.wobblePhase * 2 + s) * 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1;
    }

    // ── Draw particles ──
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ── Draw pop burst rings ──
    for (const b of this.balloons) {
      if (!b.popped) continue;
      const elapsed = (performance.now() - b.popTime) / 1000;
      if (elapsed > 0.3) continue;

      const progress = elapsed / 0.3;
      ctx.strokeStyle = b.isGolden ? "rgba(255,215,0," + (1 - progress) + ")" : "rgba(255,255,255," + (1 - progress) * 0.6 + ")";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius + progress * 40, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // ── Get current score ───────────────────────────────────────────────────
  getScore() {
    return this.score;
  }

  // ── Reset ────────────────────────────────────────────────────────────────
  reset() {
    this.balloons = [];
    this.particles = [];
    this.score = 0;
    this.combo = 0;
    this.totalPops = 0;
    this.lastPopTime = 0;
    this.lastSpawnTime = performance.now();
  }

  // ── Destroy ──────────────────────────────────────────────────────────────
  destroy() {
    this.stop();
    this.canvas.removeEventListener("pointerdown", this._handlePointer);
  }
}
