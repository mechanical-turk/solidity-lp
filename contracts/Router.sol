//SPDX-License-Identifier: Unlicense

pragma solidity ^0.8.14;

import "./interfaces/ILiquidityPool.sol";

contract Router {
    ILiquidityPool public immutable liquidityPoolContract;

    constructor(ILiquidityPool liquidityPoolContract_) {
        liquidityPoolContract = liquidityPoolContract_;
    }

    function addLiquidity(uint256 spaceCoinsGiven, uint256 minLPTokens)
        external
        payable
    {
        uint256 numLPTokensReceived = liquidityPoolContract.mint{
            value: msg.value
        }(msg.sender, spaceCoinsGiven);
        require(numLPTokensReceived >= minLPTokens, "below min");
    }

    function removeLiquidity(
        uint256 numLPTokensBurned,
        uint256 minEthReceived,
        uint256 minSpaceCoinReceived
    ) external {
        (uint256 ethReceived, uint256 spaceCoinReceived) = liquidityPoolContract
            .burn(msg.sender, numLPTokensBurned);
        require(
            (ethReceived >= minEthReceived) &&
                (spaceCoinReceived >= minSpaceCoinReceived),
            "below min"
        );
    }

    function swapExactEthForTokens(uint256 minSpaceCoinReceived)
        external
        payable
    {
        uint256 spaceCoinsReceived = liquidityPoolContract.buySpaceCoinsSellEth{
            value: msg.value
        }(msg.sender);
        require(spaceCoinsReceived >= minSpaceCoinReceived, "below min");
    }

    function swapExactTokensForEth(
        uint256 spaceCoinsGiven,
        uint256 minEthReceived
    ) external {
        uint256 ethReceived = liquidityPoolContract.buyEthSellSpaceCoins(
            msg.sender,
            spaceCoinsGiven
        );
        require(ethReceived >= minEthReceived, "below min");
    }
}
