const { ethers } = require("hardhat")
const {
  RESERVE_CHECK_RATE,
  ZERO_ADDRESS,
  RESERVE_HARD_LIMIT,
  SWAP_ROUTER,
  LENDING_POOL_ADDRESS_PROVIDER,
  ACCOUNTS_TO_MONITOR,
} = require("./consts")
const { BNtoNum, asyncFilter } = require("./utils")

// this flag is needed since in the current liquidator agent model, the liquidation may take some time, triggering another liquidation for the same account, resulting in an error 
// a better model would be listening to events emitted from the LendingPool contract
let isLiquidationInProcess = false

// user data utils
const findDebtOfUser = async (liquidatorAgent, reserves, user) => {
  let debt
  for (i = 0; i <= reserves.length; i += RESERVE_CHECK_RATE) {
    debt = await liquidatorAgent.getUserDebtForReserves(
      user,
      reserves.slice(i, i + RESERVE_CHECK_RATE)
    )
    if (debt[1] !== ZERO_ADDRESS) return debt
  }
  return null
}

const findUserCollateral = async (liquidatorAgent, reserves, user) => {
  const collateralIndex = BNtoNum(
    await liquidatorAgent.findUserCollateralIndex(user, RESERVE_HARD_LIMIT)
  )
  if (collateralIndex >= RESERVE_HARD_LIMIT) return null

  return reserves[collateralIndex]
}

const deployLiquidatorAgent = async () => {
  const Swapper = await ethers.getContractFactory("Swapper")
  const LiquidatorAgent = await ethers.getContractFactory("LiquidatorAgent")

  const swapper = await Swapper.deploy(SWAP_ROUTER)

  await swapper.deployed()

  const liquidatorAgent = await LiquidatorAgent.deploy(
    LENDING_POOL_ADDRESS_PROVIDER,
    swapper.address
  )

  await liquidatorAgent.deployed()

  return liquidatorAgent
}

const getAccountReadyForLiquidation = (liquidatorAgent) =>
  asyncFilter(ACCOUNTS_TO_MONITOR, (account) =>
    liquidatorAgent.isUserReadyForLiquidation(account)
  )
const liquidateAccount = async (liquidatorAgent, account, reserves, amount) => {
  const userCollateral = await findUserCollateral(
    liquidatorAgent,
    reserves,
    account
  )
  const debt = await findDebtOfUser(liquidatorAgent, reserves, account)
  await liquidatorAgent.liquidateUserWithFlashLoan(
    account,
    userCollateral,
    debt[1],
    amount || Math.floor(BNtoNum(debt[0]) / 2)
  )
}

const liquidatorLoop = (liquidatorAgent, lendingPool, liquidationCounter, maxAmountToLiquidate) => {
  const interval = setInterval(async () => {
    const readyAccounts = await getAccountReadyForLiquidation(liquidatorAgent)
    if (!readyAccounts.length)
      return console.log("No account eligible for liquidation currently :(")

    const reserves = await lendingPool.getReservesList()

    for (const account of readyAccounts) {
      if (isLiquidationInProcess) return // only allow 1 liquidation at a time

      isLiquidationInProcess = true
      console.log(`liquidating ${account}`)
      try {
        await liquidateAccount(liquidatorAgent, account, reserves, maxAmountToLiquidate) // maxAmountToLiquidate is only a testing feature for control
        liquidationCounter.numOfLiquidationsPerformed += 1 // temp solution, listening to events emitted from the contract is better.
      } finally {
        isLiquidationInProcess = false // don't leave isLiquidationInProcess as true if something failed
      }
    }
  }, 5000)

  return interval
}

module.exports = {
  getAccountReadyForLiquidation,
  liquidateAccount,
  liquidatorLoop,
  deployLiquidatorAgent,
  findDebtOfUser,
  findUserCollateral,
}
