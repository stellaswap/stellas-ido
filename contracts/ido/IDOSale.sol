// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

// import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./TransferHelper.sol";

interface IStellaERC20 {
  function totalSupply() external view returns (uint256);

  function balanceOf(address account) external view returns (uint256);

  function transfer(address recipient, uint256 amount) external returns (bool);

  function allowance(address owner, address spender)
    external
    view
    returns (uint256);

  function approve(address spender, uint256 amount) external returns (bool);

  function decimals() external view returns (uint8);

  function transferFrom(
    address sender,
    address recipient,
    uint256 amount
  ) external returns (bool);

  event Transfer(address indexed from, address indexed to, uint256 value);
  event Approval(address indexed owner, address indexed spender, uint256 value);
}

interface IIDOLocker {
  function userInfo(uint256, address) external view returns (uint256);
}

contract IDOSale is Ownable, ReentrancyGuard {
  using SafeMath for uint256;
  // using SafeERC20 for IERC20;

  struct SaleInfo {
    IStellaERC20 S_TOKEN; // sale token
    IStellaERC20 B_TOKEN; // base token // usually WETH (ETH)
    address XSTELLA_LOCKER; // xStella locker
    uint256 TOKEN_PRICE; // 1 base token = ? s_tokens, fixed price
    uint256 AMOUNT; // the amount of presale tokens up for presale
    uint256 TOTAL_BASE_AMOUNT; // the amount of presale tokens up for presale
    uint256 LIQUIDITY_PERCENT; // divided by 1000
    uint256 LISTING_RATE; // fixed rate at which the token will list on uniswap
    uint256 START_TIMESTAMP;
    uint256 END_TIMESTAMP;
    address PRE_SALE_OWNER;
    uint128 WHITELIST_COUNT;
  }

  struct StellaSettings {
    uint256 stellaBaseFees;
    uint256 stellaTokenFees;
    bool IS_WHITELIST; // is whitelisted sale?
  }

  struct UserInfo {
    uint256 baseDeposited; // total base token (usually ETH) deposited by user, can be withdrawn on presale failure
    uint256 tokensOwed; // num presale tokens a user is owed, can be withdrawn on presale success
    uint256 xStellaPosition; // Just number to know xStella position when depositing
  }

  struct SaleStatus {
    uint256 TOTAL_BASE_COLLECTED; // total base currency raised (usually ETH)
    uint256 TOTAL_TOKENS_SOLD; // total presale tokens sold
    uint256 TOTAL_TOKENS_WITHDRAWN; // total tokens withdrawn post successful presale
    uint256 TOTAL_BASE_WITHDRAWN; // total base tokens withdrawn on presale failure
    uint256 NUM_BUYERS; // number of unique participants
    bool CANCELLED; // if sale is cancelled
    bool MARKET_INITIALIZED; // if sale is cancelled
    bool OWNER_SETUP;
  }

  struct XStellaTiers {
    uint256 holding;
    uint256 maxCap;
  }

  // DATA STORAGE

  SaleInfo public SALE_INFO;
  StellaSettings public STELLA_SETTINGS;
  SaleStatus public SALE_STATUS;

  uint256 public S_ID;

  XStellaTiers[] public tiers;

  mapping(address => UserInfo) public userInfo;

  uint256 feeBase = 10000; // All fees should be quoted in 10,000 format e.g 1500 = 15%

  using EnumerableSet for EnumerableSet.AddressSet;
  EnumerableSet.AddressSet private WHITELIST;

  modifier onlyPresaleOwner() {
    require(SALE_INFO.PRE_SALE_OWNER == msg.sender, "NOT PRESALE OWNER");
    _;
  }

  function initialize(
    IStellaERC20 sToken,
    IStellaERC20 bToken,
    address xStellaLocker,
    uint256 tokenPrice,
    uint256 amount,
    uint256 totalBaseAmount,
    uint256 liqPercentage,
    uint256 listingRate,
    uint256 startTime,
    uint256 endTime,
    uint256 sId
  ) external onlyOwner {
    SALE_INFO.S_TOKEN = sToken;
    SALE_INFO.B_TOKEN = bToken;
    SALE_INFO.XSTELLA_LOCKER = xStellaLocker;
    SALE_INFO.TOKEN_PRICE = tokenPrice; // in WEI of Sale Token
    SALE_INFO.AMOUNT = amount;
    SALE_INFO.TOTAL_BASE_AMOUNT = totalBaseAmount;
    SALE_INFO.LIQUIDITY_PERCENT = liqPercentage;
    SALE_INFO.LISTING_RATE = listingRate;
    SALE_INFO.START_TIMESTAMP = startTime;
    SALE_INFO.END_TIMESTAMP = endTime;
    S_ID = sId;
  }

  function initializeStellaSettings(
    uint256 baseFees,
    uint256 tokenFees,
    address preSaleOwner,
    bool _isWhitelist
  ) external onlyOwner {
    STELLA_SETTINGS.stellaBaseFees = baseFees;
    STELLA_SETTINGS.stellaTokenFees = tokenFees;
    SALE_INFO.PRE_SALE_OWNER = preSaleOwner;
    STELLA_SETTINGS.IS_WHITELIST = _isWhitelist;
  }

  function initializeTokens() external onlyPresaleOwner {
    require(!SALE_STATUS.OWNER_SETUP, "Already setup");
    require(STELLA_SETTINGS.stellaTokenFees != 0, "SETTINGS ARE NOT INITIALIZED YET");
    uint256 tokensToMove = SALE_INFO.AMOUNT + ((SALE_INFO.AMOUNT * STELLA_SETTINGS.stellaTokenFees ) / feeBase);
    TransferHelper.safeTransferFrom(
      address(SALE_INFO.S_TOKEN),
      msg.sender,
      address(this),
      tokensToMove
    );
    SALE_STATUS.OWNER_SETUP = true;
  }

  function getInfo()
    public
    view
    returns (SaleInfo memory, StellaSettings memory)
  {
    SaleInfo memory info = SALE_INFO;
    info.WHITELIST_COUNT = uint128(WHITELIST.length());
    return (info, STELLA_SETTINGS);
  }

  function presaleStatus() public view returns (uint256) {
    if (SALE_STATUS.CANCELLED) {
      return 5; // force cancelled
    }

    if (
      SALE_STATUS.MARKET_INITIALIZED &&
      block.timestamp >= SALE_INFO.END_TIMESTAMP + 86400
    ) {
      return 4; // cool down pass, can claim tokens now
    }

    if (SALE_STATUS.MARKET_INITIALIZED) {
      return 3; // LP is added
    }

    if (block.timestamp >= SALE_INFO.END_TIMESTAMP) {
      return 2; // sale is ended
    }

    if (
      block.timestamp >= SALE_INFO.START_TIMESTAMP &&
      block.timestamp < SALE_INFO.END_TIMESTAMP
    ) {
      return 1; // sale is start
    }

    return 0; // waiting for start time
  }

  function userDeposit(uint256 _amount) external {
    require(
      SALE_INFO.B_TOKEN.allowance(msg.sender, address(this)) >= _amount,
      "Approve tokens first!"
    );
    require(presaleStatus() == 1, "NOT ACTIVE"); // ACTIVE
    if (STELLA_SETTINGS.IS_WHITELIST) {
      require(WHITELIST.contains(msg.sender), "NOT WHITELISTED");
    }
    _userDeposit(_amount);
  }

  function _userDeposit(uint256 _amount) internal {
    UserInfo storage user = userInfo[msg.sender];
    (uint256 userCap, uint256 userLock) = _getUserMaxCap(msg.sender);
    require(userCap > 0, "Lock xStelal first");
    uint256 amount_in = _amount;

    uint256 allowance = userCap - user.baseDeposited;
    uint256 remaining = SALE_INFO.TOTAL_BASE_AMOUNT -
      SALE_STATUS.TOTAL_BASE_COLLECTED;

    allowance = allowance > remaining ? remaining : allowance;

    if (amount_in > allowance) {
      amount_in = allowance;
    }

    uint256 tokensSold = (amount_in * SALE_INFO.TOKEN_PRICE) /
      (10**uint256(SALE_INFO.B_TOKEN.decimals()));
    require(tokensSold > 0, "ZERO TOKENS");

    if (user.baseDeposited == 0) {
      SALE_STATUS.NUM_BUYERS++;
    }

    user.baseDeposited += amount_in;
    user.tokensOwed += tokensSold;
    user.xStellaPosition = userLock;
    SALE_STATUS.TOTAL_BASE_COLLECTED += amount_in;
    SALE_STATUS.TOTAL_TOKENS_SOLD += tokensSold;

    TransferHelper.safeTransferFrom(
      address(SALE_INFO.B_TOKEN),
      msg.sender,
      address(this),
      amount_in
    );
  }

  function userWithdrawTokens() external {
    require(presaleStatus() == 4, 'CLAIM NOT STARTED YET');
    UserInfo storage user = userInfo[msg.sender];
    // uint256 tokensRemainingDenominator = SALE_STATUS.TOTAL_TOKENS_SOLD - SALE_STATUS.TOTAL_TOKENS_WITHDRAWN; // 5000 - 4000 = 1000
    // uint256 tokensOwed = SALE_INFO.S_TOKEN.balanceOf(address(this)) * user.tokensOwed / tokensRemainingDenominator; // 1000 * 500 / 1000
    uint256 tokensOwed = user.tokensOwed;
    require(tokensOwed > 0, 'NOTHING TO WITHDRAW');
    SALE_STATUS.TOTAL_TOKENS_WITHDRAWN += user.tokensOwed;
    user.tokensOwed = 0;
    TransferHelper.safeTransfer(address(SALE_INFO.S_TOKEN), msg.sender, tokensOwed);
  }

  function userWithdrawBaseTokens() external {
    require(presaleStatus() == 5, 'NOT CANCELLED');
    UserInfo storage user = userInfo[msg.sender];
    require(user.baseDeposited > 0, 'NOTHING TO WITHDRAW');
    if (user.baseDeposited > 0) {
      uint256 tokensOwed = user.baseDeposited;
      SALE_STATUS.TOTAL_BASE_WITHDRAWN += user.baseDeposited;
      user.baseDeposited = 0;
      TransferHelper.safeTransfer(address(SALE_INFO.B_TOKEN), msg.sender, tokensOwed);
    }
  }

  function ownerWithdrawTokens() external onlyPresaleOwner {
    require(presaleStatus() == 5, 'NOT CANCELLED');
    uint256 tokenFees = ( SALE_INFO.AMOUNT * STELLA_SETTINGS.stellaTokenFees ) / feeBase;
    TransferHelper.safeTransfer(address(SALE_INFO.S_TOKEN), msg.sender, SALE_INFO.AMOUNT);
    TransferHelper.safeTransfer(address(SALE_INFO.S_TOKEN), owner(), tokenFees);
  }

  function sweepFunds() external onlyOwner {
    require(presaleStatus() == 2 || presaleStatus() == 3 || presaleStatus() == 4, 'IS NOT FINISHED YET');
    uint256 baseFees = ( SALE_STATUS.TOTAL_BASE_COLLECTED * STELLA_SETTINGS.stellaBaseFees ) / feeBase;
    uint256 tokenFees = ( SALE_INFO.AMOUNT * STELLA_SETTINGS.stellaTokenFees ) / feeBase;

    uint256 tokensOwed = SALE_STATUS.TOTAL_BASE_COLLECTED - baseFees;
    
    TransferHelper.safeTransfer(address(SALE_INFO.B_TOKEN), SALE_INFO.PRE_SALE_OWNER, tokensOwed);
    TransferHelper.safeTransfer(address(SALE_INFO.B_TOKEN), msg.sender, baseFees);
    TransferHelper.safeTransfer(address(SALE_INFO.S_TOKEN), msg.sender, tokenFees);
  }

  function editWhitelist(address[] memory _users, bool _add)
    external
    onlyOwner
  {
    // require(presaleStatus() == 0, 'PRESALE HAS STARTED'); // ACTIVE
    if (_add) {
      for (uint256 i = 0; i < _users.length; i++) {
        WHITELIST.add(_users[i]);
        //   require(WHITELIST.length() <= PRESALE_INFO_2.WHITELIST_MAX_PARTICIPANTS, "NOT ENOUGH SPOTS");
      }
    } else {
      for (uint256 i = 0; i < _users.length; i++) {
        //   require(BUYERS[_users[i]].baseDeposited == 0, "CANT UNLIST USERS WHO HAVE CONTRIBUTED");
        WHITELIST.remove(_users[i]);
      }
    }
  }

  function getUserMaxCap(address _userAddr) external view returns (uint256) {
    (uint256 maxCap,) = _getUserMaxCap(_userAddr);
    return maxCap;
  }

  function _getUserMaxCap(address _userAddr) internal view returns (uint256, uint256) {
    uint256 userLock = IIDOLocker(SALE_INFO.XSTELLA_LOCKER).userInfo(
      S_ID,
      _userAddr
    );
    uint256 maxCap = 0;
    for (uint8 index = 0; index < tiers.length; index++) {
      XStellaTiers memory _tier = tiers[index];
      if (userLock >= _tier.holding) {
        maxCap = _tier.maxCap;
      }
    }
    return (maxCap, userLock);
  }

  function getWhitelistedUsersLength() external view returns (uint256) {
    return WHITELIST.length();
  }

  function getWhitelistedUserAtIndex(uint256 _index)
    external
    view
    returns (address)
  {
    return WHITELIST.at(_index);
  }

  function getUserWhitelistStatus(address _user) external view returns (bool) {
    return WHITELIST.contains(_user);
  }

  // ADMIN FUNCTIONS

  function forceCancelByStella() external onlyOwner {
    require(!SALE_STATUS.CANCELLED);
    SALE_STATUS.CANCELLED = true;
  }

  function forceCancelByPresaleOwner() external onlyPresaleOwner {
    require(presaleStatus() != 2, "Sale is ended");
    require(!SALE_STATUS.MARKET_INITIALIZED, "MARKET INITIALIZED");
    require(!SALE_STATUS.CANCELLED);
    SALE_STATUS.CANCELLED = true;
  }

  function marketInitialized() external onlyOwner {
    require(!SALE_STATUS.MARKET_INITIALIZED);
    SALE_STATUS.MARKET_INITIALIZED = true;
  }

  function addTier(XStellaTiers memory _tier) external onlyOwner {
    tiers.push(_tier);
  }

  function removeTier(uint256 index) external onlyOwner {
    delete tiers[index];
  }
}
