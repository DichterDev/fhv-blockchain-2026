import { ref, computed } from "vue";
import {
  BrowserProvider,
  JsonRpcProvider,
  Wallet,
  HDNodeWallet,
  formatEther,
  type Signer,
} from "ethers";

export type WalletMode = "burner" | "metamask";

const LOCAL_RPC = import.meta.env.VITE_LOCAL_RPC_URL || "http://127.0.0.1:8545";
const DEV_MNEMONIC =
  import.meta.env.VITE_DEV_MNEMONIC ||
  "test test test test test test test test test test test junk";

const mode = ref<WalletMode>("burner");
const burnerIndex = ref<number>(0);
const address = ref<string>("");
const balance = ref<string>("0.0000");
const chainId = ref<number>(1337);
const isConnected = ref<boolean>(false);
const walletError = ref<string | null>(null);

let activeSigner: Signer | null = null;
let readProvider: JsonRpcProvider | BrowserProvider | null = null;

function getBurnerWallet(index: number): HDNodeWallet {
  const path = `m/44'/60'/0'/0/${index}`;
  return HDNodeWallet.fromPhrase(DEV_MNEMONIC, undefined, path);
}

export function useWallet() {
  const shortAddress = computed(() => {
    if (!address.value) return "NOT CONNECTED";
    return `${address.value.slice(0, 6)}...${address.value.slice(-4)}`;
  });

  async function refreshBalance() {
    if (!readProvider || !address.value) return;
    try {
      const bal = await readProvider.getBalance(address.value);
      balance.value = Number(formatEther(bal)).toFixed(4);
    } catch {
      // Ignore transient RPC polling hiccups
    }
  }

  async function connectBurner(index = burnerIndex.value) {
    walletError.value = null;
    try {
      const provider = new JsonRpcProvider(LOCAL_RPC);
      const network = await provider.getNetwork();
      const hdWallet = getBurnerWallet(index).connect(provider);

      mode.value = "burner";
      burnerIndex.value = index;
      readProvider = provider;
      activeSigner = hdWallet;
      address.value = hdWallet.address;
      chainId.value = Number(network.chainId);
      isConnected.value = true;

      await refreshBalance();
    } catch (err: any) {
      walletError.value = `Local Ganache RPC unreachable (${LOCAL_RPC})`;
      isConnected.value = false;
    }
  }

  async function connectMetaMask() {
    walletError.value = null;
    const eth = (window as any).ethereum;
    if (!eth) {
      walletError.value = "MetaMask not detected in browser.";
      return;
    }

    try {
      const provider = new BrowserProvider(eth);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const network = await provider.getNetwork();

      mode.value = "metamask";
      readProvider = provider;
      activeSigner = signer;
      address.value = await signer.getAddress();
      chainId.value = Number(network.chainId);
      isConnected.value = true;

      await refreshBalance();
    } catch (err: any) {
      walletError.value = err?.message || "Failed to connect MetaMask.";
    }
  }

  /**
   * Generates or loads an ephemeral browser session key for gasless firing.
   */
  function getOrCreateSessionWallet(storageKey: string): Wallet {
    const existingPk = localStorage.getItem(storageKey);
    const baseWallet = existingPk ? new Wallet(existingPk) : Wallet.createRandom();

    if (!existingPk) {
      localStorage.setItem(storageKey, baseWallet.privateKey);
    }

    if (!readProvider) {
      readProvider = new JsonRpcProvider(LOCAL_RPC);
    }
    return baseWallet.connect(readProvider);
  }

  function promotePendingSessionKey(gameId: number) {
    const pending = localStorage.getItem("shellshock_pending_session");
    if (pending) {
      localStorage.setItem(`shellshock_session_${gameId}`, pending);
      localStorage.removeItem("shellshock_pending_session");
    }
  }

  function getSessionSignerForGame(gameId: number): Signer | null {
    const pk = localStorage.getItem(`shellshock_session_${gameId}`);
    if (pk && readProvider) {
      return new Wallet(pk, readProvider);
    }
    return activeSigner;
  }

  function getSigner(): Signer {
    if (!activeSigner) {
      throw new Error("Wallet not connected");
    }
    return activeSigner;
  }

  function getProvider() {
    if (!readProvider) {
      readProvider = new JsonRpcProvider(LOCAL_RPC);
    }
    return readProvider;
  }

  return {
    mode,
    burnerIndex,
    address,
    shortAddress,
    balance,
    chainId,
    isConnected,
    walletError,
    connectBurner,
    connectMetaMask,
    refreshBalance,
    getOrCreateSessionWallet,
    promotePendingSessionKey,
    getSessionSignerForGame,
    getSigner,
    getProvider,
  };
}
