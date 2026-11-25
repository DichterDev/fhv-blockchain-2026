<script setup lang="ts">
import { useWallet } from "../composables/useWallet";

const wallet = useWallet();
const emit = defineEmits<{ (e: "walletChanged"): void }>();

async function handleConnect() {
  await wallet.connectMetaMask(() => emit("walletChanged"));
  emit("walletChanged");
}
</script>

<template>
  <header
    class="border-b border-cyan-500/40 bg-slate-950/90 backdrop-blur-md px-4 py-3 flex flex-wrap items-center justify-between gap-4"
  >
    <div class="flex items-center gap-3">
      <div class="w-3 h-3 rounded-full bg-fuchsia-500 shadow-[0_0_12px_#d946ef] animate-pulse" />
      <h1 class="text-xl md:text-2xl font-black tracking-widest text-cyan-300 neon-text-cyan">
        SHELLSHOCK<span class="text-fuchsia-400 neon-text-pink">.ETH</span>
      </h1>
      <span
        v-if="wallet.isConnected.value"
        class="hidden sm:inline-block text-[11px] px-2 py-0.5 rounded border border-fuchsia-500/40 bg-fuchsia-950/40 text-fuchsia-300"
      >
        CHAIN {{ wallet.chainId }}
      </span>
    </div>

    <div class="flex items-center gap-3">
      <div
        v-if="wallet.isConnected.value"
        class="px-3 py-1.5 rounded-lg border border-cyan-500/40 bg-slate-900/90 text-xs flex items-center gap-3"
      >
        <span class="text-cyan-300 font-bold">{{ wallet.shortAddress.value }}</span>
        <span class="text-emerald-400 font-bold">{{ wallet.balance.value }} ETH</span>
      </div>

      <button
        @click="handleConnect"
        class="px-4 py-1.5 rounded-lg border border-amber-400 bg-amber-500/20 text-amber-300 text-xs font-bold tracking-wider shadow-[0_0_10px_rgba(251,191,36,0.35)] hover:bg-amber-500/30 transition cursor-pointer"
      >
        {{ wallet.isConnected.value ? "WALLET LINKED" : "CONNECT METAMASK" }}
      </button>
    </div>
  </header>

  <div
    v-if="wallet.walletError.value"
    class="bg-rose-950/90 border-b border-rose-500 px-4 py-1.5 text-center text-xs text-rose-200"
  >
    {{ wallet.walletError.value }}
  </div>
</template>
