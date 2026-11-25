import { ref, computed } from "vue";
import { BrowserProvider, JsonRpcProvider, formatEther, type Signer } from "ethers";

const LOCAL_RPC = import.meta.env.VITE_LOCAL_RPC_URL || "http://127.0.0.1:8545";

const address = ref<string>("");
const balance = ref<string>("0.0000");
const chainId = ref<number>(1337);
const isConnected = ref<boolean>(false);
const walletError = ref<string | null>(null);

let activeSigner: Signer | null = null;
let readProvider: BrowserProvider | JsonRpcProvider | null = null;
let listenersBound = false;

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
      const signer = await provider.getSigner();
      const network = await provider.getNetwork();

      readProvider = provider;
      activeSigner = signer;
      address.value = await signer.getAddress();
      chainId.value = Number(network.chainId);
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
    if (!readProvider) {
      readProvider = new JsonRpcProvider(LOCAL_RPC, undefined, {
        staticNetwork: true,
        cacheTimeout: -1,
      });
    }
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
