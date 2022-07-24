
task("node", "Starts a JSON-RPC server on top of Hardhat Network")
  .setAction(async (taskArgs, hre, runSuper) => {
    let network = hre.config.networks[taskArgs.fork];
    if (network && 'url' in network) {
      console.log(`Forking ${taskArgs.fork} from RPC: ${network.url}`);
      taskArgs.noReset = true;
      taskArgs.fork = network.url;
      if (network.chainId) {
        hre.config.networks.hardhat.chainId = network.chainId;
        hre.config.networks.localhost.chainId = network.chainId;
      }
    }
    await runSuper(taskArgs);
});


task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});



task("mine", "Mine block to update block timestamp and block number", async (taskArgs, hre) => {
  await hre.ethers.provider.send("evm_mine");
});


task("block", "Block number and timestamp", async (taskArgs, hre) => {
  const blockNumBefore = await hre.ethers.provider.getBlockNumber();
  const blockBefore = await hre.ethers.provider.getBlock(blockNumBefore);
  const timestampBefore = blockBefore.timestamp;
  console.log('Block #:', blockNumBefore);
  console.log('Block Timestamp', timestampBefore);
});


task("blockmine", "Increase block time and mine")
.addParam("time", "Time in seconds to increase block time by")
.setAction(async (taskArgs, hre) => {
  await network.provider.send("evm_increaseTime", [(+taskArgs.time)]);
  await hre.ethers.provider.send("evm_mine");
});