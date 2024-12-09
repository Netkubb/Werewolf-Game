// eslint-disable-next-line no-undef
const socket = io();
let playerRole = null;
let currentPhase = null;

const loginDiv = document.getElementById("login");
const joinBtn = document.getElementById("joinBtn");
const playerNameInput = document.getElementById("playerName");
const statusMessage = document.getElementById("statusMessage");

const gameDiv = document.getElementById("game");
const roleDisplay = document.getElementById("roleDisplay");
const phaseDisplay = document.getElementById("phaseDisplay");
const instruction = document.getElementById("instruction");

const playerList = document.getElementById("playerList");
const nightActions = document.getElementById("night-actions");
const dayActions = document.getElementById("day-actions");
const actionList = document.getElementById("actionList");
const actionListDay = document.getElementById("actionListDay");
const nightInstruction = document.getElementById("nightInstruction");

let discoveredRoles = {}; // { playerName: role }
let knownPlayers = []; // Assume this is updated whenever "playersUpdate" is received, including roles
let lastProtected = null; // Remember the last player bodyguard protected
let selectedNightTarget = null; // Temporarily store the target selected this night
let selectedTargetElement = null; // Keep track of the currently highlighted element
// eslint-disable-next-line no-unused-vars
let selectedDayTarget = null; // To store the chosen day's target name
let selectedDayTargetElement = null; // To track the currently highlighted day target

// Check sessionStorage for existing nickname
window.addEventListener("load", () => {
    const savedName = sessionStorage.getItem("nickname");
    if (savedName) {
        playerNameInput.value = savedName;
        socket.emit("joinGame", savedName);
    }
});

joinBtn.addEventListener("click", () => {
    const name = playerNameInput.value.trim();
    if (name) {
        sessionStorage.setItem("nickname", name);
        socket.emit("joinGame", name);
    }
});

socket.on("joinConfirmed", (data) => {
    statusMessage.textContent =
        data.message + ` (${data.currentCount}/${data.requiredCount})`;
    statusMessage.style.display = "block";
});

socket.on("playersWaiting", (data) => {
    playerList.innerHTML = "";
    data.players.forEach((p) => {
        const li = document.createElement("li");
        li.textContent = p.name + (p.alive ? "" : " (dead)");
        playerList.appendChild(li);
    });

    if (data.currentCount < data.requiredCount && currentPhase !== "end") {
        statusMessage.textContent = `Waiting for more players... (${data.currentCount}/${data.requiredCount})`;
        statusMessage.style.display = "block";
    }
});

socket.on("playersUpdate", (players) => {
    // players is an array: [{ name, alive }, ...]
    // To know roles, you'd have assigned them previously or have a separate event that gives the client roles.
    // For demonstration, let's assume roles are somehow known (maybe the client originally had them or they are revealed roles).
    knownPlayers = players; // Make sure knownPlayers includes role info as well
    renderPlayerList(players);
});

socket.on("gameStarted", (data) => {
    loginDiv.style.display = "none";
    gameDiv.style.display = "block";
    statusMessage.textContent = data.message;
    statusMessage.style.display = "block";
});

socket.on("yourRole", (data) => {
    playerRole = data.role;
    roleDisplay.textContent = "Your role: " + playerRole;
});

socket.on("phaseUpdate", (data) => {
    currentPhase = data.phase;
    phaseDisplay.textContent = "Current Phase: " + currentPhase;
    updateUIForPhase();

    // Switch theme based on phase
    const body = document.body;
    if (currentPhase === "day") {
        body.classList.add("day-mode");
        body.classList.remove("night-mode");
    } else if (currentPhase === "night") {
        body.classList.add("night-mode");
        body.classList.remove("day-mode");
    } else {
        // For waiting, end, or other phases, you can revert to default or do nothing
        body.classList.remove("day-mode", "night-mode");
    }

    if (currentPhase === "end") {
        showBackToLobbyButton();
    }
});

socket.on("message", (msg) => {
    instruction.textContent = msg;
});

socket.on("actionReceived", (msg) => {
    alert(msg);
    // If player is bodyguard and we are in the night phase, set lastProtected to the chosen target
    if (
        playerRole === "bodyguard" &&
        currentPhase === "night" &&
        selectedNightTarget
    ) {
        lastProtected = selectedNightTarget;
        selectedNightTarget = null; // Reset after use
    }
});

socket.on("errorMessage", (msg) => {
    // Display the error message to the player
    alert(msg);
});

socket.on("youDied", () => {
    alert("You have been eliminated! You can no longer act.");
    nightActions.style.display = "none";
    dayActions.style.display = "none";
    instruction.textContent = "You are dead. You can watch, but cannot act.";
});

socket.on("forceReload", () => {
    // Force the browser to reload the page
    console.log("Reloading...");
    window.location.reload();
});

socket.on("seerDiscoveriesUpdate", (data) => {
    // data = { playerName: role, ... }
    discoveredRoles = data;
    // Re-render player list if needed
    renderPlayerList();
});

function updateUIForPhase() {
    nightActions.style.display = "none";
    dayActions.style.display = "none";
    actionList.innerHTML = "";
    actionListDay.innerHTML = "";

    if (currentPhase === "night") {
        if (playerRole === "werewolf") {
            nightInstruction.textContent = "Choose a victim to eliminate.";
            populateNightTargets("werewolf");
        } else if (playerRole === "bodyguard") {
            nightInstruction.textContent = "Choose someone to protect.";
            populateNightTargets("bodyguard");
        } else if (playerRole === "seer") {
            nightInstruction.textContent =
                "Choose a player to reveal their role.";
            populateNightTargets("seer");
        } else {
            nightInstruction.textContent = "You are sleeping... No action.";
        }
        nightActions.style.display = "block";
    } else if (currentPhase === "day") {
        populateDayTargets();
        dayActions.style.display = "block";
    }
}

function populateNightTargets(role) {
    actionList.innerHTML = "";
    const myName = sessionStorage.getItem("nickname");

    // We'll filter knownPlayers based on conditions
    // Werewolf: cannot target self or other werewolves
    // Bodyguard: can protect anyone alive including self, except the same person protected last night
    // Seer: can target anyone alive (no restriction)

    console.log(knownPlayers);

    knownPlayers.forEach((player) => {
        if (!player.alive) return; // Skip dead players

        // If player is me:
        if (player.name === myName) {
            // If I am werewolf or seer, no reason to target myself.
            // If I am bodyguard, I can target myself unless I protected myself last night.
            if (role === "bodyguard") {
                if (lastProtected !== player.name) {
                    appendTarget(player.name);
                }
            }
            return;
        }

        if (role === "werewolf") {
            // Exclude other werewolves
            if (player.role === "werewolf") return;
            appendTarget(player.name);
        } else if (role === "bodyguard") {
            // Can protect anyone alive, including self, except the same as lastProtected
            if (lastProtected !== player.name) {
                appendTarget(player.name);
            }
        } else if (role === "seer") {
            // Can choose anyone alive
            appendTarget(player.name);
        }
    });
}

function appendTarget(name) {
    const targetLi = document.createElement("li");
    targetLi.textContent = name;

    targetLi.addEventListener("click", () => {
        selectedNightTarget = name; // Remember who we chose
        socket.emit("nightAction", { target: name });

        if (!selectedTargetElement) {
            // Highlight this selected target
            highlightSelectedTarget(targetLi);
        }
    });

    actionList.appendChild(targetLi);
}

function highlightSelectedTarget(element) {
    // Remove highlight from previously selected element if any
    if (selectedTargetElement) {
        selectedTargetElement.classList.remove("selected-target");
    }

    // Add highlight to the newly selected target
    element.classList.add("selected-target");
    selectedTargetElement = element;
}

function populateDayTargets() {
    actionListDay.innerHTML = "";
    const myName = sessionStorage.getItem("nickname");

    knownPlayers.forEach((player) => {
        if (!player.alive) return;
        if (player.name === myName) return; // Can't vote for self

        const targetLi = document.createElement("li");
        targetLi.textContent = player.name;

        targetLi.addEventListener("click", () => {
            selectedDayTarget = player.name;
            socket.emit("dayVote", { target: player.name });

            if (!selectedDayTargetElement) {
                highlightSelectedDayTarget(targetLi);
            }
        });

        actionListDay.appendChild(targetLi);
    });
}

function highlightSelectedDayTarget(element) {
    // Remove highlight from previously selected day target if any
    if (selectedDayTargetElement) {
        selectedDayTargetElement.classList.remove("selected-target-day");
    }

    // Add highlight to the newly selected day target
    element.classList.add("selected-target-day");
    selectedDayTargetElement = element;
}

function showBackToLobbyButton() {
    const lobbyButton = document.createElement("button");
    lobbyButton.textContent = "Restart Game";
    lobbyButton.style.marginTop = "20px";
    lobbyButton.addEventListener("click", () => {
        window.location.reload();
    });
    instruction.appendChild(lobbyButton);
}

function renderPlayerList(playersData) {
    // If playersData not provided (like after receiving discoveries), fetch current displayed if needed.
    // Or store the last players array in a global variable.
    if (!playersData) return; // Ensure you have a global lastPlayers = playersData upon playersUpdate.

    playerList.innerHTML = "";
    playersData.forEach((p) => {
        const li = document.createElement("li");
        // If current player is seer and has discovered this player's role, show it
        let displayName = p.name;
        if (playerRole === "seer" && discoveredRoles[p.name]) {
            displayName += ` - ${discoveredRoles[p.name]}`;
        }

        if (!p.alive) {
            displayName += " (dead)";
        }
        li.textContent = displayName;
        playerList.appendChild(li);
    });
}
