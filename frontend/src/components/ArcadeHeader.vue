<script setup lang="ts">
import { useWallet } from "../composables/useWallet";

const wallet = useWallet();
const emit = defineEmits<{ (e: "walletChanged"): void }>();

async function selectBurner(idx: number) {
  await wallet.connectBurner(idx);
  emit("walletChanged");
}

async function selectMetaMask() {
  await wallet.connectMetaMask();
  emit("walletChanged");
}
</script>

<template>
  <header
    class="border-b border-cyan-500/40 bg-slate-950/90 backdrop-blur-md px-4 py-3 flex flex-wrap items-center justify-between gap-4"
  >
    <!-- Logo -->
    <div class="flex items-center gap-3">
      <div class="w-3 h-3 rounded-full bg-fuchsia-500 shadow-[0_0_12px_#d946ef] animate-pulse" />
      <h1 class="text-xl md:text-2xl font-black tracking-widest text-cyan-300 neon-text-cyan">
        SHELLSHOCK<span class="text-fuchsia-400 neon-text-pink">.ETH</span>
      </h1>
      <span
        class="hidden sm:inline-block text-[11px] px-2 py-0.5 rounded border border-fuchsia-500/40 bg-fuchsia-950/40 text-fuchsia-300"
      >
        CHAIN {{ wallet.chainId }}
      </span>
    </div>

    <!-- Wallet & Dev Burner Switcher -->
    <div class="flex flex-wrap items-center gap-2">
      <!-- Dev Burner Quick-Switch -->
      <div class="flex items-center bg-slate-900 border border-cyan-500/30 rounded-lg p-1 gap-1">
        <span class="text-[11px] text-cyan-400/70 px-2 uppercase">DEV:</span>
        <button
          @click="selectBurner(0)"
          :class="[
            'px-2.5 py-1 rounded text-xs font-bold transition cursor-pointer',
            wallet.mode.value === 'burner' && wallet.burnerIndex.value === 0
              ? 'bg-cyan-500 text-slate-950 shadow-[0_0_10px_#06b6d4]'
              : 'text-cyan-300 hover:bg-cyan-950',
          ]"
        >
          P1 (#0)
        </button>
        <button
          @click="selectBurner(1)"
          :class="[
            'px-2.5 py-1 rounded text-xs font-bold transition cursor-pointer',
            wallet.mode.value === 'burner' && wallet.burnerIndex.value === 1
              ? 'bg-fuchsia-500 text-slate-950 shadow-[0_0_10px_#d946ef]'
              : 'text-fuchsia-300 hover:bg-fuchsia-950',
          ]"
        >
          P2 (#1)
        </button>
      </div>

      <!-- MetaMask Button -->
      <button
        @click="selectMetaMask"
        :class="[
          'px-3 py-1.5 rounded-lg border text-xs font-bold tracking-wider transition cursor-pointer',
          wallet.mode.value === 'metamask'
            ? 'border-amber-400 bg-amber-500/20 text-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.4)]'
            : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-amber-400/60',
        ]"
      >
        METAMASK
      </button>

      <!-- Active Account Readout -->
      <div
        class="px-3 py-1.5 rounded-lg border border-cyan-500/40 bg-slate-900/90 text-xs flex items-center gap-3"
      >
        <span class="text-cyan-300 font-bold">{{ wallet.shortAddress.value }}</span>
        <span class="text-emerald-400 font-bold">{{ wallet.balance.value }} ETH</span>
      </div>
    </div>
  </header>

  <div
    v-if="wallet.walletError.value"
    class="bg-rose-950/90 border-b border-rose-500 px-4 py-1.5 text-center text-xs text-rose-200"
  >
    {{ wallet.walletError.value }}
  </div>
</template>
<script setup lang="ts">
import { useWallet } from "../composables/useWallet";

const wallet = useWallet();
const emit = defineEmits<{ (e: "walletChanged"): void }>();

async function selectBurner(idx: number) {
  await wallet.connectBurner(idx);
  emit("walletChanged");
}

async function selectMetaMask() {
  await wallet.connectMetaMask();
  emit("walletChanged");
}
</script>

<template>
  <header
    class="border-b border-cyan-500/40 bg-slate-950/90 backdrop-blur-md px-4 py-3 flex flex-wrap items-center justify-between gap-4"
  >
    <!-- Logo -->
    <div class="flex items-center gap-3">
      <div class="w-3 h-3 rounded-full bg-fuchsia-500 shadow-[0_0_12px_#d946ef] animate-pulse" />
      <h1 class="text-xl md:text-2xl font-black tracking-widest text-cyan-300 neon-text-cyan">
        SHELLSHOCK<span class="text-fuchsia-400 neon-text-pink">.ETH</span>
      </h1>
      <span
        class="hidden sm:inline-block text-[11px] px-2 py-0.5 rounded border border-fuchsia-500/40 bg-fuchsia-950/40 text-fuchsia-300"
      >
        CHAIN {{ wallet.chainId }}
      </span>
    </div>

    <!-- Wallet & Dev Burner Switcher -->
    <div class="flex flex-wrap items-center gap-2">
      <!-- Dev Burner Quick-Switch -->
      <div class="flex items-center bg-slate-900 border border-cyan-500/30 rounded-lg p-1 gap-1">
        <span class="text-[11px] text-cyan-400/70 px-2 uppercase">DEV:</span>
        <button
          @click="selectBurner(0)"
          :class="[
            'px-2.5 py-1 rounded text-xs font-bold transition cursor-pointer',
            wallet.mode.value === 'burner' && wallet.burnerIndex.value === 0
              ? 'bg-cyan-500 text-slate-950 shadow-[0_0_10px_#06b6d4]'
              : 'text-cyan-300 hover:bg-cyan-950',
          ]"
        >
          P1 (#0)
        </button>
        <button
          @click="selectBurner(1)"
          :class="[
            'px-2.5 py-1 rounded text-xs font-bold transition cursor-pointer',
            wallet.mode.value === 'burner' && wallet.burnerIndex.value === 1
              ? 'bg-fuchsia-500 text-slate-950 shadow-[0_0_10px_#d946ef]'
              : 'text-fuchsia-300 hover:bg-fuchsia-950',
          ]"
        >
          P2 (#1)
        </button>
      </div>

      <!-- MetaMask Button -->
      <button
        @click="selectMetaMask"
        :class="[
          'px-3 py-1.5 rounded-lg border text-xs font-bold tracking-wider transition cursor-pointer',
          wallet.mode.value === 'metamask'
            ? 'border-amber-400 bg-amber-500/20 text-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.4)]'
            : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-amber-400/60',
        ]"
      >
        METAMASK
      </button>

      <!-- Active Account Readout -->
      <div
        class="px-3 py-1.5 rounded-lg border border-cyan-500/40 bg-slate-900/90 text-xs flex items-center gap-3"
      >
        <span class="text-cyan-300 font-bold">{{ wallet.shortAddress.value }}</span>
        <span class="text-emerald-400 font-bold">{{ wallet.balance.value }} ETH</span>
      </div>
    </div>
  </header>

  <div
    v-if="wallet.walletError.value"
    class="bg-rose-950/90 border-b border-rose-500 px-4 py-1.5 text-center text-xs text-rose-200"
  >
    {{ wallet.walletError.value }}
  </div>
</template>
