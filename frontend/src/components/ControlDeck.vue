<script setup lang="ts">
import { computed } from "vue";
import { WEAPONS, type WeaponType } from "../contracts/artillery";
import { snapAngle } from "../game/physics";

const angle = defineModel<number>("angle", { required: true });
const power = defineModel<number>("power", { required: true });
const weapon = defineModel<WeaponType>("weapon", { required: true });

defineProps<{
  canFire: boolean;
  isTxPending: boolean;
  wind: number;
  blocksLeft: number;
  canClaimTimeout: boolean;
}>();

const emit = defineEmits<{
  (e: "fire"): void;
  (e: "claimTimeout"): void;
}>();

const activeWeaponSpec = computed(() => WEAPONS[weapon.value] ?? WEAPONS[0]);
</script>

<template>
  <div
    class="grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 rounded-xl border border-fuchsia-500/40 bg-slate-950/90 neon-border-pink"
  >
    <!-- Weapon Selector with ETH Cost -->
    <div class="lg:col-span-4 flex flex-col gap-2">
      <span class="text-xs text-fuchsia-400 font-arcade tracking-wider">
        01 // SELECT ORDNANCE
      </span>
      <div class="grid grid-cols-3 gap-2">
        <button
          v-for="w in WEAPONS"
          :key="w.id"
          @click="weapon = w.id"
          :class="[
            'p-2.5 rounded-lg border text-left transition cursor-pointer flex flex-col justify-between',
            weapon === w.id
              ? 'border-cyan-400 bg-cyan-950/60 shadow-[0_0_12px_rgba(34,211,238,0.35)]'
              : 'border-slate-800 bg-slate-900/70 hover:border-slate-600',
          ]"
        >
          <div class="flex items-center justify-between">
            <span class="text-xs font-black font-arcade" :style="{ color: w.color }">
              {{ w.tag }}
            </span>
            <span class="text-[11px] text-slate-400">{{ w.maxDmg }} DMG</span>
          </div>
          <div class="text-[11px] text-slate-200 font-bold mt-1 truncate">
            {{ w.name }}
          </div>
          <div class="text-[10px] text-emerald-400 font-bold mt-1">
            {{ w.costLabel }}
          </div>
        </button>
      </div>
    </div>

    <!-- Angle & Power Sliders -->
    <div class="lg:col-span-5 flex flex-col justify-center gap-3 px-1">
      <div>
        <div class="flex justify-between text-xs mb-1">
          <span class="text-cyan-400 font-arcade">
            02 // ELEVATION (SNAPS TO {{ snapAngle(angle) }}°)
          </span>
          <span class="text-cyan-200 font-bold">{{ angle }}°</span>
        </div>
        <input
          v-model.number="angle"
          type="range"
          min="0"
          max="180"
          step="5"
          class="w-full accent-cyan-400 cursor-pointer"
        />
      </div>

      <div>
        <div class="flex justify-between text-xs mb-1">
          <span class="text-fuchsia-400 font-arcade">03 // THRUST POWER</span>
          <span class="text-fuchsia-200 font-bold">{{ power }}%</span>
        </div>
        <input
          v-model.number="power"
          type="range"
          min="5"
          max="100"
          step="1"
          class="w-full accent-fuchsia-500 cursor-pointer"
        />
      </div>
    </div>

    <!-- Fire Trigger & Wind/Timeout Telemetry -->
    <div class="lg:col-span-3 flex flex-col justify-between gap-2">
      <div
        class="flex items-center justify-between px-3 py-1.5 rounded bg-slate-900 border border-slate-800 text-xs"
      >
        <span class="text-slate-400">WIND VECTOR:</span>
        <span
          :class="
            wind === 0
              ? 'text-slate-300'
              : wind > 0
                ? 'text-emerald-400 font-bold'
                : 'text-amber-400 font-bold'
          "
        >
          {{ wind > 0 ? `→ +${wind}` : wind < 0 ? `← ${wind}` : "CALM (0)" }}
        </span>
      </div>

      <button
        @click="emit('fire')"
        :disabled="!canFire || isTxPending"
        class="w-full py-3 rounded-lg font-arcade font-black tracking-widest text-xs transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-fuchsia-600 to-cyan-500 text-slate-950 shadow-[0_0_20px_rgba(217,70,239,0.5)] hover:brightness-110"
      >
        {{
          isTxPending
            ? "TRANSMITTING..."
            : canFire
              ? `FIRE (${activeWeaponSpec.costLabel})`
              : "ENEMY TURN"
        }}
      </button>

      <button
        v-if="canClaimTimeout"
        @click="emit('claimTimeout')"
        class="w-full py-1 rounded border border-amber-400/60 bg-amber-500/20 text-amber-300 text-[11px] font-bold hover:bg-amber-500/30 cursor-pointer"
      >
        CLAIM TIMEOUT WIN
      </button>
      <div v-else class="text-[11px] text-center text-slate-500">
        TIMEOUT IN {{ blocksLeft }} BLOCKS
      </div>
    </div>
  </div>
</template>
