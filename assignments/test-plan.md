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

**SV6.2** This test will ensure that player death triggers a game-over state.  
**SV6.3** Player health is reduced to zero and server behavior is observed.   
**SV6.4 Inputs:** Damage events reducing HP to zero.   
**SV6.5 Outputs:** Player enters dead state; input disabled; game-over event triggered.   
**SV6.6** Normal.  
**SV6.7** Whitebox.  
**SV6.8** Functional.  
**SV6.9** Integration.  
**SV6.10 Results** ___.  

---

### SV7.1 Scoring Test 1

**SV7.2** This test will ensure that score accumulates correctly over time.   
**SV7.3** Player defeats multiple enemies during survival and score is tracked continuously.   
**SV7.4 Inputs:** Enemy kill events.   
**SV7.5 Outputs:** Score increases according to scoring rules without resets.   
**SV7.6** Normal.  
**SV7.7** Whitebox.  
**SV7.8** Functional.  
**SV7.9** Unit.  
**SV7.10 Results:** ___.  

---

### SV8.1 Scoring Test 2

**SV8.2** This test will ensure that score stops increasing after player death.   
**SV8.3** Player dies and additional enemy actions occur.  
**SV8.4 Inputs:** Player death event.  
**SV8.5 Outputs:** Score remains unchanged after death.  
**SV8.6** Boundary.  
**SV8.7** Whitebox.  
**SV8.8** Functional.  
**SV8.9** Integration.  
**SV8.10 Results:** ___.  

---

### AI1.1 AI Test 1

**AI1.2** This test will ensure AI enemies spawn correctly and pursue players.   
**AI1.3** AI enemies are spawned and their movement toward players is observed.   
**AI1.4 Inputs:** Enemy spawn events.   
**AI1.5 Outputs:** Enemies move toward player using AI logic.  
**AI1.6** Normal.  
**AI1.7** Blackbox.  
**AI1.8** Functional.  
**AI1.9** Integration.  
**AI1.10 Results:** ___.  

---

### CH1.1 Chat Test 1

**CH1.2** This test will ensure chat messages are delivered to all players in the room.   
**CH1.3** A player sends chat messages and other players observe delivery.  
**CH1.4 Inputs:** Chat text message.  
**CH1.5 Outputs:** Message appears in chat box for all players.  
**CH1.6** Normal.  
**CH1.7** Blackbox.  
**CH1.8** Functional.  
**CH1.9** Integration.  
**CH1.10 Results:** ___.  

---

### CH2.1 Chat Test 2

**CH2.2** This test will ensure invalid or excessive chat messages are handled safely.  
**CH2.3** Long, enmpty, or rapid messages are sent to the server.  
**CH2.4 Inputs:** Invalid/repaid chat messages.  
**CH2.5 Outputs:** Messages rejected or limited; no crash or corruption.  
**CH2.6** Abnormal.  
**CH2.7** Blackbox.  
**CH2.8** Functional.  
**CH2.9** Integration.  
**CH2.10 Results:** ___.   

---

### DB1.1 Database Test 1

**DB1.2** This test will ensure that a player's high score is persisted after death.  
**DB1.3** Player completes a survival sessiosn and dies; database is queried.   
**DB1.4 Inputs:** Finals score at death.  
**DB1.5 Outputs:** High score stored if greater than previous value.  
**DB1.6** Normal.  
**DB1.7** Whitebox.  
**DB1.8** Functional.  
**DB1.9** Integration.  
**DB1.10 Results:** ___.  

---

### DB2.1 Database Test 2

**DB2.2** This test will ensure that ELO rating updates after a survival session.  
**DB2.3** Player completes session; ELO update logic is applied and stored.  
**DB2.4 Inputs:** Session performance metrics.  
**DB2.5 Outputs:** Updated ELO persisted correctly.  
**DB2.6** Normal.  
**DB2.7** Whitebox.  
**DB2.8** Functional.  
**DB2.9** Integration.  
**DB2.10 Results:** ___.  

---

### FS1.1 Full System Test

**FS1.2** This test will ensure the full system functions together in endless survival mode.  
**FS1.3** Client, server, AI, chat, and database are deployed together and a full survival session is played until death.  
**FS1.4 Inputs:** Live client; AI enemies; database.  
**FS1.5 Outputs:** Gameplay proceeds correctly; score accumulates; death triggers persistence of stats.  
**FS1.6** Normal.  
**FS1.7** Blackbox.  
**FS1.8** Functional.  
**FS1.9** Integration.  
**FS1.10 Results:** ___.  

---

## Test Case Matrix

| Test ID | Normal / Abnormal / Boundary | Blackbox / Whitebox | Functional / Performance | Unit / Integration |
|---------|------------------------------|---------------------|--------------------------|--------------------|
| SV1     | Normal                       | Blackbox            | Functional               | Integration        |
| SV2     | Boundary                     | Blackbox            | Functional               | Integration        |
| SV3     | Normal                       | Whitebox            | Functional               | Integration        |
| SV4     | Normal                       | Whitebox            | Functional               | Unit               |
| SV5     | Normal                       | Whitebox            | Functional               | Integration        |
| SV6     | Normal                       | Whitebox            | Functional               | Unit               |
| AI1     | Normal                       | Blackbox            | Functional               | Integration        |
| CH1     | Normal                       | Blackbox            | Functional               | Integration        |
| CH2     | Abnormal                     | Blackbox            | Functional               | Integration        |
| DB1     | Normal                       | Whitebox            | Functional               | Integration        |
| DB2     | Normal                       | Whitebox            | Functional               | Integration        |
| FS1     | Normal                       | Blackbox            | Functional               | Integration        |
