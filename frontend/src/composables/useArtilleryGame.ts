import { ref, computed } from "vue";
import { Contract, parseEther } from "ethers";
import {
  ARTILLERY_ABI,
  CONTRACT_ADDRESS,
  GameStatus,
  WeaponType,
  type GameState,
  type ShotResult,
} from "../contracts/artillery";
import { useWallet } from "./useWallet";

const activeGame = ref<GameState | null>(null);
const openGames = ref<GameState[]>([]);
const currentBlock = ref<number>(0);
const timeoutBlocks = ref<number>(25);
const joinFee = ref<bigint>(parseEther("0.001"));
const isTxPending = ref<boolean>(false);
const statusMessage = ref<string>("READY FOR DEPLOYMENT");
const lastShot = ref<ShotResult | null>(null);

let pollTimer: number | null = null;

export function useArtilleryGame() {
  const wallet = useWallet();

  function getReadContract() {
    return new Contract(CONTRACT_ADDRESS, ARTILLERY_ABI, wallet.getProvider());
  }

  function parseGameTuple(gameId: number, raw: any): GameState {
    return {
      gameId,
      player1: raw.player1,
      player2: raw.player2,
      p1SessionKey: raw.p1SessionKey,
      p2SessionKey: raw.p2SessionKey,
      currentTurn: raw.currentTurn,
      winner: raw.winner,
      status: Number(raw.status) as GameStatus,
      p1X: Number(raw.p1X),
      p2X: Number(raw.p2X),
      p1Hp: Number(raw.p1Hp),
      p2Hp: Number(raw.p2Hp),
      wind: Number(raw.wind),
      turnCount: Number(raw.turnCount),
      lastMoveBlock: Number(raw.lastMoveBlock),
      prizePool: BigInt(raw.prizePool),
      terrain: Array.from(raw.terrain).map((h: any) => Number(h)),
    };
  }

  const playerRole = computed<"P1" | "P2" | "SPECTATOR">(() => {
    if (!activeGame.value || !wallet.address.value) return "SPECTATOR";
    const me = wallet.address.value.toLowerCase();
    if (activeGame.value.player1.toLowerCase() === me) return "P1";
    if (activeGame.value.player2.toLowerCase() === me) return "P2";
    return "SPECTATOR";
  });

  const isMyTurn = computed(() => {
    if (!activeGame.value || activeGame.value.status !== GameStatus.Active) {
      return false;
    }
    return activeGame.value.currentTurn.toLowerCase() === wallet.address.value.toLowerCase();
  });

  const blocksRemainingForTimeout = computed(() => {
    if (!activeGame.value || activeGame.value.status !== GameStatus.Active) {
      return timeoutBlocks.value;
    }
    const deadline = activeGame.value.lastMoveBlock + timeoutBlocks.value;
    return Math.max(0, deadline - currentBlock.value);
  });

  async function refreshLobby() {
    try {
      const contract = getReadContract();
      const [total, fee, timeout, blockNum] = await Promise.all([
        contract.nextGameId(),
        contract.JOIN_FEE().catch(() => parseEther("0.001")),
        contract.TURN_TIMEOUT_BLOCKS().catch(() => 25n),
        wallet.getProvider().getBlockNumber(),
      ]);

      joinFee.value = BigInt(fee);
      timeoutBlocks.value = Number(timeout);
      currentBlock.value = blockNum;

      const count = Number(total);
      const start = Math.max(0, count - 15);
      const fetched: GameState[] = [];

      for (let i = count - 1; i >= start; i--) {
        const raw = await contract.getGame(i);
        fetched.push(parseGameTuple(i, raw));
      }
      openGames.value = fetched;
    } catch (err: any) {
      statusMessage.value = "CONTRACT NOT FOUND ON CURRENT NETWORK";
    }
  }

  async function loadGame(gameId: number) {
    const contract = getReadContract();
    const [raw, blockNum] = await Promise.all([
      contract.getGame(gameId),
      wallet.getProvider().getBlockNumber(),
    ]);
    currentBlock.value = blockNum;
    activeGame.value = parseGameTuple(gameId, raw);
  }

  function startPolling(gameId: number) {
    stopPolling();
    pollTimer = window.setInterval(async () => {
      await loadGame(gameId);
      await wallet.refreshBalance();
    }, 2000);
  }

  function stopPolling() {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function createGame() {
    isTxPending.value = true;
    statusMessage.value = "MINTING ARENA & FUNDING GASLESS SESSION KEY...";
    try {
      const sessionWallet = wallet.getOrCreateSessionWallet("shellshock_pending_session");
      const contract = new Contract(CONTRACT_ADDRESS, ARTILLERY_ABI, wallet.getSigner());
      const tx = await contract.createGame(sessionWallet.address, {
        value: joinFee.value,
      });
      const receipt = await tx.wait();

      let createdId: number | null = null;
      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog(log);
          if (parsed?.name === "GameCreated") {
            createdId = Number(parsed.args.gameId);
          }
        } catch {}
      }

      if (createdId === null) {
        const nextId = Number(await contract.nextGameId());
        createdId = nextId - 1;
      }

      wallet.promotePendingSessionKey(createdId);
      await loadGame(createdId);
      startPolling(createdId);
      await wallet.refreshBalance();
      statusMessage.value = `ARENA #${createdId} ONLINE // AWAITING CHALLENGER`;
    } catch (err: any) {
      statusMessage.value = err?.shortMessage || err?.message || "CREATE FAILED";
    } finally {
      isTxPending.value = false;
    }
  }

  async function joinGame(gameId: number) {
    isTxPending.value = true;
    statusMessage.value = `JOINING ARENA #${gameId}...`;
    try {
      const sessionWallet = wallet.getOrCreateSessionWallet(`shellshock_session_${gameId}`);
      const contract = new Contract(CONTRACT_ADDRESS, ARTILLERY_ABI, wallet.getSigner());
      const tx = await contract.joinGame(gameId, sessionWallet.address, {
        value: joinFee.value,
      });
      await tx.wait();

      await loadGame(gameId);
      startPolling(gameId);
      await wallet.refreshBalance();
      statusMessage.value = `CONNECTED TO ARENA #${gameId} // COMBAT LIVE`;
    } catch (err: any) {
      statusMessage.value = err?.shortMessage || err?.message || "JOIN FAILED";
    } finally {
      isTxPending.value = false;
    }
  }

  async function fireShot(angle: number, power: number, weapon: WeaponType) {
    if (!activeGame.value) return;
    const gameId = activeGame.value.gameId;
    isTxPending.value = true;
    statusMessage.value = "FIRING PAYLOAD VIA GASLESS SESSION KEY...";

    try {
      // Uses pre-funded local session key so MetaMask never pops up mid-match
      const sessionSigner = wallet.getSessionSignerForGame(gameId);
      const contract = new Contract(CONTRACT_ADDRESS, ARTILLERY_ABI, sessionSigner);

      const tx = await contract.fire(gameId, angle, power, weapon);
      const receipt = await tx.wait();

      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog(log);
          if (parsed?.name === "ShotFired") {
            lastShot.value = {
              shooter: parsed.args.shooter,
              angle: Number(parsed.args.angle),
              power: Number(parsed.args.power),
              weapon: Number(parsed.args.weapon) as WeaponType,
              hitMap: Boolean(parsed.args.hitMap),
              impactX: Number(parsed.args.impactX),
              impactY: Number(parsed.args.impactY),
              damageDealt: Number(parsed.args.damageDealt),
              nextWind: Number(parsed.args.nextWind),
            };
          }
        } catch {}
      }

      await loadGame(gameId);
      await wallet.refreshBalance();

      if (lastShot.value) {
        statusMessage.value =
          lastShot.value.damageDealt > 0
            ? `DIRECT HIT! ${lastShot.value.damageDealt} DMG DEALT`
            : lastShot.value.hitMap
              ? `TERRAIN IMPACT AT COL ${lastShot.value.impactX}`
              : "SHOT FLEW OFF RADAR!";
      }
    } catch (err: any) {
      statusMessage.value = err?.shortMessage || err?.message || "FIRE FAILED";
    } finally {
      isTxPending.value = false;
    }
  }

  async function claimTimeout() {
    if (!activeGame.value) return;
    isTxPending.value = true;
    try {
      const contract = new Contract(CONTRACT_ADDRESS, ARTILLERY_ABI, wallet.getSigner());
      const tx = await contract.claimTimeoutWin(activeGame.value.gameId);
      await tx.wait();
      await loadGame(activeGame.value.gameId);
      statusMessage.value = "VICTORY CLAIMED BY OPPONENT TIMEOUT";
    } catch (err: any) {
      statusMessage.value = err?.shortMessage || "TIMEOUT NOT REACHED YET";
    } finally {
      isTxPending.value = false;
    }
  }

  function exitToLobby() {
    stopPolling();
    activeGame.value = null;
    lastShot.value = null;
    refreshLobby();
  }

  return {
    activeGame,
    openGames,
    joinFee,
    isTxPending,
    statusMessage,
    lastShot,
    playerRole,
    isMyTurn,
    blocksRemainingForTimeout,
    refreshLobby,
    loadGame,
    startPolling,
    stopPolling,
    createGame,
    joinGame,
    fireShot,
    claimTimeout,
    exitToLobby,
  };
}
