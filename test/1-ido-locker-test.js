const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = ethers;
var crypto = require('crypto');

function fmtEth(n) {
  return ethers.utils.parseEther(n).toString();
}

function fmtUsdc(n) {
  return ethers.utils.parseUnits(n, 6);
}

const latest = async function () {
  const block = await ethers.provider.getBlock("latest");
  return BigNumber.from(block.timestamp);
};

async function pushblocks(time) {
  await ethers.provider.send("evm_increaseTime", [time]);
  await ethers.provider.send("evm_mine", []);
} 


describe("IDO Testing", function () {
  describe("Locker", function () {
    beforeEach(async () => {
      const signers = await ethers.getSigners();
      this.deployer = signers[0];
      this.user = signers[1];

      this.ERC20 = await ethers.getContractFactory("MockERC20");
      this.Locker = await ethers.getContractFactory("IDOLocker");
      this.token = await this.ERC20.deploy("xStella", "XSTELLA", 0);
      await this.token.deployed();

      this.locker = await this.Locker.deploy();
      await this.locker.deployed();

      await this.token.mint(this.user.address, fmtEth("1000"));
    });

    it("Make sure everything is fine", async () => {
      expect((await this.token.symbol()).toLowerCase()).to.equal("xstella");
    });

    it("Add Pool", async () => {
      const timestamp = (await latest()).toString()
      await this.locker.add(
        this.token.address,
        timestamp, // startTime,
        +timestamp + 86400 * 7, // _endTimestamp,
        +timestamp + 86400 * 15, // _unlockTimestamp,
        1500 // _earlyUnlockPenalty,
      );

      expect(await this.locker.poolLength()).to.equal(1);
    });

    it("Add Pool with past unlock date should revert", async () => {
      const timestamp = (await latest()).toString()
      expect(
        this.locker.add(
          this.token.address,
          timestamp, // startTime,
          +timestamp + 86400 * 7, // _endTimestamp,
          +timestamp - 86400 * 15, // _unlockTimestamp,
          1500 // _earlyUnlockPenalty,
        )
      ).to.be.revertedWith("Unlock timestamp is not in the future!");
    });

    it("Add Pool with high fees should revert", async () => {
      const timestamp = (Date.now() / 1000).toFixed(0);
      expect(
        this.locker.add(
          this.token.address,
          timestamp, // startTime,
          +timestamp + 86400 * 7, // _endTimestamp,
          +timestamp - 86400 * 15, // _unlockTimestamp,
          6000 // _earlyUnlockPenalty,
        )
      ).to.be.revertedWith("Penalty cannot be more than 50%");
    });

    it("Update Pool", async () => {
      const timestamp = (await latest()).toString()
      await this.locker.add(
        this.token.address,
        timestamp, // startTime,
        +timestamp + 86400 * 7, // _endTimestamp,
        +timestamp + 86400 * 15, // _unlockTimestamp,
        1500 // _earlyUnlockPenalty,
      );
      expect(await this.locker.poolLength()).to.equal(1);
      expect((await this.locker.poolInfo(0)).earlyUnlockPenalty).to.equal(1500);

      // await this.
      await this.locker.update(
        0, // _PID
        timestamp, // startTime,
        +timestamp + 86400 * 7, // _endTimestamp,
        +timestamp + 86400 * 15, // _unlockTimestamp,
        2500 // _earlyUnlockPenalty,
      );
      expect((await this.locker.poolInfo(0)).earlyUnlockPenalty).to.equal(2500);
    });

    it("User Locks tokens", async () => {
      const timestamp = (await latest()).toString()
      await this.locker.add(
        this.token.address,
        timestamp, // startTime,
        +timestamp + 86400 * 7, // _endTimestamp,
        +timestamp + 86400 * 15, // _unlockTimestamp,
        1500 // _earlyUnlockPenalty,
      );
      expect(await this.locker.poolLength()).to.equal(1);

      await this.token
        .connect(this.user)
        .approve(this.locker.address, 10000000);
      await this.locker.connect(this.user).lock(0, 100);

      expect(await this.locker.userInfo(0, this.user.address)).to.equal(100);
    });

    // it("User Unlocks before time should revert", async () => {
    //   const timestamp = (await latest()).toString()
    //   await this.locker.add(
    //     this.token.address,
    //     timestamp, // startTime,
    //     +timestamp + 86400 * 7, // _endTimestamp,
    //     +timestamp + 86400 * 15, // _unlockTimestamp,
    //     1500 // _earlyUnlockPenalty,
    //   );
    //   expect(await this.locker.poolLength()).to.equal(1);

    //   await this.token
    //     .connect(this.user)
    //     .approve(this.locker.address, 10000000);
    //   await this.locker.connect(this.user).lock(0, 100);

    //   expect(await this.locker.userInfo(0, this.user.address)).to.equal(100);

    //   expect(this.locker.connect(this.user).unlock(0)).to.be.revertedWith(
    //     "Cannot unlock before lock period expires"
    //   );
    // });

    it("Early Withdraw has Penalty", async () => {
      const timestamp = (await latest()).toString()
      await this.locker.add(
        this.token.address,
        timestamp, // startTime,
        +timestamp + 86400 * 7, // _endTimestamp,
        +timestamp + 86400 * 15, // _unlockTimestamp,
        1500 // _earlyUnlockPenalty,
      );
      expect(await this.locker.poolLength()).to.equal(1);

      await this.token
        .connect(this.user)
        .approve(this.locker.address, fmtEth("1000"));
      await this.locker.connect(this.user).lock(0, fmtEth("1000"));

      expect(await this.locker.userInfo(0, this.user.address)).to.equal(
        fmtEth("1000")
      );

      // balancePrint(this.token, this.user.address, "Balance before");
      expect(await this.token.balanceOf(this.user.address)).to.equal(0);
      await this.locker.connect(this.user).earlyUnlock(0);
      expect(await this.token.balanceOf(this.user.address)).to.equal(
        fmtEth("850")
      );

      // MOVE PENALTY TO OWNER

      expect(await this.token.balanceOf(this.deployer.address)).to.equal(0);
      await this.locker.connect(this.deployer).sweep(0);
      expect(await this.token.balanceOf(this.deployer.address)).to.equal(
        fmtEth("150")
      );

      // balancePrint(this.token, this.user.address, "Balance after");
    });

    it("User Unlocks after time should pass", async () => {
      const timestamp = (await latest()).toString()
      await this.locker.add(
        this.token.address,
        timestamp, // startTime,
        +timestamp + 86400 * 7, // _endTimestamp,
        +timestamp + 86400 * 15, // _unlockTimestamp,
        1500 // _earlyUnlockPenalty,
      );
      expect(await this.locker.poolLength()).to.equal(1);

      await this.token
        .connect(this.user)
        .approve(this.locker.address, fmtEth("1000"));
      await this.locker.connect(this.user).lock(0, fmtEth("1000"));

      expect(await this.locker.userInfo(0, this.user.address)).to.equal(
        fmtEth("1000")
      );

      await ethers.provider.send("evm_increaseTime", [1296000]);
      await ethers.provider.send("evm_mine", []);

      // balancePrint(this.token, this.user.address, "Balance before");
      expect(await this.token.balanceOf(this.user.address)).to.equal(0);
      await this.locker.connect(this.user).unlock(0);
      expect(await this.token.balanceOf(this.user.address)).to.equal(
        fmtEth("1000")
      );

      // balancePrint(this.token, this.user.address, "Balance after");
    });
  });

  describe("IDO SALE", function () {
    beforeEach(async () => {
      const signers = await ethers.getSigners();
      this.deployer = signers[0];
      this.user = signers[1];
      this.presaleOwner = signers[2];

      this.IDOSale = await ethers.getContractFactory("IDOSale");
      this.ido = await this.IDOSale.deploy();
      await this.ido.deployed();

      this.ERC20 = await ethers.getContractFactory("MockERC20");

      this.xstella = await this.ERC20.deploy("xStella", "xStella", 0);
      await this.xstella.deployed();
      await this.xstella.mint(this.user.address, fmtEth('100'));

      this.baseToken = await this.ERC20.deploy("USDC", "USDC", 0);
      await this.baseToken.deployed();
      await this.baseToken.setDecimals(6);
      await this.baseToken.mint(this.user.address, fmtUsdc('100'));


      this.saleToken = await this.ERC20.deploy("ATH", "ATH", 0);
      await this.saleToken.deployed();

      this.Locker = await ethers.getContractFactory("IDOLocker");
      this.locker = await this.Locker.deploy();
      await this.locker.deployed();

      const timestampLocker = (await latest()).toString()
      await this.locker.add(
        this.xstella.address,
        timestampLocker, // startTime,
        +timestampLocker + 86400 * 7, // _endTimestamp,
        +timestampLocker + 86400 * 15, // _unlockTimestamp,
        1500 // _earlyUnlockPenalty,
      );

      const timestamp = (await latest()).toString()
      await this.ido.initialize(
        this.saleToken.address, // IERC20 sToken,
        this.baseToken.address, // IERC20 bToken,
        this.locker.address, // address xStellaLocker,
        fmtEth('0.5'), // uint256 tokenPrice,
        fmtEth('100'), // uint256 amount,
        fmtUsdc('500'), // uint256 totalBaseAmount,
        6000, // uint256 liqPercentage,
        fmtEth('0.6'), // uint256 listingRate,
        +timestamp + 86400,// uint256 startTime,
        +timestamp + (86400 * 2),// uint256 endTime,
        0 // s_ID
      );

      await this.ido.initializeStellaSettings(
        300, // baseFees = 3%
        100, // tokenFee = 1%
        this.presaleOwner.address,// address preSaleOwner
        true,
      );

    });

   

    it("Whitelist 100 users", async () => {
      const addrList = new Array(100).fill(0).map(() => new ethers.Wallet(crypto.randomBytes(32).toString('hex')).address)
      await this.ido.editWhitelist(addrList, true);
      expect(await this.ido.getUserWhitelistStatus(addrList[30])).to.equal(true);
    });


    it("Check if all is ok", async () => {
      const info = await this.ido.getInfo();
      expect(info[0].S_TOKEN).to.equal(this.saleToken.address);
      expect(info[0].B_TOKEN).to.equal(this.baseToken.address);
      expect(info[0].LIQUIDITY_PERCENT).to.equal(6000);
      expect(info[0].PRE_SALE_OWNER).to.equal(this.presaleOwner.address);
    });

    it("Presale is status waiting to start by default", async () => {
      expect(await this.ido.presaleStatus()).to.equal(0);
    });

    it("If forced cancel the status changes", async () => {
      await this.ido.forceCancelByStella();
      expect(await this.ido.presaleStatus()).to.equal(5);
    });

    it("If market initialized the status changes", async () => {
      await this.ido.marketInitialized();
      expect(await this.ido.presaleStatus()).to.equal(3);
    });

    it("After start timestamp pass status should change", async () => {
      await pushblocks(86400);
      expect(await this.ido.presaleStatus()).to.equal(1);
    });

    it("After end timestamp pass status should change", async () => {
      await pushblocks(86400 * 2);
      expect(await this.ido.presaleStatus()).to.equal(2);
    });

    it("After cool down and market initialized status should be claim", async () => {
      await pushblocks(86400 * 3);
      await this.ido.marketInitialized();
      expect(await this.ido.presaleStatus()).to.equal(4);
    });

    it("Add and remove tiers should reflect", async () => {
      await this.ido.addTier([fmtEth('50'), fmtEth('500')]);
      await this.ido.addTier([fmtEth('100'), fmtEth('1000')]);
      await this.ido.addTier([fmtEth('200'), fmtEth('2000')]);
      await this.ido.addTier([fmtEth('300'), fmtEth('3000')]);

      const tier1 = await this.ido.tiers(0);
      const tier2 = await this.ido.tiers(1);
      const tier3 = await this.ido.tiers(2);
      const tier4 = await this.ido.tiers(3);
      
      expect(tier1.holding).to.equal(fmtEth('50'));
      expect(tier2.holding).to.equal(fmtEth('100'));
      expect(tier3.holding).to.equal(fmtEth('200'));
      expect(tier4.holding).to.equal(fmtEth('300'));

      await this.ido.removeTier(0);
      const tierRemoved = await this.ido.tiers(0);
      expect(tierRemoved.holding).to.equal(fmtEth('0'));

    });

    it("getUserMaxCap Info", async () => {
      expect(await this.ido.S_ID()).to.equal(0);

      await this.ido.addTier([fmtEth('50'), fmtUsdc('500')]);
      await this.ido.addTier([fmtEth('100'), fmtUsdc('1500')]);
      await this.ido.addTier([fmtEth('200'), fmtUsdc('2000')]);
      await this.ido.addTier([fmtEth('300'), fmtUsdc('3000')]);

      await this.xstella
      .connect(this.user)
      .approve(this.locker.address, fmtEth("1000"));
      await this.locker.connect(this.user).lock(0, fmtEth("100"));

      const info = await this.ido.getUserMaxCap(this.user.address);
      expect(info).to.equal(fmtUsdc('1500'));

    });

    it("force Presale Owner Cancel after sale end should revert", async () => {
      await pushblocks(86400 * 2); // sale is finished
      expect(this.ido.connect(this.presaleOwner).forceCancelByPresaleOwner()).to.be.revertedWith('Sale is ended')
    });

    it("force Presale Owner Cancel during sale should pass", async () => {
      await pushblocks(86400); // sale is started
      await this.ido.connect(this.presaleOwner).forceCancelByPresaleOwner();
      expect(await this.ido.presaleStatus()).to.equal(5)
    });

    it("Depositing before sale start should revert", async () => {
      expect(this.ido.connect(this.user).userDeposit(fmtUsdc('20'))).to.be.revertedWith('Approve tokens first!')

      await this.baseToken
      .connect(this.user)
      .approve(this.ido.address, fmtEth("1000"));

      expect(this.ido.connect(this.user).userDeposit(fmtUsdc('20'))).to.be.revertedWith('NOT ACTIVE')

    });

    it("Should let user deposit after sale start and update values correctly", async () => {

      // setup tiers
      await this.ido.addTier([fmtEth('50'), fmtUsdc('500')]);
      await this.ido.addTier([fmtEth('100'), fmtUsdc('1500')]);
      await this.ido.addTier([fmtEth('200'), fmtUsdc('2000')]);
      await this.ido.addTier([fmtEth('300'), fmtUsdc('3000')]);

      await this.xstella
      .connect(this.user)
      .approve(this.locker.address, fmtEth("1000")); // approve xstella for locker
      await this.locker.connect(this.user).lock(0, fmtEth("100")); // lock xStella
      
      await this.ido.editWhitelist([this.user.address], true); // whitelist user


      await this.baseToken
      .connect(this.user)
      .approve(this.ido.address, fmtEth("1000"));

      await pushblocks(86400); // sale is started
      await this.ido.connect(this.user).userDeposit(fmtUsdc('100'));
      const userInfo = await this.ido.userInfo(this.user.address);
      expect(userInfo.baseDeposited).to.equal(fmtUsdc('100'));
      expect(userInfo.tokensOwed).to.equal(fmtEth('50'));
      expect(userInfo.xStellaPosition).to.equal(fmtEth('100'));

    });

    it("Withdraw before cool down should fail", async () => {

      // setup tiers
      await this.ido.addTier([fmtEth('50'), fmtUsdc('500')]);
      await this.ido.addTier([fmtEth('100'), fmtUsdc('1500')]);
      await this.ido.addTier([fmtEth('200'), fmtUsdc('2000')]);
      await this.ido.addTier([fmtEth('300'), fmtUsdc('3000')]);

      await this.xstella
      .connect(this.user)
      .approve(this.locker.address, fmtEth("1000")); // approve xstella for locker
      await this.locker.connect(this.user).lock(0, fmtEth("100")); // lock xStella
      
      await this.ido.editWhitelist([this.user.address], true); // whitelist user


      await this.baseToken
      .connect(this.user)
      .approve(this.ido.address, fmtEth("1000"));

      await pushblocks(86400); // sale is started
      await this.ido.connect(this.user).userDeposit(fmtUsdc('100'));

      expect(this.ido.connect(this.user).userWithdrawTokens()).to.be.revertedWith('CLAIM NOT STARTED YET')

    });

    it("Presale owner should be able to initialize Tokens", async () => {
      await this.saleToken.mint(this.presaleOwner.address, fmtEth('101'));
      await this.saleToken.connect(this.presaleOwner).approve(this.ido.address, fmtEth('101'));
      await this.ido.connect(this.presaleOwner).initializeTokens();
      const status = await this.ido.SALE_STATUS();

      expect(status.OWNER_SETUP).to.equal(true)
    });

    it("After cool down should be able to claim as owed", async () => {

      await this.saleToken.mint(this.presaleOwner.address, fmtEth('101'));
      await this.saleToken.connect(this.presaleOwner).approve(this.ido.address, fmtEth('101'));
      await this.ido.connect(this.presaleOwner).initializeTokens();

      // setup tiers
      await this.ido.addTier([fmtEth('50'), fmtUsdc('500')]);
      await this.ido.addTier([fmtEth('100'), fmtUsdc('1500')]);
      await this.ido.addTier([fmtEth('200'), fmtUsdc('2000')]);
      await this.ido.addTier([fmtEth('300'), fmtUsdc('3000')]);

      await this.xstella
      .connect(this.user)
      .approve(this.locker.address, fmtEth("1000")); // approve xstella for locker
      await this.locker.connect(this.user).lock(0, fmtEth("100")); // lock xStella
      
      await this.ido.editWhitelist([this.user.address], true); // whitelist user


      await this.baseToken
      .connect(this.user)
      .approve(this.ido.address, fmtEth("1000"));

      await pushblocks(86400); // sale is started
      await this.ido.connect(this.user).userDeposit(fmtUsdc('100'));

      await this.ido.marketInitialized();
      await pushblocks(86400 * 2); // cool down pass
      expect(await this.saleToken.balanceOf(this.user.address)).to.equal(0);
      await this.ido.connect(this.user).userWithdrawTokens();
      expect(await this.saleToken.balanceOf(this.user.address)).to.equal(fmtEth('50'));


    });


    it("User withdraw base without cancelation should fail", async () => {

      await this.saleToken.mint(this.presaleOwner.address, fmtEth('101'));
      await this.saleToken.connect(this.presaleOwner).approve(this.ido.address, fmtEth('101'));
      await this.ido.connect(this.presaleOwner).initializeTokens();

      // setup tiers
      await this.ido.addTier([fmtEth('50'), fmtUsdc('500')]);
      await this.ido.addTier([fmtEth('100'), fmtUsdc('1500')]);
      await this.ido.addTier([fmtEth('200'), fmtUsdc('2000')]);
      await this.ido.addTier([fmtEth('300'), fmtUsdc('3000')]);

      await this.xstella
      .connect(this.user)
      .approve(this.locker.address, fmtEth("1000")); // approve xstella for locker
      await this.locker.connect(this.user).lock(0, fmtEth("100")); // lock xStella
      
      await this.ido.editWhitelist([this.user.address], true); // whitelist user


      await this.baseToken
      .connect(this.user)
      .approve(this.ido.address, fmtEth("1000"));

      await pushblocks(86400); // sale is started
      await this.ido.connect(this.user).userDeposit(fmtUsdc('100'));

      expect(this.ido.connect(this.user).userWithdrawBaseTokens()).to.be.revertedWith('NOT CANCELLED');

    });

    it("User withdraw base after cancelation should pass", async () => {

      await this.saleToken.mint(this.presaleOwner.address, fmtEth('101'));
      await this.saleToken.connect(this.presaleOwner).approve(this.ido.address, fmtEth('101'));
      await this.ido.connect(this.presaleOwner).initializeTokens();

      // setup tiers
      await this.ido.addTier([fmtEth('50'), fmtUsdc('500')]);
      await this.ido.addTier([fmtEth('100'), fmtUsdc('1500')]);
      await this.ido.addTier([fmtEth('200'), fmtUsdc('2000')]);
      await this.ido.addTier([fmtEth('300'), fmtUsdc('3000')]);

      await this.xstella
      .connect(this.user)
      .approve(this.locker.address, fmtEth("1000")); // approve xstella for locker
      await this.locker.connect(this.user).lock(0, fmtEth("100")); // lock xStella
      
      await this.ido.editWhitelist([this.user.address], true); // whitelist user


      await this.baseToken
      .connect(this.user)
      .approve(this.ido.address, fmtEth("1000"));

      await pushblocks(86400); // sale is started
      await this.ido.connect(this.user).userDeposit(fmtUsdc('100'));

      await this.ido.forceCancelByStella();

      expect(await this.baseToken.balanceOf(this.user.address)).to.equal(0);
      await this.ido.connect(this.user).userWithdrawBaseTokens();
      expect(await this.baseToken.balanceOf(this.user.address)).to.equal(fmtUsdc('100'));


    });

    it("Presale Owner withdraw base before cancelation should fail", async () => {

      await this.saleToken.mint(this.presaleOwner.address, fmtEth('101'));
      await this.saleToken.connect(this.presaleOwner).approve(this.ido.address, fmtEth('101'));
      await this.ido.connect(this.presaleOwner).initializeTokens();

      // setup tiers
      await this.ido.addTier([fmtEth('50'), fmtUsdc('500')]);
      await this.ido.addTier([fmtEth('100'), fmtUsdc('1500')]);
      await this.ido.addTier([fmtEth('200'), fmtUsdc('2000')]);
      await this.ido.addTier([fmtEth('300'), fmtUsdc('3000')]);

      await this.xstella
      .connect(this.user)
      .approve(this.locker.address, fmtEth("1000")); // approve xstella for locker
      await this.locker.connect(this.user).lock(0, fmtEth("100")); // lock xStella
      
      await this.ido.editWhitelist([this.user.address], true); // whitelist user


      await this.baseToken
      .connect(this.user)
      .approve(this.ido.address, fmtEth("1000"));

      await pushblocks(86400); // sale is started
      await this.ido.connect(this.user).userDeposit(fmtUsdc('100'));

      expect(this.ido.connect(this.presaleOwner).ownerWithdrawTokens()).to.be.revertedWith('NOT CANCELLED');


    });

    it("Presale Owner withdraw base after cancelation should pass", async () => {

      await this.saleToken.mint(this.presaleOwner.address, fmtEth('101'));
      await this.saleToken.connect(this.presaleOwner).approve(this.ido.address, fmtEth('101'));
      await this.ido.connect(this.presaleOwner).initializeTokens();

      // setup tiers
      await this.ido.addTier([fmtEth('50'), fmtUsdc('500')]);
      await this.ido.addTier([fmtEth('100'), fmtUsdc('1500')]);
      await this.ido.addTier([fmtEth('200'), fmtUsdc('2000')]);
      await this.ido.addTier([fmtEth('300'), fmtUsdc('3000')]);

      await this.xstella
      .connect(this.user)
      .approve(this.locker.address, fmtEth("1000")); // approve xstella for locker
      await this.locker.connect(this.user).lock(0, fmtEth("100")); // lock xStella
      
      await this.ido.editWhitelist([this.user.address], true); // whitelist user


      await this.baseToken
      .connect(this.user)
      .approve(this.ido.address, fmtEth("1000"));

      await pushblocks(86400); // sale is started
      await this.ido.connect(this.user).userDeposit(fmtUsdc('100'));

      await this.ido.forceCancelByStella();
      expect(await this.saleToken.balanceOf(this.presaleOwner.address)).to.equal(0);
      await this.ido.connect(this.presaleOwner).ownerWithdrawTokens();
      expect(await this.saleToken.balanceOf(this.presaleOwner.address)).to.equal(fmtEth('100'));
      expect(await this.saleToken.balanceOf(this.deployer.address)).to.equal(fmtEth('1'));


    });

    it("Sweep funds after sale is finished", async () => {

      await this.saleToken.mint(this.presaleOwner.address, fmtEth('101'));
      await this.saleToken.connect(this.presaleOwner).approve(this.ido.address, fmtEth('101'));
      await this.ido.connect(this.presaleOwner).initializeTokens();

      // setup tiers
      await this.ido.addTier([fmtEth('50'), fmtUsdc('500')]);
      await this.ido.addTier([fmtEth('100'), fmtUsdc('1500')]);
      await this.ido.addTier([fmtEth('200'), fmtUsdc('2000')]);
      await this.ido.addTier([fmtEth('300'), fmtUsdc('3000')]);

      await this.xstella
      .connect(this.user)
      .approve(this.locker.address, fmtEth("1000")); // approve xstella for locker
      await this.locker.connect(this.user).lock(0, fmtEth("100")); // lock xStella
      
      await this.ido.editWhitelist([this.user.address], true); // whitelist user


      await this.baseToken
      .connect(this.user)
      .approve(this.ido.address, fmtEth("1000"));

      await pushblocks(86400); // sale is started
      await this.ido.connect(this.user).userDeposit(fmtUsdc('100'));
      await pushblocks(86400); // sale is finished

      expect(await this.baseToken.balanceOf(this.presaleOwner.address)).to.equal(0);
      expect(await this.baseToken.balanceOf(this.deployer.address)).to.equal(0);
      expect(await this.saleToken.balanceOf(this.deployer.address)).to.equal(0);

      await this.ido.sweepFunds();

      expect(await this.baseToken.balanceOf(this.presaleOwner.address)).to.equal(fmtUsdc('97'));
      expect(await this.baseToken.balanceOf(this.deployer.address)).to.equal(fmtUsdc('3'));
      expect(await this.saleToken.balanceOf(this.deployer.address)).to.equal(fmtEth('1'));



    });


    

  });
});
