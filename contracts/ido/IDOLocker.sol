// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract IDOLocker is Ownable, ReentrancyGuard {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  // DATA STORAGE
  struct PoolInfo {
    IERC20 token;
    uint256 startTimestamp; // Locking start timestamp
    uint256 endTimestamp; // Unlocking end timestamp
    uint256 unlockTimestamp; // Unlocking timestamp
    uint256 earlyUnlockPenalty; // Early Unlock penalty
    uint256 penaltyTokens; // total Tokens obtained as penalty
    uint256 totalTokens; // total Tokens locked for this pool
  }

  struct UserInfo {
    uint256 amount; // How many tokens user has locked
  }

  PoolInfo[] public poolInfo;
  mapping(uint256 => mapping(address => UserInfo)) public userInfo;

  // EVENTS

  event Lock(address indexed user, uint256 indexed pid, uint256 amount);
  event Unlock(address indexed user, uint256 indexed pid, uint256 amount);
  event EarlyUnlock(
    address indexed user,
    uint256 indexed pid,
    uint256 amount,
    uint256 penalty
  );

  // MODIFIERS
  modifier notContract() {
    require(!_isContract(msg.sender), "contract not allowed");
    require(msg.sender == tx.origin, "proxy contract not allowed");
    _;
  }

  function lock(uint256 _pid, uint256 _amount)
    external
    nonReentrant
    notContract
  {
    PoolInfo storage pool = poolInfo[_pid];
    UserInfo storage user = userInfo[_pid][msg.sender];
    require(
      block.timestamp >= pool.startTimestamp,
      "Cannot lock before locking time opens"
    );
    require(
      pool.token.allowance(msg.sender, address(this)) >= _amount,
      "Approve tokens first!"
    );

    require(_amount > 0, "Token amount too low!");

    uint256 beforeDeposit = pool.token.balanceOf(address(this));
    pool.token.safeTransferFrom(_msgSender(), address(this), _amount);
    uint256 afterDeposit = pool.token.balanceOf(address(this));

    _amount = afterDeposit.sub(beforeDeposit);

    user.amount = user.amount.add(_amount);
    pool.totalTokens = pool.totalTokens.add(_amount);

    emit Lock(msg.sender, _pid, _amount);
  }

  function unlock(uint256 _pid) external nonReentrant notContract {
    PoolInfo storage pool = poolInfo[_pid];
    UserInfo storage user = userInfo[_pid][msg.sender];

    if (block.timestamp >= pool.unlockTimestamp) {
      // unlock after unlock time
      require(
        block.timestamp >= pool.unlockTimestamp,
        "Cannot unlock before lock period expires"
      );

      uint256 amount = user.amount;

      require(
        pool.totalTokens >= amount,
        "EmergencyWithdraw: Pool total not enough"
      );

      user.amount = 0;
      pool.totalTokens = pool.totalTokens.sub(amount);
      pool.token.safeTransfer(msg.sender, amount);

      emit Unlock(msg.sender, _pid, amount);
    } else {
      // unlock before, have to pay penalty
      uint256 amount = user.amount;

      require(
        pool.totalTokens >= amount,
        "EmergencyWithdraw: Pool total not enough"
      );
      user.amount = 0;
      uint256 penalty = amount.mul(pool.earlyUnlockPenalty).div(10000);
      uint256 remainingAmount = amount.sub(penalty);
      pool.totalTokens = pool.totalTokens.sub(amount);
      pool.token.safeTransfer(msg.sender, remainingAmount);
      pool.penaltyTokens = pool.penaltyTokens.add(penalty);
      emit EarlyUnlock(msg.sender, _pid, remainingAmount, penalty);
    }
  }

  function earlyUnlock(uint256 _pid) external nonReentrant notContract {
    PoolInfo storage pool = poolInfo[_pid];
    UserInfo storage user = userInfo[_pid][msg.sender];

    uint256 amount = user.amount;

    require(
      pool.totalTokens >= amount,
      "EmergencyWithdraw: Pool total not enough"
    );
    user.amount = 0;
    uint256 penalty = amount.mul(pool.earlyUnlockPenalty).div(10000);
    uint256 remainingAmount = amount.sub(penalty);
    pool.totalTokens = pool.totalTokens.sub(amount);
    pool.token.safeTransfer(msg.sender, remainingAmount);
    pool.penaltyTokens = pool.penaltyTokens.add(penalty);
    emit EarlyUnlock(msg.sender, _pid, remainingAmount, penalty);
  }

  function poolLength() external view returns (uint256) {
    return poolInfo.length;
  }

  function add(
    IERC20 _token,
    uint256 _startTimestamp,
    uint256 _endTimestamp,
    uint256 _unlockTimestamp,
    uint256 _earlyUnlockPenalty
  ) external onlyOwner {
    require(_earlyUnlockPenalty <= 5000, "Penalty cannot be more than 50%"); // Max 50%

    require(
      _unlockTimestamp < 10000000000,
      "Unlock timestamp is not in seconds!"
    );
    require(
      _unlockTimestamp > block.timestamp,
      "Unlock timestamp is not in the future!"
    );

    poolInfo.push(
      PoolInfo({
        token: _token,
        startTimestamp: _startTimestamp,
        endTimestamp: _endTimestamp,
        unlockTimestamp: _unlockTimestamp,
        earlyUnlockPenalty: _earlyUnlockPenalty,
        penaltyTokens: 0,
        totalTokens: 0
      })
    );
  }

  function update(
    uint256 _pid,
    uint256 _startTimestamp,
    uint256 _endTimestamp,
    uint256 _unlockTimestamp,
    uint256 _earlyUnlockPenalty
  ) external onlyOwner {
    require(_earlyUnlockPenalty <= 5000, "Penalty cannot be more than 50%"); // Max 50%

    require(
      _unlockTimestamp < 10000000000,
      "Unlock timestamp is not in seconds!"
    );
    require(
      _unlockTimestamp > block.timestamp,
      "Unlock timestamp is not in the future!"
    );

    poolInfo[_pid].startTimestamp = _startTimestamp;
    poolInfo[_pid].endTimestamp = _endTimestamp;
    poolInfo[_pid].unlockTimestamp = _unlockTimestamp;
    poolInfo[_pid].earlyUnlockPenalty = _earlyUnlockPenalty;
  }

  function sweep(uint256 _pid) external onlyOwner {
    // move penalty to owner
    PoolInfo storage pool = poolInfo[_pid];
    pool.token.safeTransfer(msg.sender, pool.penaltyTokens);
    pool.penaltyTokens = 0;
  }

  /**
   * @notice Check if an address is a contract
   */
  function _isContract(address _addr) internal view returns (bool) {
    uint256 size;
    assembly {
      size := extcodesize(_addr)
    }
    return size > 0;
  }
}
