// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {ArtilleryMath} from "./ArtilleryMath.sol";

contract OnChainArtillery {
  using ArtilleryMath for uint16[32];

  enum GameStatus {
    WaitingForPlayer,
    Active,
    Finished
  }

  struct Game {
    address player1;
    address player2;
    address currentTurn;
    address winner;
    GameStatus status;
    uint8 p1X;
    uint8 p2X;
    uint8 p1Hp;
    uint8 p2Hp;
    int8 wind;
    uint8 turnCount;
    uint256 lastMoveBlock;
    uint256 prizePool;
    uint16[32] terrain;
  }

  uint256 public constant JOIN_FEE = 0.001 ether;
  uint256 public constant COST_STANDARD = 0.0002 ether;
  uint256 public constant COST_MORTAR = 0.0005 ether;
  uint256 public constant COST_BUNKER_BUSTER = 0.0004 ether;
  uint256 public constant TURN_TIMEOUT_BLOCKS = 25;
  uint256 public constant HOUSE_FEE_BPS = 500; // 5.00%

  address public owner;
  uint256 public collectedFees;
  uint256 public nextGameId;
  mapping(uint256 => Game) private games;

  event GameCreated(uint256 indexed gameId, address indexed player1);
  event GameJoined(uint256 indexed gameId, address indexed player2, int8 initialWind);
  event ShotFired(
    uint256 indexed gameId,
    address indexed shooter,
    uint8 angle,
    uint8 power,
    uint8 weapon,
    bool hitMap,
    uint8 impactX,
    uint16 impactY,
    uint8 damageDealt,
    int8 nextWind
  );
  event GameEnded(uint256 indexed gameId, address indexed winner, uint256 payout, string reason);
  event FeesWithdrawn(address indexed to, uint256 amount);
  event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

  error NotOwner();
  error InvalidAddress();
  error NoFeesToWithdraw();
  error InvalidGameState();
  error IncorrectPayment();
  error NotYourTurn();
  error InvalidShotParameters();
  error TimeoutNotReached();
  error TransferFailed();

  modifier onlyOwner() {
    if (msg.sender != owner) revert NotOwner();
    _;
  }

  constructor() {
    owner = msg.sender;
  }

  /// @notice Returns the ETH cost to fire a specific weapon
  function getWeaponCost(uint8 weapon) public pure returns (uint256) {
    if (weapon == 0) return COST_STANDARD;
    if (weapon == 1) return COST_MORTAR;
    if (weapon == 2) return COST_BUNKER_BUSTER;
    revert InvalidShotParameters();
  }

  /// @notice Creates a new 1v1 game lobby and seeds the prize pool
  function createGame() external payable returns (uint256 gameId) {
    if (msg.value != JOIN_FEE) revert IncorrectPayment();

    gameId = nextGameId++;
    Game storage g = games[gameId];
    g.player1 = msg.sender;
    g.status = GameStatus.WaitingForPlayer;
    g.p1X = 4;
    g.p2X = 27;
    g.p1Hp = 100;
    g.p2Hp = 100;
    g.prizePool = msg.value;

    uint256 seed = uint256(keccak256(abi.encode(block.prevrandao, msg.sender, gameId)));
    g.terrain = ArtilleryMath.generateTerrain(seed);

    emit GameCreated(gameId, msg.sender);
  }

  /// @notice Second player joins an open game and matches the entry stake
  function joinGame(uint256 gameId) external payable {
    if (msg.value != JOIN_FEE) revert IncorrectPayment();

    Game storage g = games[gameId];
    if (g.status != GameStatus.WaitingForPlayer || g.player1 == msg.sender) {
      revert InvalidGameState();
    }

    g.player2 = msg.sender;
    g.status = GameStatus.Active;
    g.currentTurn = g.player1;
    g.lastMoveBlock = block.number;
    g.wind = _rollWind(gameId, 0);
    g.prizePool += msg.value;

    emit GameJoined(gameId, msg.sender, g.wind);
  }

  /// @notice Pay-per-shot turn: player pays weapon fee into the pot and fires
  function fire(uint256 gameId, uint8 angle, uint8 power, uint8 weapon) external payable {
    Game storage g = games[gameId];
    if (g.status != GameStatus.Active) revert InvalidGameState();
    if (msg.sender != g.currentTurn) revert NotYourTurn();
    if (angle > 180 || power == 0 || power > 100 || weapon > 2) {
      revert InvalidShotParameters();
    }
    if (msg.value != getWeaponCost(weapon)) revert IncorrectPayment();

    g.prizePool += msg.value;

    bool isP1Turn = msg.sender == g.player1;
    uint8 shooterX = isP1Turn ? g.p1X : g.p2X;
    uint8 targetX = isP1Turn ? g.p2X : g.p1X;

    (bool hitMap, uint8 impactX, uint16 impactY) = ArtilleryMath.simulateShot(
      g.terrain,
      shooterX,
      angle,
      power,
      g.wind,
      weapon
    );

    uint8 damage = 0;
    if (hitMap) {
      damage = g.terrain.applyImpact(impactX, targetX, weapon);
      if (isP1Turn) {
        g.p2Hp = g.p2Hp > damage ? g.p2Hp - damage : 0;
      } else {
        g.p1Hp = g.p1Hp > damage ? g.p1Hp - damage : 0;
      }
    }

    g.turnCount += 1;
    g.lastMoveBlock = block.number;
    g.wind = _rollWind(gameId, g.turnCount);

    emit ShotFired(
      gameId,
      msg.sender,
      angle,
      power,
      weapon,
      hitMap,
      impactX,
      impactY,
      damage,
      g.wind
    );

    if (g.p1Hp == 0 || g.p2Hp == 0) {
      g.status = GameStatus.Finished;
      g.winner = g.p2Hp == 0 ? g.player1 : g.player2;
      _payoutWinner(gameId, g, "KO");
    } else {
      g.currentTurn = isP1Turn ? g.player2 : g.player1;
    }
  }

  /// @notice Claim victory and prize pool (minus 5% house fee) if opponent stalls
  function claimTimeoutWin(uint256 gameId) external {
    Game storage g = games[gameId];
    if (g.status != GameStatus.Active) revert InvalidGameState();
    if (msg.sender != g.player1 && msg.sender != g.player2) revert InvalidGameState();
    if (msg.sender == g.currentTurn) revert NotYourTurn();
    if (block.number <= g.lastMoveBlock + TURN_TIMEOUT_BLOCKS) {
      revert TimeoutNotReached();
    }

    g.status = GameStatus.Finished;
    g.winner = msg.sender;
    _payoutWinner(gameId, g, "Timeout");
  }

  /// @notice Allows Player 1 to cancel an unjoined lobby and get a full 100% refund
  function cancelGame(uint256 gameId) external {
    Game storage g = games[gameId];
    if (g.status != GameStatus.WaitingForPlayer || msg.sender != g.player1) {
      revert InvalidGameState();
    }
    g.status = GameStatus.Finished;
    uint256 refund = g.prizePool;
    g.prizePool = 0;

    (bool ok, ) = payable(g.player1).call{value: refund}("");
    if (!ok) revert TransferFailed();
    emit GameEnded(gameId, address(0), 0, "Cancelled");
  }

  /// @notice Withdraw accumulated 5% house fees to the contract owner
  function withdrawFees() external onlyOwner {
    uint256 amount = collectedFees;
    if (amount == 0) revert NoFeesToWithdraw();
    collectedFees = 0;

    (bool ok, ) = payable(owner).call{value: amount}("");
    if (!ok) revert TransferFailed();
    emit FeesWithdrawn(owner, amount);
  }

  /// @notice Transfer admin ownership for fee withdrawals
  function transferOwnership(address newOwner) external onlyOwner {
    if (newOwner == address(0)) revert InvalidAddress();
    emit OwnershipTransferred(owner, newOwner);
    owner = newOwner;
  }

  function getGame(uint256 gameId) external view returns (Game memory) {
    return games[gameId];
  }

  function _payoutWinner(uint256 gameId, Game storage g, string memory reason) private {
    uint256 totalPot = g.prizePool;
    g.prizePool = 0;

    uint256 fee = (totalPot * HOUSE_FEE_BPS) / 10_000;
    uint256 winnerPayout = totalPot - fee;
    collectedFees += fee;

    (bool ok, ) = payable(g.winner).call{value: winnerPayout}("");
    if (!ok) revert TransferFailed();
    emit GameEnded(gameId, g.winner, winnerPayout, reason);
  }

  function _rollWind(uint256 gameId, uint8 turn) private view returns (int8) {
    uint256 rand = uint256(keccak256(abi.encode(block.prevrandao, gameId, turn)));
    return int8(int256(rand % 13) - 6);
  }
}
