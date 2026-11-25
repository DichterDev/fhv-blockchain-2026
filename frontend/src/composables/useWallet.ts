import { ref, computed } from "vue";
import { BrowserProvider, JsonRpcProvider, formatEther, type Signer } from "ethers";

const RAW_RPC = import.meta.env.VITE_RPC_URL || "http://127.0.0.1:8545";
const RPC_URL = RAW_RPC.startsWith("/") ? `${window.location.origin}${RAW_RPC}` : RAW_RPC;
const TARGET_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 1337);

const address = ref<string>("");
const balance = ref<string>("0.0000");
const chainId = ref<number>(TARGET_CHAIN_ID);
const isConnected = ref<boolean>(false);
const walletError = ref<string | null>(null);

let activeSigner: Signer | null = null;
const readProvider = new JsonRpcProvider(RPC_URL, undefined, {
  staticNetwork: true,
  cacheTimeout: -1,
});
let listenersBound = false;

export function useWallet() {
  const shortAddress = computed(() => {
    if (!address.value) return "NOT CONNECTED";
    return `${address.value.slice(0, 6)}...${address.value.slice(-4)}`;
  });

  async function refreshBalance() {
    if (!address.value) return;
    try {
      const bal = await readProvider.getBalance(address.value);
      balance.value = Number(formatEther(bal)).toFixed(4);
    } catch {}
  }

  async function connectMetaMask(onAccountChange?: () => void) {
    walletError.value = null;
    const eth = (window as any).ethereum;
    if (!eth) {
      walletError.value = "MetaMask not detected in browser.";
      return;
    }

    try {
      const provider = new BrowserProvider(eth);
      await provider.send("eth_requestAccounts", []);

      const network = await provider.getNetwork();
      if (Number(network.chainId) !== TARGET_CHAIN_ID) {
        await eth.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${TARGET_CHAIN_ID.toString(16)}` }],
        });
      }

      const activeProvider = new BrowserProvider(eth);
      const signer = await activeProvider.getSigner();
      const activeNetwork = await activeProvider.getNetwork();

      activeSigner = signer;
      address.value = await signer.getAddress();
      chainId.value = Number(activeNetwork.chainId);
      isConnected.value = true;

      await refreshBalance();

      if (!listenersBound) {
        listenersBound = true;
        eth.on("accountsChanged", async (accounts: string[]) => {
          if (accounts.length === 0) {
            isConnected.value = false;
            address.value = "";
            activeSigner = null;
          } else {
            await connectMetaMask(onAccountChange);
            onAccountChange?.();
          }
        });
        eth.on("chainChanged", () => window.location.reload());
      }
    } catch (err: any) {
      walletError.value = err?.shortMessage || err?.message || "Failed to connect MetaMask.";
    }
  }

  function getSigner(): Signer {
    if (!activeSigner) {
      throw new Error("Connect MetaMask first");
    }
    return activeSigner;
  }

  function getProvider() {
    return readProvider;
  }

  return {
    address,
    shortAddress,
    balance,
    chainId,
    isConnected,
    walletError,
    connectMetaMask,
    refreshBalance,
    getSigner,
    getProvider,
  };
}
