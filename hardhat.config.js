require("@nomiclabs/hardhat-waffle")
require("@nomiclabs/hardhat-ethers");
require("hardhat-gas-reporter") // comment out if gas reports are annoying
require("@nomiclabs/hardhat-etherscan")
require("dotenv").config()
require("solidity-coverage")
require("hardhat-deploy")

module.exports = {
    defaultNetwork: "hardhat",
    networks: {
        hardhat: {
            forking: {
                url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_KEY}`,
                // blockNumber: 15904999,
                blockNumber: 16113380,
            },
        },
    },
    solidity: {
        compilers: [
            {
                version: "0.6.12",
            },
            {
                version: "0.7.5",
            },
        ],
    },
    namedAccounts: {
        deployer: {
            default: 0,
            1: 0,
        },
    },
    mocha: {
        timeout: 500000,
    },
}
