// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

library ArtilleryMath {
uint256 internal constant MAP_WIDTH = 32;
uint256 internal constant SCALE = 10_000;
int256 internal constant GRAVITY = 980; // Scaled gravity constant

uint8 internal constant WEAPON_STANDARD = 0;
uint8 internal constant WEAPON_MORTAR = 1;
uint8 internal constant WEAPON_BUNKER_BUSTER = 2;

/// @notice Sin lookup table for 0 to 90 degrees in 5-degree steps (scaled by 10_000)
function sin5(uint8 step) internal pure returns (int256) {
// step = angle / 5 (0..18)
if (step == 0) return 0;
if (step == 1) return 872;
if (step == 2) return 1736;
if (step == 3) return 2588;
if (step == 4) return 3420;
if (step == 5) return 4226;
if (step == 6) return 5000;
if (step == 7) return 5736;
if (step == 8) return 6428;
if (step == 9) return 7071;
if (step == 10) return 7660;
if (step == 11) return 8192;
if (step == 12) return 8660;
if (step == 13) return 9063;
if (step == 14) return 9397;
if (step == 15) return 9659;
if (step == 16) return 9848;
if (step == 17) return 9962;
return 10000;
}

/// @notice Returns (cos, sin) scaled by 10_000 for any angle 0..180 (snapped to 5-deg increments)
function trig(uint8 angle) internal pure returns (int256 cosVal, int256 sinVal) {
uint8 snapped = (angle / 5) * 5;
if (snapped <= 90) {
uint8 idx = snapped / 5;
sinVal = sin5(idx);
cosVal = sin5(18 - idx);
} else {
uint8 idx = (180 - snapped) / 5;
sinVal = sin5(idx);
cosVal = -sin5(18 - idx);
}
}

/// @notice Generates a deterministic 32-column heightmap (heights between 100 and 350)
function generateTerrain(uint256 seed) internal pure returns (uint16[32] memory terrain) {
uint16 currentHeight = 200;
for (uint256 i = 0; i < MAP_WIDTH; i++) {
// Keep spawn zones (cols 3..5 and 26..28) relatively flat
if ((i >= 3 && i <= 5) || (i >= 26 && i <= 28)) {
terrain[i] = currentHeight;
continue;
}
int256 delta = int256((uint256(keccak256(abi.encode(seed, i))) % 51)) - 25;
int256 nextHeight = int256(uint256(currentHeight)) + delta;
if (nextHeight < 100) nextHeight = 100;
if (nextHeight > 350) nextHeight = 350;
currentHeight = uint16(uint256(nextHeight));
terrain[i] = currentHeight;
}
}

/// @notice Simulates discrete time steps (dt = 0.2s) to find impact column and coordinates
function simulateShot(
uint16[32] memory terrain,
uint8 startX,
uint8 angle,
uint8 power,
int8 wind,
uint8 weapon
) internal pure returns (bool hitMap, uint8 impactX, uint16 impactY) {
(int256 cosA, int256 sinA) = trig(angle);

// Heavy mortar trades velocity for higher payload
int256 speed = weapon == WEAPON_MORTAR
? int256(uint256(power)) * 11
: int256(uint256(power)) * 13;

// Scale X so 1 column = 100 units (total map width = 3200 units)
int256 x = int256(uint256(startX)) * 100 + 50;
int256 y = int256(uint256(terrain[startX])) + 15;

int256 vx = (speed * cosA) / int256(SCALE);
int256 vy = (speed * sinA) / int256(SCALE);

// Simulate up to 60 discrete steps (dt = 0.2s -> divide velocities by 5)
for (uint256 step = 0; step < 60; step++) {
x += vx / 5;
y += vy / 5;

vx += int256(wind) * 2;
vy -= GRAVITY / 50;

if (x < 0 || x >= 3200) {
return (false, 0, 0); // Flew off map horizontally
}
if (y <= 0) {
uint8 colOut = uint8(uint256(x) / 100);
return (true, colOut, 0);
}

uint8 col = uint8(uint256(x) / 100);
if (uint256(y) <= terrain[col]) {
return (true, col, uint16(uint256(y)));
}
}

return (false, 0, 0);
}

/// @notice Deforms terrain around impactX and returns damage dealt to a target at targetX
function applyImpact(
uint16[32] storage terrain,
uint8 impactX,
uint8 targetX,
uint8 weapon
) internal returns (uint8 damage) {
uint8 radius = weapon == WEAPON_MORTAR ? 3 : (weapon == WEAPON_BUNKER_BUSTER ? 1 : 2);
uint16 depth = weapon == WEAPON_BUNKER_BUSTER ? 90 : (weapon == WEAPON_MORTAR ? 55 : 35);
uint8 maxDmg = weapon == WEAPON_MORTAR ? 45 : (weapon == WEAPON_BUNKER_BUSTER ? 40 : 30);

// Carve crater
uint256 startCol = impactX > radius ? impactX - radius : 0;
uint256 endCol = impactX + radius < MAP_WIDTH ? impactX + radius : MAP_WIDTH - 1;

for (uint256 c = startCol; c <= endCol; c++) {
uint256 dist = c > impactX ? c - impactX : impactX - c;
uint16 carve = uint16(depth / (dist + 1));
if (terrain[c] > carve) {
terrain[c] -= carve;
} else {
terrain[c] = 0;
}
}

// Calculate splash damage to opponent tank
uint256 targetDist = targetX > impactX ? targetX - impactX : impactX - targetX;
if (targetDist <= radius) {
damage = uint8(maxDmg / (targetDist + 1));
}
}
}
