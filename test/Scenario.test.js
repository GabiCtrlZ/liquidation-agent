const { assert } = require("chai")
const { ethers } = require("hardhat")
const {
  ETH_TEST_FUNDER,
  ERC20_TEST_FUNDER,
  AAVE_OWNER,
  LENDING_POOL,
  LENDING_POOL_ADDRESS_PROVIDER,
  ACCOUNTS_TO_MONITOR,
} = require("../src/consts")
const {
  deployLiquidatorAgent,
  getAccountReadyForLiquidation,
  liquidateAccount,
  findDebtOfUser,
  findUserCollateral,
} = require("../src/liquidatorAgent")
const { BNtoNum } = require("../src/utils")

const resetToBlockNum = (blockNumber) =>
  network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_KEY}`,
          blockNumber,
        },
      },
    ],
  })

// test utils
const fundBrokeUsersForTests = async (brokeUserAddress) => {
  const funder = await ethers.getImpersonatedSigner(ETH_TEST_FUNDER)

  await funder.sendTransaction({
    to: brokeUserAddress,
    value: ethers.utils.parseEther("100.0"), // random high number so that we sure we can send transactions
  })
}

const fundERC20BrokeUsersForTests = async (brokeUserAddress, token, amount) => {
  const funder = await ethers.getImpersonatedSigner(ERC20_TEST_FUNDER)
  const tokenContract = await ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
    token
  )
  await tokenContract.connect(funder).transfer(brokeUserAddress, amount)
}

describe("Run Scenario", () => {
  let liquidatorAgent
  let oracle
  let reserves
  beforeEach(async () => {
    await resetToBlockNum(16113380) // make sure all tests start from the same point

    liquidatorAgent = await deployLiquidatorAgent()

    const AaveOracleMock = await ethers.getContractFactory("AaveOracleMock")
    oracle = await AaveOracleMock.deploy()

    await oracle.deployed()

    await fundBrokeUsersForTests(AAVE_OWNER)
    await fundBrokeUsersForTests(ERC20_TEST_FUNDER)
    // await fundBrokeUsersForTestsERC20(liquidatorAgent, "0x6B175474E89094C44Da98b954EedeAC495271d0F", 20)

    const lendingPoolAddressesProvider = await ethers.getContractAt(
      "ILendingPoolAddressesProvider",
      LENDING_POOL_ADDRESS_PROVIDER
    )
    const lendingPool = await ethers.getContractAt("ILendingPool", LENDING_POOL)
    const impersonatedAaveOwner = await ethers.getImpersonatedSigner(AAVE_OWNER)
    reserves = await lendingPool.getReservesList()

    // initialize mock price oracle same as pervious
    for (const reserve of reserves) {
      await oracle.setAssetPrice(
        reserve,
        await liquidatorAgent.getAssetPrice(
          await lendingPoolAddressesProvider.getPriceOracle(),
          reserve
        )
      )
    }

    // switch oracles
    await lendingPoolAddressesProvider
      .connect(impersonatedAaveOwner)
      .setPriceOracle(oracle.address)
  })
  it("Scenario1 - changing collateral asset price to trigger liquidation eligibility", async () => {
    // first check
    assert((await getAccountReadyForLiquidation(liquidatorAgent)).length === 0) // no accounts ready for liquidation

    const collateral = await findUserCollateral(
      liquidatorAgent,
      reserves,
      ACCOUNTS_TO_MONITOR[1]
    )
    const debt = await findDebtOfUser(
      liquidatorAgent,
      reserves,
      ACCOUNTS_TO_MONITOR[1]
    )

    // make user allegeable for liquidation
    await oracle.setAssetPrice(collateral, "100000000000000") // asset price is configurable, driving the collateral price down results in liquidation
    assert((await getAccountReadyForLiquidation(liquidatorAgent)).length === 1) // after changing the asset price, the second account is ready to be liquidated

    // this funding is only needed in tests since in actual liquidation the swap will yield more revenue to return the flash loan
    // a different approach the problem would have been to mock the DEX I'm selling to, but it requires a bit more work than the scope of this test
    await fundERC20BrokeUsersForTests(
      liquidatorAgent.address,
      debt[1],
      "17860923199800825795"
    )
    await liquidateAccount(
      liquidatorAgent,
      ACCOUNTS_TO_MONITOR[1],
      reserves,
      "17860923199800825795"
    )

    const debtAfter = await findDebtOfUser(
      liquidatorAgent,
      reserves,
      ACCOUNTS_TO_MONITOR[1]
    )
    assert(BNtoNum(debtAfter[0]) < BNtoNum(debt[0])) // user have been liquidated properly
  })

  it("Scenario2 - changing debt price to trigger liquidation eligibility", async () => {
    // first check
    assert((await getAccountReadyForLiquidation(liquidatorAgent)).length === 0) // no accounts ready for liquidation

    const collateral = await findUserCollateral(
      liquidatorAgent,
      reserves,
      ACCOUNTS_TO_MONITOR[1]
    )
    const debt = await findDebtOfUser(
      liquidatorAgent,
      reserves,
      ACCOUNTS_TO_MONITOR[1]
    )

    // make user allegeable for liquidation
    await oracle.setAssetPrice(debt[1], "8103549228292030") // asset is configurable and price is configurable, driving the debt price up results in liquidation
    assert((await getAccountReadyForLiquidation(liquidatorAgent)).length === 1) // after changing the asset price, the second account is ready to be liquidated

    // this funding is only needed in tests since in actual liquidation the swap will yield more revenue to return the flash loan
    // a different approach the problem would have been to mock the DEX I'm selling to, but it requires a bit more work than the scope of this test
    await fundERC20BrokeUsersForTests(
      liquidatorAgent.address,
      debt[1],
      "17860923199800825795"
    )
    await liquidateAccount(
      liquidatorAgent,
      ACCOUNTS_TO_MONITOR[1],
      reserves,
      "17860923199800825795"
    )

    const debtAfter = await findDebtOfUser(
      liquidatorAgent,
      reserves,
      ACCOUNTS_TO_MONITOR[1]
    )
    assert(BNtoNum(debtAfter[0]) < BNtoNum(debt[0])) // user have been liquidated properly
  })
})
