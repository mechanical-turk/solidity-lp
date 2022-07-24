import { BigNumber } from "ethers";

export const expectedEthForSpc = ({
  spcIn,
  ethReserves,
  spcReserves,
  isTaxed,
}: {
  spcIn: BigNumber;
  ethReserves: BigNumber;
  spcReserves: BigNumber;
  isTaxed: boolean;
}): BigNumber => {
  const postTaxIn = isTaxed ? spcIn.mul(98).div(100) : spcIn;
  const postFeesSpcIn = postTaxIn.mul(99).div(100);
  const nominator = ethReserves.mul(postFeesSpcIn);
  const denominator = spcReserves.add(postFeesSpcIn);
  const dEth = nominator.div(denominator);

  return dEth;
};

export const expectedSpcForEth = ({
  ethIn,
  ethReserves,
  spcReserves,
  isTaxed,
}: {
  ethIn: BigNumber;
  ethReserves: BigNumber;
  spcReserves: BigNumber;
  isTaxed: boolean;
}): BigNumber => {
  const postFeesEthIn = ethIn.mul(99).div(100);
  const nominator = spcReserves.mul(postFeesEthIn);
  const denominator = ethReserves.add(postFeesEthIn);
  const dSpc = nominator.div(denominator);
  const finalDspc = isTaxed ? dSpc.mul(98).div(100) : dSpc;

  return finalDspc;
};

export const expectedEthAndLpTokensForSpc = ({
  spcIn,
  ethReserves,
  spcReserves,
  totalLpTokenSupply,
  isTaxed,
}: {
  spcIn: BigNumber;
  ethReserves: BigNumber;
  spcReserves: BigNumber;
  totalLpTokenSupply: BigNumber;
  isTaxed: boolean;
}) => {
  const postTaxSpcIn = isTaxed ? spcIn.mul(98).div(100) : spcIn;
  const correspondingEth = ethReserves.mul(postTaxSpcIn).div(spcReserves);
  const numLpTokensReceived = totalLpTokenSupply
    .mul(postTaxSpcIn)
    .div(spcReserves);

  return {
    eth: correspondingEth,
    lp: numLpTokensReceived,
  };
};

export const expectedEthAndSpcForLpTokens = ({
  lpTokensIn,
  ethReserves,
  spcReserves,
  totalLpTokenSupply,
  isTaxed,
}: {
  lpTokensIn: BigNumber;
  ethReserves: BigNumber;
  spcReserves: BigNumber;
  totalLpTokenSupply: BigNumber;
  isTaxed: boolean;
}) => {
  const ethReceived = ethReserves.mul(lpTokensIn).div(totalLpTokenSupply);
  const spaceCoinsOut = spcReserves.mul(lpTokensIn).div(totalLpTokenSupply);
  const spaceCoinReceived = isTaxed
    ? spaceCoinsOut.mul(98).div(100)
    : spaceCoinsOut;

  return {
    eth: ethReceived,
    spc: spaceCoinReceived,
  };
};

export const getMinAfterSlippage = ({
  original,
  slippageFactor,
}: {
  original: BigNumber;
  slippageFactor: BigNumber;
}): BigNumber => {
  return original.sub(original.mul(slippageFactor).div(1_000_000));
};
