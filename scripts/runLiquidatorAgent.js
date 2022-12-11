const { ethers } = require("hardhat")
const { LENDING_POOL } = require("../src/consts")
const {
  liquidatorLoop,
  deployLiquidatorAgent,
} = require("../src/liquidatorAgent")

let liquidatorInterval

const liquidationCounter = {
  numOfLiquidationsPerformed: 0
}

async function main() {
  const lendingPool = await ethers.getContractAt("ILendingPool", LENDING_POOL)
  const liquidatorAgent = await deployLiquidatorAgent()

  liquidatorInterval = await liquidatorLoop(liquidatorAgent, lendingPool, liquidationCounter)
}

main().catch((error) => {
  console.error(error)
  clearInterval(liquidatorInterval)
  process.exitCode = 1
})
