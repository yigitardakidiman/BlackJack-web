"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Coins,
  Crown,
  Dices,
  History,
  LogOut,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Spade,
  Trophy,
  User,
  Users,
  Copy,
  Check,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import {
  BlackjackState,
  CardCode,
  GameOutcome,
  LeaderboardEntry,
  OnlineRoom,
  PistiState,
  PlayerProfile,
  RoomGameType,
} from "@/lib/types";
import {
  applyDealerPistiMove,
  applyPlayerPistiMove,
  calculateBlackjackScore,
  chooseSmartDealerCard,
  doubleDownBlackjack,
  hitBlackjack,
  processPistiMove,
  splitBlackjack,
  standBlackjack,
  startBlackjackGame,
  startPistiGame,
} from "@/lib/game-engine";
import { PlayingCard } from "@/components/PlayingCard";

type ActiveTab = "blackjack" | "pisti" | "online" | "leaderboard" | "profile";

const AVATARS = ["🎰", "👑", "♠️", "🃏", "💎", "🦁", "🔥", "🎩"];
const QUICK_BETS = [10, 50, 100, 250, 500];

interface PistiTurnAnim {
  phase: "player-throw" | "player-sweep" | "dealer-throw" | "dealer-sweep";
  hiddenPlayerCard: CardCode;
  reduceDealerHand: boolean;
  displayBoard: CardCode[];
  boardAnimClass: string;
  bannerText?: string;
}

interface OnlinePistiAnim {
  card: CardCode;
  animClass: string;
  bannerText?: string;
}

const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));

function createDefaultProfile(isGuestTab = false): PlayerProfile {
  const randomSuffix = Math.floor(100 + Math.random() * 900);
  return {
    id: `plr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    nickname: isGuestTab ? `Misafir_${randomSuffix}` : `Oyuncu_${randomSuffix}`,
    avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
    chips: 1000,
    wins: 0,
    losses: 0,
    draws: 0,
    history: [],
    updatedAt: Date.now(),
  };
}

export default function RoyalCasinoApp() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("blackjack");
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editNickname, setEditNickname] = useState("");
  const [editAvatar, setEditAvatar] = useState("🎰");

  // Betting input
  const [betInput, setBetInput] = useState<number>(50);
  const [toast, setToast] = useState<string | null>(null);

  // Single player Blackjack states + Dealer sequential animation
  const [bjGame, setBjGame] = useState<BlackjackState | null>(null);
  const [bjLockedBet, setBjLockedBet] = useState<number>(0);
  const [bjVisibleDealerCount, setBjVisibleDealerCount] = useState<number>(2);
  const [bjDealerDrawing, setBjDealerDrawing] = useState<boolean>(false);

  // Single player Pişti states + Turn choreography animation
  const [pistiGame, setPistiGame] = useState<PistiState | null>(null);
  const [pistiLockedBet, setPistiLockedBet] = useState<number>(0);
  const [pistiAnim, setPistiAnim] = useState<PistiTurnAnim | null>(null);
  const [pistiRoundDealKey, setPistiRoundDealKey] = useState<number>(1);

  // Online Multiplayer & Leaderboard states
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [rooms, setRooms] = useState<OnlineRoom[]>([]);
  const [currentRoom, setCurrentRoom] = useState<OnlineRoom | null>(null);
  const activeRoomCodeRef = useRef<string | null>(null);
  const isSessionGuestRef = useRef<boolean>(false);

  // Online Pişti animation state
  const [onlinePistiAnim, setOnlinePistiAnim] =
    useState<OnlinePistiAnim | null>(null);
  const lastOnlineMoveTsRef = useRef<number>(0);

  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [newRoomGameType, setNewRoomGameType] = useState<RoomGameType>("pisti");
  const [newRoomBet, setNewRoomBet] = useState<number>(50);
  const [newRoomName, setNewRoomName] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [settledRoomKey, setSettledRoomKey] = useState<string>("");

  const bcRef = useRef<BroadcastChannel | null>(null);

  const notifyToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Load profile from storage (or sessionStorage if opened via ?join= CODE for 2-tab testing)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinParam = params.get("join")?.toUpperCase();

    let loaded: PlayerProfile | null = null;

    if (
      joinParam ||
      sessionStorage.getItem("royal_casino_is_guest_tab") === "1"
    ) {
      isSessionGuestRef.current = true;
      sessionStorage.setItem("royal_casino_is_guest_tab", "1");
      const sessionRaw = sessionStorage.getItem("royal_casino_session_profile");
      if (sessionRaw) {
        try {
          loaded = JSON.parse(sessionRaw);
        } catch {}
      }
      if (!loaded) {
        loaded = createDefaultProfile(true);
        sessionStorage.setItem(
          "royal_casino_session_profile",
          JSON.stringify(loaded)
        );
      }
    } else {
      const localRaw = localStorage.getItem("royal_casino_profile_v1");
      if (localRaw) {
        try {
          loaded = JSON.parse(localRaw);
        } catch {}
      }
      if (!loaded) {
        loaded = createDefaultProfile(false);
        localStorage.setItem("royal_casino_profile_v1", JSON.stringify(loaded));
        setShowProfileModal(true);
      }
    }

    setProfile(loaded);
    setEditNickname(loaded.nickname);
    setEditAvatar(loaded.avatar);

    if (joinParam && loaded) {
      setActiveTab("online");
      setRoomCodeInput(joinParam);
      window.history.replaceState({}, "", window.location.pathname);
      fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "joinRoom",
          code: joinParam,
          player: {
            id: loaded.id,
            nickname: loaded.nickname,
            avatar: loaded.avatar,
            chips: loaded.chips,
          },
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.ok && data.room) {
            activeRoomCodeRef.current = data.room.code;
            setCurrentRoom(data.room);
            bcRef.current?.postMessage({ ts: Date.now() });
          }
        })
        .catch(() => {});
    }
  }, []);

  const profileRef = useRef<PlayerProfile | null>(null);

  const persistLocalProfile = useCallback((next: PlayerProfile) => {
    profileRef.current = next;
    setProfile(next);
    if (isSessionGuestRef.current) {
      sessionStorage.setItem(
        "royal_casino_session_profile",
        JSON.stringify(next)
      );
    } else {
      localStorage.setItem("royal_casino_profile_v1", JSON.stringify(next));
    }
  }, []);

  const saveProfile = useCallback(
    (next: PlayerProfile) => {
      persistLocalProfile(next);
      fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "syncProfile", profile: next }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.leaderboard) setLeaderboard(d.leaderboard);
          if (d.me && (d.me.adminUpdatedAt ?? 0) > (next.adminUpdatedAt ?? 0)) {
            persistLocalProfile({
              ...next,
              chips: d.me.chips,
              wins: d.me.wins,
              losses: d.me.losses,
              draws: d.me.draws,
              lastDailyBonusAt: d.me.lastDailyBonusAt,
              adminUpdatedAt: d.me.adminUpdatedAt,
            });
          }
        })
        .catch(() => {});
    },
    [persistLocalProfile]
  );

  const commitGameResultToServer = useCallback(
    (nextLocal: PlayerProfile, netChipChange: number, outcome: GameOutcome) => {
      persistLocalProfile(nextLocal);
      if (netChipChange > 0) {
        notifyToast(
          `🎉 +${netChipChange} Çip kazandınız! Yeni Bakiyeniz: ${nextLocal.chips.toLocaleString("tr-TR")} Çip`
        );
      }
      fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "recordGameResult",
          playerId: nextLocal.id,
          nickname: nextLocal.nickname,
          avatar: nextLocal.avatar,
          chipChange: netChipChange,
          outcome,
          newChips: nextLocal.chips,
          wins: nextLocal.wins,
          losses: nextLocal.losses,
          draws: nextLocal.draws,
          clientAdminUpdatedAt: nextLocal.adminUpdatedAt,
        }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.leaderboard) setLeaderboard(d.leaderboard);
          if (d.me) {
            persistLocalProfile({
              ...nextLocal,
              chips: d.me.chips,
              wins: d.me.wins,
              losses: d.me.losses,
              draws: d.me.draws,
              lastDailyBonusAt: d.me.lastDailyBonusAt,
              adminUpdatedAt: d.me.adminUpdatedAt,
            });
          }
        })
        .catch(() => {});
    },
    [persistLocalProfile]
  );

  const recordGameFinished = useCallback(
    (
      gameType:
        | "Blackjack"
        | "Blackjack (Online)"
        | "Pişti"
        | "Pişti (Online)"
        | "Pişti 2v2 (Online)",
      betAmount: number,
      chipDeltaFromInitialLock: number,
      netChipChange: number,
      outcome: GameOutcome,
      resultText: string,
      opponentName?: string
    ) => {
      const current = profileRef.current || profile;
      if (!current) return;
      const next: PlayerProfile = {
        ...current,
        chips: Math.max(0, current.chips + chipDeltaFromInitialLock),
        wins: current.wins + (outcome === "win" ? 1 : 0),
        losses: current.losses + (outcome === "loss" ? 1 : 0),
        draws: current.draws + (outcome === "push" ? 1 : 0),
        updatedAt: Date.now(),
        history: [
          {
            id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            gameType,
            betAmount,
            chipChange: netChipChange,
            outcome,
            resultText,
            playedAt: new Date().toLocaleString("tr-TR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }),
            opponentName,
          },
          ...current.history,
        ].slice(0, 25),
      };
      commitGameResultToServer(next, netChipChange, outcome);
    },
    [profile, commitGameResultToServer]
  );

  // Sync with server & BroadcastChannel
  const fetchServerData = useCallback(async () => {
    try {
      const currentProfile = profileRef.current;
      const requestedCode = activeRoomCodeRef.current;
      const params = new URLSearchParams();
      if (requestedCode) params.set("roomCode", requestedCode);
      if (currentProfile?.id) params.set("playerId", currentProfile.id);
      const qs = params.toString();

      const res = await fetch(`/api/game${qs ? `?${qs}` : ""}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.leaderboard) setLeaderboard(data.leaderboard);
      if (data.rooms) setRooms(data.rooms);

      // Only overwrite local chips if Admin modified the player's balance on the server,
      // or if server restarted and lost the player entry, re-sync local profile to server.
      if (currentProfile) {
        if (!data.me) {
          fetch("/api/game", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "syncProfile",
              profile: currentProfile,
            }),
          }).catch(() => {});
        } else if (
          (data.me.adminUpdatedAt ?? 0) > (currentProfile.adminUpdatedAt ?? 0)
        ) {
          persistLocalProfile({
            ...currentProfile,
            chips: data.me.chips,
            wins: data.me.wins,
            losses: data.me.losses,
            draws: data.me.draws,
            lastDailyBonusAt: data.me.lastDailyBonusAt,
            adminUpdatedAt: data.me.adminUpdatedAt,
          });
          notifyToast(
            `🔔 Bakiyeniz yönetici tarafından güncellendi: ${data.me.chips.toLocaleString("tr-TR")} Çip`
          );
        }
      }

      if (activeRoomCodeRef.current !== requestedCode) {
        return;
      }

      if (requestedCode) {
        const serverRoom: OnlineRoom | null = data.room ?? null;
        const stillMember =
          serverRoom &&
          currentProfile &&
          serverRoom.players.some((p) => p.id === currentProfile.id);

        if (serverRoom && stillMember) {
          setCurrentRoom(serverRoom);
        } else {
          activeRoomCodeRef.current = null;
          setCurrentRoom(null);
        }
      }
    } catch {}
  }, [persistLocalProfile]);

  const syncedInitialProfileRef = useRef(false);
  useEffect(() => {
    if (!profile || syncedInitialProfileRef.current) return;
    profileRef.current = profile;
    syncedInitialProfileRef.current = true;
    fetch("/api/game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "syncProfile", profile }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.leaderboard) setLeaderboard(d.leaderboard);
        if (
          d.me &&
          (d.me.adminUpdatedAt ?? 0) > (profile.adminUpdatedAt ?? 0)
        ) {
          persistLocalProfile({
            ...profile,
            chips: d.me.chips,
            wins: d.me.wins,
            losses: d.me.losses,
            draws: d.me.draws,
            lastDailyBonusAt: d.me.lastDailyBonusAt,
            adminUpdatedAt: d.me.adminUpdatedAt,
          });
        }
      })
      .catch(() => {});
  }, [profile, persistLocalProfile]);

  useEffect(() => {
    fetchServerData();
    const interval = setInterval(
      fetchServerData,
      activeTab === "online" || currentRoom ? 1200 : 4000
    );
    return () => clearInterval(interval);
  }, [fetchServerData, activeTab, currentRoom]);

  useEffect(() => {
    if (typeof window === "undefined" || !("BroadcastChannel" in window))
      return;
    const bc = new BroadcastChannel("royal_casino_realtime");
    bcRef.current = bc;
    bc.onmessage = () => {
      fetchServerData();
    };
    return () => bc.close();
  }, [fetchServerData]);

  const pingRealtime = () => {
    bcRef.current?.postMessage({ ts: Date.now() });
  };

  // Detect new move in Online Pişti to trigger throw/sweep animation
  useEffect(() => {
    const move = currentRoom?.pisti?.lastMove;
    if (!move || !profile) return;
    if (move.timestamp <= lastOnlineMoveTsRef.current) return;
    lastOnlineMoveTsRef.current = move.timestamp;

    const isMine = move.byPlayerId === profile.id;
    if (move.capturedCount > 0) {
      setOnlinePistiAnim({
        card: move.card,
        animClass: isMine ? "animate-sweep-player" : "animate-sweep-dealer",
        bannerText: move.madePisti
          ? `🔥 ${move.byNickname} PİŞTİ YAPTI!`
          : `✨ ${move.byNickname} ${move.capturedCount} Kart Topladı!`,
      });
      const t = setTimeout(() => setOnlinePistiAnim(null), 700);
      return () => clearTimeout(t);
    } else {
      setOnlinePistiAnim({
        card: move.card,
        animClass: isMine ? "animate-throw-player" : "animate-throw-dealer",
      });
      const t = setTimeout(() => setOnlinePistiAnim(null), 460);
      return () => clearTimeout(t);
    }
  }, [currentRoom?.pisti?.lastMove, profile]);

  // Settle online room results once when room status transitions to "finished"
  useEffect(() => {
    if (!currentRoom || currentRoom.status !== "finished" || !profile) return;
    const settleKey = `${currentRoom.code}-${currentRoom.updatedAt}`;
    if (settledRoomKey === settleKey) return;

    if (currentRoom.gameType === "blackjack" && currentRoom.blackjack) {
      const seat = currentRoom.blackjack.seats.find(
        (s) => s.playerId === profile.id
      );
      if (seat && seat.outcome) {
        setSettledRoomKey(settleKey);
        recordGameFinished(
          "Blackjack (Online)",
          seat.bet,
          seat.chipChange,
          seat.chipChange,
          seat.outcome,
          seat.resultText || "Tamamlandı",
          "Online Masa"
        );
      }
    } else if (
      (currentRoom.gameType === "pisti" ||
        currentRoom.gameType === "pisti_2v2") &&
      currentRoom.pisti
    ) {
      const me = currentRoom.pisti.players.find(
        (p) => p.playerId === profile.id
      );
      const opp = currentRoom.pisti.players.find(
        (p) => p.playerId !== profile.id
      );
      if (me && me.outcome) {
        setSettledRoomKey(settleKey);
        recordGameFinished(
          currentRoom.gameType === "pisti_2v2"
            ? "Pişti 2v2 (Online)"
            : "Pişti (Online)",
          currentRoom.betAmount,
          me.chipChange,
          me.chipChange,
          me.outcome,
          currentRoom.winnerMessage || "Tamamlandı",
          currentRoom.gameType === "pisti_2v2"
            ? "2v2 Eşli Masa"
            : opp?.nickname
        );
      }
    }
  }, [currentRoom, profile, recordGameFinished, settledRoomKey]);

  // ==========================================
  // SINGLE PLAYER BLACKJACK HANDLERS
  // ==========================================
  const animateDealerAndSettle = useCallback(
    async (
      nextGame: BlackjackState,
      lockedSoFar: number,
      baseProfile: PlayerProfile
    ) => {
      setBjGame(nextGame);

      if (!nextGame.isGameOver || !nextGame.outcome) {
        setBjVisibleDealerCount(nextGame.dealerHand.length);
        setBjDealerDrawing(false);
        return;
      }

      // If dealer drew extra cards (>2), reveal them one by one
      if (nextGame.dealerHand.length > 2) {
        setBjDealerDrawing(true);
        setBjVisibleDealerCount(2);
        await wait(480); // First let hidden card flip
        for (let count = 3; count <= nextGame.dealerHand.length; count++) {
          setBjVisibleDealerCount(count);
          await wait(520);
        }
        setBjDealerDrawing(false);
      } else {
        setBjVisibleDealerCount(nextGame.dealerHand.length);
        setBjDealerDrawing(false);
      }

      const returnChips = lockedSoFar + nextGame.chipChange;
      const settled: PlayerProfile = {
        ...baseProfile,
        chips: Math.max(0, baseProfile.chips + returnChips),
        wins: baseProfile.wins + (nextGame.outcome === "win" ? 1 : 0),
        losses: baseProfile.losses + (nextGame.outcome === "loss" ? 1 : 0),
        draws: baseProfile.draws + (nextGame.outcome === "push" ? 1 : 0),
        updatedAt: Date.now(),
        history: [
          {
            id: `hist-${Date.now()}`,
            gameType: "Blackjack" as const,
            betAmount: nextGame.currentBet,
            chipChange: nextGame.chipChange,
            outcome: nextGame.outcome,
            resultText: nextGame.gameMessage,
            playedAt: new Date().toLocaleString("tr-TR"),
          },
          ...baseProfile.history,
        ].slice(0, 25),
      };
      commitGameResultToServer(settled, nextGame.chipChange, nextGame.outcome);
    },
    [commitGameResultToServer]
  );

  const handleStartBlackjack = () => {
    if (!profile || bjDealerDrawing) return;
    if (betInput <= 0) {
      notifyToast("Lütfen geçerli bir bahis miktarı girin.");
      return;
    }
    if (profile.chips < betInput) {
      notifyToast(`Yetersiz bakiye! Mevcut çipiniz: ${profile.chips}`);
      return;
    }

    const afterLock: PlayerProfile = {
      ...profile,
      chips: profile.chips - betInput,
      updatedAt: Date.now(),
    };
    persistLocalProfile(afterLock);
    setBjLockedBet(betInput);
    setBjVisibleDealerCount(2);
    setBjDealerDrawing(false);

    const game = startBlackjackGame(betInput);
    setBjGame(game);

    if (game.isGameOver && game.outcome) {
      const returnAmount = betInput + game.chipChange;
      const settled: PlayerProfile = {
        ...afterLock,
        chips: afterLock.chips + returnAmount,
        wins: afterLock.wins + (game.outcome === "win" ? 1 : 0),
        losses: afterLock.losses + (game.outcome === "loss" ? 1 : 0),
        draws: afterLock.draws + (game.outcome === "push" ? 1 : 0),
        history: [
          {
            id: `hist-${Date.now()}`,
            gameType: "Blackjack" as const,
            betAmount: game.currentBet,
            chipChange: game.chipChange,
            outcome: game.outcome,
            resultText: game.gameMessage,
            playedAt: new Date().toLocaleString("tr-TR"),
          },
          ...afterLock.history,
        ].slice(0, 25),
      };
      commitGameResultToServer(settled, game.chipChange, game.outcome);
    }
  };

  const handleBjHit = () => {
    if (!bjGame || !profile || bjDealerDrawing) return;
    const next = hitBlackjack(bjGame);
    animateDealerAndSettle(next, bjLockedBet, profile);
  };

  const handleBjStand = () => {
    if (!bjGame || !profile || bjDealerDrawing) return;
    const next = standBlackjack(bjGame);
    animateDealerAndSettle(next, bjLockedBet, profile);
  };

  const handleBjDouble = () => {
    if (!bjGame || !profile || bjDealerDrawing) return;
    if (profile.chips < bjGame.currentBet) {
      notifyToast(
        `Double Down için ${bjGame.currentBet} ekstra çip gerekiyor!`
      );
      return;
    }
    const extraLock = bjGame.currentBet;
    const afterExtraLock: PlayerProfile = {
      ...profile,
      chips: profile.chips - extraLock,
    };
    persistLocalProfile(afterExtraLock);
    const totalLock = bjLockedBet + extraLock;
    setBjLockedBet(totalLock);

    const next = doubleDownBlackjack(bjGame);
    animateDealerAndSettle(next, totalLock, afterExtraLock);
  };

  const handleBjSplit = () => {
    if (!bjGame || !profile || bjDealerDrawing) return;
    if (profile.chips < bjGame.currentBet) {
      notifyToast(
        `Eli bölmek (Split) için ${bjGame.currentBet} ekstra çip gerekiyor!`
      );
      return;
    }
    const extraLock = bjGame.currentBet;
    const afterExtraLock: PlayerProfile = {
      ...profile,
      chips: profile.chips - extraLock,
    };
    persistLocalProfile(afterExtraLock);
    const totalLock = bjLockedBet + extraLock;
    setBjLockedBet(totalLock);

    const next = splitBlackjack(bjGame);
    setBjGame(next);
  };

  // ==========================================
  // SINGLE PLAYER PİŞTİ HANDLERS (CHOREOGRAPHED)
  // ==========================================
  const handleStartPisti = () => {
    if (!profile || pistiAnim) return;
    if (betInput <= 0) {
      notifyToast("Lütfen geçerli bir bahis miktarı girin.");
      return;
    }
    if (profile.chips < betInput) {
      notifyToast(`Yetersiz bakiye! Mevcut çipiniz: ${profile.chips}`);
      return;
    }

    const afterLock: PlayerProfile = {
      ...profile,
      chips: profile.chips - betInput,
      updatedAt: Date.now(),
    };
    persistLocalProfile(afterLock);
    setPistiLockedBet(betInput);
    setPistiAnim(null);
    setPistiRoundDealKey((k) => k + 1);

    const game = startPistiGame(betInput);
    setPistiGame(game);
  };

  const handlePlayPistiCard = async (card: CardCode) => {
    if (!pistiGame || !profile || pistiGame.isGameOver || pistiAnim) return;

    const currentBoard = pistiGame.board;

    // Step 1: Animate player's card flying from bottom hand onto the center pile
    setPistiAnim({
      phase: "player-throw",
      hiddenPlayerCard: card,
      reduceDealerHand: false,
      displayBoard: [...currentBoard, card],
      boardAnimClass: "animate-throw-player",
      bannerText: "Kartınız masaya atıldı...",
    });
    await wait(420);

    // Commit player's move to state immediately so Pişti count & score update right away!
    const afterPlayer = applyPlayerPistiMove(pistiGame, card);
    setPistiGame(afterPlayer.state);

    // Step 2: If player captured the pile, animate pile sweeping downward to player
    if (afterPlayer.captured) {
      setPistiAnim({
        phase: "player-sweep",
        hiddenPlayerCard: card,
        reduceDealerHand: false,
        displayBoard: [...currentBoard, card],
        boardAnimClass: "animate-sweep-player",
        bannerText: afterPlayer.madePisti
          ? afterPlayer.pistiBonusCount === 2
            ? "🔥 ÇİFT VALE PİŞTİ! (+20 Puan)"
            : "🔥 PİŞTİ YAPTINIZ! (+10 Puan)"
          : afterPlayer.capturedCount === 2
          ? "🃏 Vale (J) tek kartı topladı (Yalnız J-J pişti olur)"
          : `✨ Yerdeki ${afterPlayer.capturedCount} Kartı Topladınız!`,
      });
      await wait(640);
    }

    const boardAfterPlayer = afterPlayer.state.board;

    // Step 3: Bot plays its card from top hand onto the center pile
    if (afterPlayer.state.dealerHand.length > 0) {
      const dealerCard = chooseSmartDealerCard(
        afterPlayer.state.dealerHand,
        boardAfterPlayer
      );
      const dRes = processPistiMove(boardAfterPlayer, dealerCard);

      setPistiAnim({
        phase: "dealer-throw",
        hiddenPlayerCard: card,
        reduceDealerHand: true,
        displayBoard: [...boardAfterPlayer, dealerCard],
        boardAnimClass: "animate-throw-dealer",
        bannerText: afterPlayer.madePisti
          ? "🔥 PİŞTİ (+10p) — 🤖 Bilgisayar yeni kart attı"
          : "🤖 Bilgisayar kartını attı...",
      });
      await wait(520);

      // Step 4: If bot captured the pile, animate pile sweeping upward to bot
      if (dRes.captured) {
        setPistiAnim({
          phase: "dealer-sweep",
          hiddenPlayerCard: card,
          reduceDealerHand: true,
          displayBoard: [...boardAfterPlayer, dealerCard],
          boardAnimClass: "animate-sweep-dealer",
          bannerText:
            dRes.pistiBonusCount > 0
              ? "🤖 Bilgisayar PİŞTİ Yaptı! (+10 Puan)"
              : `🤖 Bilgisayar ${dRes.capturedCards.length} Kartı Topladı!`,
        });
        await wait(640);
      }
    }

    const prevRound = pistiGame.roundNumber;
    const afterDealer = applyDealerPistiMove(afterPlayer.state);
    const next = afterDealer.state;

    setPistiAnim(null);
    if (next.roundNumber !== prevRound) {
      setPistiRoundDealKey((k) => k + 1);
    }
    setPistiGame(next);

    if (next.isGameOver && next.outcome) {
      const returnChips = pistiLockedBet + next.chipChange;
      const settled: PlayerProfile = {
        ...profile,
        chips: Math.max(0, profile.chips + returnChips),
        wins: profile.wins + (next.outcome === "win" ? 1 : 0),
        losses: profile.losses + (next.outcome === "loss" ? 1 : 0),
        draws: profile.draws + (next.outcome === "push" ? 1 : 0),
        updatedAt: Date.now(),
        history: [
          {
            id: `hist-${Date.now()}`,
            gameType: "Pişti" as const,
            betAmount: next.currentBet,
            chipChange: next.chipChange,
            outcome: next.outcome,
            resultText: next.gameMessage,
            playedAt: new Date().toLocaleString("tr-TR"),
            opponentName: "Kurpiyer Bot",
          },
          ...profile.history,
        ].slice(0, 25),
      };
      commitGameResultToServer(settled, next.chipChange, next.outcome);
    }
  };

  // ==========================================
  // ONLINE MULTIPLAYER HANDLERS
  // ==========================================
  const handleCreateRoom = async () => {
    if (!profile) return;
    if (profile.chips < newRoomBet) {
      notifyToast("Oda bahsi için yeterli çipiniz yok!");
      return;
    }
    const res = await fetch("/api/game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "createRoom",
        gameType: newRoomGameType,
        betAmount: newRoomBet,
        roomName: newRoomName,
        player: {
          id: profile.id,
          nickname: profile.nickname,
          avatar: profile.avatar,
          chips: profile.chips,
        },
      }),
    });
    const data = await res.json();
    if (data.ok && data.room) {
      activeRoomCodeRef.current = data.room.code;
      setCurrentRoom(data.room);
      pingRealtime();
      notifyToast(`Oda kuruldu! Oda Kodu: ${data.room.code}`);
    } else {
      notifyToast(data.error || "Oda kurulamadı.");
    }
  };

  const handleJoinRoom = async (codeToJoin: string) => {
    if (!profile) return;
    const clean = codeToJoin.trim().toUpperCase();
    if (!clean) {
      notifyToast("Lütfen bir oda kodu girin.");
      return;
    }
    const res = await fetch("/api/game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "joinRoom",
        code: clean,
        player: {
          id: profile.id,
          nickname: profile.nickname,
          avatar: profile.avatar,
          chips: profile.chips,
        },
      }),
    });
    const data = await res.json();
    if (data.ok && data.room) {
      activeRoomCodeRef.current = data.room.code;
      setCurrentRoom(data.room);
      setActiveTab("online");
      pingRealtime();
      notifyToast(`${data.room.name} odasına katıldınız!`);
    } else {
      notifyToast(data.error || "Odaya katılınamadı.");
    }
  };

  const handleLeaveRoom = async () => {
    if (!currentRoom || !profile) return;
    const codeToLeave = currentRoom.code;

    activeRoomCodeRef.current = null;
    setCurrentRoom(null);

    try {
      await fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "leaveRoom",
          code: codeToLeave,
          playerId: profile.id,
        }),
      });
    } catch {}

    pingRealtime();
    fetchServerData();
    notifyToast("Odadan ayrıldınız.");
  };

  const handleStartOnlineGame = async (isRematch = false, fillBots = false) => {
    if (!currentRoom) return;
    const res = await fetch("/api/game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: isRematch ? "rematchRoom" : "startRoom",
        code: currentRoom.code,
        fillBots,
      }),
    });
    const data = await res.json();
    if (data.ok && data.room) {
      setCurrentRoom(data.room);
      pingRealtime();
    } else {
      notifyToast(data.error || "Oyun başlatılamadı.");
    }
  };

  const handleSwitchRoomTeam = async (targetTeam?: "A" | "B") => {
    if (!currentRoom || !profile) return;
    const res = await fetch("/api/game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "switchRoomTeam",
        code: currentRoom.code,
        playerId: profile.id,
        targetTeam,
      }),
    });
    const data = await res.json();
    if (data.ok && data.room) {
      setCurrentRoom(data.room);
      pingRealtime();
    } else {
      notifyToast(data.error || "Takım değiştirilemedi.");
    }
  };

  const handleOnlineBjMove = async (move: "hit" | "stand" | "double") => {
    if (!currentRoom || !profile) return;
    const res = await fetch("/api/game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "mpBlackjackAction",
        code: currentRoom.code,
        playerId: profile.id,
        move,
      }),
    });
    const data = await res.json();
    if (data.ok && data.room) {
      setCurrentRoom(data.room);
      pingRealtime();
    } else {
      notifyToast(data.error || "Hamle yapılamadı.");
    }
  };

  const handleOnlinePistiCard = async (card: CardCode) => {
    if (!currentRoom || !profile || onlinePistiAnim) return;
    const res = await fetch("/api/game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "mpPistiPlayCard",
        code: currentRoom.code,
        playerId: profile.id,
        card,
      }),
    });
    const data = await res.json();
    if (data.ok && data.room) {
      setCurrentRoom(data.room);
      pingRealtime();
    } else {
      notifyToast(data.error || "Kart oynanamadı.");
    }
  };

  const handleClaimBonusChips = async () => {
    if (!profile) return;
    try {
      const res = await fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "claimDailyBonus",
          playerId: profile.id,
        }),
      });
      const data = await res.json();
      if (data.ok && data.me) {
        persistLocalProfile({
          ...profile,
          chips: data.me.chips,
          lastDailyBonusAt: data.me.lastDailyBonusAt,
          updatedAt: Date.now(),
        });
        if (data.leaderboard) setLeaderboard(data.leaderboard);
        pingRealtime();
        notifyToast(data.message || "+250 Günlük Başlangıç Çipi eklendi!");
      } else {
        notifyToast(data.error || "Günlük destek çipi alınamadı.");
      }
    } catch {
      notifyToast("Sunucu ile bağlantı kurulamadı.");
    }
  };

  if (!profile) {
    return (
      <div className="min-h-screen casino-felt-bg flex items-center justify-center">
        <div className="text-amber-300 font-display text-xl animate-pulse">
          Royal Velvet Club Yükleniyor...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen casino-felt-bg text-slate-100 flex flex-col lg:flex-row">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-slate-950/95 border border-amber-400/50 text-amber-200 shadow-2xl animate-pop-banner">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}

      {/* Profile Setup / Edit Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-amber-500/40 p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <Crown className="w-7 h-7 text-amber-400" />
              <h2 className="font-display text-2xl font-bold text-amber-300">
                Oyuncu Kimliği
              </h2>
            </div>
            <p className="text-sm text-slate-400 mb-5">
              Liderlik tablosunda ve online odalarda görünecek rumuzunuzu ve
              avatarınızı seçin.
            </p>

            <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">
              Avatar Seçin
            </label>
            <div className="grid grid-cols-4 gap-2 mb-5">
              {AVATARS.map((av) => (
                <button
                  key={av}
                  type="button"
                  onClick={() => setEditAvatar(av)}
                  className={`py-2.5 text-2xl rounded-xl border transition ${
                    editAvatar === av
                      ? "bg-amber-500/20 border-amber-400 scale-105"
                      : "bg-slate-800/70 border-slate-700 hover:border-slate-500"
                  }`}
                >
                  {av}
                </button>
              ))}
            </div>

            <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">
              Oyuncu Rumuzu
            </label>
            <input
              type="text"
              maxLength={20}
              value={editNickname}
              onChange={(e) => setEditNickname(e.target.value)}
              placeholder="Örn: KaroKralı"
              className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-semibold focus:outline-none focus:border-amber-400 mb-6"
            />

            <button
              type="button"
              onClick={() => {
                const clean = editNickname.trim() || profile.nickname;
                saveProfile({
                  ...profile,
                  nickname: clean,
                  avatar: editAvatar,
                  updatedAt: Date.now(),
                });
                setShowProfileModal(false);
                notifyToast(`Hoş geldin, ${clean}!`);
              }}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-bold hover:brightness-110 transition cursor-pointer"
            >
              Masaya Otur
            </button>
          </div>
        </div>
      )}

      {/* SIDEBAR NAVIGATION */}
      <aside className="w-full lg:w-72 bg-slate-950/85 border-b lg:border-b-0 lg:border-r border-emerald-900/60 backdrop-blur-md flex flex-col justify-between p-5 shrink-0">
        <div>
          {/* Player Mini Wallet Card */}
          <div className="rounded-2xl bg-gradient-to-br from-emerald-950/90 to-slate-900/90 border border-amber-500/30 p-4 mb-6 shadow-inner">
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                onClick={() => {
                  setEditNickname(profile.nickname);
                  setEditAvatar(profile.avatar);
                  setShowProfileModal(true);
                }}
                className="flex items-center gap-2.5 text-left group cursor-pointer"
              >
                <span className="w-10 h-10 rounded-xl bg-slate-800 border border-amber-400/40 flex items-center justify-center text-xl">
                  {profile.avatar}
                </span>
                <div>
                  <div className="font-bold text-sm text-white group-hover:text-amber-300 transition">
                    {profile.nickname}
                  </div>
                  <div className="text-[11px] text-slate-400 underline">
                    Profili Düzenle
                  </div>
                </div>
              </button>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-white/10">
              <div className="flex items-center gap-1.5 text-amber-400">
                <Coins className="w-4 h-4" />
                <span className="font-mono-num text-lg font-bold">
                  {profile.chips.toLocaleString("tr-TR")}
                </span>
                <span className="text-xs text-amber-200/70">Çip</span>
              </div>
              {profile.chips <= 0 ? (
                !profile.lastDailyBonusAt ||
                Date.now() - profile.lastDailyBonusAt >= 24 * 60 * 60 * 1000 ? (
                  <button
                    type="button"
                    onClick={handleClaimBonusChips}
                    className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/50 text-emerald-300 text-xs font-semibold transition cursor-pointer animate-pulse"
                    title="Çipiniz bittiği için günde 1 kez +250 başlangıç çipi alabilirsiniz"
                  >
                    🎁 +250 Günlük Destek
                  </button>
                ) : (
                  <span
                    className="px-2 py-1 rounded-lg bg-slate-900/90 border border-white/10 text-slate-400 text-[10px]"
                    title="Günlük 250 çip hakkınız kullanıldı. Ekstra çip için yöneticiyle iletişime geçin."
                  >
                    ⏳ Günlük Hak Kullanıldı
                  </span>
                )
              ) : (
                <span
                  className="px-2 py-0.5 rounded-lg bg-slate-900/80 border border-white/10 text-slate-400 text-[10px]"
                  title="Çip yüklemeleri yönetici tarafından yapılır"
                >
                  🔒 Admin Kontrollü
                </span>
              )}
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex lg:flex-col gap-2 overflow-x-auto pb-2 lg:pb-0">
            <button
              type="button"
              onClick={() => setActiveTab("blackjack")}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm whitespace-nowrap transition cursor-pointer ${
                activeTab === "blackjack"
                  ? "bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 shadow-lg shadow-amber-500/20"
                  : "text-slate-300 hover:bg-white/5"
              }`}
            >
              <Spade className="w-4 h-4" />
              <span>Blackjack (Tekli)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("pisti")}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm whitespace-nowrap transition cursor-pointer ${
                activeTab === "pisti"
                  ? "bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 shadow-lg shadow-amber-500/20"
                  : "text-slate-300 hover:bg-white/5"
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>Pişti (Bota Karşı)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("online")}
              className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl font-semibold text-sm whitespace-nowrap transition cursor-pointer ${
                activeTab === "online"
                  ? "bg-gradient-to-r from-emerald-400 to-teal-400 text-slate-950 shadow-lg shadow-emerald-500/20"
                  : "text-emerald-300 bg-emerald-950/50 border border-emerald-700/40 hover:bg-emerald-900/40"
              }`}
            >
              <div className="flex items-center gap-3">
                <Users className="w-4 h-4" />
                <span>Online Multiplayer</span>
              </div>
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-emerald-950 text-emerald-300">
                CANLI ({rooms.length})
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("leaderboard")}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm whitespace-nowrap transition cursor-pointer ${
                activeTab === "leaderboard"
                  ? "bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 shadow-lg shadow-amber-500/20"
                  : "text-slate-300 hover:bg-white/5"
              }`}
            >
              <Trophy className="w-4 h-4" />
              <span>Liderlik Tablosu</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("profile")}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm whitespace-nowrap transition cursor-pointer ${
                activeTab === "profile"
                  ? "bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 shadow-lg shadow-amber-500/20"
                  : "text-slate-300 hover:bg-white/5"
              }`}
            >
              <History className="w-4 h-4" />
              <span>Profilim & Geçmiş</span>
            </button>
          </nav>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 p-4 sm:p-8 overflow-y-auto">
        {/* ====================================================
            TAB 1: SINGLE PLAYER BLACKJACK
        ==================================================== */}
        {activeTab === "blackjack" && (
          <div className="max-w-5xl mx-auto">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-amber-300">
                  VIP Blackjack Masası
                </h2>
                <p className="text-sm text-slate-300">
                  Kurpiyer 17&apos;de durur • Blackjack 3:2 öder • Split &
                  Double Down açık
                </p>
              </div>
              {bjGame && (
                <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-slate-950/70 border border-amber-500/30">
                  <span className="text-xs uppercase tracking-wider text-slate-400">
                    Aktif Bahis:
                  </span>
                  <span className="font-mono-num text-lg font-bold text-amber-400">
                    {bjGame.currentBet} Çip
                  </span>
                </div>
              )}
            </div>

            {!bjGame ? (
              /* Betting Card */
              <div className="max-w-lg mx-auto mt-8 rounded-3xl bg-slate-950/80 border border-amber-500/30 p-6 sm:p-8 text-center shadow-2xl">
                <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-400/40 flex items-center justify-center mx-auto mb-4 text-amber-300">
                  <Dices className="w-8 h-8" />
                </div>
                <h3 className="font-display text-2xl font-bold text-white mb-2">
                  Bahsinizi Masaya Koyun
                </h3>
                <p className="text-sm text-slate-400 mb-6">
                  Hızlı çiplerden birini seçin veya özel bahis miktarı girin.
                </p>

                <div className="flex flex-wrap justify-center gap-2.5 mb-6">
                  {QUICK_BETS.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setBetInput(amt)}
                      className={`px-4 py-2 rounded-full font-mono-num text-sm font-bold border transition cursor-pointer ${
                        betInput === amt
                          ? "bg-amber-400 text-slate-950 border-amber-300 scale-105 shadow-lg"
                          : "bg-slate-900/90 text-amber-200 border-amber-500/30 hover:border-amber-400"
                      }`}
                    >
                      {amt} Çip
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setBetInput(Math.max(10, profile.chips))}
                    className="px-4 py-2 rounded-full font-mono-num text-sm font-bold bg-rose-600/20 text-rose-300 border border-rose-500/40 hover:bg-rose-600/30 transition cursor-pointer"
                  >
                    ALL-IN ({profile.chips})
                  </button>
                </div>

                <div className="flex items-center bg-slate-900 border border-slate-700 rounded-2xl px-4 py-3 mb-6">
                  <Coins className="w-6 h-6 text-amber-400 mr-3" />
                  <input
                    type="number"
                    min={1}
                    max={profile.chips}
                    value={betInput}
                    onChange={(e) =>
                      setBetInput(Math.max(0, parseInt(e.target.value) || 0))
                    }
                    className="w-full bg-transparent text-center font-mono-num text-2xl font-bold text-white focus:outline-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleStartBlackjack}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-slate-950 font-bold text-lg shadow-xl shadow-amber-500/20 hover:brightness-110 transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Play className="w-5 h-5 fill-current" />
                  Kartları Dağıt
                </button>
              </div>
            ) : (
              /* Active Blackjack Table */
              <div className="relative rounded-3xl bg-emerald-950/40 border-2 border-amber-500/30 p-6 sm:p-8 shadow-2xl space-y-8 overflow-hidden">
                {/* Visual Deck Shoe in Top-Right Corner */}
                <div className="hidden md:block absolute top-6 right-6 pointer-events-none">
                  <div className="relative w-16 h-24">
                    <div className="absolute inset-0 translate-x-1.5 -translate-y-1.5 rounded-lg card-back-pattern border border-amber-300/40 opacity-70" />
                    <div className="absolute inset-0 translate-x-0.5 -translate-y-0.5 rounded-lg card-back-pattern border border-amber-300/50 opacity-85" />
                    <div className="absolute inset-0 rounded-lg card-back-pattern border-2 border-amber-300/70 shadow-lg flex items-center justify-center">
                      <span className="text-[10px] font-mono-num font-bold text-amber-200 bg-slate-950/80 px-1.5 py-0.5 rounded">
                        {bjGame.deck.length}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Dealer Section */}
                <div className="text-center">
                  <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-950/80 border border-white/10 text-sm font-semibold mb-4">
                    <span className="text-slate-300">Kurpiyerin Eli</span>
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono-num font-bold">
                      {bjGame.isGameOver
                        ? calculateBlackjackScore(
                            bjGame.dealerHand.slice(0, bjVisibleDealerCount)
                          )
                        : "?"}
                    </span>
                  </div>

                  <div className="flex justify-center flex-wrap gap-3 min-h-[140px]">
                    {bjGame.dealerHand
                      .slice(0, bjVisibleDealerCount)
                      .map((c, idx) => {
                        const isHoleCard = idx === 0;
                        const isFaceDown = isHoleCard && !bjGame.isGameOver;
                        const animClass =
                          isHoleCard && bjGame.isGameOver
                            ? "animate-flip-reveal"
                            : "animate-deal";
                        const delayMs =
                          !bjGame.isGameOver && idx < 2 ? idx * 180 + 90 : 0;

                        return (
                          <PlayingCard
                            key={`${bjGame.id}-dealer-${idx}-${
                              isFaceDown ? "down" : c
                            }`}
                            card={c}
                            faceDown={isFaceDown}
                            className={animClass}
                            style={
                              delayMs
                                ? { animationDelay: `${delayMs}ms` }
                                : undefined
                            }
                          />
                        );
                      })}
                  </div>
                </div>

                {/* Status Banner */}
                <div className="text-center">
                  {bjDealerDrawing ? (
                    <div className="inline-block px-6 py-3 rounded-2xl font-semibold text-base bg-slate-950/90 border border-amber-400/50 text-amber-300 animate-pulse">
                      🎴 Kurpiyer kart çekiyor...
                    </div>
                  ) : (
                    <div
                      className={`inline-block px-6 py-3 rounded-2xl font-semibold text-base sm:text-lg border shadow-lg animate-pop-banner ${
                        bjGame.isGameOver
                          ? bjGame.chipChange > 0
                            ? "bg-emerald-900/90 border-emerald-400 text-emerald-100"
                            : bjGame.chipChange < 0
                            ? "bg-rose-950/90 border-rose-400 text-rose-100"
                            : "bg-slate-900/90 border-slate-500 text-slate-200"
                          : "bg-slate-950/80 border-amber-500/40 text-amber-200"
                      }`}
                    >
                      {bjGame.gameMessage}
                      {bjGame.isGameOver && (
                        <span className="ml-3 font-mono-num font-extrabold">
                          (
                          {bjGame.chipChange > 0
                            ? `+${bjGame.chipChange}`
                            : bjGame.chipChange}{" "}
                          Çip)
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Player Hand(s) */}
                <div
                  className={`grid gap-6 ${
                    bjGame.hasSplit
                      ? "grid-cols-1 md:grid-cols-2"
                      : "grid-cols-1"
                  }`}
                >
                  {/* Hand 1 */}
                  <div
                    className={`rounded-2xl p-4 text-center transition ${
                      bjGame.hasSplit &&
                      bjGame.activeHand === 1 &&
                      !bjGame.isGameOver
                        ? "bg-amber-500/10 border-2 border-amber-400"
                        : "bg-slate-950/40 border border-white/10"
                    }`}
                  >
                    <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-slate-900 text-sm font-semibold mb-4">
                      <span>
                        {bjGame.hasSplit ? "1. Eliniz" : "Sizin Eliniz"}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono-num font-bold">
                        {bjGame.playerScore}
                      </span>
                    </div>
                    <div className="flex justify-center flex-wrap gap-3">
                      {bjGame.playerHand.map((c, idx) => {
                        const isInitial =
                          idx < 2 &&
                          bjGame.playerHand.length === 2 &&
                          !bjGame.hasSplit;
                        return (
                          <PlayingCard
                            key={`${bjGame.id}-p1-${idx}-${c}`}
                            card={c}
                            className="animate-deal"
                            style={
                              isInitial
                                ? { animationDelay: `${idx * 180}ms` }
                                : undefined
                            }
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* Hand 2 (if Split) */}
                  {bjGame.hasSplit && (
                    <div
                      className={`rounded-2xl p-4 text-center transition ${
                        bjGame.activeHand === 2 && !bjGame.isGameOver
                          ? "bg-amber-500/10 border-2 border-amber-400"
                          : "bg-slate-950/40 border border-white/10"
                      }`}
                    >
                      <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-slate-900 text-sm font-semibold mb-4">
                        <span>2. Eliniz</span>
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono-num font-bold">
                          {bjGame.playerScore2}
                        </span>
                      </div>
                      <div className="flex justify-center flex-wrap gap-3">
                        {bjGame.playerHand2.map((c, idx) => (
                          <PlayingCard
                            key={`${bjGame.id}-p2-${idx}-${c}`}
                            card={c}
                            className="animate-deal"
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Controls */}
                <div className="flex flex-wrap justify-center gap-3 pt-2">
                  {!bjGame.isGameOver ? (
                    <>
                      <button
                        type="button"
                        onClick={handleBjHit}
                        disabled={bjDealerDrawing}
                        className="px-7 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-base shadow-lg transition cursor-pointer"
                      >
                        Kart Çek (Hit)
                      </button>
                      <button
                        type="button"
                        onClick={handleBjStand}
                        disabled={bjDealerDrawing}
                        className="px-7 py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-base shadow-lg transition cursor-pointer"
                      >
                        Dur (Stand)
                      </button>
                      {bjGame.canDoubleDown && (
                        <button
                          type="button"
                          onClick={handleBjDouble}
                          disabled={bjDealerDrawing}
                          className="px-6 py-3.5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-base shadow-lg transition cursor-pointer"
                        >
                          İkiye Katla (2x)
                        </button>
                      )}
                      {bjGame.canSplit && (
                        <button
                          type="button"
                          onClick={handleBjSplit}
                          disabled={bjDealerDrawing}
                          className="px-6 py-3.5 rounded-2xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-bold text-base shadow-lg transition cursor-pointer"
                        >
                          Eli Böl (Split)
                        </button>
                      )}
                    </>
                  ) : !bjDealerDrawing ? (
                    <div className="w-full max-w-xl mx-auto rounded-2xl bg-slate-950/90 border border-amber-400/40 p-5 text-center space-y-4 animate-pop-banner">
                      <div className="text-sm font-semibold">
                        {bjGame.chipChange > 0 ? (
                          <span className="text-emerald-400">
                            🎉 +{bjGame.chipChange} Çip Kazandınız! • Güncel
                            Bakiyeniz:{" "}
                            <strong>
                              {profile.chips.toLocaleString("tr-TR")} Çip
                            </strong>
                          </span>
                        ) : bjGame.chipChange < 0 ? (
                          <span className="text-rose-400">
                            📉 {bjGame.chipChange} Çip • Güncel Bakiyeniz:{" "}
                            <strong>
                              {profile.chips.toLocaleString("tr-TR")} Çip
                            </strong>
                          </span>
                        ) : (
                          <span className="text-amber-300">
                            🤝 Bahsiniz İade Edildi • Güncel Bakiyeniz:{" "}
                            <strong>
                              {profile.chips.toLocaleString("tr-TR")} Çip
                            </strong>
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap justify-center gap-3">
                        <button
                          type="button"
                          onClick={handleStartBlackjack}
                          className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-bold text-sm shadow-xl hover:brightness-110 transition flex items-center gap-2 cursor-pointer"
                        >
                          <RefreshCw className="w-4 h-4" />
                          Tekrar Oyna ({betInput} Çip)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const won = bjGame.chipChange;
                            setBjGame(null);
                            setActiveTab("profile");
                            notifyToast(
                              won > 0
                                ? `💰 +${won} Çip kazancınızla masadan ayrıldınız. Toplam Bakiye: ${profile.chips.toLocaleString("tr-TR")} Çip`
                                : `Masadan ayrıldınız. Güncel Bakiye: ${profile.chips.toLocaleString("tr-TR")} Çip`
                            );
                          }}
                          className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm shadow-lg transition flex items-center gap-2 cursor-pointer"
                        >
                          <Coins className="w-4 h-4" />
                          {bjGame.chipChange > 0
                            ? "Kazancı Alıp Çık"
                            : "Masadan Çık"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setBjGame(null)}
                          className="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm transition cursor-pointer"
                        >
                          Bahis Değiştir
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ====================================================
            TAB 2: SINGLE PLAYER PİŞTİ
        ==================================================== */}
        {activeTab === "pisti" && (
          <div className="max-w-5xl mx-auto">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-amber-300">
                  Anadolu Kulübü — Pişti Masası
                </h2>
                <p className="text-sm text-slate-300">
                  Vale (J) her şeyi toplar • Pişti +10 Puan • ♦10 (+3), ♣2 (+2),
                  As/Vale (+1), Kart Çoğunluğu (+3)
                </p>
              </div>
              {pistiGame && (
                <div className="flex items-center gap-4 px-4 py-2 rounded-2xl bg-slate-950/80 border border-amber-500/30 text-sm">
                  <span>
                    Destede:{" "}
                    <strong className="text-amber-300 font-mono-num">
                      {pistiGame.deck.length}
                    </strong>{" "}
                    Kart
                  </span>
                  <span>•</span>
                  <span>
                    Bahis:{" "}
                    <strong className="text-amber-300 font-mono-num">
                      {pistiGame.currentBet} Çip
                    </strong>
                  </span>
                </div>
              )}
            </div>

            {!pistiGame ? (
              <div className="max-w-lg mx-auto mt-8 rounded-3xl bg-slate-950/80 border border-amber-500/30 p-6 sm:p-8 text-center shadow-2xl">
                <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-400/40 flex items-center justify-center mx-auto mb-4 text-amber-300">
                  <Sparkles className="w-8 h-8" />
                </div>
                <h3 className="font-display text-2xl font-bold text-white mb-2">
                  Pişti Bahsinizi Seçin
                </h3>
                <p className="text-sm text-slate-400 mb-6">
                  52 kartlık tam deste bitene kadar en yüksek puanı toplayan
                  kazanır!
                </p>

                <div className="flex flex-wrap justify-center gap-2.5 mb-6">
                  {QUICK_BETS.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setBetInput(amt)}
                      className={`px-4 py-2 rounded-full font-mono-num text-sm font-bold border transition cursor-pointer ${
                        betInput === amt
                          ? "bg-amber-400 text-slate-950 border-amber-300 scale-105"
                          : "bg-slate-900 text-amber-200 border-amber-500/30"
                      }`}
                    >
                      {amt} Çip
                    </button>
                  ))}
                </div>

                <div className="flex items-center bg-slate-900 border border-slate-700 rounded-2xl px-4 py-3 mb-6">
                  <Coins className="w-6 h-6 text-amber-400 mr-3" />
                  <input
                    type="number"
                    min={1}
                    max={profile.chips}
                    value={betInput}
                    onChange={(e) =>
                      setBetInput(Math.max(0, parseInt(e.target.value) || 0))
                    }
                    className="w-full bg-transparent text-center font-mono-num text-2xl font-bold text-white focus:outline-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleStartPisti}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-slate-950 font-bold text-lg shadow-xl hover:brightness-110 transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Play className="w-5 h-5 fill-current" />
                  Pişti Başlat
                </button>
              </div>
            ) : (
              (() => {
                const visibleBoard = pistiAnim
                  ? pistiAnim.displayBoard
                  : pistiGame.board;
                const dealerHandCount =
                  pistiGame.dealerHand.length -
                  (pistiAnim?.reduceDealerHand ? 1 : 0);
                const visiblePlayerHand = pistiAnim
                  ? pistiGame.playerHand.filter(
                      (c) => c !== pistiAnim.hiddenPlayerCard
                    )
                  : pistiGame.playerHand;

                return (
                  <div className="rounded-3xl bg-emerald-950/40 border-2 border-amber-500/30 p-5 sm:p-8 shadow-2xl space-y-6">
                    {/* Bot Header & Hand */}
                    <div className="flex flex-col items-center">
                      <div className="flex flex-wrap items-center justify-center gap-3 mb-3 text-xs sm:text-sm">
                        <span className="px-3 py-1 rounded-full bg-slate-900 border border-white/10 font-semibold">
                          🤖 Bilgisayar: {pistiGame.dealerScore} Puan
                        </span>
                        <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 font-semibold">
                          Pişti: {pistiGame.dealerPistiCount}
                        </span>
                        <span className="px-3 py-1 rounded-full bg-slate-900 text-slate-300">
                          Toplanan: {pistiGame.dealerCaptured.length} Kart
                        </span>
                      </div>
                      <div className="flex justify-center gap-2 sm:gap-3 min-h-[96px]">
                        {Array.from({ length: Math.max(0, dealerHandCount) }).map(
                          (_, idx) => (
                            <PlayingCard
                              key={`bot-${pistiRoundDealKey}-${idx}`}
                              faceDown
                              size="sm"
                              className="animate-deal"
                              style={{ animationDelay: `${idx * 90}ms` }}
                            />
                          )
                        )}
                      </div>
                    </div>

                    {/* Center Board Area */}
                    <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-6 py-4 border-y border-white/10">
                      {/* Last Turn Move Log */}
                      <div className="rounded-2xl bg-slate-950/60 border border-white/10 p-4 text-center">
                        <div className="text-xs uppercase tracking-wider text-slate-400 mb-2">
                          Son Hamle Özeti
                        </div>
                        {pistiGame.lastAction ? (
                          <div className="flex items-center justify-center gap-4">
                            {pistiGame.lastAction.playerCard && (
                              <div className="flex flex-col items-center gap-1.5">
                                <span className="text-[11px] text-emerald-300 font-medium">
                                  Siz Attınız
                                </span>
                                <PlayingCard
                                  card={pistiGame.lastAction.playerCard}
                                  size="sm"
                                  highlightSpecial
                                />
                                {pistiGame.lastAction.playerMadePisti && (
                                  <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-extrabold animate-bounce">
                                    🔥 PİŞTİ! (+10p)
                                  </span>
                                )}
                              </div>
                            )}
                            {pistiGame.lastAction.dealerCard && (
                              <div className="flex flex-col items-center gap-1.5">
                                <span className="text-[11px] text-rose-300 font-medium">
                                  Bot Attı
                                </span>
                                <PlayingCard
                                  card={pistiGame.lastAction.dealerCard}
                                  size="sm"
                                  highlightSpecial
                                />
                                {pistiGame.lastAction.dealerMadePisti && (
                                  <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-extrabold animate-bounce">
                                    🤖 PİŞTİ! (+10p)
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500 py-4">
                            Henüz kart atılmadı.
                          </p>
                        )}
                      </div>

                      {/* Center Pile with Throw & Sweep Animations */}
                      <div className="flex flex-col items-center justify-center">
                        <div className="mb-2 text-center">
                          {visibleBoard.length === 1 ? (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-400/20 border border-amber-400/60 text-amber-300 text-xs font-extrabold tracking-wide animate-pulse">
                              🔥 TEK KART — PİŞTİ FIRSATI! (+10p)
                            </span>
                          ) : (
                            <span className="text-xs uppercase tracking-wider text-amber-300 font-semibold">
                              Yerdeki Kartlar ({visibleBoard.length})
                            </span>
                          )}
                        </div>
                        <div className="relative min-w-[180px] h-44 flex items-center justify-center px-4">
                          {visibleBoard.length === 0 ? (
                            <div className="w-24 h-36 rounded-xl border-2 border-dashed border-emerald-500/40 flex items-center justify-center text-xs text-emerald-300/60">
                              Yer Boş
                            </div>
                          ) : (
                            <div
                              key={
                                pistiAnim
                                  ? `${pistiAnim.phase}-${visibleBoard.length}`
                                  : `board-${visibleBoard.length}`
                              }
                              className={`relative flex items-center justify-center -space-x-11 ${
                                pistiAnim ? pistiAnim.boardAnimClass : ""
                              }`}
                            >
                              {visibleBoard.slice(-6).map((bCard, bIdx, arr) => {
                                const isTopCard = bIdx === arr.length - 1;
                                const globalIdx =
                                  visibleBoard.length - arr.length + bIdx;
                                const isInitialHidden =
                                  pistiGame.lastCapturer === "" &&
                                  globalIdx < 3 &&
                                  !isTopCard;
                                return (
                                  <div
                                    key={`board-item-${globalIdx}-${bCard}`}
                                    style={{ zIndex: bIdx + 1 }}
                                    className={`transition-transform duration-200 ${
                                      isTopCard
                                        ? "scale-105 ring-2 ring-amber-400/80 rounded-xl shadow-2xl"
                                        : "opacity-85 scale-95 -translate-y-1"
                                    }`}
                                  >
                                    <PlayingCard
                                      card={bCard}
                                      faceDown={isInitialHidden}
                                      highlightSpecial={isTopCard}
                                      size="md"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Status & Legend */}
                      <div className="rounded-2xl bg-slate-950/60 border border-white/10 p-4 text-center space-y-2">
                        <div
                          key={
                            pistiAnim?.bannerText || pistiGame.gameMessage
                          }
                          className="text-sm font-bold text-amber-300 animate-pop-banner"
                        >
                          {pistiAnim?.bannerText || pistiGame.gameMessage}
                        </div>
                        <div className="text-xs text-slate-400">
                          🌟{" "}
                          <strong className="text-amber-300">Altın Kart:</strong>{" "}
                          Vale (J) — Yeri Toplar
                        </div>
                        <div className="text-xs text-slate-400">
                          🥈{" "}
                          <strong className="text-slate-200">Gümüş Kart:</strong>{" "}
                          ♦10 (3p), ♣2 (2p), As (1p)
                        </div>
                      </div>
                    </div>

                    {/* Player Hand */}
                    <div className="text-center">
                      <div className="flex flex-wrap items-center justify-center gap-3 mb-4 text-xs sm:text-sm">
                        <span className="px-3.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 font-bold">
                          Sizin Puanınız: {pistiGame.playerScore}
                        </span>
                        <span className="px-3.5 py-1 rounded-full bg-amber-500/20 text-amber-300 font-bold">
                          Pişti: {pistiGame.playerPistiCount}
                        </span>
                        <span className="px-3.5 py-1 rounded-full bg-slate-900 text-slate-300">
                          Toplanan: {pistiGame.playerCaptured.length} Kart
                        </span>
                      </div>

                      {!pistiGame.isGameOver ? (
                        <div className="flex justify-center flex-wrap gap-3 sm:gap-4 min-h-[160px]">
                          {visiblePlayerHand.map((c, idx) => (
                            <PlayingCard
                              key={`${pistiRoundDealKey}-${c}`}
                              card={c}
                              highlightSpecial
                              size="lg"
                              disabled={Boolean(pistiAnim)}
                              onClick={() => handlePlayPistiCard(c)}
                              className="animate-deal"
                              style={{ animationDelay: `${idx * 90}ms` }}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-2xl bg-slate-950/90 border border-amber-400/50 p-6 max-w-xl mx-auto space-y-4 animate-pop-banner">
                          <h4 className="font-display text-2xl font-bold text-amber-300">
                            {pistiGame.gameMessage}
                          </h4>
                          <p className="text-sm text-slate-300">
                            Siz: <strong>{pistiGame.playerScore} Puan</strong> (
                            {pistiGame.playerCaptured.length} kart,{" "}
                            {pistiGame.playerPistiCount} pişti) — Bilgisayar:{" "}
                            <strong>{pistiGame.dealerScore} Puan</strong> (
                            {pistiGame.dealerCaptured.length} kart,{" "}
                            {pistiGame.dealerPistiCount} pişti)
                          </p>
                          <div className="text-sm font-semibold">
                            {pistiGame.chipChange > 0 ? (
                              <span className="text-emerald-400">
                                🎉 +{pistiGame.chipChange} Çip Kazandınız! •
                                Güncel Bakiyeniz:{" "}
                                <strong>
                                  {profile.chips.toLocaleString("tr-TR")} Çip
                                </strong>
                              </span>
                            ) : pistiGame.chipChange < 0 ? (
                              <span className="text-rose-400">
                                📉 {pistiGame.chipChange} Çip • Güncel
                                Bakiyeniz:{" "}
                                <strong>
                                  {profile.chips.toLocaleString("tr-TR")} Çip
                                </strong>
                              </span>
                            ) : (
                              <span className="text-amber-300">
                                🤝 Bahsiniz İade Edildi • Güncel Bakiyeniz:{" "}
                                <strong>
                                  {profile.chips.toLocaleString("tr-TR")} Çip
                                </strong>
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap justify-center gap-3 pt-2">
                            <button
                              type="button"
                              onClick={handleStartPisti}
                              className="px-6 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-sm transition cursor-pointer"
                            >
                              Tekrar Oyna ({betInput} Çip)
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const won = pistiGame.chipChange;
                                setPistiGame(null);
                                setActiveTab("profile");
                                notifyToast(
                                  won > 0
                                    ? `💰 +${won} Çip kazancınızla masadan ayrıldınız. Toplam Bakiye: ${profile.chips.toLocaleString("tr-TR")} Çip`
                                    : `Masadan ayrıldınız. Güncel Bakiye: ${profile.chips.toLocaleString("tr-TR")} Çip`
                                );
                              }}
                              className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm flex items-center gap-2 transition cursor-pointer"
                            >
                              <Coins className="w-4 h-4" />
                              {pistiGame.chipChange > 0
                                ? "Kazancı Alıp Çık"
                                : "Masadan Çık"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setPistiGame(null)}
                              className="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-sm transition cursor-pointer"
                            >
                              Bahis Değiştir
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        )}

        {/* ====================================================
            TAB 3: ONLINE MULTIPLAYER (ROOMS & LIVE TABLE)
        ==================================================== */}
        {activeTab === "online" && (
          <div className="max-w-5xl mx-auto">
            {!currentRoom ? (
              <div className="space-y-8">
                <div>
                  <h2 className="font-display text-2xl sm:text-3xl font-bold text-emerald-300">
                    Canlı Multiplayer Lobi
                  </h2>
                  <p className="text-sm text-slate-300">
                    Oda kurup arkadaşlarınıza oda kodunu gönderin veya açık
                    masalara hemen katılın!
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Create Room Card */}
                  <div className="rounded-3xl bg-slate-950/80 border border-emerald-500/30 p-6 shadow-xl space-y-5">
                    <div className="flex items-center gap-3">
                      <Plus className="w-6 h-6 text-emerald-400" />
                      <h3 className="font-display text-xl font-bold text-white">
                        Yeni Online Masa Kur
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setNewRoomGameType("pisti")}
                        className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
                          newRoomGameType === "pisti"
                            ? "bg-emerald-500/20 border-emerald-400 text-white"
                            : "bg-slate-900 border-slate-800 text-slate-400"
                        }`}
                      >
                        <div className="font-bold text-sm">🃏 Pişti (1v1)</div>
                        <div className="text-[11px] opacity-75">
                          2 Kişilik Düello
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setNewRoomGameType("pisti_2v2")}
                        className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
                          newRoomGameType === "pisti_2v2"
                            ? "bg-amber-500/25 border-amber-400 text-white shadow-lg shadow-amber-500/10"
                            : "bg-slate-900 border-slate-800 text-slate-400"
                        }`}
                      >
                        <div className="font-bold text-sm">
                          🤝 Eşli Pişti (2v2)
                        </div>
                        <div className="text-[11px] opacity-75">
                          4 Kişilik Takımlı
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setNewRoomGameType("blackjack")}
                        className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
                          newRoomGameType === "blackjack"
                            ? "bg-amber-500/20 border-amber-400 text-white"
                            : "bg-slate-900 border-slate-800 text-slate-400"
                        }`}
                      >
                        <div className="font-bold text-sm">♠️ Blackjack</div>
                        <div className="text-[11px] opacity-75">
                          1-4 Kişilik Masa
                        </div>
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1.5">
                        Masa Adı (İsteğe Bağlı)
                      </label>
                      <input
                        type="text"
                        value={newRoomName}
                        onChange={(e) => setNewRoomName(e.target.value)}
                        placeholder={`${profile.nickname} VIP Masası`}
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-emerald-400"
                      />
                    </div>

                    <div>
                      <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1.5">
                        Masa Bahsi (Çip)
                      </label>
                      <div className="flex gap-2">
                        {[25, 50, 100, 250].map((b) => (
                          <button
                            key={b}
                            type="button"
                            onClick={() => setNewRoomBet(b)}
                            className={`flex-1 py-2 rounded-xl font-mono-num text-sm font-bold border transition cursor-pointer ${
                              newRoomBet === b
                                ? "bg-amber-400 text-slate-950 border-amber-300"
                                : "bg-slate-900 text-slate-300 border-slate-700"
                            }`}
                          >
                            {b}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleCreateRoom}
                      className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-400 text-slate-950 font-bold text-base shadow-lg hover:brightness-110 transition cursor-pointer"
                    >
                      Odayı Oluştur & Davet Kodu Al
                    </button>
                  </div>

                  {/* Join by Code & Active Rooms */}
                  <div className="rounded-3xl bg-slate-950/80 border border-amber-500/30 p-6 shadow-xl flex flex-col justify-between space-y-6">
                    <div>
                      <h3 className="font-display text-xl font-bold text-white mb-2">
                        Oda Kodu İle Katıl
                      </h3>
                      <p className="text-xs text-slate-400 mb-4">
                        Arkadaşınızın paylaştığı 6 haneli kodu (Örn: PS4821)
                        girin:
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={roomCodeInput}
                          onChange={(e) =>
                            setRoomCodeInput(e.target.value.toUpperCase())
                          }
                          placeholder="ODA KODU (Örn: PS1234)"
                          className="flex-1 px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 font-mono-num text-base font-bold uppercase tracking-widest text-amber-300 focus:outline-none focus:border-amber-400"
                        />
                        <button
                          type="button"
                          onClick={() => handleJoinRoom(roomCodeInput)}
                          className="px-6 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold transition cursor-pointer"
                        >
                          Katıl
                        </button>
                      </div>
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          Açık Masalar ({rooms.length})
                        </h4>
                        <button
                          type="button"
                          onClick={fetchServerData}
                          className="text-xs text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <RefreshCw className="w-3 h-3" /> Yenile
                        </button>
                      </div>

                      {rooms.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-800 p-6 text-center text-xs text-slate-500">
                          Şu an bekleyen açık masa yok. Soldan ilk masayı siz
                          kurun!
                        </div>
                      ) : (
                        <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                          {rooms.map((r) => (
                            <div
                              key={r.code}
                              className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-emerald-500/40 transition"
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-sm text-white">
                                    {r.name}
                                  </span>
                                  <span className="px-2 py-0.5 rounded bg-slate-800 font-mono-num text-xs text-amber-300">
                                    {r.code}
                                  </span>
                                </div>
                                <div className="text-xs text-slate-400 mt-0.5">
                                  {r.gameType === "pisti_2v2"
                                    ? "🤝 Pişti 2v2 Eşli"
                                    : r.gameType === "pisti"
                                    ? "🃏 Pişti 1v1"
                                    : "♠️ Blackjack"}{" "}
                                  • Bahis: {r.betAmount} Çip • Oyuncular:{" "}
                                  {r.players.length}/{r.maxPlayers}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleJoinRoom(r.code)}
                                className="px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-300 text-xs font-bold transition cursor-pointer"
                              >
                                Masaya Geç
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* INSIDE AN ACTIVE ONLINE ROOM */
              <div className="space-y-6">
                {/* Room Top Bar */}
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5 rounded-3xl bg-slate-950/90 border border-emerald-500/40">
                  <div className="flex items-center gap-3">
                    <div className="px-3.5 py-2 rounded-2xl bg-emerald-500/15 border border-emerald-400/40 font-mono-num font-bold text-lg text-emerald-300">
                      {currentRoom.code}
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-white">
                        {currentRoom.name}
                      </h3>
                      <p className="text-xs text-slate-400">
                        {currentRoom.gameType === "pisti_2v2"
                          ? "Online 2v2 Eşli (Takımlı) Pişti"
                          : currentRoom.gameType === "pisti"
                          ? "Online 1v1 Pişti"
                          : "Online Çok Oyunculu Blackjack"}{" "}
                        • Masa Bahsi:{" "}
                        <strong className="text-amber-300">
                          {currentRoom.betAmount} Çip
                        </strong>
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(currentRoom.code);
                        setCopiedCode(true);
                        setTimeout(() => setCopiedCode(false), 2000);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      {copiedCode ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Copy className="w-4 h-4 text-amber-300" />
                      )}
                      {copiedCode ? "Kopyalandı!" : "Kodu Kopyala"}
                    </button>

                    <a
                      href={`/?join=${currentRoom.code}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 text-xs font-semibold flex items-center gap-1.5 transition"
                      title="Aynı bilgisayarda 2. oyuncu olarak test etmek için yeni sekmede açar"
                    >
                      <ExternalLink className="w-4 h-4" />
                      2. Sekmede Rakip Aç (Test)
                    </a>

                    <button
                      type="button"
                      onClick={handleLeaveRoom}
                      className="px-3.5 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      Odadan Ayrıl
                    </button>
                  </div>
                </div>

                {/* WAITING LOBBY STATE */}
                {currentRoom.status === "waiting" && (
                  <div className="rounded-3xl bg-slate-950/75 border border-white/10 p-6 sm:p-8 text-center space-y-6">
                    {currentRoom.winnerMessage && (
                      <div className="inline-block px-4 py-2 rounded-xl bg-amber-500/15 border border-amber-400/40 text-amber-300 text-xs font-semibold">
                        {currentRoom.winnerMessage}
                      </div>
                    )}
                    <h4 className="font-display text-2xl font-bold text-amber-300">
                      Oyuncular Bekleniyor ({currentRoom.players.length}/
                      {currentRoom.maxPlayers})
                    </h4>

                    {currentRoom.gameType === "pisti_2v2" ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl mx-auto text-left">
                        {/* Team A Column */}
                        <div className="rounded-2xl bg-amber-500/10 border border-amber-400/40 p-5 space-y-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <h5 className="font-display font-bold text-amber-300 text-base">
                                🅰️ Altın Takım (Takım A)
                              </h5>
                              <p className="text-[11px] text-slate-400">
                                Karşılıklı oturan 2 ortak
                              </p>
                            </div>
                            {currentRoom.players.find(
                              (p) => p.id === profile.id
                            )?.team !== "A" && (
                              <button
                                type="button"
                                onClick={() => handleSwitchRoomTeam("A")}
                                className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold transition cursor-pointer"
                              >
                                Bu Takıma Geç
                              </button>
                            )}
                          </div>
                          <div className="space-y-2.5">
                            {[0, 1].map((slotIdx) => {
                              const teamPlayers = currentRoom.players.filter(
                                (p) => (p.team || "A") === "A"
                              );
                              const member = teamPlayers[slotIdx];
                              return member ? (
                                <div
                                  key={member.id}
                                  className="flex items-center justify-between p-3 rounded-xl bg-slate-900/90 border border-amber-400/30"
                                >
                                  <div className="flex items-center gap-2.5">
                                    <span className="text-2xl">
                                      {member.avatar}
                                    </span>
                                    <div>
                                      <div className="font-bold text-sm text-white">
                                        {member.nickname}
                                      </div>
                                      <div className="text-[11px] text-amber-300 font-mono-num">
                                        {member.chips} Çip
                                      </div>
                                    </div>
                                  </div>
                                  {member.id === currentRoom.hostId && (
                                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                                      Kurucu
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div
                                  key={`empty-a-${slotIdx}`}
                                  className="p-3.5 rounded-xl border border-dashed border-amber-400/30 text-center text-xs text-slate-500"
                                >
                                  Boş Koltuk ({slotIdx + 1}. Ortak Bekleniyor)
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Team B Column */}
                        <div className="rounded-2xl bg-emerald-500/10 border border-emerald-400/40 p-5 space-y-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <h5 className="font-display font-bold text-emerald-300 text-base">
                                🅱️ Zümrüt Takım (Takım B)
                              </h5>
                              <p className="text-[11px] text-slate-400">
                                Karşılıklı oturan 2 ortak
                              </p>
                            </div>
                            {currentRoom.players.find(
                              (p) => p.id === profile.id
                            )?.team !== "B" && (
                              <button
                                type="button"
                                onClick={() => handleSwitchRoomTeam("B")}
                                className="px-3 py-1.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-xs font-bold transition cursor-pointer"
                              >
                                Bu Takıma Geç
                              </button>
                            )}
                          </div>
                          <div className="space-y-2.5">
                            {[0, 1].map((slotIdx) => {
                              const teamPlayers = currentRoom.players.filter(
                                (p) => p.team === "B"
                              );
                              const member = teamPlayers[slotIdx];
                              return member ? (
                                <div
                                  key={member.id}
                                  className="flex items-center justify-between p-3 rounded-xl bg-slate-900/90 border border-emerald-400/30"
                                >
                                  <div className="flex items-center gap-2.5">
                                    <span className="text-2xl">
                                      {member.avatar}
                                    </span>
                                    <div>
                                      <div className="font-bold text-sm text-white">
                                        {member.nickname}
                                      </div>
                                      <div className="text-[11px] text-emerald-300 font-mono-num">
                                        {member.chips} Çip
                                      </div>
                                    </div>
                                  </div>
                                  {member.id === currentRoom.hostId && (
                                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                                      Kurucu
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div
                                  key={`empty-b-${slotIdx}`}
                                  className="p-3.5 rounded-xl border border-dashed border-emerald-400/30 text-center text-xs text-slate-500"
                                >
                                  Boş Koltuk ({slotIdx + 1}. Ortak Bekleniyor)
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-center flex-wrap gap-4">
                        {currentRoom.players.map((p) => (
                          <div
                            key={p.id}
                            className="w-44 p-4 rounded-2xl bg-slate-900 border border-emerald-500/30 flex flex-col items-center gap-2"
                          >
                            <span className="text-3xl">{p.avatar}</span>
                            <span className="font-bold text-white text-sm">
                              {p.nickname}
                            </span>
                            <span className="text-xs text-amber-400 font-mono-num">
                              {p.chips} Çip
                            </span>
                            {p.id === currentRoom.hostId && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                                Masa Sahibi
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {currentRoom.hostId === profile.id ? (
                      <div className="flex flex-wrap items-center justify-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleStartOnlineGame(false, false)}
                          disabled={
                            (currentRoom.gameType === "pisti" &&
                              currentRoom.players.length < 2) ||
                            (currentRoom.gameType === "pisti_2v2" &&
                              currentRoom.players.length < 4)
                          }
                          className="px-8 py-4 rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-400 disabled:opacity-40 text-slate-950 font-bold text-base sm:text-lg shadow-xl transition cursor-pointer"
                        >
                          {currentRoom.gameType === "pisti" &&
                          currentRoom.players.length < 2
                            ? "2. Oyuncu Bekleniyor..."
                            : currentRoom.gameType === "pisti_2v2" &&
                              currentRoom.players.length < 4
                            ? `4 Oyuncu Bekleniyor (${currentRoom.players.length}/4)`
                            : "Oyunu Şimdi Başlat"}
                        </button>

                        {currentRoom.gameType === "pisti_2v2" &&
                          currentRoom.players.length < 4 && (
                            <button
                              type="button"
                              onClick={() => handleStartOnlineGame(false, true)}
                              className="px-6 py-4 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-sm sm:text-base shadow-xl transition cursor-pointer"
                            >
                              🤖 Eksik Koltukları Botla Tamamla & Başlat
                            </button>
                          )}
                      </div>
                    ) : (
                      <p className="text-sm text-emerald-300 animate-pulse">
                        Masa sahibinin ({currentRoom.hostName}) oyunu başlatması
                        bekleniyor...
                      </p>
                    )}
                  </div>
                )}

                {/* ONLINE MULTIPLAYER 2v2 TEAM PİŞTİ TABLE */}
                {currentRoom.status !== "waiting" &&
                  currentRoom.gameType === "pisti_2v2" &&
                  currentRoom.pisti &&
                  (() => {
                    const ps = currentRoom.pisti;
                    const myIdx = Math.max(
                      0,
                      ps.players.findIndex((p) => p.playerId === profile.id)
                    );
                    const me = ps.players[myIdx] ?? ps.players[0];
                    const leftOpp = ps.players[(myIdx + 1) % 4];
                    const partner = ps.players[(myIdx + 2) % 4];
                    const rightOpp = ps.players[(myIdx + 3) % 4];

                    const activePlayer = ps.players.find(
                      (p) => p.playerId === ps.turnPlayerId
                    );
                    const isMyTurn =
                      currentRoom.status === "playing" &&
                      ps.turnPlayerId === profile.id;
                    const isPartnerTurn =
                      currentRoom.status === "playing" &&
                      partner &&
                      ps.turnPlayerId === partner.playerId;

                    const centerCard =
                      onlinePistiAnim?.card ??
                      ps.board[ps.board.length - 1] ??
                      null;

                    const teamAMembers = ps.players
                      .filter((p) => p.team === "A")
                      .map((p) => p.nickname)
                      .join(" & ");
                    const teamBMembers = ps.players
                      .filter((p) => p.team === "B")
                      .map((p) => p.nickname)
                      .join(" & ");

                    return (
                      <div className="rounded-3xl bg-emerald-950/45 border-2 border-amber-500/30 p-4 sm:p-6 space-y-6">
                        {/* 2v2 Team Scoreboard Header */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center rounded-2xl bg-slate-950/80 border border-white/10 p-4">
                          <div
                            className={`rounded-xl p-3 border ${
                              me.team === "A"
                                ? "bg-amber-500/15 border-amber-400/50"
                                : "bg-slate-900/70 border-white/10"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-extrabold text-amber-300">
                                🅰️ ALTIN TAKIM{" "}
                                {me.team === "A" ? "(SİZİN TAKIM)" : ""}
                              </span>
                              <span className="font-mono-num text-lg font-extrabold text-amber-300">
                                {ps.teamAScore ?? 0} Puan
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-300 truncate mt-0.5">
                              {teamAMembers}
                            </div>
                            <div className="flex gap-3 mt-1.5 text-[11px] text-slate-400">
                              <span>
                                🔥 Pişti:{" "}
                                <strong className="text-amber-300">
                                  {ps.teamAPistiCount ?? 0}
                                </strong>
                              </span>
                              <span>
                                🃏 Toplanan:{" "}
                                <strong className="text-white">
                                  {ps.teamACardCount ?? 0} Kart
                                </strong>
                              </span>
                            </div>
                          </div>

                          <div className="text-center space-y-1">
                            <div className="text-xs font-bold uppercase tracking-widest text-slate-400">
                              {ps.roundNumber}. El • Kalan Deste:{" "}
                              {ps.deck.length}
                            </div>
                            <div
                              className={`inline-block px-4 py-1.5 rounded-full text-xs font-bold ${
                                isMyTurn
                                  ? "bg-emerald-400 text-slate-950 animate-pulse"
                                  : isPartnerTurn
                                  ? "bg-amber-400/25 text-amber-200 border border-amber-400/50"
                                  : "bg-slate-900 text-slate-300"
                              }`}
                            >
                              {currentRoom.status === "finished"
                                ? currentRoom.winnerMessage
                                : onlinePistiAnim?.bannerText
                                ? onlinePistiAnim.bannerText
                                : isMyTurn
                                ? "🟢 SIRA SİZDE — Kartınızı Atın"
                                : isPartnerTurn
                                ? `🤝 Sıra Ortağınızda (${partner?.nickname})`
                                : `⏳ Sıra Rakipte (${activePlayer?.nickname})`}
                            </div>
                          </div>

                          <div
                            className={`rounded-xl p-3 border ${
                              me.team === "B"
                                ? "bg-emerald-500/15 border-emerald-400/50"
                                : "bg-slate-900/70 border-white/10"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-extrabold text-emerald-300">
                                🅱️ ZÜMRÜT TAKIM{" "}
                                {me.team === "B" ? "(SİZİN TAKIM)" : ""}
                              </span>
                              <span className="font-mono-num text-lg font-extrabold text-emerald-300">
                                {ps.teamBScore ?? 0} Puan
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-300 truncate mt-0.5">
                              {teamBMembers}
                            </div>
                            <div className="flex gap-3 mt-1.5 text-[11px] text-slate-400">
                              <span>
                                🔥 Pişti:{" "}
                                <strong className="text-emerald-300">
                                  {ps.teamBPistiCount ?? 0}
                                </strong>
                              </span>
                              <span>
                                🃏 Toplanan:{" "}
                                <strong className="text-white">
                                  {ps.teamBCardCount ?? 0} Kart
                                </strong>
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Top Seat: Partner (Teammate across the table) */}
                        {partner && (
                          <div className="flex flex-col items-center">
                            <div
                              className={`inline-flex flex-wrap items-center justify-center gap-2.5 px-4 py-1.5 rounded-2xl border mb-2.5 text-xs transition ${
                                ps.turnPlayerId === partner.playerId &&
                                currentRoom.status === "playing"
                                  ? "bg-amber-500/20 border-amber-400 ring-2 ring-amber-400/50"
                                  : "bg-slate-950/75 border-white/10"
                              }`}
                            >
                              <span className="px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 font-bold text-[10px]">
                                🤝 ORTAĞINIZ (Takım {partner.team})
                              </span>
                              <span className="font-bold text-white">
                                {partner.avatar} {partner.nickname}
                              </span>
                              <span className="text-slate-400">
                                Pişti: {partner.pistiCount} • Kart:{" "}
                                {partner.captured.length}
                              </span>
                            </div>
                            <div className="flex justify-center gap-1.5 min-h-[84px]">
                              {partner.hand.map((_, idx) => (
                                <PlayingCard
                                  key={`partner-${ps.roundNumber}-${idx}`}
                                  faceDown
                                  size="sm"
                                  className="animate-deal"
                                />
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Middle Row: Left Opponent — Center Board — Right Opponent */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 items-center gap-4 py-3 border-y border-white/10">
                          {/* Left Opponent */}
                          <div className="lg:col-span-3 flex flex-col items-center">
                            {leftOpp && (
                              <div
                                className={`w-full rounded-2xl p-3.5 text-center border transition ${
                                  ps.turnPlayerId === leftOpp.playerId &&
                                  currentRoom.status === "playing"
                                    ? "bg-rose-500/15 border-rose-400 ring-2 ring-rose-400/50"
                                    : "bg-slate-950/65 border-white/10"
                                }`}
                              >
                                <div className="text-[10px] uppercase font-bold text-rose-300 mb-1">
                                  ⚔️ Sol Rakip (Takım {leftOpp.team})
                                </div>
                                <div className="font-bold text-sm text-white">
                                  {leftOpp.avatar} {leftOpp.nickname}
                                </div>
                                <div className="text-[11px] text-slate-400 mt-0.5 mb-2">
                                  Pişti: {leftOpp.pistiCount} • Kart:{" "}
                                  {leftOpp.captured.length}
                                </div>
                                <div className="flex justify-center -space-x-6 min-h-[76px]">
                                  {leftOpp.hand.map((_, idx) => (
                                    <PlayingCard
                                      key={`left-${ps.roundNumber}-${idx}`}
                                      faceDown
                                      size="sm"
                                    />
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Center Pile */}
                          <div className="lg:col-span-6 flex flex-col items-center justify-center space-y-2.5">
                            {ps.lastMove && (
                              <div className="text-xs text-slate-300 text-center">
                                Son Hamle:{" "}
                                <strong className="text-amber-300">
                                  {ps.lastMove.byNickname} (Takım{" "}
                                  {ps.lastMove.byTeam || "A"})
                                </strong>{" "}
                                {ps.lastMove.madePisti
                                  ? "🔥 PİŞTİ YAPTI! (+10p)"
                                  : ps.lastMove.capturedCount > 0
                                  ? `yerdeki ${ps.lastMove.capturedCount} kartı topladı!`
                                  : "yere kart attı."}
                              </div>
                            )}

                            <div className="text-center">
                              {ps.board.length === 1 ? (
                                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-400/20 border border-amber-400/60 text-amber-300 text-xs font-extrabold tracking-wide animate-pulse">
                                  🔥 TEK KART — PİŞTİ FIRSATI! (+10p)
                                </span>
                              ) : (
                                <span className="text-xs text-amber-300 font-semibold">
                                  Yerdeki Kartlar ({ps.board.length})
                                </span>
                              )}
                            </div>

                            <div className="relative min-w-[180px] h-44 flex items-center justify-center px-4">
                              {!centerCard ? (
                                <div className="w-24 h-36 rounded-xl border-2 border-dashed border-emerald-500/40 flex items-center justify-center text-xs text-emerald-300/60">
                                  Yer Boş
                                </div>
                              ) : (
                                <div
                                  key={`${ps.lastMove?.timestamp ?? 0}-${centerCard}`}
                                  className={`relative flex items-center justify-center -space-x-11 ${
                                    onlinePistiAnim
                                      ? onlinePistiAnim.animClass
                                      : ""
                                  }`}
                                >
                                  {(ps.board.length > 0
                                    ? ps.board.slice(-6)
                                    : [centerCard]
                                  ).map((bCard, bIdx, arr) => {
                                    const isTopCard = bIdx === arr.length - 1;
                                    const globalIdx =
                                      ps.board.length - arr.length + bIdx;
                                    const isInitialHidden =
                                      ps.lastCapturerId === "" &&
                                      globalIdx < 3 &&
                                      !isTopCard;
                                    return (
                                      <div
                                        key={`mp2v2-board-${globalIdx}-${bCard}`}
                                        style={{ zIndex: bIdx + 1 }}
                                        className={`transition-transform duration-200 ${
                                          isTopCard
                                            ? "scale-105 ring-2 ring-amber-400/80 rounded-xl shadow-2xl"
                                            : "opacity-85 scale-95 -translate-y-1"
                                        }`}
                                      >
                                        <PlayingCard
                                          card={bCard}
                                          faceDown={isInitialHidden}
                                          highlightSpecial={isTopCard}
                                          size="md"
                                        />
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Right Opponent */}
                          <div className="lg:col-span-3 flex flex-col items-center">
                            {rightOpp && (
                              <div
                                className={`w-full rounded-2xl p-3.5 text-center border transition ${
                                  ps.turnPlayerId === rightOpp.playerId &&
                                  currentRoom.status === "playing"
                                    ? "bg-rose-500/15 border-rose-400 ring-2 ring-rose-400/50"
                                    : "bg-slate-950/65 border-white/10"
                                }`}
                              >
                                <div className="text-[10px] uppercase font-bold text-rose-300 mb-1">
                                  ⚔️ Sağ Rakip (Takım {rightOpp.team})
                                </div>
                                <div className="font-bold text-sm text-white">
                                  {rightOpp.avatar} {rightOpp.nickname}
                                </div>
                                <div className="text-[11px] text-slate-400 mt-0.5 mb-2">
                                  Pişti: {rightOpp.pistiCount} • Kart:{" "}
                                  {rightOpp.captured.length}
                                </div>
                                <div className="flex justify-center -space-x-6 min-h-[76px]">
                                  {rightOpp.hand.map((_, idx) => (
                                    <PlayingCard
                                      key={`right-${ps.roundNumber}-${idx}`}
                                      faceDown
                                      size="sm"
                                    />
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Bottom Seat: My Hand */}
                        <div className="text-center">
                          <div className="flex flex-wrap items-center justify-center gap-3 mb-4 text-xs sm:text-sm">
                            <span className="px-3.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 font-bold">
                              {me.avatar} Siz ({me.nickname} • Takım {me.team})
                            </span>
                            <span className="px-3.5 py-1 rounded-full bg-amber-500/20 text-amber-300 font-bold">
                              Bireysel Pişti: {me.pistiCount}
                            </span>
                            <span className="px-3.5 py-1 rounded-full bg-slate-900 text-slate-300">
                              Bireysel Toplanan: {me.captured.length} Kart
                            </span>
                          </div>

                          {currentRoom.status === "playing" ? (
                            <div className="flex justify-center flex-wrap gap-3 sm:gap-4 min-h-[160px]">
                              {me.hand.map((c, idx) => (
                                <PlayingCard
                                  key={`2v2-${ps.roundNumber}-${c}`}
                                  card={c}
                                  highlightSpecial
                                  size="lg"
                                  disabled={
                                    !isMyTurn || Boolean(onlinePistiAnim)
                                  }
                                  onClick={() => handleOnlinePistiCard(c)}
                                  className="animate-deal"
                                  style={{ animationDelay: `${idx * 80}ms` }}
                                />
                              ))}
                            </div>
                          ) : (
                            <div className="space-y-4">
                              <div className="text-lg font-bold text-amber-300">
                                {currentRoom.winnerMessage}
                              </div>
                              <div className="flex flex-wrap justify-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => handleStartOnlineGame(true, true)}
                                  className="px-7 py-3.5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold transition cursor-pointer"
                                >
                                  🔄 2v2 Rövanş Başlat (Tekrar Oyna)
                                </button>
                                <button
                                  type="button"
                                  onClick={handleLeaveRoom}
                                  className="px-6 py-3.5 rounded-2xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/50 text-emerald-200 font-bold transition cursor-pointer"
                                >
                                  💰 Kazancı Alıp Masadan Çık
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                {/* ONLINE MULTIPLAYER 1v1 PİŞTİ TABLE */}
                {currentRoom.status !== "waiting" &&
                  currentRoom.gameType === "pisti" &&
                  currentRoom.pisti &&
                  (() => {
                    const ps = currentRoom.pisti;
                    const me =
                      ps.players.find((p) => p.playerId === profile.id) ??
                      ps.players[0];
                    const opp =
                      ps.players.find((p) => p.playerId !== profile.id) ??
                      ps.players[1];
                    const isMyTurn =
                      currentRoom.status === "playing" &&
                      ps.turnPlayerId === profile.id;

                    const centerCard =
                      onlinePistiAnim?.card ??
                      ps.board[ps.board.length - 1] ??
                      null;

                    return (
                      <div className="rounded-3xl bg-emerald-950/45 border-2 border-amber-500/30 p-6 space-y-6">
                        {/* Opponent Row */}
                        <div className="flex flex-col items-center">
                          <div className="flex flex-wrap items-center gap-3 mb-3 text-xs sm:text-sm">
                            <span className="px-3 py-1 rounded-full bg-slate-900 border border-white/10 font-bold">
                              {opp.avatar} {opp.nickname}: {opp.score} Puan
                            </span>
                            <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300">
                              Pişti: {opp.pistiCount}
                            </span>
                            <span className="px-3 py-1 rounded-full bg-slate-900 text-slate-300">
                              Kart: {opp.captured.length}
                            </span>
                          </div>
                          <div className="flex justify-center gap-2 min-h-[96px]">
                            {opp.hand.map((_, idx) => (
                              <PlayingCard
                                key={`opp-${ps.roundNumber}-${idx}`}
                                faceDown
                                size="sm"
                                className="animate-deal"
                                style={{ animationDelay: `${idx * 80}ms` }}
                              />
                            ))}
                          </div>
                        </div>

                        {/* Center Board */}
                        <div className="flex flex-col items-center justify-center py-4 border-y border-white/10 space-y-3">
                          <div
                            className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                              isMyTurn
                                ? "bg-emerald-400 text-slate-950 animate-pulse"
                                : "bg-slate-900 text-amber-300"
                            }`}
                          >
                            {currentRoom.status === "finished"
                              ? currentRoom.winnerMessage
                              : onlinePistiAnim?.bannerText
                              ? onlinePistiAnim.bannerText
                              : isMyTurn
                              ? "🟢 SIRA SİZDE — Bir Kart Atın"
                              : `⏳ Sıra ${opp.nickname} oyuncusunda...`}
                          </div>

                          {ps.lastMove && (
                            <div className="text-xs text-slate-300">
                              Son Hamle:{" "}
                              <strong>{ps.lastMove.byNickname}</strong>{" "}
                              {ps.lastMove.madePisti
                                ? "🔥 PİŞTİ YAPTI!"
                                : ps.lastMove.capturedCount > 0
                                ? `yerdeki ${ps.lastMove.capturedCount} kartı topladı!`
                                : "yere kart attı."}
                            </div>
                          )}

                          <div className="text-center">
                            {ps.board.length === 1 ? (
                              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-400/20 border border-amber-400/60 text-amber-300 text-xs font-extrabold tracking-wide animate-pulse">
                                🔥 TEK KART — PİŞTİ FIRSATI! (+10p)
                              </span>
                            ) : (
                              <span className="text-xs text-amber-300 font-semibold">
                                Yerdeki Kartlar ({ps.board.length})
                              </span>
                            )}
                          </div>

                          <div className="relative min-w-[180px] h-44 flex items-center justify-center px-4">
                            {!centerCard ? (
                              <div className="w-24 h-36 rounded-xl border-2 border-dashed border-emerald-500/40 flex items-center justify-center text-xs text-emerald-300/60">
                                Yer Boş
                              </div>
                            ) : (
                              <div
                                key={`${ps.lastMove?.timestamp ?? 0}-${centerCard}`}
                                className={`relative flex items-center justify-center -space-x-11 ${
                                  onlinePistiAnim
                                    ? onlinePistiAnim.animClass
                                    : ""
                                }`}
                              >
                                {(ps.board.length > 0
                                  ? ps.board.slice(-6)
                                  : [centerCard]
                                ).map((bCard, bIdx, arr) => {
                                  const isTopCard = bIdx === arr.length - 1;
                                  const globalIdx =
                                    ps.board.length - arr.length + bIdx;
                                  const isInitialHidden =
                                    ps.lastCapturerId === "" &&
                                    globalIdx < 3 &&
                                    !isTopCard;
                                  return (
                                    <div
                                      key={`mp-board-${globalIdx}-${bCard}`}
                                      style={{ zIndex: bIdx + 1 }}
                                      className={`transition-transform duration-200 ${
                                        isTopCard
                                          ? "scale-105 ring-2 ring-amber-400/80 rounded-xl shadow-2xl"
                                          : "opacity-85 scale-95 -translate-y-1"
                                      }`}
                                    >
                                      <PlayingCard
                                        card={bCard}
                                        faceDown={isInitialHidden}
                                        highlightSpecial={isTopCard}
                                        size="md"
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* My Hand */}
                        <div className="text-center">
                          <div className="flex flex-wrap items-center justify-center gap-3 mb-4 text-xs sm:text-sm">
                            <span className="px-3.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 font-bold">
                              {me.avatar} Siz ({me.nickname}): {me.score} Puan
                            </span>
                            <span className="px-3.5 py-1 rounded-full bg-amber-500/20 text-amber-300 font-bold">
                              Pişti: {me.pistiCount}
                            </span>
                            <span className="px-3.5 py-1 rounded-full bg-slate-900 text-slate-300">
                              Toplanan: {me.captured.length} Kart
                            </span>
                          </div>

                          {currentRoom.status === "playing" ? (
                            <div className="flex justify-center flex-wrap gap-3 sm:gap-4 min-h-[160px]">
                              {me.hand.map((c, idx) => (
                                <PlayingCard
                                  key={`${ps.roundNumber}-${c}`}
                                  card={c}
                                  highlightSpecial
                                  size="lg"
                                  disabled={
                                    !isMyTurn || Boolean(onlinePistiAnim)
                                  }
                                  onClick={() => handleOnlinePistiCard(c)}
                                  className="animate-deal"
                                  style={{ animationDelay: `${idx * 80}ms` }}
                                />
                              ))}
                            </div>
                          ) : (
                            <div className="space-y-4">
                              <div className="text-lg font-bold text-amber-300">
                                {currentRoom.winnerMessage}
                              </div>
                              <div className="flex flex-wrap justify-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => handleStartOnlineGame(true)}
                                  className="px-7 py-3.5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold transition cursor-pointer"
                                >
                                  🔄 Rövanş Başlat (Tekrar Oyna)
                                </button>
                                <button
                                  type="button"
                                  onClick={handleLeaveRoom}
                                  className="px-6 py-3.5 rounded-2xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/50 text-emerald-200 font-bold transition cursor-pointer"
                                >
                                  💰 Kazancı Alıp Masadan Çık
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                {/* ONLINE MULTIPLAYER BLACKJACK TABLE */}
                {currentRoom.status !== "waiting" &&
                  currentRoom.gameType === "blackjack" &&
                  currentRoom.blackjack &&
                  (() => {
                    const bj = currentRoom.blackjack;
                    const activeSeat = bj.seats[bj.activeSeatIndex];
                    const isMyTurn =
                      currentRoom.status === "playing" &&
                      activeSeat?.playerId === profile.id;

                    return (
                      <div className="rounded-3xl bg-emerald-950/45 border-2 border-amber-500/30 p-6 space-y-8">
                        {/* Dealer */}
                        <div className="text-center">
                          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-950 text-sm font-semibold mb-3">
                            <span>Kurpiyer</span>
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono-num">
                              {bj.dealerRevealed ? bj.dealerScore : "?"}
                            </span>
                          </div>
                          <div className="flex justify-center gap-3">
                            {bj.dealerHand.map((c, idx) => {
                              const faceDown = idx === 0 && !bj.dealerRevealed;
                              return (
                                <PlayingCard
                                  key={`mp-dealer-${idx}-${
                                    faceDown ? "down" : c
                                  }`}
                                  card={c}
                                  faceDown={faceDown}
                                  className={
                                    idx === 0 && bj.dealerRevealed
                                      ? "animate-flip-reveal"
                                      : "animate-deal"
                                  }
                                />
                              );
                            })}
                          </div>
                        </div>

                        {/* Seats Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {bj.seats.map((seat, idx) => {
                            const isCurrent =
                              currentRoom.status === "playing" &&
                              idx === bj.activeSeatIndex;
                            return (
                              <div
                                key={seat.playerId}
                                className={`rounded-2xl p-4 text-center border transition ${
                                  isCurrent
                                    ? "bg-amber-500/15 border-amber-400 shadow-lg"
                                    : "bg-slate-950/50 border-white/10"
                                }`}
                              >
                                <div className="flex items-center justify-between mb-3">
                                  <span className="font-bold text-sm text-white">
                                    {seat.avatar} {seat.nickname}
                                  </span>
                                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono-num text-xs font-bold">
                                    Skor: {seat.score} • Bahis: {seat.bet}
                                  </span>
                                </div>
                                <div className="flex justify-center flex-wrap gap-2 mb-2">
                                  {seat.hand.map((c, cIdx) => (
                                    <PlayingCard
                                      key={`${seat.playerId}-${cIdx}-${c}`}
                                      card={c}
                                      size="sm"
                                      className="animate-deal"
                                    />
                                  ))}
                                </div>
                                {seat.resultText && (
                                  <div className="text-xs font-bold text-amber-300 mt-2 animate-pop-banner">
                                    {seat.resultText} (
                                    {seat.chipChange > 0
                                      ? `+${seat.chipChange}`
                                      : seat.chipChange}{" "}
                                    Çip)
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Controls */}
                        <div className="flex justify-center gap-3">
                          {currentRoom.status === "playing" ? (
                            isMyTurn ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleOnlineBjMove("hit")}
                                  className="px-6 py-3 rounded-xl bg-emerald-500 text-slate-950 font-bold cursor-pointer"
                                >
                                  Kart Çek (Hit)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOnlineBjMove("stand")}
                                  className="px-6 py-3 rounded-xl bg-rose-600 text-white font-bold cursor-pointer"
                                >
                                  Dur (Stand)
                                </button>
                                {activeSeat.hand.length === 2 && (
                                  <button
                                    type="button"
                                    onClick={() => handleOnlineBjMove("double")}
                                    className="px-6 py-3 rounded-xl bg-amber-400 text-slate-950 font-bold cursor-pointer"
                                  >
                                    2x Katla
                                  </button>
                                )}
                              </>
                            ) : (
                              <div className="text-sm text-amber-300 animate-pulse">
                                Sıra {activeSeat?.nickname} oyuncusunda...
                              </div>
                            )
                          ) : (
                            <div className="flex flex-wrap justify-center gap-3">
                              <button
                                type="button"
                                onClick={() => handleStartOnlineGame(true)}
                                className="px-7 py-3.5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold transition cursor-pointer"
                              >
                                🔄 Yeni El Dağıt (Tekrar Oyna)
                              </button>
                              <button
                                type="button"
                                onClick={handleLeaveRoom}
                                className="px-6 py-3.5 rounded-2xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/50 text-emerald-200 font-bold transition cursor-pointer"
                              >
                                💰 Kazancı Alıp Masadan Çık
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
              </div>
            )}
          </div>
        )}

        {/* ====================================================
            TAB 4: LEADERBOARD
        ==================================================== */}
        {activeTab === "leaderboard" && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-amber-300">
                En Zengin Oyuncular — Liderlik Tablosu
              </h2>
              <p className="text-sm text-slate-300">
                Blackjack ve Pişti masalarında en yüksek çip bakiyesine ulaşan
                oyuncular
              </p>
            </div>

            <div className="rounded-3xl bg-slate-950/85 border border-amber-500/30 overflow-hidden shadow-2xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-400 bg-slate-900/60">
                    <th className="py-4 px-5 text-center w-20">Sıra</th>
                    <th className="py-4 px-5">Oyuncu</th>
                    <th className="py-4 px-5 text-center">G / M / B</th>
                    <th className="py-4 px-5 text-right">Toplam Çip</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm">
                  {leaderboard.map((item, idx) => {
                    const rank = idx + 1;
                    const isMe = item.id === profile.id;
                    return (
                      <tr
                        key={item.id}
                        className={`${
                          isMe ? "bg-amber-500/10" : "hover:bg-white/5"
                        } transition`}
                      >
                        <td className="py-4 px-5 text-center font-bold text-lg">
                          {rank === 1
                            ? "🥇"
                            : rank === 2
                            ? "🥈"
                            : rank === 3
                            ? "🥉"
                            : rank}
                        </td>
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-3">
                            <span className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-lg">
                              {item.avatar}
                            </span>
                            <div>
                              <span className="font-bold text-white">
                                {item.nickname}
                              </span>
                              {isMe && (
                                <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-bold">
                                  SİZ
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-5 text-center font-mono-num text-xs text-slate-300">
                          <span className="text-emerald-400 font-bold">
                            {item.wins}G
                          </span>{" "}
                          /{" "}
                          <span className="text-rose-400 font-bold">
                            {item.losses}M
                          </span>{" "}
                          / <span>{item.draws}B</span>
                        </td>
                        <td className="py-4 px-5 text-right font-mono-num font-bold text-base text-amber-400">
                          {item.chips.toLocaleString("tr-TR")} Çip
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ====================================================
            TAB 5: PROFILE & GAME HISTORY
        ==================================================== */}
        {activeTab === "profile" && (
          <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Player Stats Card */}
            <div className="rounded-3xl bg-slate-950/85 border border-amber-500/30 p-6 text-center space-y-5 self-start">
              <div className="w-20 h-20 rounded-3xl bg-slate-900 border-2 border-amber-400 flex items-center justify-center text-4xl mx-auto shadow-lg">
                {profile.avatar}
              </div>
              <div>
                <h3 className="font-display text-2xl font-bold text-white">
                  {profile.nickname}
                </h3>
                <p className="text-xs text-emerald-400">VIP Kulüp Üyesi</p>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2">
                <div className="p-3 rounded-2xl bg-slate-900/90 border border-white/5">
                  <div className="text-xs text-slate-400">Galibiyet</div>
                  <div className="font-mono-num text-lg font-bold text-emerald-400">
                    {profile.wins}
                  </div>
                </div>
                <div className="p-3 rounded-2xl bg-slate-900/90 border border-white/5">
                  <div className="text-xs text-slate-400">Mağlubiyet</div>
                  <div className="font-mono-num text-lg font-bold text-rose-400">
                    {profile.losses}
                  </div>
                </div>
                <div className="p-3 rounded-2xl bg-slate-900/90 border border-white/5">
                  <div className="text-xs text-slate-400">Berabere</div>
                  <div className="font-mono-num text-lg font-bold text-slate-300">
                    {profile.draws}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowProfileModal(true)}
                className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-semibold text-white flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <User className="w-4 h-4" />
                Rumuz / Avatar Değiştir
              </button>
            </div>

            {/* Game History Table */}
            <div className="lg:col-span-2 rounded-3xl bg-slate-950/85 border border-white/10 overflow-hidden shadow-xl">
              <div className="p-5 border-b border-white/10 flex items-center justify-between">
                <h3 className="font-display text-lg font-bold text-amber-300 flex items-center gap-2">
                  <History className="w-5 h-5" />
                  Son Oyun Geçmişi
                </h3>
                <span className="text-xs text-slate-400">
                  Son {profile.history.length} karşılaşma
                </span>
              </div>

              {profile.history.length === 0 ? (
                <div className="p-12 text-center text-sm text-slate-500">
                  Henüz hiç oyun oynamadınız. Blackjack veya Pişti masasına
                  oturarak ilk elinizi oynayın!
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-900/60 text-xs uppercase text-slate-400 border-b border-white/10">
                        <th className="py-3.5 px-4">Tarih</th>
                        <th className="py-3.5 px-4">Oyun</th>
                        <th className="py-3.5 px-4">Bahis</th>
                        <th className="py-3.5 px-4">Durum</th>
                        <th className="py-3.5 px-4 text-right">Net Çip</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {profile.history.map((h) => (
                        <tr key={h.id} className="hover:bg-white/5">
                          <td className="py-3.5 px-4 text-xs text-slate-400 whitespace-nowrap">
                            {h.playedAt}
                          </td>
                          <td className="py-3.5 px-4 font-semibold text-white">
                            {h.gameType}
                          </td>
                          <td className="py-3.5 px-4 font-mono-num text-slate-300">
                            {h.betAmount}
                          </td>
                          <td className="py-3.5 px-4">
                            {h.outcome === "win" ? (
                              <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold">
                                Kazandı
                              </span>
                            ) : h.outcome === "loss" ? (
                              <span className="px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 text-xs font-bold">
                                Kaybetti
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full bg-slate-700 text-slate-300 text-xs font-bold">
                                Berabere
                              </span>
                            )}
                          </td>
                          <td
                            className={`py-3.5 px-4 text-right font-mono-num font-bold ${
                              h.chipChange > 0
                                ? "text-emerald-400"
                                : h.chipChange < 0
                                ? "text-rose-400"
                                : "text-slate-400"
                            }`}
                          >
                            {h.chipChange > 0
                              ? `+${h.chipChange}`
                              : h.chipChange}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
