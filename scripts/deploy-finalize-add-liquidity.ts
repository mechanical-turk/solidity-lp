import { ethers } from "hardhat";
import { ONE_ETHER, Phase } from "../test/Helper";

async function main() {
  const [treasury] = await ethers.getSigners();
  const spaceCoinFactory = await ethers.getContractFactory("SpaceCoin");
  const liquidityPoolFactory = await ethers.getContractFactory("LiquidityPool");
  const routerFactory = await ethers.getContractFactory("Router");

  const spaceCoin = await spaceCoinFactory
    .connect(treasury)
    .deploy(treasury.address);
  await (await spaceCoin.connect(treasury).toggleTax(true)).wait();
  await (await spaceCoin.connect(treasury).advancePhaseFrom(Phase.SEED)).wait();
  await (
    await spaceCoin.connect(treasury).advancePhaseFrom(Phase.GENERAL)
  ).wait();

  const liquidityPool = await liquidityPoolFactory
    .connect(treasury)
    .deploy(spaceCoin.address);
  const router = await routerFactory
    .connect(treasury)
    .deploy(liquidityPool.address);

  const ONE_HUNDREDTH_OF_AN_ETHER = ONE_ETHER.div(100);

  await (
    await spaceCoin
      .connect(treasury)
      .approve(liquidityPool.address, ONE_HUNDREDTH_OF_AN_ETHER)
  ).wait();

  await (
    await router.connect(treasury).addLiquidity(ONE_HUNDREDTH_OF_AN_ETHER, 1, {
      value: ONE_HUNDREDTH_OF_AN_ETHER.div(5),
    })
  ).wait();

  console.log("spaceCoin deployed to: ", spaceCoin.address);
  console.log("router deployed to: ", router.address);
  console.log("lp deployed to: ", liquidityPool.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
