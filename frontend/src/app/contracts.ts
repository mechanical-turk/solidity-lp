import { ethers } from "ethers";
import { SpaceCoin, Router, LiquidityPool } from "../../../typechain";
import SpaceCoinJSON from "../artifacts/contracts/SpaceCoin.sol/SpaceCoin.json";
import RouterJSON from "../artifacts/contracts/Router.sol/Router.json";
import LiquidityPoolJSON from "../artifacts/contracts/LiquidityPool.sol/LiquidityPool.json";
import { provider } from "./provider";

export const spaceCoinContractAddress =
  "0x7C96F1Ac33cf3E09d333044fBaF813fdA907EB7c";
export const routerContractAddress =
  "0x367b2319bfcee3aAeC234269113479AdfD66F1Bb";
export const lpContractAddress = "0x803bcfe40FEc2813112a84787727d78896C0657d";

export const spaceCoinContract = new ethers.Contract(
  spaceCoinContractAddress,
  SpaceCoinJSON.abi,
  provider
) as SpaceCoin;

export const routerContract = new ethers.Contract(
  routerContractAddress,
  RouterJSON.abi,
  provider
) as Router;

export const liquidityPoolContract = new ethers.Contract(
  lpContractAddress,
  LiquidityPoolJSON.abi,
  provider
) as LiquidityPool;
