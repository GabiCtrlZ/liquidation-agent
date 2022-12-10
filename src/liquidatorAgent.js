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

const findUserCurrentReserve = async (liquidatorAgent, reserves, user) => {
  const currentReserveIndex = BNtoNum(
    await liquidatorAgent.findUserCurrentReserveIndex(user, RESERVE_HARD_LIMIT)
  )
  if (currentReserveIndex >= RESERVE_HARD_LIMIT) return null

  return reserves[currentReserveIndex]
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
  // const currentReserve = await findUserCurrentReserve(liquidatorAgent, reserves, account) // needed only in tests to trigger liquidation, usually it's the debt asset anyway
  const debt = await findDebtOfUser(liquidatorAgent, reserves, account)
  await liquidatorAgent.liquidateUserWithFlashLoan(
    account,
    userCollateral,
    debt[1],
    amount || Math.floor(BNtoNum(debt[0]) / 2)
  )
}

const liquidatorLoop = (liquidatorAgent, lendingPool) => {
  const interval = setInterval(async () => {
    const readyAccounts = await getAccountReadyForLiquidation(liquidatorAgent)
    if (!readyAccounts.length)
      return console.log("No account eligible for liquidation currently :(")

    const reserves = await lendingPool.getReservesList()

    for (const account of readyAccounts) {
      console.log(`liquidating ${account}`)
      await liquidateAccount(liquidatorAgent, account, reserves)
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
  findUserCurrentReserve,
}