// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ArcTestnetFaucet
 * @notice ERC-20 token faucet for ARC Testnet
 * @dev Allows users to claim 100 USDC (testnet) once every 24 hours via gasless claims
 * @dev Only owner can execute claims through claimFor function
 */
contract ArcTestnetFaucet is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // State variables
    IERC20 public token;
    uint256 public claimAmount;
    uint256 public cooldown;
    bool public paused;
    uint256 public totalClaims; // Total number of successful claims (social proof)

    // Mapping to track last claim timestamp per address
    mapping(address => uint256) public lastClaimAt;

    // Custom errors for gas efficiency
    error CooldownActive(uint256 remainingSeconds);
    error FaucetEmpty();
    error InsufficientFaucetBalance(uint256 currentBalance, uint256 requiredAmount);
    error Paused();

    // Events
    event Claimed(address indexed user, uint256 amount, uint256 timestamp);
    event ClaimAmountUpdated(uint256 oldAmount, uint256 newAmount);
    event CooldownUpdated(uint256 oldCooldown, uint256 newCooldown);
    event TokenUpdated(address oldToken, address newToken);
    event PausedUpdated(bool paused);

    /**
     * @param _token Address of the ERC-20 token (USDC testnet)
     * @param _claimAmount Amount to claim per address (in token units, e.g., 100 * 10^6 for 100 USDC with 6 decimals)
     * @param _cooldown Cooldown period in seconds (default: 24 * 60 * 60 = 86400)
     */
    constructor(
        address _token,
        uint256 _claimAmount,
        uint256 _cooldown
    ) Ownable(msg.sender) {
        require(_claimAmount > 0, "Claim amount must be > 0");
        require(_cooldown > 0, "Cooldown must be > 0");
        require(_token != address(0), "Token address cannot be zero");

        token = IERC20(_token);
        claimAmount = _claimAmount;
        cooldown = _cooldown;
        paused = false;
    }

    /**
     * @notice Owner can claim tokens for a recipient address (gasless claims)
     * @dev Only owner can call this function. Used for backend-controlled gasless claims.
     * @param recipient The address that will receive the faucet USDC
     */
    function claimFor(address recipient) external onlyOwner nonReentrant {
        // Check if paused
        if (paused) {
            revert Paused();
        }

        // Validate recipient
        require(recipient != address(0), "Recipient cannot be zero address");

        // Check cooldown per recipient
        uint256 lastClaim = lastClaimAt[recipient];
        if (lastClaim > 0) {
            uint256 nextClaimTime = lastClaim + cooldown;
            if (block.timestamp < nextClaimTime) {
                uint256 remainingSeconds = nextClaimTime - block.timestamp;
                revert CooldownActive(remainingSeconds);
            }
        }

        // Check faucet balance
        uint256 balance = token.balanceOf(address(this));
        if (balance == 0) {
            revert FaucetEmpty();
        }
        if (balance < claimAmount) {
            revert InsufficientFaucetBalance(balance, claimAmount);
        }

        // Update state (Effects) - cooldown is per recipient
        lastClaimAt[recipient] = block.timestamp;
        totalClaims++; // Increment total claims counter

        // Transfer tokens to recipient (Interactions)
        token.safeTransfer(recipient, claimAmount);

        // Emit event with recipient
        emit Claimed(recipient, claimAmount, block.timestamp);
    }

    /**
     * @notice Check if an address can claim and get remaining cooldown time
     * @param user Address to check
     * @return allowed True if user can claim
     * @return remainingSeconds Remaining cooldown time in seconds (0 if allowed)
     */
    function canClaim(address user) external view returns (bool allowed, uint256 remainingSeconds) {
        if (paused) {
            return (false, 0);
        }

        uint256 lastClaim = lastClaimAt[user];
        if (lastClaim == 0) {
            // Never claimed, can claim if faucet has balance
            uint256 balance = token.balanceOf(address(this));
            return (balance >= claimAmount, 0);
        }

        uint256 nextClaimTime = lastClaim + cooldown;
        if (block.timestamp >= nextClaimTime) {
            // Cooldown expired, check balance
            uint256 balance = token.balanceOf(address(this));
            return (balance >= claimAmount, 0);
        } else {
            // Still in cooldown
            remainingSeconds = nextClaimTime - block.timestamp;
            return (false, remainingSeconds);
        }
    }

    /**
     * @notice Get the current balance of the faucet
     * @return Current token balance
     */
    function faucetBalance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }

    // ============ Admin Functions ============

    /**
     * @notice Update the claim amount (only owner)
     * @param newAmount New claim amount in token units
     */
    function setClaimAmount(uint256 newAmount) external onlyOwner {
        require(newAmount > 0, "Claim amount must be > 0");
        uint256 oldAmount = claimAmount;
        claimAmount = newAmount;
        emit ClaimAmountUpdated(oldAmount, newAmount);
    }

    /**
     * @notice Update the cooldown period (only owner)
     * @param newCooldown New cooldown period in seconds
     */
    function setCooldown(uint256 newCooldown) external onlyOwner {
        require(newCooldown > 0, "Cooldown must be > 0");
        uint256 oldCooldown = cooldown;
        cooldown = newCooldown;
        emit CooldownUpdated(oldCooldown, newCooldown);
    }

    /**
     * @notice Update the token address (only owner)
     * @param newToken New token address
     */
    function setToken(address newToken) external onlyOwner {
        require(newToken != address(0), "Token address cannot be zero");
        address oldToken = address(token);
        token = IERC20(newToken);
        emit TokenUpdated(oldToken, newToken);
    }

    /**
     * @notice Pause or unpause the faucet (only owner)
     * @param _paused True to pause, false to unpause
     */
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PausedUpdated(_paused);
    }

    /**
     * @notice Withdraw tokens from the faucet (only owner)
     * @param to Address to send tokens to
     * @param amount Amount of tokens to withdraw
     */
    function withdrawTokens(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Cannot withdraw to zero address");
        token.safeTransfer(to, amount);
    }
}

