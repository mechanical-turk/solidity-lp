import { BigNumber } from "ethers";
import {
  liquidityPoolContract,
  spaceCoinContract,
  lpContractAddress,
} from "../app/contracts";
import { signer } from "../app/provider";

export type RemoteState = {
  signer: string;
  isTaxed: boolean;
  spcBalance: BigNumber;
  ethBalance: BigNumber;
  lpAllowance: BigNumber;
  lpTokens: BigNumber;
  totalLPTokensSupply: BigNumber;
  ethReserves: BigNumber;
  spcReserves: BigNumber;
};

export const getRemoteState = async (): Promise<RemoteState> => {
  const signerAddress = await signer.getAddress();
  const lpTokens = await liquidityPoolContract
    .connect(signer)
    .balanceOf(signerAddress);
  const totalLPTokensSupply = await liquidityPoolContract
    .connect(signer)
    .totalSupply();
  return {
    signer: signerAddress,
    isTaxed: await spaceCoinContract.connect(signer).isTaxed(),
    ethBalance: await signer.getBalance(),
    spcBalance: await spaceCoinContract
      .connect(signer)
      .balanceOf(signerAddress),
    lpAllowance: await spaceCoinContract
      .connect(signer)
      .allowance(signerAddress, lpContractAddress),
    lpTokens,
    totalLPTokensSupply,
    ethReserves: await liquidityPoolContract.ethReserves(),
    spcReserves: await liquidityPoolContract.spaceCoinReserves(),
  };
};
