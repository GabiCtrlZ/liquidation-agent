// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import {FlashLoanReceiverBase} from "@aave/protocol-v2/contracts/flashloan/base/FlashLoanReceiverBase.sol";
import {ILendingPool} from "@aave/protocol-v2/contracts/interfaces/ILendingPool.sol";
import {ILendingPoolAddressesProvider} from "@aave/protocol-v2/contracts/interfaces/ILendingPoolAddressesProvider.sol";
import {IPriceOracleGetter} from "@aave/protocol-v2/contracts/interfaces/IPriceOracleGetter.sol";
import {IERC20} from "@aave/protocol-v2/contracts/dependencies/openzeppelin/contracts/IERC20.sol";
import {DataTypes} from "@aave/protocol-v2/contracts/protocol/libraries/types/DataTypes.sol";
import "hardhat/console.sol";

import {ISwapper} from "./ISwapper.sol";

contract LiquidatorAgent is FlashLoanReceiverBase {
  address private immutable owner;
  ISwapper private immutable swapper;

  struct DebtData {
    uint256 totalDebt;
    address asset;
  }

  constructor(address _addressProvider, address _swapper)
    public
    FlashLoanReceiverBase(ILendingPoolAddressesProvider(_addressProvider))
  {
    owner = msg.sender;
    swapper = ISwapper(_swapper);
  }

  /**
        This function is called after your contract has received the flash loaned amount
     */
  function executeOperation(
    address[] calldata assets,
    uint256[] calldata amounts,
    uint256[] calldata premiums,
    address initiator,
    bytes calldata params
  ) external override returns (bool) {
    (address _collateral, address _user) = abi.decode(
      params,
      (address, address)
    );
    for (uint256 i = 0; i < assets.length; i++) {
      address _debtAsset = assets[i];
      uint256 _debtAmount = amounts[i];

      uint256 initialCollateralBalance = IERC20(_collateral).balanceOf(
        address(this)
      );
      uint256 initialDebtBalance = IERC20(_debtAsset).balanceOf(address(this));

      // agent has _debtAsset in his balance and no _collateralAsset
      console.log(
        "starting liquidationCall, _collateralBalance %s, _debtBalance %s",
        initialCollateralBalance,
        initialDebtBalance
      );

      // starting the liquidationCall process
      IERC20(_debtAsset).approve(address(LENDING_POOL), 0);
      IERC20(_debtAsset).approve(address(LENDING_POOL), _debtAmount);

      LENDING_POOL.liquidationCall(
        _collateral,
        _debtAsset,
        _user,
        _debtAmount,
        false
      );

      // agent recieved _collateralAsset as expected from the liquidationCall
      console.log(
        "finished liquidationCall, _collateralBalance %s, _debtBalance %s",
        IERC20(_collateral).balanceOf(address(this)),
        IERC20(_debtAsset).balanceOf(address(this))
      );

      IERC20(_collateral).approve(address(swapper), 0);
      IERC20(_collateral).approve(
        address(swapper),
        IERC20(_collateral).balanceOf(address(this)) - initialCollateralBalance // if the agent got some of the collateralAsset from before, no need to swap everything
      );

      swapper.swapExactInputSingle(
        IERC20(_collateral).balanceOf(address(this)) - initialCollateralBalance,
        _collateral,
        _debtAsset
      );

      // agent sold the _collateralAsset from the liquidationCall
      console.log(
        "finished swap, _collateralBalance %s, _debtBalance %s",
        IERC20(_collateral).balanceOf(address(this)),
        IERC20(_debtAsset).balanceOf(address(this))
      );

      // agent sold the _collateralAsset from the liquidationCall to uniswap DEX
      // approving returning the loan
      uint256 amountOwing = _debtAmount.add(premiums[i]);
      IERC20(_debtAsset).approve(address(LENDING_POOL), 0);
      IERC20(_debtAsset).approve(address(LENDING_POOL), amountOwing);
    }

    return true;
  }

  function liquidateUserWithFlashLoan(
    address _user,
    address _collateral,
    address _debtToken,
    uint256 _amount
  ) public onlyOwner {
    console.log(
      "Got request flash loan request from %s for token %s and amount %s",
      msg.sender,
      _debtToken,
      _amount
    );

    address receiverAddress = address(this);

    address[] memory assets = new address[](1);
    assets[0] = _debtToken;

    uint256[] memory amounts = new uint256[](1);
    amounts[0] = _amount;

    // 0 = no debt, 1 = stable, 2 = variable
    uint256[] memory modes = new uint256[](1);
    modes[0] = 0;

    address onBehalfOf = address(this);
    bytes memory params = abi.encode(_collateral, _user);
    uint16 referralCode = 0;

    LENDING_POOL.flashLoan(
      receiverAddress,
      assets,
      amounts,
      modes,
      onBehalfOf,
      params,
      referralCode
    );
  }

  // user data functions
  function isUserReadyForLiquidation(address user)
    external
    view
    returns (bool)
  {
    (, , , , , uint256 healthFactor) = LENDING_POOL.getUserAccountData(user);
    return healthFactor <= 1 ether;
  }

  // this function finds the first user collateral index as it's a naive implementation simply for this kinda basic POC
  function findUserCollateralIndex(address user, uint256 reservesCount)
    external
    view
    returns (uint256)
  {
    DataTypes.UserConfigurationMap memory userConfig = LENDING_POOL
      .getUserConfiguration(user);

    for (
      uint256 reserveIndex = 0;
      reserveIndex < reservesCount;
      reserveIndex++
    ) {
      if ((userConfig.data >> (reserveIndex * 2 + 1)) & 1 != 0) {
        // this is the calculation used in isUsingAsCollateral function
        return reserveIndex;
      }
    }
    return uint256(-1);
  }

  function getUserDebtForReserves(address user, address[] memory reserves)
    external
    view
    returns (DebtData memory)
  {
    for (uint256 i = 0; i < reserves.length; i++) {
      DataTypes.ReserveData memory reserve = LENDING_POOL.getReserveData(
        reserves[i]
      );
      if (
        IERC20(reserve.stableDebtTokenAddress).balanceOf(user) > 0 ||
        IERC20(reserve.variableDebtTokenAddress).balanceOf(user) > 0
      ) {
        return
          DebtData(
            IERC20(reserve.stableDebtTokenAddress).balanceOf(user) +
              IERC20(reserve.variableDebtTokenAddress).balanceOf(user),
            reserves[i]
          );
      }
    }
    return DebtData(0, address(0));
  }

  // oracle helper functions
  function getAssetPrice(address oracle, address asset)
    external
    view
    returns (uint256)
  {
    // helps compare different oracles dynamically
    return IPriceOracleGetter(oracle).getAssetPrice(asset);
  }

  // contract state view functions
  function getBalance(address _tokenAddress) external view returns (uint256) {
    return IERC20(_tokenAddress).balanceOf(address(this));
  }

  function withdraw(address _tokenAddress) external onlyOwner {
    IERC20(_tokenAddress).transfer(
      msg.sender,
      IERC20(_tokenAddress).balanceOf(address(this))
    );
  }

  modifier onlyOwner() {
    require(
      msg.sender == owner,
      "Only the contract owner can call this function"
    );
    _;
  }

  receive() external payable {}
}
