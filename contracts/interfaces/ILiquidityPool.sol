//SPDX-License-Identifier: Unlicense

pragma solidity ^0.8.14;

interface ILiquidityPool {
    function buyEthSellSpaceCoins(address trader, uint256 spaceCoinsGiven)
        external
        returns (uint256 ethReceived);

    function buySpaceCoinsSellEth(address trader)
        external
        payable
        returns (uint256 spaceCoinsReceived);

    function mint(address liquidityProvider, uint256 spaceCoinsGiven)
        external
        payable
        returns (uint256 numLPTokensReceived);

    function burn(address liquidityProvider, uint256 numLPTokensBurned)
        external
        returns (uint256 ethReceived, uint256 spaceCoinReceived);
}
