export type Suit = "Hearts" | "Diamonds" | "Clubs" | "Spades";
export type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";
export type CardCode = `${Suit}-${Rank}`;

export type GameOutcome = "win" | "loss" | "push";

export interface GameHistoryRecord {
  id: string;
  gameType:
    | "Blackjack"
    | "Blackjack (Online)"
    | "Pişti"
    | "Pişti (Online)"
    | "Pişti 2v2 (Online)";
  betAmount: number;
  chipChange: number;
  outcome: GameOutcome;
  resultText: string;
  playedAt: string;
  opponentName?: string;
}

export interface PlayerProfile {
  id: string;
  nickname: string;
  avatar: string;
  chips: number;
  wins: number;
  losses: number;
  draws: number;
  lastDailyBonusAt?: number;
  history: GameHistoryRecord[];
  updatedAt: number;
}

export interface LeaderboardEntry {
  id: string;
  nickname: string;
  avatar: string;
  chips: number;
  wins: number;
  losses: number;
  draws: number;
  lastDailyBonusAt?: number;
  updatedAt: number;
}

// ==========================================
// SINGLE PLAYER BLACKJACK
// ==========================================
export interface BlackjackState {
  id: string;
  deck: CardCode[];
  playerHand: CardCode[];
  dealerHand: CardCode[];
  playerScore: number;
  dealerScore: number;
  currentBet: number;
  isGameOver: boolean;
  outcome?: GameOutcome;
  gameMessage: string;
  chipChange: number;
  canDoubleDown: boolean;
  canSplit: boolean;
  hasSplit: boolean;
  activeHand: 1 | 2;
  playerHand2: CardCode[];
  playerScore2: number;
  hand1Bet: number;
  hand2Bet: number;
}

// ==========================================
// SINGLE PLAYER PİŞTİ
// ==========================================
export interface PistiState {
  id: string;
  deck: CardCode[];
  board: CardCode[];
  playerHand: CardCode[];
  dealerHand: CardCode[];
  playerCaptured: CardCode[];
  dealerCaptured: CardCode[];
  playerScore: number;
  dealerScore: number;
  playerPistiCount: number;
  dealerPistiCount: number;
  lastCapturer: "Player" | "Dealer" | "";
  currentBet: number;
  isGameOver: boolean;
  outcome?: GameOutcome;
  gameMessage: string;
  chipChange: number;
  roundNumber: number;
  lastAction?: {
    playerCard?: CardCode;
    dealerCard?: CardCode;
    playerCapturedCards: CardCode[];
    dealerCapturedCards: CardCode[];
    playerMadePisti: boolean;
    dealerMadePisti: boolean;
  };
}

// ==========================================
// MULTIPLAYER ROOMS (ONLINE)
// ==========================================
export type RoomGameType = "blackjack" | "pisti" | "pisti_2v2";
export type RoomStatus = "waiting" | "playing" | "finished";

export interface BlackjackSeat {
  playerId: string;
  nickname: string;
  avatar: string;
  bet: number;
  hand: CardCode[];
  score: number;
  status: "betting" | "playing" | "stood" | "busted" | "blackjack" | "done";
  outcome?: GameOutcome;
  chipChange: number;
  resultText?: string;
}

export interface MultiplayerBlackjackData {
  deck: CardCode[];
  dealerHand: CardCode[];
  dealerScore: number;
  seats: BlackjackSeat[];
  activeSeatIndex: number;
  dealerRevealed: boolean;
}

export interface MultiplayerPistiPlayer {
  playerId: string;
  nickname: string;
  avatar: string;
  team?: "A" | "B";
  isBot?: boolean;
  hand: CardCode[];
  captured: CardCode[];
  pistiCount: number;
  score: number;
  chipChange: number;
  outcome?: GameOutcome;
}

export interface MultiplayerPistiData {
  mode?: "1v1" | "2v2";
  deck: CardCode[];
  board: CardCode[];
  players: MultiplayerPistiPlayer[];
  turnPlayerId: string;
  lastCapturerId: string;
  roundNumber: number;
  teamAScore?: number;
  teamBScore?: number;
  teamAPistiCount?: number;
  teamBPistiCount?: number;
  teamACardCount?: number;
  teamBCardCount?: number;
  lastMove?: {
    byPlayerId: string;
    byNickname: string;
    byTeam?: "A" | "B";
    card: CardCode;
    capturedCount: number;
    madePisti: boolean;
    timestamp: number;
  };
}

export interface OnlineRoom {
  code: string;
  name: string;
  gameType: RoomGameType;
  hostId: string;
  hostName: string;
  betAmount: number;
  status: RoomStatus;
  createdAt: number;
  updatedAt: number;
  maxPlayers: number;
  players: {
    id: string;
    nickname: string;
    avatar: string;
    chips: number;
    team?: "A" | "B";
    isBot?: boolean;
  }[];
  blackjack?: MultiplayerBlackjackData;
  pisti?: MultiplayerPistiData;
  winnerMessage?: string;
}

