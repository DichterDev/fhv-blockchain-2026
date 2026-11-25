import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("ArtilleryModule", (m) => {
  const artillery = m.contract("OnChainArtillery");
  return { artillery };
});
