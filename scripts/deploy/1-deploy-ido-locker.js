const hre = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log(`Deploying contracts with ${deployer.address}`);

  const balance = await deployer.getBalance();
  console.log(`Account balance: ${balance.toString()}`);

  // wrapped eth address
  this.Locker = await ethers.getContractFactory("IDOLocker");
  this.locker = await this.Locker.deploy();
  await this.locker.deployed();

  console.log('Locker', this.locker.address);

  const timestamp = (Date.now() / 1000).toFixed(0);
  await this.locker.add(
    '0x06A3b410b681c82417A906993aCeFb91bAB6A080',
    timestamp, // startTime,
    +timestamp + 86400 * 7, // _endTimestamp,
    +timestamp + 86400 * 15, // _unlockTimestamp,
    1500 // _earlyUnlockPenalty,
  );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
