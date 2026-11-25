<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from "vue";
import {
  MAP_WIDTH,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  simulateShotPreview,
  type TrajectoryPoint,
} from "../game/physics";
import { WEAPONS, type GameState, type ShotResult, type WeaponType } from "../contracts/artillery";

const props = defineProps<{
  game: GameState;
  aimAngle: number;
  aimPower: number;
  selectedWeapon: WeaponType;
  isMyTurn: boolean;
  playerRole: "P1" | "P2" | "SPECTATOR";
  lastShot: ShotResult | null;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
let animFrameId = 0;

// Visual terrain buffer: freezes during projectile flight and carves out on impact
const renderedTerrain = ref<number[]>([...props.game.terrain]);

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

let activeProjectile: {
  points: TrajectoryPoint[];
  index: number;
  color: string;
  damage: number;
} | null = null;

let particles: Particle[] = [];
let floatingPopup: { x: number; y: number; text: string; life: number } | null = null;

// Sync renderedTerrain whenever game terrain updates and no projectile is mid-flight
watch(
  () => props.game.terrain,
  (newTerrain) => {
    if (!activeProjectile) {
      renderedTerrain.value = [...newTerrain];
    }
  },
  { deep: true },
);

watch(
  () => props.lastShot,
  (shot) => {
    if (!shot) return;
    // Freeze pre-impact terrain so projectile flies against the terrain it actually hit
    renderedTerrain.value = [...shot.preTerrain];

    const isP1Shooter = shot.shooter.toLowerCase() === props.game.player1.toLowerCase();
    const startCol = isP1Shooter ? props.game.p1X : props.game.p2X;
    const sim = simulateShotPreview(
      shot.preTerrain,
      startCol,
      shot.angle,
      shot.power,
      shot.preWind,
      shot.weapon,
    );
    const weaponSpec = WEAPONS[shot.weapon] ?? WEAPONS[0];
    activeProjectile = {
      points: sim.points,
      index: 0,
      color: weaponSpec.color,
      damage: shot.damageDealt,
    };
  },
);

function spawnExplosion(wx: number, wy: number, color: string, dmg: number) {
  // Now apply the post-impact terrain crater!
  renderedTerrain.value = [...props.game.terrain];

  for (let i = 0; i < 36; i++) {
    const a = Math.random() * Math.PI * 2;
    const spd = 2 + Math.random() * 8;
    particles.push({
      x: wx,
      y: wy,
      vx: Math.cos(a) * spd,
      vy: Math.sin(a) * spd,
      life: 1.0,
      color,
    });
  }
  if (dmg > 0) {
    floatingPopup = { x: wx, y: wy + 25, text: `-${dmg} HP`, life: 1.0 };
  }
}

function render() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const terrain = renderedTerrain.value;
  const W = canvas.width;
  const H = canvas.height;
  const scaleX = W / WORLD_WIDTH;
  const scaleY = H / WORLD_HEIGHT;

  const toCanvasX = (wx: number) => wx * scaleX;
  const toCanvasY = (wy: number) => H - wy * scaleY;

  ctx.fillStyle = "#060814";
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(34, 211, 238, 0.06)";
  ctx.lineWidth = 1;
  for (let gx = 0; gx < W; gx += 40) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, H);
    ctx.stroke();
  }
  for (let gy = 0; gy < H; gy += 40) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(W, gy);
    ctx.stroke();
  }

  const colW = W / MAP_WIDTH;
  const grad = ctx.createLinearGradient(0, H * 0.25, 0, H);
  grad.addColorStop(0, "rgba(217, 70, 239, 0.45)");
  grad.addColorStop(1, "rgba(15, 23, 42, 0.95)");

  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let i = 0; i < MAP_WIDTH; i++) {
    const h = terrain[i] ?? 200;
    const x0 = i * colW;
    const y0 = toCanvasY(h);
    ctx.lineTo(x0, y0);
    ctx.lineTo(x0 + colW, y0);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  for (let i = 0; i < MAP_WIDTH; i++) {
    const h = terrain[i] ?? 200;
    const x0 = i * colW;
    const y0 = toCanvasY(h);
    if (i === 0) ctx.moveTo(x0, y0);
    else ctx.lineTo(x0, y0);
    ctx.lineTo(x0 + colW, y0);
  }
  ctx.strokeStyle = "#e879f9";
  ctx.lineWidth = 3;
  ctx.shadowColor = "#d946ef";
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.shadowBlur = 0;

  drawTank(
    ctx,
    toCanvasX(props.game.p1X * 100 + 50),
    toCanvasY(terrain[props.game.p1X] ?? 200),
    "#22d3ee",
    props.playerRole === "P1" ? props.aimAngle : 45,
    "P1",
  );

  drawTank(
    ctx,
    toCanvasX(props.game.p2X * 100 + 50),
    toCanvasY(terrain[props.game.p2X] ?? 200),
    "#fb7185",
    props.playerRole === "P2" ? props.aimAngle : 135,
    "P2",
  );

  if (props.isMyTurn && !activeProjectile) {
    const startCol = props.playerRole === "P1" ? props.game.p1X : props.game.p2X;
    const preview = simulateShotPreview(
      terrain,
      startCol,
      props.aimAngle,
      props.aimPower,
      props.game.wind,
      props.selectedWeapon,
    );

    const weaponColor = WEAPONS[props.selectedWeapon]?.color ?? "#22d3ee";
    preview.points.slice(0, 28).forEach((pt, idx) => {
      ctx.beginPath();
      ctx.arc(toCanvasX(pt.x), toCanvasY(pt.y), 2.5, 0, Math.PI * 2);
      ctx.fillStyle = weaponColor;
      ctx.globalAlpha = Math.max(0.15, 1 - idx / 28);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  if (activeProjectile) {
    const p = activeProjectile.points[activeProjectile.index];
    if (p) {
      ctx.beginPath();
      ctx.arc(toCanvasX(p.x), toCanvasY(p.y), 6, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = activeProjectile.color;
      ctx.shadowBlur = 16;
      ctx.fill();
      ctx.shadowBlur = 0;

      activeProjectile.index += 2;
      if (activeProjectile.index >= activeProjectile.points.length) {
        const lastPt = activeProjectile.points[activeProjectile.points.length - 1];
        spawnExplosion(lastPt.x, lastPt.y, activeProjectile.color, activeProjectile.damage);
        activeProjectile = null;
      }
    }
  }

  particles.forEach((pt) => {
    pt.x += pt.vx * 8;
    pt.y += pt.vy * 4;
    pt.life -= 0.03;
    ctx.beginPath();
    ctx.arc(toCanvasX(pt.x), toCanvasY(pt.y), 3 * pt.life, 0, Math.PI * 2);
    ctx.fillStyle = pt.color;
    ctx.globalAlpha = Math.max(0, pt.life);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  particles = particles.filter((p) => p.life > 0);

  if (floatingPopup) {
    floatingPopup.y += 1.5;
    floatingPopup.life -= 0.02;
    ctx.font = "bold 20px Orbitron, sans-serif";
    ctx.fillStyle = "#facc15";
    ctx.globalAlpha = Math.max(0, floatingPopup.life);
    ctx.fillText(floatingPopup.text, toCanvasX(floatingPopup.x) - 35, toCanvasY(floatingPopup.y));
    ctx.globalAlpha = 1;
    if (floatingPopup.life <= 0) floatingPopup = null;
  }

  animFrameId = requestAnimationFrame(render);
}

function drawTank(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  color: string,
  angleDeg: number,
  label: string,
) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;

  const rad = (angleDeg * Math.PI) / 180;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 10);
  ctx.lineTo(cx + Math.cos(rad) * 22, cy - 10 - Math.sin(rad) * 22);
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(cx - 14, cy - 12, 28, 12, 4);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "bold 11px Orbitron, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, cx, cy + 16);
  ctx.restore();
}

onMounted(() => {
  animFrameId = requestAnimationFrame(render);
});

onUnmounted(() => {
  cancelAnimationFrame(animFrameId);
});
</script>

<template>
  <div
    class="relative w-full rounded-xl overflow-hidden border border-cyan-500/40 neon-border-cyan bg-slate-950"
  >
    <canvas ref="canvasRef" width="1120" height="450" class="w-full h-[320px] sm:h-[420px] block" />
    <div class="crt-scanlines pointer-events-none absolute inset-0 opacity-40" />
  </div>
</template>
