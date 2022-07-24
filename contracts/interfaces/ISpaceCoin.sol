//SPDX-License-Identifier: Unlicense

pragma solidity ^0.8.14;

import "../../node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface ISpaceCoin is IERC20 {
    function isTaxed() external view returns (bool);

    function TAX_DIVISOR() external view returns (uint8);
}
