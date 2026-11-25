import { ref, computed } from "vue";
import { Contract, parseEther } from "ethers";
import {
  ARTILLERY_ABI,
  CONTRACT_ADDRESS,
  GameStatus,
  WEAPONS,
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
let isPollingInFlight = false;

export function useArtilleryGame() {
  const wallet = useWallet();

  function getReadContract() {
    return new Contract(CONTRACT_ADDRESS, ARTILLERY_ABI, wallet.getProvider());
  }

  function decodeTxError(err: any, fallback: string): string {
    const data = err?.data || err?.info?.error?.data || err?.error?.data;
    if (data && data !== "0x") {
      try {
        const decoded = getReadContract().interface.parseError(data);
        if (decoded) {
          return `REVERTED: ${decoded.name}`;
        }
      } catch {}
    }
    return err?.shortMessage || err?.message || fallback;
  }

  function parseGameTuple(gameId: number, raw: any): GameState {
    return {
      gameId,
      player1: raw.player1,
      player2: raw.player2,
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

  function clearLastShot() {
    lastShot.value = null;
  }

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
      if (
        statusMessage.value.startsWith("LOBBY ERROR") ||
        statusMessage.value === "CONTRACT NOT FOUND ON CURRENT NETWORK"
      ) {
        statusMessage.value = "READY FOR DEPLOYMENT";
      }
    } catch (err: any) {
      console.error("refreshLobby error:", err);
      statusMessage.value = `LOBBY ERROR: ${err?.shortMessage || err?.message || "CONTRACT NOT FOUND"}`;
    }
  }

  async function loadGame(gameId: number) {
    const contract = getReadContract();
    const [raw, blockNum] = await Promise.all([
      contract.getGame(gameId),
      wallet.getProvider().getBlockNumber(),
    ]);
    currentBlock.value = blockNum;

    const prevGame = activeGame.value;
    const nextGame = parseGameTuple(gameId, raw);

    // Detect if turnCount advanced while polling (e.g., opponent fired in another window)
    if (
      prevGame &&
      prevGame.gameId === gameId &&
      nextGame.turnCount > prevGame.turnCount &&
      lastShot.value?.turnId !== nextGame.turnCount
    ) {
      try {
        const filter = contract.filters.ShotFired(gameId);
        const events = await contract.queryFilter(filter, -10);
        const latest = events[events.length - 1];
        if (latest && "args" in latest) {
          lastShot.value = {
            turnId: nextGame.turnCount,
            shooter: latest.args.shooter,
            angle: Number(latest.args.angle),
            power: Number(latest.args.power),
            weapon: Number(latest.args.weapon) as WeaponType,
            hitMap: Boolean(latest.args.hitMap),
            impactX: Number(latest.args.impactX),
            impactY: Number(latest.args.impactY),
            damageDealt: Number(latest.args.damageDealt),
            nextWind: Number(latest.args.nextWind),
            preTerrain: [...prevGame.terrain],
            preWind: prevGame.wind,
          };
        }
      } catch {}
    }

    activeGame.value = nextGame;
  }

  function startPolling(gameId: number) {
    stopPolling();
    pollTimer = window.setInterval(async () => {
      const g = activeGame.value;
      const shouldPoll =
        !g ||
        g.status === GameStatus.WaitingForPlayer ||
        (g.status === GameStatus.Active &&
          g.currentTurn.toLowerCase() !== wallet.address.value.toLowerCase());

      if (!shouldPoll || isPollingInFlight) return;

      isPollingInFlight = true;
      try {
        await loadGame(gameId);
        await wallet.refreshBalance();
      } finally {
        isPollingInFlight = false;
      }
    }, 4000);
  }

  function stopPolling() {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function createGame() {
    isTxPending.value = true;
    statusMessage.value = "DEPLOYING ARENA...";
    try {
      const contract = new Contract(CONTRACT_ADDRESS, ARTILLERY_ABI, wallet.getSigner());
      const tx = await contract.createGame({ value: joinFee.value });
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
        createdId = Number(await contract.nextGameId()) - 1;
      }

      lastShot.value = null;
      await loadGame(createdId);
      startPolling(createdId);
      await wallet.refreshBalance();
      statusMessage.value = `ARENA #${createdId} ONLINE // AWAITING CHALLENGER`;
    } catch (err: any) {
      statusMessage.value = decodeTxError(err, "CREATE FAILED");
    } finally {
      isTxPending.value = false;
    }
  }

  async function joinGame(gameId: number) {
    isTxPending.value = true;
    statusMessage.value = `JOINING ARENA #${gameId}...`;
    try {
      const contract = new Contract(CONTRACT_ADDRESS, ARTILLERY_ABI, wallet.getSigner());
      const tx = await contract.joinGame(gameId, { value: joinFee.value });
      await tx.wait();

      lastShot.value = null;
      await loadGame(gameId);
      startPolling(gameId);
      await wallet.refreshBalance();
      statusMessage.value = `CONNECTED TO ARENA #${gameId} // COMBAT LIVE`;
    } catch (err: any) {
      statusMessage.value = decodeTxError(err, "JOIN FAILED");
    } finally {
      isTxPending.value = false;
    }
  }

  async function fireShot(angle: number, power: number, weapon: WeaponType) {
    if (!activeGame.value) return;
    const gameId = activeGame.value.gameId;
    const preTerrain = [...activeGame.value.terrain];
    const preWind = activeGame.value.wind;
    const weaponSpec = WEAPONS[weapon] ?? WEAPONS[0];

    isTxPending.value = true;
    statusMessage.value = `FIRING ${weaponSpec.name} (${weaponSpec.costLabel})...`;

    try {
      const contract = new Contract(CONTRACT_ADDRESS, ARTILLERY_ABI, wallet.getSigner());

      const tx = await contract.fire(gameId, angle, power, weapon, {
        value: weaponSpec.costWei,
      });
      const receipt = await tx.wait();

      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog(log);
          if (parsed?.name === "ShotFired") {
            lastShot.value = {
              turnId: activeGame.value.turnCount + 1,
              shooter: parsed.args.shooter,
              angle: Number(parsed.args.angle),
              power: Number(parsed.args.power),
              weapon: Number(parsed.args.weapon) as WeaponType,
              hitMap: Boolean(parsed.args.hitMap),
              impactX: Number(parsed.args.impactX),
              impactY: Number(parsed.args.impactY),
              damageDealt: Number(parsed.args.damageDealt),
              nextWind: Number(parsed.args.nextWind),
              preTerrain,
              preWind,
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
      statusMessage.value = decodeTxError(err, "FIRE FAILED");
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
      statusMessage.value = decodeTxError(err, "TIMEOUT NOT REACHED YET");
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
    clearLastShot,
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
