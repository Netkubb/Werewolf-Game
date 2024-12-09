Below is a sample `README.md` you can adapt for your repository. It provides an overview of the Werewolf game, setup instructions, and usage details.

# Werewolf Game

A browser-based implementation of the classic social deduction game "Werewolf" (also known as Mafia). Players join the game through a browser, receive hidden roles, and participate in day and night phases, attempting to eliminate the opposing faction.

## Features

- **Multiple Roles**: Assigns roles like Werewolf, Villager, Bodyguard, and Seer from a `roles.txt` file.
- **Real-Time Gameplay**: Utilizes Socket.IO for real-time communication between players.
- **Night/Day Phases**: Automatically transitions through night and day, allowing for secret werewolf attacks at night and open discussions/voting during the day.
- **Theming**: Switches between a light ("day-mode") and dark ("night-mode") theme for better immersion.
- **Persistence**: Remembers player nicknames via `sessionStorage`, allowing easy reconnection.

## Prerequisites

- **Node.js & npm**: [Download and Install Node.js](https://nodejs.org/)
- **Git**: [Download and Install Git](https://git-scm.com/)

## Installation

1. **Clone the Repository**:

    ```bash
    git clone https://github.com/Netkubb/Werewolf-Game.git
    cd Werewolf-Game
    ```

2. **Install Dependencies**:

    ```bash
    npm install
    ```

3. **Add Your Roles**:
    - Edit `roles.txt` in the repository root. Each line should contain a single role, for example:
        ```
        werewolf
        bodyguard
        seer
        villager
        villager
        ```
    - The number of roles defined in `roles.txt` determines the required player count.

## Running the Game

1. **Start the Server**:

    ```bash
    npm start
    ```

    The server will start on `http://localhost:3000`.

2. **Open in Browser**:

    - Open the URL `http://localhost:3000` in your browser.
    - Multiple players can join from different machines by accessing the same URL (replace `localhost` with your server IP if needed).

3. **Join and Play**:
    - Enter a nickname and click "Join Game".
    - Once all required players have joined, the game will start automatically.
    - Follow on-screen instructions for day/night actions.

## How to Play

- **Werewolves**: Secretly choose a victim to eliminate at night.
- **Villagers**: Discuss and vote to eliminate a suspect during the day.
- **Bodyguard**: Protect someone at night (even yourself), but not the same person two nights in a row.
- **Seer**: Reveal another player's role each night to gain more information.

The game ends when either:

- All werewolves are eliminated (Villagers win), or
- Werewolves outnumber or equal the number of villagers (Werewolves win).

## Customization

- **Styling**: Edit `styles.css` to change colors, fonts, and layout.
- **Server Logic**: Modify `server.js` for custom role logic, timing, or additional features.
- **Client Logic**: Update `client.js` for custom UI behavior and additional events.

## Troubleshooting

- If styling doesn’t update when switching phases, ensure `.day-mode` and `.night-mode` classes are correctly toggled in the client code.
- For errors or disconnects, check the server logs in the console.
- If the game doesn’t start, confirm that the number of players matches the number of roles defined in `roles.txt`.

## Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

## License

This project is released under the [MIT License](LICENSE).

```

Feel free to adjust the content, add screenshots, or include more detailed instructions based on your specific repository setup.
```
