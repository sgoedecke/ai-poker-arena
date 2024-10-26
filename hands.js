// Card values mapping
const VALUES = {
'2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
'9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};


// Hand rankings from highest to lowest
const HAND_RANKINGS = {
ROYAL_FLUSH: 10,
STRAIGHT_FLUSH: 9,
FOUR_OF_A_KIND: 8,
FULL_HOUSE: 7,
FLUSH: 6,
STRAIGHT: 5,
THREE_OF_A_KIND: 4,
TWO_PAIR: 3,
ONE_PAIR: 2,
HIGH_CARD: 1
};

function parseCard(cardString) {
    // Handle 10 as special case
    if (cardString.length === 3) {
        return {
        value: cardString.slice(0, 2),
        suit: cardString[2]
        };
    }
    return {
        value: cardString[0],
        suit: cardString[1]
    };
}

class PokerHand {
    constructor(cardStrings) {
        this.cardStrings = cardStrings;
        this.cards = cardStrings.map(parseCard);
        this.sortedValues = this.cards.map(card => VALUES[card.value]).sort((a, b) => b - a);
        this.suits = this.cards.map(card => card.suit);
        this.valueCounts = this.getValueCounts();
        this.score = this.evaluateHand();
    }

    getValueCounts() {
        return this.cards.reduce((counts, card) => {
        counts[VALUES[card.value]] = (counts[VALUES[card.value]] || 0) + 1;
        return counts;
        }, {});
    }

    hasFlush() {
        return this.suits.every(suit => suit === this.suits[0]);
    }

    hasStraight() {
        const values = [...new Set(this.sortedValues)].sort((a, b) => b - a);
        // Handle Ace-low straight (A,2,3,4,5)
        if (values[0] === 14 && values[1] === 5) {
        values.shift();
        values.push(1);
        }
        for (let i = 0; i < values.length - 1; i++) {
        if (values[i] - values[i + 1] !== 1) return false;
        }
        return true;
    }

    evaluateHand() {
        const values = Object.values(this.valueCounts).sort((a, b) => b - a);
        const isFlush = this.hasFlush();
        const isStraight = this.hasStraight();

        // Royal Flush
        if (isFlush && isStraight && this.sortedValues[0] === 14 && this.sortedValues[4] === 10) {
        return { rank: HAND_RANKINGS.ROYAL_FLUSH, value: this.sortedValues };
        }

        // Straight Flush
        if (isFlush && isStraight) {
        return { rank: HAND_RANKINGS.STRAIGHT_FLUSH, value: this.sortedValues };
        }

        // Four of a Kind
        if (values[0] === 4) {
        const quadValue = Number(Object.keys(this.valueCounts).find(key => this.valueCounts[key] === 4));
        const kicker = this.sortedValues.find(value => value !== quadValue);
        return { rank: HAND_RANKINGS.FOUR_OF_A_KIND, value: [quadValue, kicker] };
        }

        // Full House
        if (values[0] === 3 && values[1] === 2) {
        const tripValue = Number(Object.keys(this.valueCounts).find(key => this.valueCounts[key] === 3));
        const pairValue = Number(Object.keys(this.valueCounts).find(key => this.valueCounts[key] === 2));
        return { rank: HAND_RANKINGS.FULL_HOUSE, value: [tripValue, pairValue] };
        }

        // Flush
        if (isFlush) {
        return { rank: HAND_RANKINGS.FLUSH, value: this.sortedValues };
        }

        // Straight
        if (isStraight) {
        return { rank: HAND_RANKINGS.STRAIGHT, value: this.sortedValues };
        }

        // Three of a Kind
        if (values[0] === 3) {
        const tripValue = Number(Object.keys(this.valueCounts).find(key => this.valueCounts[key] === 3));
        const kickers = this.sortedValues.filter(value => value !== tripValue);
        return { rank: HAND_RANKINGS.THREE_OF_A_KIND, value: [tripValue, ...kickers] };
        }

        // Two Pair
        if (values[0] === 2 && values[1] === 2) {
        const pairs = Object.entries(this.valueCounts)
            .filter(([_, count]) => count === 2)
            .map(([value, _]) => Number(value))
            .sort((a, b) => b - a);
        const kicker = this.sortedValues.find(value => !pairs.includes(value));
        return { rank: HAND_RANKINGS.TWO_PAIR, value: [...pairs, kicker] };
        }

        // One Pair
        if (values[0] === 2) {
        const pairValue = Number(Object.keys(this.valueCounts).find(key => this.valueCounts[key] === 2));
        const kickers = this.sortedValues.filter(value => value !== pairValue);
        return { rank: HAND_RANKINGS.ONE_PAIR, value: [pairValue, ...kickers] };
        }

        // High Card
        return { rank: HAND_RANKINGS.HIGH_CARD, value: this.sortedValues };
    }

    getHandName() {
        const rankNames = {
            10: 'Royal Flush',
            9: 'Straight Flush',
            8: 'Four of a Kind',
            7: 'Full House',
            6: 'Flush',
            5: 'Straight',
            4: 'Three of a Kind',
            3: 'Two Pair',
            2: 'One Pair',
            1: 'High Card'
            };
            return rankNames[this.score.rank];
        }
    }

function compareHands(hands) {
    const evaluatedHands = hands.map(hand => new PokerHand(hand));

    // Sort hands by rank first, then by value arrays
    return evaluatedHands.sort((a, b) => {
        if (a.score.rank !== b.score.rank) {
        return b.score.rank - a.score.rank;
        }
        
        // Compare value arrays element by element
        for (let i = 0; i < a.score.value.length; i++) {
        if (a.score.value[i] !== b.score.value[i]) {
            return b.score.value[i] - a.score.value[i];
        }
        }
        
        return 0; // Hands are equal
    });
}

module.exports = { compareHands };