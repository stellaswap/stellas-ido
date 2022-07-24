require("@nomiclabs/hardhat-waffle");
require("hardhat-contract-sizer");
require("dotenv").config();
require("./tasks/index");
require("@nomiclabs/hardhat-etherscan");
// require("@ericxstone/hardhat-blockscout-verify");

module.exports = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      gas: 12000000,
      blockGasLimit: 0x1fffffffffffff,
      allowUnlimitedContractSize: true,
      timeout: 1800000,
    },
  },

  solidity: {
    compilers: [
      {
        version: "0.8.4",
      },
      {
        version: "0.6.6",
      },
      {
        version: "0.5.16",
      },
      {
        version: "0.6.12",
      },
      {
        version: "0.8.0",
      },
      {
        version: "0.8.7",
      },
      {
        version: "0.6.6",
      },
      {
        version: "0.8.2",
      },
      {
        version: "0.7.6",
      },
    ],

    overrides: {
      "contracts/amm/StellaSwapV2Router02.sol": {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      "contracts/amm/StellaSwapV2GaslessRouter.sol": {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      "contracts/farms/v2/SolarDistributorV2.sol": {
        version: "0.8.7",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
    
    settings: {
      optimizer: {
        enabled: false,
        runs: 999999,
      },
    },
  },

  mocha: {
    timeout: 2000000,
  },

  etherscan: {
    apiKey: "VI67SHY8CMMKENY3ZSZ7ETBTVENHF2TFJ3",
  },
  // blockscoutVerify: {
  //   blockscoutURL: "https://blockscout.moonbeam.network",
  //   contracts: {
  //     "Stella": {
  //       compilerVersion: SOLIDITY_VERSION.SOLIDITY_V_8_0, // checkout enum SOLIDITY_VERSION
  //       optimization: true,
  //       // evmVersion: EVM_VERSION.EVM_LONDON, // checkout enum SOLIDITY_VERSION
  //       optimizationRuns: 200,
  //     },
  //   },
  // },
};
