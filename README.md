# Liquidation Agent

Welcome to the Liquidation Agent project!

The Liquidation Agent receives list of accounts on Aave and monitor them for liquidation eligibility. Once any account is eligible the agent liquidates (buys the collateral) and sells it back on the Uniswap DEX for profit.

Additionally, there are 2 test scenario that are altering the oracle prices for Aave on an EVM fork and thus test the Liquidation Agent is able to liquidate.

## How is it happening??

To be able to buy the collateral the Liquidation Agent asks for a flash loan for the debt, buys the collateral, swaps it for the debt asset on Uniswap and returns the loan, enjoying the margin in profits.

To manipulate the Oracle prices there's an Oracle mock that overwrites the Mainnet Oracle in the EVM fork, allowing full control of current prices.

## Installation

To install the liquidation agent, follow these steps:

1. Make sure you have [Node.js](https://nodejs.org/) installed on your system.
2. Clone this repository and navigate to the root directory:
```
git clone https://github.com/gabictrlz/liquidation-agent.git
cd liquidation-agent
```
3. Install the necessary dependencies by running:
```
yarn install
```

## Env
Make sure you got a ALCHEMY_KEY for forking the mainnet for tests:
```
ALCHEMY_KEY=your_alchemy_key
```

## Usage

To use the liquidation agent, run the following command:
```
yarn hardhat run scripts/runLiquidatorAgent.js
```

To test the given scenarios run:
```
yarn hardhat test
```

## Manipulate the Oracle prices
To manipulate the Oracle prices simply call the `setAssetPrice` method on the mock oracle contract

## Todo

The project is currently under development so some features maybe missing/implemented naively.

1. Mocking the DEX may allow for better tests without the need to fund impersonated users
2. Providing a nice API to control the oracle without changing the code
3. Monitor AAVE events to find accounts eligible for liquidation instead of querying each time