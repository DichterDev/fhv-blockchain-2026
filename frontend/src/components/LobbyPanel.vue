<script setup lang="ts">
import { formatEther } from "ethers";
import { GameStatus, type GameState } from "../contracts/artillery";

defineProps<{
  games: GameState[];
  joinFee: bigint;
  isTxPending: boolean;
  myAddress: string;
}>();

const emit = defineEmits<{
  (e: "create"): void;
  (e: "join", gameId: number): void;
  (e: "spectate", gameId: number): void;
  (e: "refresh"): void;
}>();

function statusLabel(status: GameStatus) {
  if (status === GameStatus.WaitingForPlayer) return "OPEN LOBBY";
  if (status === GameStatus.Active) return "IN COMBAT";
  return "FINISHED";
}
</script>

<template>
  <div class="max-w-4xl mx-auto mt-8 flex flex-col gap-6">
    <!-- Hero Callout -->
    <div
      class="p-6 rounded-2xl border border-cyan-500/40 bg-slate-950/85 neon-border-cyan flex flex-col sm:flex-row items-center justify-between gap-4"
    >
      <div>
        <h2 class="text-2xl font-black text-cyan-300 neon-text-cyan">
          INSERT COIN // 1V1 ARTILLERY
        </h2>
        <p class="text-sm text-slate-400 mt-1">
          Entry stake:
          <span class="text-emerald-400 font-bold"> {{ formatEther(joinFee) }} ETH </span>
          (includes auto-funded gasless session key for zero-popup turns).
        </p>
      </div>

      <div class="flex items-center gap-3">
        <button
          @click="emit('refresh')"
          class="px-4 py-3 rounded-xl border border-slate-700 bg-slate-900 text-xs font-bold text-slate-300 hover:border-cyan-400 cursor-pointer"
        >
          REFRESH
        </button>
        <button
          @click="emit('create')"
          :disabled="isTxPending"
          class="px-6 py-3 rounded-xl font-arcade font-black text-sm tracking-wider bg-gradient-to-r from-cyan-400 to-fuchsia-500 text-slate-950 shadow-[0_0_20px_rgba(34,211,238,0.45)] hover:brightness-110 disabled:opacity-40 cursor-pointer"
        >
          {{ isTxPending ? "DEPLOYING..." : "+ NEW ARENA" }}
        </button>
      </div>
    </div>

    <!-- Active & Open Matches -->
    <div class="rounded-2xl border border-fuchsia-500/30 bg-slate-950/80 overflow-hidden">
      <div class="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
        <span class="font-arcade text-xs text-fuchsia-400 tracking-widest"> RECENT ARENAS </span>
        <span class="text-xs text-slate-500">{{ games.length }} FOUND</span>
      </div>

      <div v-if="games.length === 0" class="p-8 text-center text-slate-500 text-sm">
        No arenas deployed yet. Click <span class="text-cyan-300">+ NEW ARENA</span> to start!
      </div>

      <div v-else class="divide-y divide-slate-800/80">
        <div
          v-for="g in games"
          :key="g.gameId"
          class="px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-900/50"
        >
          <div class="flex items-center gap-4">
            <span class="font-arcade font-bold text-cyan-300"> #{{ g.gameId }} </span>
            <span
              :class="[
                'text-[11px] px-2 py-0.5 rounded font-bold',
                g.status === GameStatus.WaitingForPlayer
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : g.status === GameStatus.Active
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-slate-800 text-slate-400',
              ]"
            >
              {{ statusLabel(g.status) }}
            </span>
            <span class="text-xs text-slate-400">
              P1: {{ g.player1.slice(0, 6) }}...{{ g.player1.slice(-4) }}
            </span>
          </div>

          <div class="flex items-center gap-2">
            <button
              v-if="
                g.status === GameStatus.WaitingForPlayer &&
                g.player1.toLowerCase() !== myAddress.toLowerCase()
              "
              @click="emit('join', g.gameId)"
              :disabled="isTxPending"
              class="px-4 py-1.5 rounded-lg bg-fuchsia-500 text-slate-950 font-arcade font-bold text-xs shadow-[0_0_12px_#d946ef] hover:brightness-110 cursor-pointer"
            >
              JOIN ({{ formatEther(joinFee) }} ETH)
            </button>

            <button
              @click="emit('spectate', g.gameId)"
              class="px-3 py-1.5 rounded-lg border border-cyan-500/40 text-cyan-300 text-xs font-bold hover:bg-cyan-950/60 cursor-pointer"
            >
              {{
                g.player1.toLowerCase() === myAddress.toLowerCase() ||
                g.player2.toLowerCase() === myAddress.toLowerCase()
                  ? "ENTER MATCH"
                  : "WATCH"
              }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
