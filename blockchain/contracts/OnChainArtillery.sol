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
        uint16[32] terrain;
    }

    uint256 public constant TURN_TIMEOUT_BLOCKS = 25; // ~5 minutes on Sepolia
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
    event GameEnded(uint256 indexed gameId, address indexed winner, string reason);

    error InvalidGameState();
    error NotYourTurn();
    error InvalidShotParameters();
    error TimeoutNotReached();

    /// @notice Creates a new 1v1 game lobby
    function createGame() external returns (uint256 gameId) {
        gameId = nextGameId++;
        Game storage g = games[gameId];
        g.player1 = msg.sender;
        g.status = GameStatus.WaitingForPlayer;
        g.p1X = 4;
        g.p2X = 27;
        g.p1Hp = 100;
        g.p2Hp = 100;

        uint256 seed = uint256(keccak256(abi.encode(block.prevrandao, msg.sender, gameId)));
        g.terrain = ArtilleryMath.generateTerrain(seed);

        emit GameCreated(gameId, msg.sender);
    }

    /// @notice Second player joins an open game and starts the match
    function joinGame(uint256 gameId) external {
        Game storage g = games[gameId];
        if (g.status != GameStatus.WaitingForPlayer || g.player1 == msg.sender) {
            revert InvalidGameState();
        }

        g.player2 = msg.sender;
        g.status = GameStatus.Active;
        g.currentTurn = g.player1;
        g.lastMoveBlock = block.number;
        g.wind = _rollWind(gameId, 0);

        emit GameJoined(gameId, msg.sender, g.wind);
    }

    /// @notice Single-transaction turn: aim, choose weapon, fire, and pass turn
    /// @param angle Firing angle in degrees (0 = right, 90 = straight up, 180 = left)
    /// @param power Shot power from 1 to 100
    /// @param weapon 0 = Standard, 1 = Heavy Mortar, 2 = Bunker Buster
    function fire(uint256 gameId, uint8 angle, uint8 power, uint8 weapon) external {
        Game storage g = games[gameId];
        if (g.status != GameStatus.Active) revert InvalidGameState();
        if (msg.sender != g.currentTurn) revert NotYourTurn();
        if (angle > 180 || power == 0 || power > 100 || weapon > 2) {
            revert InvalidShotParameters();
        }

        bool isP1 = msg.sender == g.player1;
        uint8 shooterX = isP1 ? g.p1X : g.p2X;
        uint8 targetX = isP1 ? g.p2X : g.p1X;

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
            if (isP1) {
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
            emit GameEnded(gameId, g.winner, "KO");
        } else {
            g.currentTurn = isP1 ? g.player2 : g.player1;
        }
    }

    /// @notice Claim victory if the opponent stalls past TURN_TIMEOUT_BLOCKS
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
        emit GameEnded(gameId, msg.sender, "Timeout");
    }

    /// @notice Returns full game state including the 32-column terrain array for frontend rendering
    function getGame(uint256 gameId) external view returns (Game memory) {
        return games[gameId];
    }

    function _rollWind(uint256 gameId, uint8 turn) private view returns (int8) {
        uint256 rand = uint256(keccak256(abi.encode(block.prevrandao, gameId, turn)));
        return int8(int256(rand % 13) - 6); // Wind between -6 and +6
    }
}
