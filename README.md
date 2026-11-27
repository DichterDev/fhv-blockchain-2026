# OnChainArtillery

Turn-based two-player artillery game deployed on Ethereum (Sepolia Testnet), where terrain generation, projectile trajectories, blast damage, and ETH prize payouts are resolved deterministically on-chain.

---

## Deployment Info

- **Network:** Ethereum Sepolia Testnet (`Chain ID: 11155111`)
- **Contract Address:** `0x1132dc10bf7D687563c6f56345E677047b088Ab5`
- **Contract ABI:** [abi.json](/blockchain/ignition/deployments/chain-11155111/artifacts/ArtilleryModule%23OnChainArtillery.json)

---

## What It Does & How to Interact With It

### Game Flow

1. **Connect Wallet:** Open the web interface and connect a MetaMask wallet switched to the **Sepolia** network.
2. **Create or Join a Match:**
   - **Player 1** calls `createGame()` by depositing the entry stake (`joinFee`), initializing a 32-column terrain map and spawning both tanks.
   - **Player 2** selects an open lobby and calls `joinGame(gameId)` with a matching stake, locking the combined `prizePool` in escrow.
3. **Take Turns (`fire`):**
   - On their turn, the active player chooses an **angle**, **power**, and **weapon tier** (each tier requires a corresponding ETH payment) and submits a `fire(gameId, angle, power, weapon)` transaction.
   - The smart contract simulates the projectile flight path, applies wind and gravity, deforms the terrain crater, deducts hit points, and emits a `ShotFired` event.
   - The Vue 3 frontend listens for `ShotFired` and reads `getGame(gameId)` via `ethers` v6 to animate the shot and update the terrain and HUD.
4. **Victory & Payout:**
   - When a player's HP reaches `0`, `_payoutWinner` automatically transfers the `prizePool` (minus protocol fee) to the winner and emits `GameEnded`.
   - If an opponent stops responding beyond the block timeout window, the waiting player can call `claimTimeout(gameId)` to claim the win.

---

## Design Decisions

- **Deterministic Fixed-Point Integer Physics (`ArtilleryMath.sol`):**
  - Floating-point arithmetic does not exist in the EVM and fine-grained physics simulations are prohibitively expensive in gas. All trajectory steps, wind influence, and trigonometric lookups are implemented using scaled integer math (`1e4` / `1e6` fixed-point precision) with a coarse simulation step size so an entire shot resolves within a single affordable transaction.
- **Compact 32-Column Terrain Heightmap:**
  - Instead of storing a 2D pixel grid in contract storage (which would require hundreds of `SSTORE` operations), terrain is represented as a fixed `uint16[32]` heightmap array. Crater deformation only updates the columns within the blast radius, keeping storage writes minimal.
- **On-Chain Authoritative State & Event-Driven Replay:**
  - The frontend never computes hit detection locally; it submits player inputs to the contract and reconstructs the visual trajectory from the authoritative parameters emitted in `ShotFired` and stored in `getGame(gameId)`.
- **Explicit Gas Limit Padding:**
  - Lethal turns execute additional state writes and an external ETH payout transfer compared to non-lethal turns. The frontend applies a `130%` buffer over `eth_estimateGas` so killing shots do not fail due to tight gas estimates.

---

## Use of AI Tools

- **Smart Contract Physics & Implementation:** Starting from a manually defined empty contract interface (`OnChainArtillery` function signatures, events, and game state structure), AI tools were used to implement the contract logic—specifically designing the gas-efficient fixed-point integer physics, lookup-based trigonometry, and compact terrain deformation in `ArtilleryMath.sol` so projectile simulation remains viable on-chain.
- **Frontend Application:** The entire Vue 3 + TypeScript + HTML5 Canvas frontend was generated with AI assistance based on the game concept, retro artillery aesthetic, and predefined project dependencies (`ethers` v6, Vite, Vue 3).
