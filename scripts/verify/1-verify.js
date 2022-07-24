
const hre = require("hardhat");
const { network, ethers, waffle } = require("hardhat");
const { Contract } = ethers;

function fmtEth(n) {
  return ethers.utils.parseEther(n).toString();
}

async function main() {

  const vaultVerificationArgs = {
    address: '0x50f5212f94b6964D70a3997480088a4D3B8027B9',
    constructorArguments: [],
  };

  await hre.run("verify:verify", vaultVerificationArgs);

}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
