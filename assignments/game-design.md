# Game Design

## Health, Damage, and Weapons
- Players and enemies will have 100 health points
- Player weapon damage numbers:
    - Sword will do 50 damage per hit (2 hits to kill)
        - Standard player movement speed
    - Bow will do 40 damage per hit (3 hits to kill)
        - Quicker player movement speed
    - Staff will do 33 damage per hit (4 hits to kill), but will also slow enemies
        - Slower player movement speed
- Ideally, players will be able to pick up multiple weapon types and switch between them on the fly. Keybinds to switch to each weapon will be 1, 2, and 3. However, this may be out of scope. MVP will focus on having 1 weapon at a time.
- Enemies will do 10 damage per hit and can only melee, no ranged attacks (10 hits from an enemy will kill the player, unless healed by a power-up).

## Power-Ups
- Health Restore
- Increase Maximum Health (by 50 points, lasts 20 seconds)
- Increase Movement Speed (by 50%, lasts 30 seconds)
- Increase Player Damage (by 100%, lasts 10 seconds)

*Power-Ups and Weapons will spawn randomly at fixed locations. At least 3 per round*

## Win & Lose Conditions
- There is no win condition. Players will play and gather as much score as they can until they lose
- Each hit on an enemy will reward 20 points, while each power-up pick up will reward 50 points
- Lose condition is when all players die (reach 0 health points)

## Enemy Waves
- Number of enemies begins at 4 for round 1, then increases by 2 each round
- Maximum number of enemies will be 30 at round 13
- After round 13, the enemies will begin increasing in difficulty rather than number (+1% damage and speed per round, and cap out at a maximum of +20% at round 23)
