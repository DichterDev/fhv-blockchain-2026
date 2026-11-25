import { parseEther } from "ethers";

export const CONTRACT_ADDRESS =
  import.meta.env.VITE_CONTRACT_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3";

export const ARTILLERY_ABI = [
  "function JOIN_FEE() view returns (uint256)",
  "function TURN_TIMEOUT_BLOCKS() view returns (uint256)",
  "function nextGameId() view returns (uint256)",
  "function getWeaponCost(uint8 weapon) pure returns (uint256)",
  "function createGame() payable returns (uint256)",
  "function joinGame(uint256 gameId) payable",
  "function fire(uint256 gameId, uint8 angle, uint8 power, uint8 weapon) payable",
  "function claimTimeoutWin(uint256 gameId)",
  "function cancelGame(uint256 gameId)",
  "function getGame(uint256 gameId) view returns (tuple(address player1, address player2, address currentTurn, address winner, uint8 status, uint8 p1X, uint8 p2X, uint8 p1Hp, uint8 p2Hp, int8 wind, uint8 turnCount, uint256 lastMoveBlock, uint256 prizePool, uint16[32] terrain))",
  "event GameCreated(uint256 indexed gameId, address indexed player1)",
  "event GameJoined(uint256 indexed gameId, address indexed player2, int8 initialWind)",
  "event ShotFired(uint256 indexed gameId, address indexed shooter, uint8 angle, uint8 power, uint8 weapon, bool hitMap, uint8 impactX, uint16 impactY, uint8 damageDealt, int8 nextWind)",
  "event GameEnded(uint256 indexed gameId, address indexed winner, uint256 payout, string reason)",
] as const;

export const GameStatus = {
  WaitingForPlayer: 0,
  Active: 1,
  Finished: 2,
} as const;
export type GameStatus = (typeof GameStatus)[keyof typeof GameStatus];

export const WeaponType = {
  Standard: 0,
  Mortar: 1,
  BunkerBuster: 2,
} as const;
export type WeaponType = (typeof WeaponType)[keyof typeof WeaponType];

export interface WeaponSpec {
  id: WeaponType;
  name: string;
  tag: string;
  maxDmg: number;
  radius: number;
  depth: number;
  costWei: bigint;
  costLabel: string;
  color: string;
}

export const WEAPONS: WeaponSpec[] = [
  {
    id: WeaponType.Standard,
    name: "PLASMA SHELL",
    tag: "STD",
    maxDmg: 30,
    radius: 2,
    depth: 35,
    costWei: parseEther("0.0002"),
    costLabel: "0.0002 ETH",
    color: "#22d3ee",
  },
  {
    id: WeaponType.Mortar,
    name: "HEAVY MORTAR",
    tag: "HVY",
    maxDmg: 45,
    radius: 3,
    depth: 55,
    costWei: parseEther("0.0005"),
    costLabel: "0.0005 ETH",
    color: "#f43f5e",
  },
  {
    id: WeaponType.BunkerBuster,
    name: "CRATER DRILL",
    tag: "DRL",
    maxDmg: 40,
    radius: 1,
    depth: 90,
    costWei: parseEther("0.0004"),
    costLabel: "0.0004 ETH",
    color: "#facc15",
  },
];

export interface GameState {
  gameId: number;
  player1: string;
  player2: string;
  currentTurn: string;
  winner: string;
  status: GameStatus;
  p1X: number;
  p2X: number;
  p1Hp: number;
  p2Hp: number;
  wind: number;
  turnCount: number;
  lastMoveBlock: number;
  prizePool: bigint;
  terrain: number[];
}

export interface ShotResult {
  turnId: number;
  shooter: string;
  angle: number;
  power: number;
  weapon: WeaponType;
  hitMap: boolean;
  impactX: number;
  impactY: number;
  damageDealt: number;
  nextWind: number;
  preTerrain: number[];
  preWind: number;
}
