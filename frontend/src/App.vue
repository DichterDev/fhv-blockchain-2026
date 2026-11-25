<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { formatEther } from "ethers";
import ArcadeHeader from "./components/ArcadeHeader.vue";
import ArenaCanvas from "./components/ArenaCanvas.vue";
import ControlDeck from "./components/ControlDeck.vue";
import LobbyPanel from "./components/LobbyPanel.vue";
import { useWallet } from "./composables/useWallet";
import { useArtilleryGame } from "./composables/useArtilleryGame";
import { GameStatus, WeaponType } from "./contracts/artillery";

const wallet = useWallet();
const game = useArtilleryGame();

const aimAngle = ref<number>(45);
const aimPower = ref<number>(55);
const selectedWeapon = ref<WeaponType>(WeaponType.Standard);

onMounted(async () => {
  await wallet.connectMetaMask(handleWalletChanged);
  await game.refreshLobby();
});

onUnmounted(() => {
  game.stopPolling();
});

async function handleWalletChanged() {
  if (game.activeGame.value) {
    // Flip default aiming direction when switching between P1 and P2 in dev mode
    aimAngle.value = game.playerRole.value === "P2" ? 135 : 45;
  } else {
    await game.refreshLobby();
  }
}

async function openMatch(gameId: number) {
  await game.loadGame(gameId);
  game.startPolling(gameId);
  aimAngle.value = game.playerRole.value === "P2" ? 135 : 45;
}
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <ArcadeHeader @wallet-changed="handleWalletChanged" />

    <!-- Status Telemetry Ticker -->
    <div
      class="bg-slate-900/90 border-b border-slate-800 px-4 py-1.5 flex items-center justify-between text-xs"
    >
      <span class="text-cyan-300 tracking-wider"> > {{ game.statusMessage.value }} </span>
      <button
        v-if="game.activeGame.value"
        @click="game.exitToLobby"
        class="text-fuchsia-400 hover:text-fuchsia-300 underline cursor-pointer"
      >
        ← EXIT TO LOBBY
      </button>
    </div>

    <main class="flex-1 max-w-6xl w-full mx-auto px-4 py-5">
      <!-- Lobby View -->
      <LobbyPanel
        v-if="!game.activeGame.value"
        :games="game.openGames.value"
        :join-fee="game.joinFee.value"
        :is-tx-pending="game.isTxPending.value"
        :my-address="wallet.address.value"
        @create="game.createGame"
        @join="game.joinGame"
        @spectate="openMatch"
        @refresh="game.refreshLobby"
      />

      <!-- Active Battle Arena -->
      <div v-else class="flex flex-col gap-4">
        <!-- HUD Health Bars & Pot -->
        <div class="grid grid-cols-3 items-center gap-4">
          <!-- Player 1 HP -->
          <div class="p-3 rounded-xl border border-cyan-500/40 bg-slate-950/80">
            <div class="flex justify-between text-xs mb-1">
              <span class="font-arcade font-bold text-cyan-300">
                P1 {{ game.playerRole.value === "P1" ? "(YOU)" : "" }}
              </span>
              <span class="text-cyan-200 font-bold">
                {{ game.activeGame.value.p1Hp }} / 100 HP
              </span>
            </div>
            <div class="w-full h-3 bg-slate-900 rounded-full overflow-hidden">
              <div
                class="h-full bg-cyan-400 shadow-[0_0_10px_#22d3ee] transition-all duration-300"
                :style="{ width: `${game.activeGame.value.p1Hp}%` }"
              />
            </div>
          </div>

          <!-- Center Match Info -->
          <div class="text-center">
            <div class="font-arcade text-xs text-slate-400">
              ARENA #{{ game.activeGame.value.gameId }} • TURN
              {{ game.activeGame.value.turnCount }}
            </div>
            <div class="font-arcade text-lg font-black text-emerald-400 mt-0.5">
              POT: {{ formatEther(game.activeGame.value.prizePool) }} ETH
            </div>
            <div
              v-if="game.activeGame.value.status === GameStatus.WaitingForPlayer"
              class="text-xs text-amber-300 animate-pulse mt-0.5"
            >
              WAITING FOR PLAYER 2...
            </div>
          </div>

          <!-- Player 2 HP -->
          <div class="p-3 rounded-xl border border-rose-500/40 bg-slate-950/80">
            <div class="flex justify-between text-xs mb-1">
              <span class="font-arcade font-bold text-rose-400">
                P2 {{ game.playerRole.value === "P2" ? "(YOU)" : "" }}
              </span>
              <span class="text-rose-200 font-bold">
                {{ game.activeGame.value.p2Hp }} / 100 HP
              </span>
            </div>
            <div class="w-full h-3 bg-slate-900 rounded-full overflow-hidden">
              <div
                class="h-full bg-rose-500 shadow-[0_0_10px_#f43f5e] transition-all duration-300"
                :style="{ width: `${game.activeGame.value.p2Hp}%` }"
              />
            </div>
          </div>
        </div>

        <!-- Victory Banner -->
        <div
          v-if="game.activeGame.value.status === GameStatus.Finished"
          class="p-5 rounded-xl border border-emerald-400 bg-emerald-950/60 text-center"
        >
          <h2 class="text-2xl font-black text-emerald-300">
            MATCH COMPLETE // WINNER:
            {{
              game.activeGame.value.winner.toLowerCase() ===
              game.activeGame.value.player1.toLowerCase()
                ? "PLAYER 1"
                : "PLAYER 2"
            }}
          </h2>
          <p class="text-xs text-emerald-200/80 mt-1">
            {{ game.activeGame.value.winner }}
          </p>
        </div>

        <!-- Main Canvas -->
        <ArenaCanvas
          :game="game.activeGame.value"
          :aim-angle="aimAngle"
          :aim-power="aimPower"
          :selected-weapon="selectedWeapon"
          :is-my-turn="game.isMyTurn.value"
          :player-role="game.playerRole.value"
          :last-shot="game.lastShot.value"
        />

        <!-- Bottom Weapon & Firing Controls -->
        <ControlDeck
          v-if="game.activeGame.value.status === GameStatus.Active"
          v-model:angle="aimAngle"
          v-model:power="aimPower"
          v-model:weapon="selectedWeapon"
          :can-fire="game.isMyTurn.value"
          :is-tx-pending="game.isTxPending.value"
          :wind="game.activeGame.value.wind"
          :blocks-left="game.blocksRemainingForTimeout.value"
          :can-claim-timeout="
            game.playerRole.value !== 'SPECTATOR' &&
            !game.isMyTurn.value &&
            game.blocksRemainingForTimeout.value === 0
          "
          @fire="game.fireShot(aimAngle, aimPower, selectedWeapon)"
          @claim-timeout="game.claimTimeout"
        />
      </div>
    </main>
  </div>
</template>
