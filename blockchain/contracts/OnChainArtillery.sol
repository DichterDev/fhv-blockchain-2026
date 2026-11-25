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
    address p1SessionKey;
    address p2SessionKey;
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
  uint256 public constant SESSION_GAS_STIPEND = 0.0004 ether; // Funded from JOIN_FEE for gasless turns
    uint256 public constant TURN_TIMEOUT_BLOCKS = 25;

  uint256 public nextGameId;
  mapping(uint256 => Game) private games;

  event GameCreated(uint256 indexed gameId, address indexed player1, address sessionKey);
  event GameJoined(uint256 indexed gameId, address indexed player2, address sessionKey, int8 initialWind);
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

  error InvalidGameState();
  error IncorrectEntryFee();
  error NotYourTurn();
  error InvalidShotParameters();
  error TimeoutNotReached();
  error TransferFailed();

  /// @notice Creates a new 1v1 game lobby, collects JOIN_FEE, and funds the player's gasless session key
  function createGame(address sessionKey) external payable returns (uint256 gameId) {
    if (msg.value != JOIN_FEE) revert IncorrectEntryFee();

    gameId = nextGameId++;
    Game storage g = games[gameId];
    g.player1 = msg.sender;
    g.p1SessionKey = sessionKey;
    g.status = GameStatus.WaitingForPlayer;
    g.p1X = 4;
    g.p2X = 27;
    g.p1Hp = 100;
    g.p2Hp = 100;
    g.prizePool = msg.value - SESSION_GAS_STIPEND;

    uint256 seed = uint256(keccak256(abi.encode(block.prevrandao, msg.sender, gameId)));
    g.terrain = ArtilleryMath.generateTerrain(seed);

    if (sessionKey != address(0) && sessionKey != msg.sender) {
      (bool ok, ) = payable(sessionKey).call{value: SESSION_GAS_STIPEND}("");
      if (!ok) revert TransferFailed();
    } else {
      g.prizePool += SESSION_GAS_STIPEND;
    }

    emit GameCreated(gameId, msg.sender, sessionKey);
  }

  /// @notice Second player joins, pays JOIN_FEE, and gets their gasless session key funded
  function joinGame(uint256 gameId, address sessionKey) external payable {
    if (msg.value != JOIN_FEE) revert IncorrectEntryFee();

    Game storage g = games[gameId];
    if (g.status != GameStatus.WaitingForPlayer || g.player1 == msg.sender) {
      revert InvalidGameState();
    }

    g.player2 = msg.sender;
    g.p2SessionKey = sessionKey;
    g.status = GameStatus.Active;
    g.currentTurn = g.player1;
    g.lastMoveBlock = block.number;
    g.wind = _rollWind(gameId, 0);
    g.prizePool += (msg.value - SESSION_GAS_STIPEND);

    if (sessionKey != address(0) && sessionKey != msg.sender) {
      (bool ok, ) = payable(sessionKey).call{value: SESSION_GAS_STIPEND}("");
      if (!ok) revert TransferFailed();
    } else {
      g.prizePool += SESSION_GAS_STIPEND;
    }

    emit GameJoined(gameId, msg.sender, sessionKey, g.wind);
  }

  /// @notice Callable by either the player's main wallet OR their pre-funded gasless session key
  function fire(uint256 gameId, uint8 angle, uint8 power, uint8 weapon) external {
    Game storage g = games[gameId];
    if (g.status != GameStatus.Active) revert InvalidGameState();

    bool isP1Turn = g.currentTurn == g.player1;
    bool authorized = isP1Turn
      ? (msg.sender == g.player1 || msg.sender == g.p1SessionKey)
      : (msg.sender == g.player2 || msg.sender == g.p2SessionKey);

      if (!authorized) revert NotYourTurn();
      if (angle > 180 || power == 0 || power > 100 || weapon > 2) {
        revert InvalidShotParameters();
      }

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
        g.currentTurn,
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

  /// @notice Claim victory and prize pool if opponent stalls past TURN_TIMEOUT_BLOCKS
  function claimTimeoutWin(uint256 gameId) external {
    Game storage g = games[gameId];
    if (g.status != GameStatus.Active) revert InvalidGameState();

    bool isP1 = msg.sender == g.player1 || msg.sender == g.p1SessionKey;
    bool isP2 = msg.sender == g.player2 || msg.sender == g.p2SessionKey;
    if (!isP1 && !isP2) revert InvalidGameState();

    address callerPlayer = isP1 ? g.player1 : g.player2;
    if (callerPlayer == g.currentTurn) revert NotYourTurn();
    if (block.number <= g.lastMoveBlock + TURN_TIMEOUT_BLOCKS) {
      revert TimeoutNotReached();
    }

    g.status = GameStatus.Finished;
    g.winner = callerPlayer;
    _payoutWinner(gameId, g, "Timeout");
  }

  /// @notice Allows Player 1 to cancel an unjoined lobby and get a full refund
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

  function getGame(uint256 gameId) external view returns (Game memory) {
    return games[gameId];
  }

  function _payoutWinner(uint256 gameId, Game storage g, string memory reason) private {
    uint256 payout = g.prizePool;
    g.prizePool = 0;
    (bool ok, ) = payable(g.winner).call{value: payout}("");
    if (!ok) revert TransferFailed();
    emit GameEnded(gameId, g.winner, payout, reason);
  }

  function _rollWind(uint256 gameId, uint8 turn) private view returns (int8) {
    uint256 rand = uint256(keccak256(abi.encode(block.prevrandao, gameId, turn)));
    return int8(int256(rand % 13) - 6);
  }
}
