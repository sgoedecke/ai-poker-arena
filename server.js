// server.js
const express = require('express');
const ModelClient = require("@azure-rest/ai-inference").default;
const { AzureKeyCredential } = require("@azure/core-auth");
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');

const { compareHands } = require('./hands');

const app = express();
const http = createServer(app);
const io = new Server(http);


const client = new ModelClient(
    "https://models.inference.ai.azure.com",
    new AzureKeyCredential(process.env.GITHUB_TOKEN)
);

// Poker game state
let gameState = {
    players: [
        { name: 'gpt-4o-mini', chips: 1000, cards: [], model: 'gpt-4o-mini' },
        { name: 'Phi-3-medium-4k-instruct', chips: 1000, cards: [], model: 'Phi-3-medium-4k-instruct' },
        { name: 'Meta-Llama-3.1-8B-Instruct', chips: 1000, cards: [], model: 'Meta-Llama-3.1-8B-Instruct' },
        { name: 'Mistral-small', chips: 1000, cards: [], model: 'Mistral-small' },
    ],
    deck: [],
    communityCards: [],
    pot: 0,
    currentPlayer: 0,
    round: 'preflop',
    handNumber: 1,
    gameLog: [],  // Add game log array
    currentBet: 0,
    playerBets: {}, // Track how much each player has bet this round
    lastRaiseAmount: 0,
    minRaise: 50, // Minimum raise amount
    foldedPlayers: [] // Track players who have folded
};

function addToLog(message) {
    const timestamp = new Date().toLocaleTimeString();
    gameState.gameLog.unshift(`[${timestamp}] ${message}`);
    // Keep only last 50 messages
    if (gameState.gameLog.length > 50) {
        gameState.gameLog.pop();
    }
}

function initializeDeck() {
    const suits = ['♠', '♣', '♥', '♦'];
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const deck = [];
    
    for (let suit of suits) {
        for (let value of values) {
            deck.push(value + suit);
        }
    }
    return shuffle(deck);
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}


async function getAIDecision(player, gameState) {
    try {
        // Calculate how much this player needs to call
        const playerCurrentBet = gameState.playerBets[player.name] || 0;
        const amountToCall = gameState.currentBet - playerCurrentBet;
        
        const prompt = `You are playing Texas Hold'em Poker. 
            Your cards: ${player.cards.join(', ')}
            Community cards: ${gameState.communityCards.join(', ')}
            Current pot: ${gameState.pot}
            Your chips: ${player.chips}
            Current bet: $${gameState.currentBet}
            Amount to call: $${amountToCall}
            Minimum raise: $${gameState.minRaise}
            Last raise amount: $${gameState.lastRaiseAmount}
            
            What action do you take? Respond with exactly one of:
            - fold
            - call (costs $${amountToCall})
            - raise {amount} (must be at least $${gameState.currentBet + gameState.minRaise})`;

        const response = await client.path("/chat/completions").post({
            body: {
                messages: [{ role: "user", content: prompt }],
                model: player.model
            }
        });

        if (response.status === '200') {
            const responseText = response.body.choices[0].message.content.trim();
            console.log("AI decision:", responseText);

            // This often comes back as "call (costs $0)" or "raise $50" instead of "raise 50", or "I would raise 10".
            // Let's try and generously parse this

            if (responseText.includes('call')) {
                return 'call';
            }
            if (responseText.includes('raise')) {
                const parsedResponse = responseText.match(/raise \$?(\d+)/);
                if (parsedResponse) {
                    return `raise ${parsedResponse[1]}`;
                }
            }

            if (responseText.includes('fold')) {
                return 'fold';
            }


            return responseText
        }
        
        // Fallback to fold if API fails
        return 'fold'
    } catch (error) {
        console.log(`Error getting AI decision: ${error}`);
        return 'fold';
    }
}

function processDecision(decision, player) {
    const playerCurrentBet = gameState.playerBets[player.name] || 0;
    const amountToCall = gameState.currentBet - playerCurrentBet;

    if (decision.startsWith('raise')) {
        const raiseAmount = parseInt(decision.split(' ')[1]) || (gameState.currentBet + gameState.minRaise);
        const totalBet = Math.max(raiseAmount, gameState.currentBet + gameState.minRaise);
        const actualRaiseAmount = totalBet - playerCurrentBet;
        
        if (actualRaiseAmount <= player.chips) {
            gameState.lastRaiseAmount = totalBet - gameState.currentBet;
            gameState.currentBet = totalBet;
            gameState.pot += actualRaiseAmount;
            player.chips -= actualRaiseAmount;
            gameState.playerBets[player.name] = totalBet;
            addToLog(`${player.name} raises to $${totalBet} (adding $${actualRaiseAmount})`);
        } else {
            // If player can't afford raise, convert to call if possible
            if (player.chips >= amountToCall) {
                processDealerDecision('call', player);
            } else {
                processDealerDecision('fold', player);
            }
        }
    } else if (decision === 'call') {
        if (player.chips >= amountToCall) {
            gameState.pot += amountToCall;
            player.chips -= amountToCall;
            gameState.playerBets[player.name] = gameState.currentBet;
            addToLog(`${player.name} calls $${amountToCall}`);
        } else {
            processDealerDecision('fold', player);
        }
    } else {
        addToLog(`${player.name} folds`);
        gameState.foldedPlayers.push(player.name);
        // Could add player to a 'folded' list if we want to skip their turns
    }
}

function advanceRound() {
    switch (gameState.round) {
        case 'preflop':
            gameState.round = 'flop';
            gameState.currentBet = 0;
            gameState.playerBets = {};
            gameState.lastRaiseAmount = 0;
            gameState.communityCards = [
                gameState.deck.pop(),
                gameState.deck.pop(),
                gameState.deck.pop()
            ];
            addToLog(`Flop dealt: ${gameState.communityCards.join(', ')}`);
            break;
        case 'flop':
            gameState.round = 'turn';
            const turnCard = gameState.deck.pop();
            gameState.communityCards.push(turnCard);
            addToLog(`Turn dealt: ${turnCard}`);
            break;
        case 'turn':
            gameState.round = 'river';
            const riverCard = gameState.deck.pop();
            gameState.communityCards.push(riverCard);
            addToLog(`River dealt: ${riverCard}`);
            break;
        case 'river':
            endHand();
            gameState.round = 'preflop';
            gameState.communityCards = [];
            gameState.handNumber++;
            break;
    }
}

async function advanceGame() {
    const currentPlayer = gameState.players[gameState.currentPlayer];

    // Deal if starting new hand
    if (gameState.round === 'preflop' && gameState.communityCards.length === 0) {
        if (gameState.currentPlayer == 0) {
            gameState.deck = initializeDeck();
            addToLog(`Hand #${gameState.handNumber} begins. Cards dealt.`);
        }
        // Deal two cards to each player
        currentPlayer.cards = [gameState.deck.pop(), gameState.deck.pop()];   
    }

    // Get current player's decision

    if (!gameState.foldedPlayers.includes(currentPlayer.name)) {
        const decision = await getAIDecision(currentPlayer, gameState);
    
        // Process decision
        processDecision(decision, currentPlayer);
    }

    // If all players have folded, end the round
    if (gameState.foldedPlayers.length === gameState.players.length - 1) {
        endHand();
        gameState.round = 'preflop';
        gameState.communityCards = [];
        gameState.handNumber++;

        // Broadcast updated game state
        io.emit('gameUpdate', gameState);
        return
    }


    // Move to next player
    gameState.currentPlayer = (gameState.currentPlayer + 1) % gameState.players.length;

    // If round is complete, deal community cards
    if (gameState.currentPlayer === 0) {
        advanceRound();
    }

    // Broadcast updated game state
    io.emit('gameUpdate', gameState);
}

function endHand() {
    const hands = gameState.players
        .filter(player => !gameState.foldedPlayers.includes(player.name))
        .map(player => player.cards.concat(gameState.communityCards));
    const winningHand = compareHands(hands)[0]

    console.log('winningHand', winningHand, winningHand.getHandName());

    const winner = gameState.players.find(player => player.cards.concat(gameState.communityCards).join('') === winningHand.cardStrings.join(''));
    winner.chips += gameState.pot;
    addToLog(`${winner.name} wins pot of $${gameState.pot} with ${winningHand.getHandName()}`);
    gameState.pot = 0;
}

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log('Client connected');
    socket.emit('gameUpdate', gameState);
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Run game loop
async function gameLoop() {
    while (true) {
        await advanceGame();
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
}

gameLoop();