# Test Plan and Results

## Overall Test Plan

First, we test individual system components using simulated players, AI enemies, and seeded database data. These tests validate normal, abnormal, and boundary behavior for core gameplay mechanics such as movement, combat, AI behavior, score accumulation, chat functionality, and stat persistence. Component testing is performed in isolation where possible to ensure deterministic logic (damage, scoring, cooldowns) behaves correctly.   

For the second phase, we test the full system in an interated environment consisting of the game client, server, and database. These tests simulate real gameplay sessions in an endless survival mode where players accumulate score until death. This phase validates correct interaction between AI enemies, player state, score tracking, chat, and persistent statistics such as high score and ELO rating, while also evaluating system stability during long-running sessions.

## Test Case Descriptions

### SV1.1 Server Test 1

**SV1.2** This test will ensure that a game room can be created and joined successfully.   
**SV1.3** The server will be started and clients will request to join a room. The room state will be inspected to confirm successful creation and correct player registration.   
**SV1.4 Inputs:** Matchmaking request; client connection.   
**SV1.5 Outputs:** Room exists; player is added to room state with valid spawn data.   
**SV1.6** Normal.  
**SV1.7** Blackbox.  
**SV1.8** Functional.  
**SV1.9** Integration.  
**SV1.10 Results:** ____.  

---

### SV2.1 Server Test 2

**SV2.2** This test will ensure that the room enforces its maximum player limit.   
**SV2.3** Clients will attempt to join a room until capacity is reached, followed by additional join attempts.   
**SV2.4 Inputs:** Join requests exceeding room capacity.   
**SV2.5 Outputs:** Room does not exceed max players; excess joins are rejected.   
**SV2.6** Boundary.  
**SV2.7** Blackbox.  
**SV2.8** Functional.  
**SV2.9** Integration.  
**SV2.10 Results:** ___.  

---

### SV3.1 Gameplay Test 1

**SV3.2** This test will ensure server-authoratative player movement.   
**SV3.3** Player movement inputs are sent to the server and replicated to observing clients. Server state is compared against received updates.   
**SV3.4 Inputs:** Movement inputs over time.   
**SV3.5 Outputs:** Player positions remain consistent across clients and server.   
**SV3.6** Normal.  
**SV3.7** Whitebox.  
**SV3.8** Functional.  
**SV3.9** Integration.  
**SV3.10 Results:** ___.  

---

### SV4.1 Combat Test 1

**SV4.2**This test will ensure that player attacks correctly damage AI enemies.   
**SV4.3** A player attacks AI enemies at valid and invalid ranges and damages events are observed.   
**SV4.4 Inputs:** Attack commands; enemy positions.  
**SV4.5 Outputs:** AI health decreases only when valid hits occur.   
**SV4.6** Normal.  
**SV4.7** Whitebox.   
**SV4.8** Functional.  
**SV4.9** Unit.  
**SV4.10 Results:** ___.

---

### SV5.1 Combat Test 2

**SV5.2** This test wille ensure that enemy AI can damage the player.  
**SV5.3** AI enemies are allowed to attack the player over time until damage is applied.   
**SV5.4 Inputs:** AI attack behavior.   
**SV5.5 Outputs:** Player health decreases according to damage rules.   
**SV5.6** Normal.  
**SV5.7** Whitebox.   
**SV5.8** Functional.  
**SV5.9** Integration.   
**SV5.10 Results:** ___.   

---

### SV6.1 Gameplay State Test