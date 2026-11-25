// blockchain/scripts/debug-finish.ts
import { network } from "hardhat";

const { ethers } = await network.getOrCreate({ network: "ganache" });

const ADDR = "0x5eb3Bc0a489C5A8288765d2336659EbCA68FCd00";

async function main() {
  const code = await ethers.provider.getCode(ADDR);
  console.log("Live deployed bytecode bytes:", (code.length - 2) / 2);

  const [p1, p2] = await ethers.getSigners();
  const game = await ethers.getContractAt("OnChainArtillery", ADDR);

  // Create & join a fresh game
  const createTx = await game.connect(p1).createGame({ value: ethers.parseEther("0.001") });
  await createTx.wait();
  const gameId = (await game.nextGameId()) - 1n;
  console.log("Created gameId:", gameId.toString());

  await (await game.connect(p2).joinGame(gameId, { value: ethers.parseEther("0.001") })).wait();

  // Fire shots until P2 HP reaches 0 (finishing shot)
  for (let i = 0; i < 10; i++) {
    const state = await game.getGame(gameId);
    if (Number(state.status) === 2) {
      console.log("Game finished! Winner:", state.winner);
      break;
    }

    const isP1 = state.currentTurn.toLowerCase() === p1.address.toLowerCase();
    const shooter = isP1 ? p1 : p2;
    // Aim straight at opponent (power 55 at 45 deg hits col ~27 from col 4)
    const angle = isP1 ? 45 : 135;

    console.log(`Turn ${i + 1}: P1 HP=${state.p1Hp}, P2 HP=${state.p2Hp}, Wind=${state.wind}`);
    const tx = await game.connect(shooter).fire(gameId, angle, 55, 1, {
      value: ethers.parseEther("0.0005"),
    });
    const receipt = await tx.wait();
    console.log(`  -> Mined in block ${receipt?.blockNumber}, gasUsed=${receipt?.gasUsed}`);
  }
}

main().catch((err) => {
  console.error("LIVE GANACHE ERROR:", err);
  process.exit(1);
});
