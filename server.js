const express = require("express");
const { Server } = require("socket.io");
const http = require("http");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

let players = []; // { id: socket.id, name: string, role: string, alive: bool, disconnected: bool }
let phase = "waiting";
let bodyguardProtection = null;
let werewolfVotes = {};
let werewolfVoters = new Set(); // Track which werewolves have voted
let seerTarget = null;
let seerDiscoveries = {};
let votes = [];
let dayVoters = new Set(); // Track which players have voted this day
let roles = fs.readFileSync("roles.txt", "utf-8").trim().split("\n");
// for each role clean \r
roles = roles.map((role) => role.replace("\r", ""));
console.log(roles);
// roles now is an array like ["werewolf", "werewolf", "bodyguard", "seer", "villager", "villager", "villager"]
let requiredPlayers = roles.length;

io.on("connection", (socket) => {
    console.log("A player connected", socket.id);

    socket.on("joinGame", (name) => {
        if (phase === "end") {
            resetGame();
        }

        // Check if a player with this name already exists (rejoining scenario)
        let player = players.find((p) => p.name === name);
        if (player) {
            // Player is rejoining
            player.id = socket.id; // Reassign socket id
            player.disconnected = false; // Mark them connected
            socket.emit("joinConfirmed", {
                message: `Welcome back, ${name}.`,
                currentCount: players.length,
                requiredCount: requiredPlayers,
            });
        } else {
            // New player joining
            if (phase !== "waiting") {
                socket.emit("errorMessage", "Cannot join mid-game.");
                return;
            }

            players.push({
                id: socket.id,
                name,
                role: null,
                alive: true,
                disconnected: false,
            });
            socket.emit("joinConfirmed", {
                message: `You have joined the game as "${name}". Waiting for others...`,
                currentCount: players.length,
                requiredCount: requiredPlayers,
            });
        }

        io.emit("playersWaiting", {
            currentCount: players.length,
            requiredCount: requiredPlayers,
            players: players.map((p) => ({ name: p.name, alive: p.alive })),
        });

        if (players.length === requiredPlayers && phase === "waiting") {
            startGame();
        }

        if (phase === "night" || phase === "day") {
            // If player rejoined mid-game, send them current state info
            socket.emit("phaseUpdate", { phase });
            socket.emit(
                "playersUpdate",
                players.map((p) => ({ name: p.name, alive: p.alive })),
            );
            if (phase === "night") {
                io.emit(
                    "message",
                    "Night has begun. Werewolf and Bodyguard, choose your targets.",
                );
            } else if (phase === "day") {
                io.emit(
                    "message",
                    "Day has begun. Discuss and vote who to eliminate.",
                );
            }
        }
    });

    socket.on("nightAction", (data) => {
        const player = players.find(
            (p) => p.id === socket.id && p.alive && !p.disconnected,
        );
        if (!player) return;
        if (phase !== "night") return;

        if (player.role === "werewolf") {
            // Check if this werewolf already voted this night
            if (werewolfVoters.has(player.id)) {
                socket.emit(
                    "errorMessage",
                    "You have already voted this night!",
                );
                return;
            }

            // Multiple werewolves scenario: each werewolf votes for a victim
            if (!werewolfVotes[data.target]) werewolfVotes[data.target] = 0;
            werewolfVotes[data.target]++;
            werewolfVoters.add(player.id); // Mark that this werewolf has voted

            socket.emit(
                "actionReceived",
                "Vote registered. Waiting for the rest...",
            );
        } else if (player.role === "bodyguard") {
            bodyguardProtection = data.target;
            socket.emit(
                "actionReceived",
                "Protection given. Waiting for day...",
            );
        } else if (player.role === "seer") {
            seerTarget = data.target;
            socket.emit("actionReceived", "You have chosen someone to see...");
        }
        checkNightActionsComplete();
    });

    socket.on("dayVote", (data) => {
        if (phase !== "day") return;

        const player = players.find(
            (p) => p.id === socket.id && p.alive && !p.disconnected,
        );
        if (!player) return;

        // Check if the player has already voted today
        if (dayVoters.has(player.id)) {
            socket.emit("errorMessage", "You have already voted this day!");
            return;
        }

        // Record the vote
        votes.push({ voter: player.name, target: data.target });
        dayVoters.add(player.id); // Mark the player as having voted
        socket.emit("actionReceived", "Vote cast.");
        checkDayVotesComplete();
    });

    socket.on("disconnect", () => {
        console.log("A player disconnected", socket.id);
        // Mark player as disconnected
        let player = players.find((p) => p.id === socket.id);
        if (player) {
            player.disconnected = true;
            // If during waiting phase, remove them entirely
            if (phase === "waiting") {
                players = players.filter((p) => p.id !== socket.id);
                io.emit("playersWaiting", {
                    currentCount: players.length,
                    requiredCount: requiredPlayers,
                    players: players.map((p) => ({
                        name: p.name,
                        alive: p.alive,
                    })),
                });
            }
        }
    });

    socket.on("resetGame", () => {
        // This event is triggered by some condition, maybe a button click from a player.
        if (phase !== "end") {
            resetGame();
        }
    });
});

function startGame() {
    phase = "night";
    assignRoles();
    io.emit("gameStarted", {
        message: "All players have joined! Game started! Night falls...",
    });
    io.emit(
        "playersUpdate",
        players.map((p) => ({ name: p.name, alive: p.alive, role: p.role })),
    );
    sendPhaseUpdate();
}

function assignRoles() {
    const shuffledRoles = shuffleArray(roles);
    for (let i = 0; i < players.length; i++) {
        players[i].role = shuffledRoles[i];
        io.to(players[i].id).emit("yourRole", { role: players[i].role });
    }

    // Initialize seer discoveries if a seer exists
    const seer = players.find((p) => p.role === "seer");
    if (seer) {
        seerDiscoveries[seer.id] = {};
    }
}

function sendPhaseUpdate() {
    io.emit("phaseUpdate", { phase });
    if (phase === "night") {
        io.emit(
            "message",
            "Night has begun. Werewolf and Bodyguard, choose your targets.",
        );
    } else if (phase === "day") {
        io.emit("message", "Day has begun. Discuss and vote who to eliminate.");
    } else if (phase === "end") {
        io.emit(
            "message",
            'Game has ended. Click "Restart Game" to play again.',
        );
    }
}

function checkNightActionsComplete() {
    const werewolvesAlive = players.filter(
        (p) => p.role === "werewolf" && p.alive,
    );
    const bodyguardAlive = players.find(
        (p) => p.role === "bodyguard" && p.alive,
    );
    const seerAlive = players.find((p) => p.role === "seer" && p.alive);

    // Conditions for completion:
    // - All living werewolves have voted OR no werewolves alive
    const allWolvesVoted =
        werewolvesAlive.length === 0 ||
        Object.values(werewolfVotes).reduce((sum, val) => sum + val, 0) ===
            werewolvesAlive.length;

    const bodyguardDone = !bodyguardAlive || bodyguardProtection !== null;
    const seerDone = !seerAlive || seerTarget !== null;

    if (allWolvesVoted && bodyguardDone && seerDone) {
        resolveNightActions();
    }
}

function resolveNightActions() {
    let victim = null;

    // Determine the werewolves’ chosen victim
    if (Object.keys(werewolfVotes).length > 0) {
        // Find the target with the maximum votes
        let maxVotes = 0;
        let candidates = [];
        for (let target in werewolfVotes) {
            if (werewolfVotes[target] > maxVotes) {
                maxVotes = werewolfVotes[target];
                candidates = [target];
            } else if (werewolfVotes[target] === maxVotes) {
                candidates.push(target);
            }
        }

        if (maxVotes > 0) {
            // If tie, choose random
            const chosen =
                candidates[Math.floor(Math.random() * candidates.length)];
            victim = players.find((p) => p.name === chosen && p.alive);
        }
    }

    // Apply bodyguard protection
    if (victim && bodyguardProtection === victim.name) {
        // Victim protected, no one dies
        victim = null;
    }

    // If victim chosen (not protected), eliminate
    if (victim) {
        victim.alive = false;
        io.to(victim.id).emit("youDied");
    }

    if (seerTarget) {
        const seer = players.find((p) => p.role === "seer" && p.alive);
        const targetPlayer = players.find((p) => p.name === seerTarget);

        if (seer && targetPlayer) {
            // Store in seerDiscoveries
            if (!seerDiscoveries[seer.id]) {
                seerDiscoveries[seer.id] = {};
            }
            seerDiscoveries[seer.id][seerTarget] = targetPlayer.role;

            // Notify the seer of updated discoveries
            io.to(seer.id).emit(
                "seerDiscoveriesUpdate",
                seerDiscoveries[seer.id],
            );
        }
    }

    // Reset night actions
    werewolfVotes = {};
    werewolfVoters.clear();
    seerTarget = null;
    bodyguardProtection = null;

    io.emit(
        "playersUpdate",
        players.map((p) => ({ name: p.name, alive: p.alive, role: p.role })),
    );

    checkWinCondition();
    if (phase !== "end") {
        phase = "day";
        votes = [];
        sendPhaseUpdate();
    }
}

function checkDayVotesComplete() {
    const livingCount = players.filter((p) => p.alive).length;
    if (votes.length === livingCount) {
        resolveDayVoting();
    }
}

function resolveDayVoting() {
    const tally = {};
    votes.forEach((v) => {
        if (!tally[v.target]) tally[v.target] = 0;
        tally[v.target]++;
    });

    let maxVotes = 0;
    let toEliminate = null;
    for (let target in tally) {
        if (tally[target] > maxVotes) {
            maxVotes = tally[target];
            toEliminate = target;
        }
    }

    if (toEliminate) {
        const victim = players.find((p) => p.name === toEliminate && p.alive);
        if (victim) {
            victim.alive = false;
            io.to(victim.id).emit("youDied");
        }
    }

    votes = [];
    dayVoters.clear(); // Reset the voters set for the next day phase

    io.emit(
        "playersUpdate",
        players.map((p) => ({ name: p.name, alive: p.alive, role: p.role })),
    );

    checkWinCondition();
    if (phase !== "end") {
        phase = "night";
        sendPhaseUpdate();
    }
}

function checkWinCondition() {
    const wolvesAlive = players.filter(
        (p) => p.alive && p.role === "werewolf",
    ).length;
    const villagersAlive = players.filter(
        (p) => p.alive && p.role !== "werewolf",
    ).length;

    if (wolvesAlive === 0) {
        phase = "end";
        io.emit("message", "Villagers win! The werewolf has been eliminated.");
        io.emit("phaseUpdate", { phase });
    } else if (wolvesAlive >= villagersAlive) {
        phase = "end";
        io.emit(
            "message",
            "Werewolf wins! The beast has overpowered the villagers.",
        );
        io.emit("phaseUpdate", { phase });
    }
}

function resetGame() {
    players = [];
    phase = "waiting";
    bodyguardProtection = null;
    votes = [];
    io.emit("playersWaiting", {
        currentCount: players.length,
        requiredCount: requiredPlayers,
        players: players.map((p) => ({ name: p.name, alive: p.alive })),
    });
    io.emit("message", "Game has been reset. Reloading...");
    io.emit("forceReload");
}

function shuffleArray(arr) {
    let array = arr.slice();
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

server.listen(3000, () => {
    console.log("Server started on http://localhost:3000");
});
