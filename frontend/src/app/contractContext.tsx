import { BigNumber } from "ethers";
import React, { useState, useEffect } from "react";
import {
  liquidityPoolContract,
  routerContract,
  spaceCoinContract,
} from "./contracts";
import { signer } from "./provider";
import { delimit } from "../utils/delimit";
import {
  expectedEthAndLpTokensForSpc,
  expectedEthAndSpcForLpTokens,
  expectedEthForSpc,
  expectedSpcForEth,
  getMinAfterSlippage,
} from "../libs/liquidityPoolMath";
import { RemoteState, getRemoteState } from "../libs/remoteState";

const initialRemoteState: RemoteState = {
  signer: "",
  isTaxed: false,
  spcBalance: BigNumber.from(0),
  lpAllowance: BigNumber.from(0),
  ethBalance: BigNumber.from(0),
  lpTokens: BigNumber.from(0),
  totalLPTokensSupply: BigNumber.from(0),
  ethReserves: BigNumber.from(0),
  spcReserves: BigNumber.from(0),
};

export const ContractContextWrapper = () => {
  const [remoteState, setRemoteState] =
    useState<RemoteState>(initialRemoteState);
  const [swappingSpcIn, setSwappingSpcIn] = useState("");
  const [swappingEthIn, setSwappingEthIn] = useState("");
  const [swappingLPTokensIn, setSwappingLPTokensIn] = useState("");
  const [isTransacting, setIsTransacting] = useState(false);
  const [maxSlippage, setMaxSlippage] = useState("");
  const [isLoading, setLoading] = useState(true);
  const resetRemoteState = async () => {
    const remoteState = await getRemoteState();
    setRemoteState(remoteState);
  };
  const resetLocalState = () => {
    setSwappingSpcIn("");
    setMaxSlippage("");
    setSwappingEthIn("");
    setSwappingLPTokensIn("");
  };

  const resetEverything = async () => {
    await resetRemoteState();
    resetLocalState();
  };

  useEffect(() => {
    resetRemoteState().then(() => {
      setLoading(false);
    });
  }, []);

  if (isLoading) {
    return <div>loading...</div>;
  }

  const isEnoughAllowance = remoteState.lpAllowance.gt(
    BigNumber.from("1000000000000")
  );

  const spcIn = (() => {
    try {
      return BigNumber.from(swappingSpcIn);
    } catch (e) {
      return BigNumber.from(0);
    }
  })();

  const ethIn = (() => {
    try {
      return BigNumber.from(swappingEthIn);
    } catch (e) {
      return BigNumber.from(0);
    }
  })();

  const lpTokensIn = (() => {
    try {
      return BigNumber.from(swappingLPTokensIn);
    } catch (e) {
      return BigNumber.from(0);
    }
  })();

  const expectedEth = (() => {
    try {
      return expectedEthForSpc({
        spcIn,
        ethReserves: remoteState.ethReserves,
        spcReserves: remoteState.spcReserves,
        isTaxed: remoteState.isTaxed,
      });
    } catch (e) {
      console.error(e);
      return BigNumber.from(0);
    }
  })();

  const expectedSPC = (() => {
    try {
      return expectedSpcForEth({
        ethIn,
        ethReserves: remoteState.ethReserves,
        spcReserves: remoteState.spcReserves,
        isTaxed: remoteState.isTaxed,
      });
    } catch (e) {
      console.error(e);
      return BigNumber.from(0);
    }
  })();

  const slippageFactor = (() => {
    try {
      return BigNumber.from(maxSlippage);
    } catch (e) {
      return BigNumber.from(0);
    }
  })();

  const preSlippageExpectedEth = remoteState.ethReserves
    .mul(spcIn)
    .div(remoteState.spcReserves);

  const minEthRequirement = getMinAfterSlippage({
    original: preSlippageExpectedEth,
    slippageFactor,
  });

  const preSlippageExpectedSpc = remoteState.spcReserves
    .mul(ethIn)
    .div(remoteState.ethReserves);

  const minSpcRequirement = getMinAfterSlippage({
    original: preSlippageExpectedSpc,
    slippageFactor,
  });

  const ethAndLpTokensForSpc = expectedEthAndLpTokensForSpc({
    spcIn,
    ethReserves: remoteState.ethReserves,
    spcReserves: remoteState.spcReserves,
    totalLpTokenSupply: remoteState.totalLPTokensSupply,
    isTaxed: remoteState.isTaxed,
  });

  const minLPTokensGained = ethAndLpTokensForSpc.lp.mul(95).div(100);

  const ethAndSpcForLpTokens = expectedEthAndSpcForLpTokens({
    lpTokensIn,
    ethReserves: remoteState.ethReserves,
    spcReserves: remoteState.spcReserves,
    totalLpTokenSupply: remoteState.totalLPTokensSupply,
    isTaxed: remoteState.isTaxed,
  });

  const minEthGainedAfterLpTokensIn = getMinAfterSlippage({
    original: ethAndSpcForLpTokens.eth,
    slippageFactor: BigNumber.from("950000"),
  });

  const minSpcGainedAfterLpTokensIn = getMinAfterSlippage({
    original: ethAndSpcForLpTokens.spc,
    slippageFactor: BigNumber.from("950000"),
  });

  const allowanceButton = isEnoughAllowance ? (
    <span className="text-green-600 font-bold">Allowance sufficient</span>
  ) : (
    <button
      type="submit"
      className="bg-red-500 disabled:bg-gray-300 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
      disabled={isTransacting}
      onClick={async (e) => {
        try {
          setIsTransacting(true);
          await (
            await spaceCoinContract.connect(signer).approve(
              liquidityPoolContract.address,
              BigNumber.from(
                "115792089237316195423570985008687907853269984665640564039457584007913129639935"
              ) // max uint
            )
          ).wait();
          await resetEverything();
          alert("Success! Approval completed. You can begin swaps now.");
        } catch (e) {
          console.error(e);
          alert("Something went wrong");
        }
        setIsTransacting(false);
      }}
    >
      Give SPC Allowance
    </button>
  );

  const introBlock = (
    <div className="text-xl font-bold p-4 h-24 m-4 bg-gray-200">
      Welcome to the liquidity pool
    </div>
  );
  const hangTight = (
    <div className="text-xl font-bold text-red-800 p-4 h-24 m-4 bg-red-100">
      Transaction in process, hang tight!{" "}
    </div>
  );

  const hero = isTransacting ? hangTight : introBlock;

  const overview = (
    <table className="table-auto hover:table-fixed bg-gray-200 rounded">
      <tr>
        <td>Context</td>
        <td>
          <h2 className="text-xl font-bold">Overview</h2>
        </td>
      </tr>
      <tr>
        <td>SPC is Taxed</td>
        <td>{remoteState.isTaxed ? "Yes" : "No"}</td>
      </tr>

      <tr>
        <td>Your ETH Balance</td>
        <td>{delimit(remoteState.ethBalance)}</td>
      </tr>
      <tr>
        <td>Your SPC Balance</td>
        <td>{delimit(remoteState.spcBalance)}</td>
      </tr>
      <tr>
        <td>Your LP Tokens</td>
        <td>{delimit(remoteState.lpTokens)}</td>
      </tr>
      <tr>
        <td>LP - ETH Reserves</td>
        <td>{delimit(remoteState.ethReserves)}</td>
      </tr>
      <tr>
        <td>LP - SPC Reserves</td>
        <td>{delimit(remoteState.spcReserves)}</td>
      </tr>
      <tr>
        <td>LP - Token Supply</td>
        <td>{delimit(remoteState.totalLPTokensSupply)}</td>
      </tr>
      <tr>
        <td>Your SPC Allowance to LP Contract</td>
        <td>{allowanceButton}</td>
      </tr>
    </table>
  );

  const buyEth = (
    <table className="table-auto hover:table-fixed bg-gray-200 rounded ml-4">
      <tr>
        <td>Swap</td>
        <td>
          <h2 className="text-xl font-bold">Sell SPC, Buy ETH</h2>
        </td>
      </tr>
      <tr>
        <td>Selling SPC</td>
        <td>
          <input
            className="shadow appearance-none border rounded py-2 px-3 text-gray-700 w-full focus:outline-none focus:shadow-outline"
            type="number"
            value={swappingSpcIn}
            onChange={(e) => {
              setSwappingSpcIn(e.target.value);
            }}
          />
        </td>
      </tr>
      <tr>
        <td>Maximum Slippage (on a scale of 0 to 1_000_000)</td>
        <td>
          <input
            className="shadow appearance-none border rounded py-2 px-3 text-gray-700 w-full focus:outline-none focus:shadow-outline"
            type="number"
            value={maxSlippage}
            onChange={(e) => {
              setMaxSlippage(e.target.value);
            }}
          />
        </td>
      </tr>
      <tr>
        <td>Expected ETH gained (gas cost ignored)</td>
        <td>{delimit(expectedEth)}</td>
      </tr>
      <tr>
        <td>Pre-Slippage Theoretical Max gained (gas cost ignored)</td>
        <td>{delimit(preSlippageExpectedEth)}</td>
      </tr>
      <tr>
        <td>Min ETH Requirement</td>
        <td>{delimit(minEthRequirement)}</td>
      </tr>
      <tr>
        <td>Action</td>
        <td>
          <button
            type="submit"
            className="bg-blue-500 disabled:bg-gray-300 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            disabled={
              swappingSpcIn === "" || maxSlippage === "" || isTransacting
            }
            onClick={async (e) => {
              e.preventDefault();
              if (!isEnoughAllowance) {
                alert("Click the red button to give allowance first.");
                return;
              }
              if (minEthRequirement.gt(expectedEth)) {
                alert(
                  "Infeasible swap. Unless an independent transaction changes the prices in your favor, this swap will not result in a trade above your slippage tolerance. We suggest you increase your max slippage."
                );
                return;
              }
              try {
                setIsTransacting(true);
                await (
                  await routerContract
                    .connect(signer)
                    .swapExactTokensForEth(swappingSpcIn, minEthRequirement)
                ).wait();
                await resetEverything();
                alert("Success! Swap completed!");
              } catch (e) {
                console.error(e);
                alert("Something went wrong");
              }
              setIsTransacting(false);
            }}
          >
            Swap
          </button>
        </td>
      </tr>
    </table>
  );

  const buySpc = (
    <table className="table-auto hover:table-fixed bg-gray-200 rounded ml-4">
      <tr>
        <td>Swap</td>
        <td>
          <h2 className="text-xl font-bold">Sell ETH, Buy SPC</h2>
        </td>
      </tr>
      <tr>
        <td>Selling ETH</td>
        <td>
          <input
            className="shadow appearance-none border rounded py-2 px-3 text-gray-700 w-full focus:outline-none focus:shadow-outline"
            type="number"
            value={swappingEthIn}
            onChange={(e) => {
              setSwappingEthIn(e.target.value);
            }}
          />
        </td>
      </tr>
      <tr>
        <td>Maximum Slippage (on a scale of 0 to 1_000_000)</td>
        <td>
          <input
            className="shadow appearance-none border rounded py-2 px-3 text-gray-700 w-full focus:outline-none focus:shadow-outline"
            type="number"
            value={maxSlippage}
            onChange={(e) => {
              setMaxSlippage(e.target.value);
            }}
          />
        </td>
      </tr>
      <tr>
        <td>Expected SPC gained</td>
        <td>{delimit(expectedSPC)}</td>
      </tr>
      <tr>
        <td>Pre-Slippage Theoretical Max gained</td>
        <td>{delimit(preSlippageExpectedSpc)}</td>
      </tr>
      <tr>
        <td>Min SPC Requirement</td>
        <td>{delimit(minSpcRequirement)}</td>
      </tr>
      <tr>
        <td>Action</td>
        <td>
          <button
            type="submit"
            className="bg-blue-500 disabled:bg-gray-300 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            disabled={
              swappingEthIn === "" || maxSlippage === "" || isTransacting
            }
            onClick={async (e) => {
              e.preventDefault();
              if (minSpcRequirement.gt(expectedSPC)) {
                alert(
                  "Infeasible swap. Unless an independent transaction changes the prices in your favor, this swap will not result in a trade above your slippage tolerance. We suggest you increase your max slippage."
                );
                return;
              }
              try {
                setIsTransacting(true);
                await (
                  await routerContract
                    .connect(signer)
                    .swapExactEthForTokens(minSpcRequirement, {
                      value: ethIn,
                    })
                ).wait();
                await resetEverything();
                alert("Success! Swap completed!");
              } catch (e) {
                console.error(e);
                alert("Something went wrong");
              }
              setIsTransacting(false);
            }}
          >
            Swap
          </button>
        </td>
      </tr>
    </table>
  );

  const addLiquidity = (
    <table className="table-auto hover:table-fixed bg-gray-200 rounded ml-4">
      <tr>
        <td>Context</td>
        <td>
          <h2 className="text-xl font-bold">Add Liquidity</h2>
        </td>
      </tr>
      <tr>
        <td>SPC in</td>
        <td>
          <input
            className="shadow appearance-none border rounded py-2 px-3 text-gray-700 w-full focus:outline-none focus:shadow-outline"
            type="number"
            value={swappingSpcIn}
            onChange={(e) => {
              setSwappingSpcIn(e.target.value);
            }}
          />
        </td>
      </tr>

      <tr>
        <td>Expected ETH Cost</td>
        <td>{delimit(ethAndLpTokensForSpc.eth)}</td>
      </tr>
      <tr>
        <td>Expected LP Tokens gained</td>
        <td>{delimit(ethAndLpTokensForSpc.lp)}</td>
      </tr>
      <tr>
        <td>Min LP Tokens Requirement</td>
        <td>{delimit(minLPTokensGained)}</td>
      </tr>
      <tr>
        <td>Action</td>
        <td>
          <button
            type="submit"
            className="bg-blue-500 disabled:bg-gray-300 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            disabled={swappingSpcIn === "" || isTransacting}
            onClick={async (e) => {
              e.preventDefault();
              try {
                if (!isEnoughAllowance) {
                  alert("Click the red button to give allowance first.");
                  return;
                }
                setIsTransacting(true);
                await (
                  await routerContract
                    .connect(signer)
                    .addLiquidity(spcIn, minLPTokensGained, {
                      value: ethAndLpTokensForSpc.eth.mul(105).div(100),
                    })
                ).wait();
                await resetEverything();
                alert("Success! Added liquidity successfully!");
              } catch (e) {
                console.error(e);
                alert("Something went wrong");
              }
              setIsTransacting(false);
            }}
          >
            Add Liquidity
          </button>
        </td>
      </tr>
    </table>
  );

  const removeLiquidity = (
    <table className="table-auto hover:table-fixed bg-gray-200 rounded ml-4">
      <tr>
        <td>Context</td>
        <td>
          <h2 className="text-xl font-bold">Remove Liquidity</h2>
        </td>
      </tr>
      <tr>
        <td>LP Tokens in</td>
        <td>
          <input
            className="shadow appearance-none border rounded py-2 px-3 text-gray-700 w-full focus:outline-none focus:shadow-outline"
            type="number"
            value={swappingLPTokensIn}
            onChange={(e) => {
              setSwappingLPTokensIn(e.target.value);
            }}
          />
        </td>
      </tr>

      <tr>
        <td>Expected ETH gained</td>
        <td>{delimit(ethAndSpcForLpTokens.eth)}</td>
      </tr>
      <tr>
        <td>Expected SPC gained</td>
        <td>{delimit(ethAndSpcForLpTokens.spc)}</td>
      </tr>
      <tr>
        <td>Min Eth gained Requirement</td>
        <td>{delimit(minEthGainedAfterLpTokensIn)}</td>
      </tr>
      <tr>
        <td>Min SPC gained Requirement</td>
        <td>{delimit(minSpcGainedAfterLpTokensIn)}</td>
      </tr>
      <tr>
        <td>Action</td>
        <td>
          <button
            type="submit"
            className="bg-blue-500 disabled:bg-gray-300 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            disabled={swappingLPTokensIn === "" || isTransacting}
            onClick={async (e) => {
              e.preventDefault();
              try {
                setIsTransacting(true);
                await (
                  await routerContract
                    .connect(signer)
                    .removeLiquidity(
                      lpTokensIn,
                      minEthGainedAfterLpTokensIn,
                      minSpcGainedAfterLpTokensIn
                    )
                ).wait();
                await resetEverything();
                alert("Success! Added liquidity successfully!");
              } catch (e) {
                console.error(e);
                alert("Something went wrong");
              }
              setIsTransacting(false);
            }}
          >
            Remove Liquidity
          </button>
        </td>
      </tr>
    </table>
  );

  return (
    <div>
      {hero}
      <div className="grid grid-cols-3 gap-4 content-start m-4">
        {overview}
        {buyEth}
        {buySpc}
        <span></span>
        {addLiquidity}
        {removeLiquidity}
      </div>
    </div>
  );
};
