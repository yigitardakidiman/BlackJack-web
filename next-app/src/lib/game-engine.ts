import {
  BlackjackState,
  CardCode,
  GameOutcome,
  MultiplayerBlackjackData,
  MultiplayerPistiData,
  PistiState,
  Rank,
  Suit,
} from "./types";

const SUITS: Suit[] = ["Hearts", "Diamonds", "Clubs", "Spades"];
const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

export function createShuffledDeck(): CardCode[] {
  const deck: CardCode[] = [];
  for (const s of SUITS) {
    for (const r of RANKS) {
      deck.push(`${s}-${r}`);
    }
  }
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function parseCard(card: CardCode): { suit: Suit; rank: Rank } {
  const [suit, rank] = card.split("-") as [Suit, Rank];
  return { suit, rank };
}

export function getSuitSymbol(suit: Suit): string {
  switch (suit) {
    case "Hearts":
      return "♥";
    case "Diamonds":
      return "♦";
    case "Clubs":
      return "♣";
    case "Spades":
      return "♠";
  }
}

export function isRedSuit(suit: Suit): boolean {
  return suit === "Hearts" || suit === "Diamonds";
}

export function getPistiSpecialTier(card: CardCode): "gold" | "silver" | "normal" {
  const { suit, rank } = parseCard(card);
  if (rank === "J") return "gold";
  if (rank === "A" || (suit === "Diamonds" && rank === "10") || (suit === "Clubs" && rank === "2")) {
    return "silver";
  }
  return "normal";
}

// ==========================================
// BLACKJACK ENGINE
// ==========================================

export function calculateBlackjackScore(hand: CardCode[]): number {
  let score = 0;
  let aces = 0;
  for (const card of hand) {
    const { rank } = parseCard(card);
    if (rank === "A") {
      aces++;
      score += 11;
    } else if (rank === "K" || rank === "Q" || rank === "J") {
      score += 10;
    } else {
      score += parseInt(rank, 10);
    }
  }
  while (score > 21 && aces > 0) {
    score -= 10;
    aces--;
  }
  return score;
}

function drawFromDeck(deck: CardCode[]): CardCode {
  if (deck.length === 0) {
    deck.push(...createShuffledDeck());
  }
  return deck.shift()!;
}

export function startBlackjackGame(betAmount: number): BlackjackState {
  const deck = createShuffledDeck();
  const playerHand: CardCode[] = [drawFromDeck(deck), drawFromDeck(deck)];
  const dealerHand: CardCode[] = [drawFromDeck(deck), drawFromDeck(deck)];

  const playerScore = calculateBlackjackScore(playerHand);
  const dealerScore = calculateBlackjackScore(dealerHand);

  const card1Score = calculateBlackjackScore([playerHand[0]]);
  const card2Score = calculateBlackjackScore([playerHand[1]]);
  const canSplit = card1Score === card2Score;

  const state: BlackjackState = {
    id: `bj-${Date.now()}`,
    deck,
    playerHand,
    dealerHand,
    playerScore,
    dealerScore,
    currentBet: betAmount,
    hand1Bet: betAmount,
    hand2Bet: 0,
    isGameOver: false,
    gameMessage: "Hamlenizi seçin",
    chipChange: 0,
    canDoubleDown: true,
    canSplit,
    hasSplit: false,
    activeHand: 1,
    playerHand2: [],
    playerScore2: 0,
  };

  if (playerScore === 21) {
    state.isGameOver = true;
    state.canDoubleDown = false;
    state.canSplit = false;
    if (dealerScore === 21) {
      state.outcome = "push";
      state.gameMessage = "Berabere! İkinizde de Blackjack var.";
      state.chipChange = 0;
    } else {
      state.outcome = "win";
      state.gameMessage = "BLACKJACK! 3:2 Oranında Kazandınız!";
      state.chipChange = Math.floor(betAmount * 1.5);
    }
  }

  return state;
}

export function hitBlackjack(prev: BlackjackState): BlackjackState {
  if (prev.isGameOver) return prev;
  const state: BlackjackState = structuredClone(prev);
  state.canDoubleDown = false;
  state.canSplit = false;

  if (state.hasSplit && state.activeHand === 2) {
    state.playerHand2.push(drawFromDeck(state.deck));
    state.playerScore2 = calculateBlackjackScore(state.playerHand2);
    if (state.playerScore2 >= 21) {
      return standBlackjack(state);
    }
  } else {
    state.playerHand.push(drawFromDeck(state.deck));
    state.playerScore = calculateBlackjackScore(state.playerHand);
    if (state.playerScore > 21) {
      if (state.hasSplit) {
        state.activeHand = 2;
        state.gameMessage = "1. El 21'i geçti (Bust). Şimdi 2. Eli oynuyorsunuz.";
      } else {
        state.isGameOver = true;
        state.outcome = "loss";
        state.gameMessage = "21'i geçtiniz (Bust)! Kurpiyer kazandı.";
        state.chipChange = -state.currentBet;
      }
    } else if (state.playerScore === 21) {
      return standBlackjack(state);
    }
  }

  return state;
}

export function doubleDownBlackjack(prev: BlackjackState): BlackjackState {
  if (prev.isGameOver || !prev.canDoubleDown) return prev;
  const state: BlackjackState = structuredClone(prev);
  state.currentBet *= 2;
  state.hand1Bet = state.currentBet;
  state.canDoubleDown = false;
  state.canSplit = false;

  state.playerHand.push(drawFromDeck(state.deck));
  state.playerScore = calculateBlackjackScore(state.playerHand);

  if (state.playerScore > 21) {
    state.isGameOver = true;
    state.outcome = "loss";
    state.gameMessage = "Double Down sonrası 21'i geçtiniz (Bust)!";
    state.chipChange = -state.currentBet;
    return state;
  }

  return standBlackjack(state);
}

export function splitBlackjack(prev: BlackjackState): BlackjackState {
  if (prev.isGameOver || !prev.canSplit) return prev;
  const state: BlackjackState = structuredClone(prev);

  state.hasSplit = true;
  state.canSplit = false;
  state.canDoubleDown = false;
  state.hand2Bet = state.hand1Bet;
  state.currentBet = state.hand1Bet * 2;

  const secondCard = state.playerHand.pop()!;
  state.playerHand2 = [secondCard];

  state.playerHand.push(drawFromDeck(state.deck));
  state.playerHand2.push(drawFromDeck(state.deck));

  state.playerScore = calculateBlackjackScore(state.playerHand);
  state.playerScore2 = calculateBlackjackScore(state.playerHand2);
  state.activeHand = 1;
  state.gameMessage = "Eller bölündü! Önce 1. el için hamle yapın.";

  return state;
}

export function standBlackjack(prev: BlackjackState): BlackjackState {
  if (prev.isGameOver) return prev;
  const state: BlackjackState = structuredClone(prev);
  state.canDoubleDown = false;
  state.canSplit = false;

  if (state.hasSplit && state.activeHand === 1) {
    state.activeHand = 2;
    state.gameMessage = "Şimdi 2. El için hamle yapın.";
    return state;
  }

  // Dealer only draws if at least one hand is not busted
  const hand1Alive = state.playerScore <= 21;
  const hand2Alive = state.hasSplit && state.playerScore2 <= 21;

  if (hand1Alive || hand2Alive) {
    while (state.dealerScore < 17) {
      state.dealerHand.push(drawFromDeck(state.deck));
      state.dealerScore = calculateBlackjackScore(state.dealerHand);
    }
  }

  state.isGameOver = true;
  evaluateBlackjackHands(state);
  return state;
}

function evaluateSingleHand(playerScore: number, dealerScore: number, bet: number): number {
  if (playerScore > 21) return -bet;
  if (dealerScore > 21) return bet;
  if (playerScore > dealerScore) return bet;
  if (playerScore < dealerScore) return -bet;
  return 0;
}

function evaluateBlackjackHands(state: BlackjackState): void {
  if (state.hasSplit) {
    const c1 = evaluateSingleHand(state.playerScore, state.dealerScore, state.hand1Bet);
    const c2 = evaluateSingleHand(state.playerScore2, state.dealerScore, state.hand2Bet);
    state.chipChange = c1 + c2;
    const r1 = c1 > 0 ? "Kazandı" : c1 < 0 ? "Kaybetti" : "Berabere";
    const r2 = c2 > 0 ? "Kazandı" : c2 < 0 ? "Kaybetti" : "Berabere";
    state.gameMessage = `1. El: ${r1} | 2. El: ${r2}`;
    state.outcome = state.chipChange > 0 ? "win" : state.chipChange < 0 ? "loss" : "push";
  } else {
    state.chipChange = evaluateSingleHand(state.playerScore, state.dealerScore, state.currentBet);
    if (state.chipChange > 0) {
      state.outcome = "win";
      state.gameMessage =
        state.dealerScore > 21
          ? "Kurpiyer 21'i geçti! Kazandınız!"
          : "Tebrikler, Kurpiyeri yendiniz!";
    } else if (state.chipChange < 0) {
      state.outcome = "loss";
      state.gameMessage =
        state.playerScore > 21 ? "21'i geçtiniz (Bust)!" : "Kurpiyer kazandı.";
    } else {
      state.outcome = "push";
      state.gameMessage = "Berabere (Push)! Bahsiniz iade edildi.";
    }
  }
}

// ==========================================
// PİŞTİ ENGINE (SINGLE PLAYER)
// ==========================================

export function calculatePistiCardPoints(cards: CardCode[]): number {
  let score = 0;
  for (const card of cards) {
    if (card === "Diamonds-10") score += 3;
    else if (card === "Clubs-2") score += 2;
    else if (card.endsWith("-A") || card.endsWith("-J")) score += 1;
  }
  return score;
}

export function startPistiGame(betAmount: number): PistiState {
  const deck = createShuffledDeck();
  const board: CardCode[] = [];
  for (let i = 0; i < 4; i++) {
    board.push(deck.shift()!);
  }
  const playerHand: CardCode[] = [];
  const dealerHand: CardCode[] = [];
  for (let i = 0; i < 4; i++) playerHand.push(deck.shift()!);
  for (let i = 0; i < 4; i++) dealerHand.push(deck.shift()!);

  return {
    id: `pisti-${Date.now()}`,
    deck,
    board,
    playerHand,
    dealerHand,
    playerCaptured: [],
    dealerCaptured: [],
    playerScore: 0,
    dealerScore: 0,
    playerPistiCount: 0,
    dealerPistiCount: 0,
    lastCapturer: "",
    currentBet: betAmount,
    isGameOver: false,
    gameMessage: "Yere atmak istediğiniz kartı seçin",
    chipChange: 0,
    roundNumber: 1,
  };
}

export function chooseSmartDealerCard(hand: CardCode[], board: CardCode[]): CardCode {
  const topCard = board[board.length - 1];
  const topRank = topCard ? parseCard(topCard).rank : null;

  if (topRank) {
    // 1. Exact rank match (prefer non-J match to get Pişti or save Jack)
    const exactMatch = hand.find((c) => parseCard(c).rank === topRank && parseCard(c).rank !== "J");
    if (exactMatch) return exactMatch;

    // Double Jack Pişti opportunity
    if (board.length === 1 && topRank === "J") {
      const jack = hand.find((c) => parseCard(c).rank === "J");
      if (jack) return jack;
    }

    // 2. Use Jack if board has point cards or >= 3 cards
    const boardPoints = calculatePistiCardPoints(board);
    if (board.length >= 2 || boardPoints > 0) {
      const jack = hand.find((c) => parseCard(c).rank === "J");
      if (jack) return jack;
    }
  }

  // 3. Throw a non-Jack, low-point card
  const nonJack = hand.find((c) => parseCard(c).rank !== "J");
  return nonJack ?? hand[0];
}

export function applyPlayerPistiMove(
  prev: PistiState,
  card: CardCode
): {
  state: PistiState;
  captured: boolean;
  madePisti: boolean;
  pistiBonusCount: number;
  capturedCount: number;
} {
  if (prev.isGameOver || !prev.playerHand.includes(card)) {
    return {
      state: prev,
      captured: false,
      madePisti: false,
      pistiBonusCount: 0,
      capturedCount: 0,
    };
  }

  const state: PistiState = structuredClone(prev);
  state.playerHand = state.playerHand.filter((c) => c !== card);

  const pResult = processPistiMove(state.board, card);
  const madePisti = pResult.pistiBonusCount > 0;

  if (pResult.captured) {
    state.playerPistiCount += pResult.pistiBonusCount;
    state.playerCaptured.push(...pResult.capturedCards);
    state.lastCapturer = "Player";
    state.board = [];
    state.gameMessage = madePisti
      ? pResult.pistiBonusCount === 2
        ? "🔥 ÇİFT VALE PİŞTİ! (+20 Puan)"
        : "🔥 PİŞTİ YAPTINIZ! (+10 Puan)"
      : pResult.capturedCards.length === 2
      ? "🃏 Vale (J) tek kartı toplar (Vale ile yalnız J-J pişti olur)"
      : `✨ Yerdeki ${pResult.capturedCards.length} kartı topladınız!`;
  } else {
    state.board.push(card);
    state.gameMessage = "Bilgisayar hamlesini yapıyor...";
  }

  state.playerScore =
    calculatePistiCardPoints(state.playerCaptured) + state.playerPistiCount * 10;
  state.dealerScore =
    calculatePistiCardPoints(state.dealerCaptured) + state.dealerPistiCount * 10;

  state.lastAction = {
    playerCard: card,
    dealerCard: undefined,
    playerCapturedCards: pResult.captured ? [...pResult.capturedCards] : [],
    dealerCapturedCards: [],
    playerMadePisti: madePisti,
    dealerMadePisti: false,
  };

  return {
    state,
    captured: pResult.captured,
    madePisti,
    pistiBonusCount: pResult.pistiBonusCount,
    capturedCount: pResult.capturedCards.length,
  };
}

export function applyDealerPistiMove(prev: PistiState): {
  state: PistiState;
  dealerCard?: CardCode;
  captured: boolean;
  madePisti: boolean;
  capturedCount: number;
} {
  if (prev.isGameOver) {
    return { state: prev, captured: false, madePisti: false, capturedCount: 0 };
  }

  const state: PistiState = structuredClone(prev);
  let dealerCard: CardCode | undefined;
  let captured = false;
  let madePisti = false;
  let capturedCount = 0;

  if (state.dealerHand.length > 0) {
    dealerCard = chooseSmartDealerCard(state.dealerHand, state.board);
    state.dealerHand = state.dealerHand.filter((c) => c !== dealerCard);

    const dResult = processPistiMove(state.board, dealerCard);
    captured = dResult.captured;
    madePisti = dResult.pistiBonusCount > 0;
    capturedCount = dResult.capturedCards.length;

    if (dResult.captured) {
      state.dealerPistiCount += dResult.pistiBonusCount;
      state.dealerCaptured.push(...dResult.capturedCards);
      state.lastCapturer = "Dealer";
      state.board = [];
    } else {
      state.board.push(dealerCard);
    }

    if (state.lastAction) {
      state.lastAction.dealerCard = dealerCard;
      state.lastAction.dealerCapturedCards = dResult.captured
        ? [...dResult.capturedCards]
        : [];
      state.lastAction.dealerMadePisti = madePisti;
    }
  }

  // Check if hands are empty -> deal next round or finish game
  if (state.playerHand.length === 0 && state.dealerHand.length === 0) {
    if (state.deck.length >= 8) {
      for (let i = 0; i < 4; i++) state.playerHand.push(state.deck.shift()!);
      for (let i = 0; i < 4; i++) state.dealerHand.push(state.deck.shift()!);
      state.roundNumber += 1;
    } else {
      state.isGameOver = true;
      if (state.board.length > 0) {
        if (state.lastCapturer === "Player") {
          state.playerCaptured.push(...state.board);
          state.lastAction?.playerCapturedCards.push(...state.board);
        } else {
          state.dealerCaptured.push(...state.board);
          state.lastAction?.dealerCapturedCards.push(...state.board);
        }
        state.board = [];
      }
    }
  }

  // Update scores
  state.playerScore =
    calculatePistiCardPoints(state.playerCaptured) + state.playerPistiCount * 10;
  state.dealerScore =
    calculatePistiCardPoints(state.dealerCaptured) + state.dealerPistiCount * 10;

  if (state.isGameOver) {
    if (state.playerCaptured.length > state.dealerCaptured.length) {
      state.playerScore += 3;
    } else if (state.dealerCaptured.length > state.playerCaptured.length) {
      state.dealerScore += 3;
    }

    if (state.playerScore > state.dealerScore) {
      state.outcome = "win";
      state.chipChange = state.currentBet;
      state.gameMessage = `Tebrikler, ${state.playerScore} - ${state.dealerScore} kazandınız!`;
    } else if (state.dealerScore > state.playerScore) {
      state.outcome = "loss";
      state.chipChange = -state.currentBet;
      state.gameMessage = `Bilgisayar ${state.dealerScore} - ${state.playerScore} kazandı.`;
    } else {
      state.outcome = "push";
      state.chipChange = 0;
      state.gameMessage = `Oyun ${state.playerScore} - ${state.dealerScore} berabere bitti!`;
    }
  } else {
    // Keep player's Pişti celebration message if they made Pişti this turn!
    if (state.lastAction?.playerMadePisti && madePisti) {
      state.gameMessage = "🔥 İnanılmaz! Hem siz hem bilgisayar PİŞTİ yaptınız!";
    } else if (state.lastAction?.playerMadePisti) {
      state.gameMessage = "🔥 PİŞTİ YAPTINIZ! (+10 Puan Eklendi)";
    } else if (madePisti) {
      state.gameMessage = "🤖 Bilgisayar PİŞTİ yaptı! (+10 Puan)";
    } else if ((state.lastAction?.playerCapturedCards.length ?? 0) > 0) {
      state.gameMessage =
        state.lastAction?.playerCapturedCards.length === 2
          ? "🃏 Vale (J) tek kartı topladı (Yalnız J-J pişti olur)"
          : `✨ Yerdeki ${state.lastAction?.playerCapturedCards.length} kartı topladınız!`;
    } else if (capturedCount > 0) {
      state.gameMessage = `🤖 Bilgisayar yerdeki ${capturedCount} kartı topladı.`;
    } else {
      state.gameMessage = `${state.roundNumber}. El — Hamlenizi yapın`;
    }
  }

  return { state, dealerCard, captured, madePisti, capturedCount };
}

export function playPistiCard(prev: PistiState, card: CardCode): PistiState {
  const afterPlayer = applyPlayerPistiMove(prev, card);
  const afterDealer = applyDealerPistiMove(afterPlayer.state);
  return afterDealer.state;
}

export function processPistiMove(
  board: CardCode[],
  playedCard: CardCode
): {
  captured: boolean;
  pistiBonusCount: number;
  capturedCards: CardCode[];
} {
  const topCard = board[board.length - 1];
  if (!topCard) {
    return { captured: false, pistiBonusCount: 0, capturedCards: [] };
  }

  const playedRank = parseCard(playedCard).rank;
  const topRank = parseCard(topCard).rank;

  if (playedRank === topRank || playedRank === "J") {
    let pistiBonusCount = 0;
    if (board.length === 1) {
      if (playedRank === "J" && topRank === "J") {
        pistiBonusCount = 2; // Çift Vale Pişti (20 puan)
      } else if (playedRank !== "J") {
        pistiBonusCount = 1; // Normal Pişti (10 puan)
      }
    }
    return {
      captured: true,
      pistiBonusCount,
      capturedCards: [...board, playedCard],
    };
  }

  return { captured: false, pistiBonusCount: 0, capturedCards: [] };
}

// ==========================================
// MULTIPLAYER ENGINES
// ==========================================

export function createMultiplayerBlackjackData(
  players: { id: string; nickname: string; avatar: string }[],
  betAmount: number
): MultiplayerBlackjackData {
  const deck = createShuffledDeck();
  const dealerHand: CardCode[] = [drawFromDeck(deck), drawFromDeck(deck)];

  const seats = players.map((p) => {
    const hand: CardCode[] = [drawFromDeck(deck), drawFromDeck(deck)];
    const score = calculateBlackjackScore(hand);
    const isBj = score === 21;
    return {
      playerId: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
      bet: betAmount,
      hand,
      score,
      status: (isBj ? "blackjack" : "playing") as
        | "playing"
        | "blackjack"
        | "stood"
        | "busted"
        | "done",
      chipChange: 0,
    };
  });

  let activeSeatIndex = seats.findIndex((s) => s.status === "playing");
  let dealerRevealed = false;

  const data: MultiplayerBlackjackData = {
    deck,
    dealerHand,
    dealerScore: calculateBlackjackScore(dealerHand),
    seats,
    activeSeatIndex: activeSeatIndex === -1 ? 0 : activeSeatIndex,
    dealerRevealed,
  };

  if (activeSeatIndex === -1) {
    finalizeMultiplayerBlackjack(data);
  }

  return data;
}

export function finalizeMultiplayerBlackjack(data: MultiplayerBlackjackData): void {
  data.dealerRevealed = true;
  const anySeatAlive = data.seats.some(
    (s) => s.status === "stood" || s.status === "blackjack"
  );

  if (anySeatAlive) {
    while (data.dealerScore < 17) {
      data.dealerHand.push(drawFromDeck(data.deck));
      data.dealerScore = calculateBlackjackScore(data.dealerHand);
    }
  }

  for (const seat of data.seats) {
    if (seat.status === "blackjack") {
      if (data.dealerScore === 21 && data.dealerHand.length === 2) {
        seat.outcome = "push";
        seat.chipChange = 0;
        seat.resultText = "Berabere (Blackjack)";
      } else {
        seat.outcome = "win";
        seat.chipChange = Math.floor(seat.bet * 1.5);
        seat.resultText = "Blackjack! (+1.5x)";
      }
    } else if (seat.status === "busted" || seat.score > 21) {
      seat.outcome = "loss";
      seat.chipChange = -seat.bet;
      seat.resultText = "Bust (21'i Geçti)";
    } else {
      const diff = evaluateSingleHand(seat.score, data.dealerScore, seat.bet);
      seat.chipChange = diff;
      if (diff > 0) {
        seat.outcome = "win";
        seat.resultText = "Kazandı!";
      } else if (diff < 0) {
        seat.outcome = "loss";
        seat.resultText = "Kaybetti";
      } else {
        seat.outcome = "push";
        seat.resultText = "Berabere";
      }
    }
    seat.status = "done";
  }
}

export function createMultiplayerPistiData(
  p1: { id: string; nickname: string; avatar: string },
  p2: { id: string; nickname: string; avatar: string }
): MultiplayerPistiData {
  const deck = createShuffledDeck();
  const board: CardCode[] = [];
  for (let i = 0; i < 4; i++) board.push(deck.shift()!);

  const hand1: CardCode[] = [];
  const hand2: CardCode[] = [];
  for (let i = 0; i < 4; i++) hand1.push(deck.shift()!);
  for (let i = 0; i < 4; i++) hand2.push(deck.shift()!);

  return {
    mode: "1v1",
    deck,
    board,
    players: [
      {
        playerId: p1.id,
        nickname: p1.nickname,
        avatar: p1.avatar,
        hand: hand1,
        captured: [],
        pistiCount: 0,
        score: 0,
        chipChange: 0,
      },
      {
        playerId: p2.id,
        nickname: p2.nickname,
        avatar: p2.avatar,
        hand: hand2,
        captured: [],
        pistiCount: 0,
        score: 0,
        chipChange: 0,
      },
    ],
    turnPlayerId: p1.id,
    lastCapturerId: "",
    roundNumber: 1,
  };
}

export function createMultiplayerPisti2v2Data(
  roomPlayers: {
    id: string;
    nickname: string;
    avatar: string;
    team?: "A" | "B";
    isBot?: boolean;
  }[]
): MultiplayerPistiData {
  const deck = createShuffledDeck();
  const board: CardCode[] = [];
  for (let i = 0; i < 4; i++) board.push(deck.shift()!);

  const teamA = roomPlayers.filter((p) => p.team === "A");
  const teamB = roomPlayers.filter((p) => p.team === "B");
  const unassigned = roomPlayers.filter((p) => p.team !== "A" && p.team !== "B");

  for (const p of unassigned) {
    if (teamA.length < 2) {
      p.team = "A";
      teamA.push(p);
    } else {
      p.team = "B";
      teamB.push(p);
    }
  }

  // Ensure human players come before bots within each team
  teamA.sort((a, b) => Number(Boolean(a.isBot)) - Number(Boolean(b.isBot)));
  teamB.sort((a, b) => Number(Boolean(a.isBot)) - Number(Boolean(b.isBot)));

  // Alternating seating: A1 -> B1 -> A2 -> B2 (teammates sit opposite each other)
  const ordered = [teamA[0], teamB[0], teamA[1], teamB[1]].filter(Boolean);

  const players = ordered.map((p, idx) => {
    const hand: CardCode[] = [];
    for (let i = 0; i < 4; i++) hand.push(deck.shift()!);
    return {
      playerId: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
      team: (p.team || (idx % 2 === 0 ? "A" : "B")) as "A" | "B",
      isBot: Boolean(p.isBot),
      hand,
      captured: [],
      pistiCount: 0,
      score: 0,
      chipChange: 0,
    };
  });

  const firstHuman = players.find((p) => !p.isBot);

  return {
    mode: "2v2",
    deck,
    board,
    players,
    turnPlayerId: firstHuman?.playerId || players[0]?.playerId || "",
    lastCapturerId: "",
    roundNumber: 1,
    teamAScore: 0,
    teamBScore: 0,
    teamAPistiCount: 0,
    teamBPistiCount: 0,
    teamACardCount: 0,
    teamBCardCount: 0,
  };
}


