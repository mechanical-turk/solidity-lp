//SPDX-License-Identifier: Unlicense

pragma solidity ^0.8.14;

import "./interfaces/ISpaceCoin.sol";
import "./interfaces/ILiquidityPool.sol";
import "./libraries/Math.sol";

contract LiquidityPool is ILiquidityPool, ERC20 {
    ISpaceCoin public immutable spaceCoinContract;

    uint256 public ethReserves;
    uint256 public spaceCoinReserves;
    uint256 public invariant;

    uint256 constant REMAINDER_PERCENT_AFTER_FEES = 99;
    uint256 constant MINIMUM_LIQUIDITY = 1_000;

    address constant MINIMUM_LIQUIDITY_OWNER_ADDRESS = address(0x1);

    constructor(ISpaceCoin spaceCoinContract_) ERC20("SPC Liquidity", "SPT") {
        spaceCoinContract = spaceCoinContract_;
    }

    bool private unlocked = true;
    modifier lock() {
        require(unlocked, "locked");
        unlocked = false;
        _;
        unlocked = true;
    }

    event Mint(
        address liquidityProvider,
        uint256 ethIn,
        uint256 spaceCoinsIn,
        uint256 liquidityTokensMinted
    );

    event Burn(
        address liquidityProvider,
        uint256 ethOut,
        uint256 spaceCoinsOut,
        uint256 liquidityTokensBurned
    );

    event Swap(
        address trader,
        uint256 ethIn,
        uint256 ethOut,
        uint256 spaceCoinsIn,
        uint256 spaceCoinsOut
    );

    function getSpaceCoinDiffAfterTransferFrom(address from, uint256 amount)
        internal
        returns (uint256 dX)
    {
        uint256 balanceBefore = spaceCoinContract.balanceOf(address(this));
        bool success = spaceCoinContract.transferFrom(
            from,
            address(this),
            amount
        );
        require(success, "transfer failed");
        uint256 balanceAfter = spaceCoinContract.balanceOf(address(this));
        return balanceAfter - balanceBefore;
    }

    function getSpaceCoinDiffAfterTransfer(address to, uint256 amount)
        internal
        returns (uint256 dX)
    {
        uint256 balanceBefore = spaceCoinContract.balanceOf(to);
        bool success = spaceCoinContract.transfer(to, amount);
        require(success, "transfer failed");
        uint256 balanceAfter = spaceCoinContract.balanceOf(to);
        return balanceAfter - balanceBefore;
    }

    function buyEthSellSpaceCoins(address trader, uint256 spaceCoinsGiven)
        external
        lock
        returns (uint256 ethReceived)
    {
        uint256 spaceCoinsReceived = getSpaceCoinDiffAfterTransferFrom(
            trader,
            spaceCoinsGiven
        );
        uint256 feeAdjustedSpaceCoinsIn = (spaceCoinsReceived *
            REMAINDER_PERCENT_AFTER_FEES) / 100;
        ethReceived =
            (ethReserves * feeAdjustedSpaceCoinsIn) /
            (spaceCoinReserves + feeAdjustedSpaceCoinsIn);

        require(ethReceived > 0, "zero trade");

        ethReserves -= ethReceived;
        spaceCoinReserves += spaceCoinsReceived;
        assert(ethReserves * spaceCoinReserves > invariant); // making sure the constant product has increased
        invariant = ethReserves * spaceCoinReserves;

        (bool success, ) = trader.call{value: ethReceived}("");
        require(success, "eth send failed");
        emit Swap(trader, 0, ethReceived, spaceCoinsGiven, 0);
    }

    function buySpaceCoinsSellEth(address trader)
        external
        payable
        lock
        returns (uint256 spaceCoinsReceived)
    {
        uint256 ethInAfterFees = (msg.value * REMAINDER_PERCENT_AFTER_FEES) /
            100;
        uint256 spaceCoinsOut = (spaceCoinReserves * ethInAfterFees) /
            (ethReserves + ethInAfterFees);
        spaceCoinsReceived = getSpaceCoinDiffAfterTransfer(
            trader,
            spaceCoinsOut
        );
        require(spaceCoinsReceived > 0, "zero trade");

        ethReserves += msg.value;
        spaceCoinReserves -= spaceCoinsOut;
        assert(ethReserves * spaceCoinReserves > invariant); // making sure the constant product has increased
        invariant = ethReserves * spaceCoinReserves;
        emit Swap(trader, msg.value, 0, 0, spaceCoinsReceived);
    }

    function mint(address liquidityProvider, uint256 spaceCoinsGiven)
        external
        payable
        lock
        returns (uint256 numLPTokensReceived)
    {
        uint256 spaceCoinsReceived = getSpaceCoinDiffAfterTransferFrom(
            liquidityProvider,
            spaceCoinsGiven
        );

        uint256 incrementEthReservesBy = msg.value;

        if (totalSupply() == 0) {
            uint256 initialLPTokens = Math.sqrt(msg.value * spaceCoinsReceived);
            _mint(MINIMUM_LIQUIDITY_OWNER_ADDRESS, MINIMUM_LIQUIDITY);
            numLPTokensReceived = initialLPTokens - MINIMUM_LIQUIDITY;
        } else {
            uint256 correspondingEth = (ethReserves * spaceCoinsReceived) /
                spaceCoinReserves;

            // if the following is the case:
            // spaceCoinReserves = 1_000_000;
            // ethReserves = 1;
            // spaceCoinsReceived = 1000;
            // then a provider can mint without giving any ETH!
            //
            // correspondingEth = 0!!!
            //
            // so we should defend against it!

            require(correspondingEth > 0, "zero eth mint");

            require(msg.value >= correspondingEth, "non-matching eth value");

            numLPTokensReceived =
                (totalSupply() * spaceCoinsReceived) /
                spaceCoinReserves;

            if (msg.value > correspondingEth) {
                // refunding dust
                (bool success, ) = liquidityProvider.call{
                    value: (msg.value - correspondingEth)
                }("");
                require(success, "eth send failed");
            }

            incrementEthReservesBy = correspondingEth;
        }
        require(numLPTokensReceived > 0, "zero trade");

        ethReserves += incrementEthReservesBy;
        spaceCoinReserves += spaceCoinsReceived;

        assert(ethReserves * spaceCoinReserves > invariant); // making sure the constant product has increased
        invariant = ethReserves * spaceCoinReserves;
        _mint(liquidityProvider, numLPTokensReceived);

        emit Mint(
            liquidityProvider,
            msg.value,
            spaceCoinsGiven,
            numLPTokensReceived
        );
    }

    function burn(address liquidityProvider, uint256 numLPTokensBurned)
        external
        lock
        returns (uint256 ethReceived, uint256 spaceCoinReceived)
    {
        ethReceived = (ethReserves * numLPTokensBurned) / totalSupply();
        uint256 spaceCoinsOut = (spaceCoinReserves * numLPTokensBurned) /
            totalSupply();
        spaceCoinReceived = getSpaceCoinDiffAfterTransfer(
            liquidityProvider,
            spaceCoinsOut
        );
        require(ethReceived > 0, "zero trade");
        require(spaceCoinReceived > 0, "zero trade");
        ethReserves -= ethReceived;
        spaceCoinReserves -= spaceCoinsOut;
        invariant = ethReserves * spaceCoinReserves;
        _burn(liquidityProvider, numLPTokensBurned);
        (bool success, ) = liquidityProvider.call{value: ethReceived}("");
        require(success, "send eth failed");

        emit Burn(
            liquidityProvider,
            ethReceived,
            spaceCoinReceived,
            numLPTokensBurned
        );
    }
}
