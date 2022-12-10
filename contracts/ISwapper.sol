// SPDX-License-Identifier: MIT
pragma solidity >=0.6.12;

interface ISwapper {
    function swapExactInputSingle(
        uint256 amountIn,
        address tokenIn,
        address tokenOut
    ) external returns (uint256 amountOut);
}
