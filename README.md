````markdown
# OnChainArtillery

Turn-based artillery game built on Ethereum where terrain generation, projectile physics, blast damage, and ETH prize payouts are executed deterministically on-chain.

---

## Architecture Overview

```text
┌─────────────────────────────┐         JSON-RPC (Read / Events)         ┌──────────────────────────────┐
│        Vue 3 Frontend       │ ◄──────────────────────────────────────► │   Ethereum Node (Infura /    │
│  (ethers.js v6 + Canvas)    │                                          │   Ganache / Sepolia)         │
└──────────────┬──────────────┘                                          └──────────────▲───────────────┘
               │ EIP-1193 (`window.ethereum`)                                           │
               ▼                                                                        │
┌─────────────────────────────┐         Signed Transactions              ───────────────┘
│          MetaMask           │ ─────────────────────────────────────────►  OnChainArtillery.sol
└─────────────────────────────┘                                             └── ArtilleryMath.sol
```
````

---

## Smart Contracts (`blockchain/`)

- **`OnChainArtillery.sol`** — Core game state machine, escrow, and turn enforcement:
- **Lobby & Escrow:** Players create a match via `createGame()` and join via `joinGame(gameId)`, each depositing the `joinFee` into `prizePool`.
- **Turn Execution (`fire`):** Validates turn ownership, checks `msg.value` against the selected weapon tier, delegates physics and terrain deformation to `ArtilleryMath`, updates player HP, rotates wind via `block.prevrandao`, and emits `ShotFired`.
- **Settlement (`_payoutWinner` & `claimTimeout`):** Automatically transfers `prizePool` (minus protocol fee) to the winner on a lethal hit (`KO`) or allows the active opponent to claim victory if a player stalls beyond the block timeout.

- **`ArtilleryMath.sol`** — Pure deterministic fixed-point physics library:
- Generates a 32-column heightmap (`uint16[32]`) from an on-chain seed (`keccak256(block.prevrandao, msg.sender, gameId)`).
- Simulates projectile trajectory step-by-step using integer trigonometry, gravity, and wind, resolving terrain craters and direct/splash damage identically on-chain and off-chain.

---

## Frontend ⇄ Blockchain Communication (`frontend/`)

The Vue frontend uses **`ethers` v6** (`useArtilleryGame.ts`) to synchronize on-chain state and animate turns without a centralized backend:

1. **Read-Only State Queries (`BrowserProvider` / `JsonRpcProvider`):**

- Calls `getGame(gameId)` and `nextGameId()` via `eth_call` to fetch active lobbies, terrain heightmaps (`uint16[32]`), tank coordinates (`p1X`, `p2X`), HP, current wind, and turn ownership.

2. **Write Transactions (`Signer` via MetaMask):**

- `createGame()`, `joinGame()`, `fire(gameId, angle, power, weapon)`, and `claimTimeout(gameId)` are signed by the player's wallet and submitted with a padded `gasLimit` buffer (`estimatedGas * 130%`) to prevent out-of-gas reverts on state-heavy turns (such as terrain storage writes and KO payouts).

3. **Event-Driven Replay & UI Sync:**

- Listens for contract events (`GameCreated`, `PlayerJoined`, `ShotFired`, `GameEnded`) and parses transaction receipts via `contract.interface.parseLog`.
- When `ShotFired` is received, the frontend feeds the authoritative on-chain parameters (angle, power, wind, weapon, impact coordinates, and crater radius) into the HTML5 Canvas renderer to animate the projectile arc and terrain deformation before refreshing `getGame(gameId)`.
