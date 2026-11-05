import { NextRequest, NextResponse } from "next/server";
import {
  CardCode,
  LeaderboardEntry,
  OnlineRoom,
  RoomGameType,
} from "@/lib/types";
import {
  calculateBlackjackScore,
  calculatePistiCardPoints,
  chooseSmartDealerCard,
  createMultiplayerBlackjackData,
  createMultiplayerPisti2v2Data,
  createMultiplayerPistiData,
  finalizeMultiplayerBlackjack,
  processPistiMove,
} from "@/lib/game-engine";

export const dynamic = "force-dynamic";

interface GlobalStore {
  rooms: Map<string, OnlineRoom>;
  leaderboard: Map<string, LeaderboardEntry>;
  deletedPlayerIds: Set<string>;
}

const globalForGame = globalThis as unknown as { __royalCasinoStore?: GlobalStore };

function getAdminCredentials() {
  return {
    username: process.env.ADMIN_USERNAME || "admin",
    password: process.env.ADMIN_PASSWORD || "admin123",
  };
}

function getExpectedAdminToken() {
  const { username, password } = getAdminCredentials();
  return Buffer.from(`royal-admin:${username}:${password}`).toString("base64");
}

function isValidAdminToken(token?: string): boolean {
  if (!token) return false;
  return token === getExpectedAdminToken();
}

function syncPlayerChipsInRooms(store: GlobalStore, playerId: string, chips: number) {
  for (const room of store.rooms.values()) {
    const p = room.players.find((pl) => pl.id === playerId);
    if (p) {
      p.chips = chips;
    }
  }
}

function getStore(): GlobalStore {
  if (!globalForGame.__royalCasinoStore) {
    const leaderboard = new Map<string, LeaderboardEntry>();
    // Seed initial competitive players so leaderboard is rich out of the box
    const seeds: LeaderboardEntry[] = [
      {
        id: "seed-1",
        nickname: "KaroKralı_34",
        avatar: "👑",
        chips: 4850,
        wins: 24,
        losses: 9,
        draws: 2,
        updatedAt: Date.now() - 3600_000,
      },
      {
        id: "seed-2",
        nickname: "AsMaça_Emre",
        avatar: "♠️",
        chips: 3400,
        wins: 18,
        losses: 7,
        draws: 3,
        updatedAt: Date.now() - 7200_000,
      },
      {
        id: "seed-3",
        nickname: "PiştiUstası",
        avatar: "🃏",
        chips: 2750,
        wins: 15,
        losses: 8,
        draws: 1,
        updatedAt: Date.now() - 9400_000,
      },
      {
        id: "seed-4",
        nickname: "MonteCarlo_VIP",
        avatar: "💎",
        chips: 1950,
        wins: 11,
        losses: 6,
        draws: 2,
        updatedAt: Date.now() - 12400_000,
      },
    ];
    for (const s of seeds) leaderboard.set(s.id, s);

    globalForGame.__royalCasinoStore = {
      rooms: new Map<string, OnlineRoom>(),
      leaderboard,
      deletedPlayerIds: new Set<string>(),
    };
  }
  if (!globalForGame.__royalCasinoStore.deletedPlayerIds) {
    globalForGame.__royalCasinoStore.deletedPlayerIds = new Set<string>();
  }
  return globalForGame.__royalCasinoStore;
}

function cleanStaleRooms(store: GlobalStore) {
  const now = Date.now();
  for (const [code, room] of store.rooms.entries()) {
    // Remove rooms inactive for > 45 minutes
    if (now - room.updatedAt > 45 * 60 * 1000) {
      store.rooms.delete(code);
    }
  }
}

export async function GET(req: NextRequest) {
  const store = getStore();
  cleanStaleRooms(store);

  const { searchParams } = new URL(req.url);
  const roomCode = searchParams.get("roomCode")?.toUpperCase();
  const playerId = searchParams.get("playerId");

  const leaderboard = Array.from(store.leaderboard.values())
    .sort((a, b) => b.chips - a.chips)
    .slice(0, 20);

  const rooms = Array.from(store.rooms.values()).sort(
    (a, b) => b.updatedAt - a.updatedAt
  );

  const room = roomCode ? store.rooms.get(roomCode) ?? null : null;
  const me = playerId ? store.leaderboard.get(playerId) ?? null : null;

  return NextResponse.json({
    leaderboard,
    rooms,
    room,
    me,
    serverTime: Date.now(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const store = getStore();
    cleanStaleRooms(store);
    const body = await req.json();
    const { action } = body;

    if (action === "syncProfile") {
      const { profile } = body;
      let me: LeaderboardEntry | null = null;
      if (profile && profile.id) {
        const existing = store.leaderboard.get(profile.id);
        if (existing) {
          existing.nickname = profile.nickname || existing.nickname || "Oyuncu";
          existing.avatar = profile.avatar || existing.avatar || "🎰";
          existing.updatedAt = Date.now();
          me = existing;
        } else {
          const wasDeleted = store.deletedPlayerIds.has(profile.id);
          if (wasDeleted) {
            store.deletedPlayerIds.delete(profile.id);
          }
          me = {
            id: profile.id,
            nickname: profile.nickname || "Oyuncu",
            avatar: profile.avatar || "🎰",
            chips: wasDeleted
              ? 1000
              : typeof profile.chips === "number"
              ? profile.chips
              : 1000,
            wins: wasDeleted ? 0 : profile.wins || 0,
            losses: wasDeleted ? 0 : profile.losses || 0,
            draws: wasDeleted ? 0 : profile.draws || 0,
            lastDailyBonusAt: wasDeleted ? undefined : profile.lastDailyBonusAt,
            updatedAt: Date.now(),
          };
          store.leaderboard.set(profile.id, me);
        }
      }
      return NextResponse.json({
        ok: true,
        me,
        leaderboard: Array.from(store.leaderboard.values())
          .sort((a, b) => b.chips - a.chips)
          .slice(0, 20),
      });
    }

    if (action === "recordGameResult") {
      const {
        playerId,
        nickname,
        avatar,
        chipChange,
        outcome,
      }: {
        playerId: string;
        nickname?: string;
        avatar?: string;
        chipChange: number;
        outcome: "win" | "loss" | "push";
      } = body;

      if (!playerId) {
        return NextResponse.json(
          { ok: false, error: "Oyuncu kimliği eksik." },
          { status: 400 }
        );
      }

      let entry = store.leaderboard.get(playerId);
      if (!entry) {
        entry = {
          id: playerId,
          nickname: nickname || "Oyuncu",
          avatar: avatar || "🎰",
          chips: 1000,
          wins: 0,
          losses: 0,
          draws: 0,
          updatedAt: Date.now(),
        };
        store.leaderboard.set(playerId, entry);
      }

      if (nickname) entry.nickname = nickname;
      if (avatar) entry.avatar = avatar;
      entry.chips = Math.max(0, entry.chips + Number(chipChange || 0));
      if (outcome === "win") entry.wins += 1;
      else if (outcome === "loss") entry.losses += 1;
      else entry.draws += 1;
      entry.updatedAt = Date.now();

      syncPlayerChipsInRooms(store, playerId, entry.chips);

      return NextResponse.json({
        ok: true,
        me: entry,
        leaderboard: Array.from(store.leaderboard.values())
          .sort((a, b) => b.chips - a.chips)
          .slice(0, 20),
      });
    }

    if (action === "claimDailyBonus") {
      const { playerId }: { playerId: string } = body;
      const entry = store.leaderboard.get(playerId);
      if (!entry) {
        return NextResponse.json(
          { ok: false, error: "Oyuncu kaydı bulunamadı." },
          { status: 404 }
        );
      }

      if (entry.chips > 0) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Günlük 250 çip başlangıç desteği yalnızca çipiniz 0'a düştüğünde alınabilir.",
          },
          { status: 400 }
        );
      }

      const DAY_MS = 24 * 60 * 60 * 1000;
      const now = Date.now();
      if (entry.lastDailyBonusAt && now - entry.lastDailyBonusAt < DAY_MS) {
        const remainingMs = DAY_MS - (now - entry.lastDailyBonusAt);
        const remHours = Math.floor(remainingMs / (60 * 60 * 1000));
        const remMins = Math.ceil(
          (remainingMs % (60 * 60 * 1000)) / (60 * 1000)
        );
        return NextResponse.json(
          {
            ok: false,
            error: `Günlük başlangıç desteğinizi bugün zaten kullandınız. (${remHours} sa ${remMins} dk sonra tekrar aktif olur veya Admin'den çip isteyebilirsiniz.)`,
          },
          { status: 400 }
        );
      }

      entry.chips = 250;
      entry.lastDailyBonusAt = now;
      entry.updatedAt = now;
      syncPlayerChipsInRooms(store, playerId, entry.chips);

      return NextResponse.json({
        ok: true,
        me: entry,
        message: "🎁 Günlük +250 Başlangıç Çipi hesabınıza yüklendi!",
        leaderboard: Array.from(store.leaderboard.values())
          .sort((a, b) => b.chips - a.chips)
          .slice(0, 20),
      });
    }

    // ==========================================
    // ADMIN PANEL API ACTIONS
    // ==========================================
    if (action === "adminLogin") {
      const { username, password }: { username?: string; password?: string } =
        body;
      const creds = getAdminCredentials();
      if (
        (username || "").trim() === creds.username &&
        (password || "") === creds.password
      ) {
        return NextResponse.json({
          ok: true,
          token: getExpectedAdminToken(),
        });
      }
      return NextResponse.json(
        { ok: false, error: "Kullanıcı adı veya şifre hatalı." },
        { status: 401 }
      );
    }

    if (action === "adminGetPlayers") {
      const { token }: { token?: string } = body;
      if (!isValidAdminToken(token)) {
        return NextResponse.json(
          { ok: false, error: "Yetkisiz erişim. Lütfen tekrar giriş yapın." },
          { status: 401 }
        );
      }

      const players = Array.from(store.leaderboard.values()).sort(
        (a, b) => b.chips - a.chips
      );
      return NextResponse.json({
        ok: true,
        players,
      });
    }

    if (action === "adminManagePlayer") {
      const {
        token,
        targetPlayerId,
        op,
        amount,
      }: {
        token?: string;
        targetPlayerId: string;
        op:
          | "add_chips"
          | "remove_chips"
          | "set_chips"
          | "reset_player"
          | "delete_player";
        amount?: number;
      } = body;

      if (!isValidAdminToken(token)) {
        return NextResponse.json(
          { ok: false, error: "Yetkisiz erişim." },
          { status: 401 }
        );
      }

      if (op === "delete_player") {
        store.leaderboard.delete(targetPlayerId);
        store.deletedPlayerIds.add(targetPlayerId);
        return NextResponse.json({
          ok: true,
          players: Array.from(store.leaderboard.values()).sort(
            (a, b) => b.chips - a.chips
          ),
        });
      }

      const entry = store.leaderboard.get(targetPlayerId);
      if (!entry) {
        return NextResponse.json(
          { ok: false, error: "Oyuncu bulunamadı." },
          { status: 404 }
        );
      }

      const cleanAmount = Math.max(0, Math.floor(Number(amount) || 0));

      if (op === "add_chips") {
        entry.chips = Math.max(0, entry.chips + cleanAmount);
      } else if (op === "remove_chips") {
        entry.chips = Math.max(0, entry.chips - cleanAmount);
      } else if (op === "set_chips") {
        entry.chips = cleanAmount;
      } else if (op === "reset_player") {
        entry.chips = 1000;
        entry.wins = 0;
        entry.losses = 0;
        entry.draws = 0;
        entry.lastDailyBonusAt = undefined;
      }

      entry.updatedAt = Date.now();
      syncPlayerChipsInRooms(store, targetPlayerId, entry.chips);

      return NextResponse.json({
        ok: true,
        player: entry,
        players: Array.from(store.leaderboard.values()).sort(
          (a, b) => b.chips - a.chips
        ),
      });
    }

    if (action === "createRoom") {
      const {
        gameType,
        betAmount,
        roomName,
        player,
      }: {
        gameType: RoomGameType;
        betAmount: number;
        roomName?: string;
        player: { id: string; nickname: string; avatar: string; chips: number };
      } = body;

      const prefix =
        gameType === "blackjack"
          ? "BJ"
          : gameType === "pisti_2v2"
          ? "P4"
          : "PS";
      const randomNum = Math.floor(1000 + Math.random() * 9000);
      const code = `${prefix}${randomNum}`;

      const gameLabel =
        gameType === "blackjack"
          ? "Blackjack"
          : gameType === "pisti_2v2"
          ? "Pişti 2v2 Eşli"
          : "Pişti 1v1";

      const room: OnlineRoom = {
        code,
        name: roomName?.trim() || `${player.nickname} Masası (${gameLabel})`,
        gameType,
        hostId: player.id,
        hostName: player.nickname,
        betAmount: Math.max(10, Number(betAmount) || 50),
        status: "waiting",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        maxPlayers:
          gameType === "blackjack" || gameType === "pisti_2v2" ? 4 : 2,
        players: [
          {
            ...player,
            team: gameType === "pisti_2v2" ? "A" : undefined,
          },
        ],
      };

      store.rooms.set(code, room);
      return NextResponse.json({ ok: true, room });
    }

    if (action === "joinRoom") {
      const {
        code,
        player,
      }: {
        code: string;
        player: { id: string; nickname: string; avatar: string; chips: number };
      } = body;

      const cleanCode = (code || "").trim().toUpperCase();
      const room = store.rooms.get(cleanCode);
      if (!room) {
        return NextResponse.json(
          { ok: false, error: "Oda bulunamadı. Oda kodunu kontrol edin." },
          { status: 404 }
        );
      }

      const existing = room.players.find((p) => p.id === player.id);
      if (!existing) {
        if (room.status !== "waiting") {
          return NextResponse.json(
            { ok: false, error: "Bu odada oyun şu an devam ediyor." },
            { status: 400 }
          );
        }
        // If room has bots in waiting state, replace a bot seat first
        const botIndex = room.players.findIndex((p) => p.isBot);
        if (botIndex !== -1) {
          const inheritedTeam = room.players[botIndex].team;
          room.players[botIndex] = {
            ...player,
            team: inheritedTeam,
            isBot: false,
          };
        } else {
          if (room.players.length >= room.maxPlayers) {
            return NextResponse.json(
              { ok: false, error: "Oda tamamen dolu." },
              { status: 400 }
            );
          }
          let assignedTeam: "A" | "B" | undefined = undefined;
          if (room.gameType === "pisti_2v2") {
            const countA = room.players.filter((p) => p.team === "A").length;
            assignedTeam = countA < 2 ? "A" : "B";
          }
          room.players.push({
            ...player,
            team: assignedTeam,
          });
        }
      } else {
        existing.nickname = player.nickname;
        existing.avatar = player.avatar;
        existing.chips = player.chips;
      }

      room.updatedAt = Date.now();
      return NextResponse.json({ ok: true, room });
    }

    if (action === "switchRoomTeam") {
      const {
        code,
        playerId,
        targetTeam,
      }: { code: string; playerId: string; targetTeam?: "A" | "B" } = body;

      const room = store.rooms.get((code || "").toUpperCase());
      if (!room || room.gameType !== "pisti_2v2" || room.status !== "waiting") {
        return NextResponse.json(
          { ok: false, error: "Takım yalnızca bekleme odasında değiştirilebilir." },
          { status: 400 }
        );
      }

      const me = room.players.find((p) => p.id === playerId);
      if (!me) {
        return NextResponse.json(
          { ok: false, error: "Oyuncu odada bulunamadı." },
          { status: 404 }
        );
      }

      const currentTeam = me.team || "A";
      const desiredTeam: "A" | "B" =
        targetTeam || (currentTeam === "A" ? "B" : "A");

      if (currentTeam !== desiredTeam) {
        const playersInTarget = room.players.filter(
          (p) => p.team === desiredTeam && p.id !== playerId
        );
        if (playersInTarget.length >= 2) {
          // Swap with a bot first if possible, otherwise swap with the last player in target team
          const swapPartner =
            playersInTarget.find((p) => p.isBot) ||
            playersInTarget[playersInTarget.length - 1];
          swapPartner.team = currentTeam;
        }
        me.team = desiredTeam;
        room.updatedAt = Date.now();
      }

      return NextResponse.json({ ok: true, room });
    }

    if (action === "leaveRoom") {
      const { code, playerId }: { code: string; playerId: string } = body;
      const room = store.rooms.get((code || "").toUpperCase());
      if (room) {
        room.players = room.players.filter(
          (p) => p.id !== playerId && !p.isBot
        );
        if (room.players.length === 0) {
          store.rooms.delete(room.code);
          return NextResponse.json({ ok: true, room: null });
        }
        if (room.hostId === playerId) {
          room.hostId = room.players[0].id;
          room.hostName = room.players[0].nickname;
        }
        if (room.status === "playing") {
          room.status = "waiting";
          room.pisti = undefined;
          room.blackjack = undefined;
          room.winnerMessage =
            "Bir oyuncu masadan ayrıldığı için el sıfırlandı.";
        }
        room.updatedAt = Date.now();
      }
      return NextResponse.json({ ok: true, room: null });
    }

    if (action === "startRoom" || action === "rematchRoom") {
      const { code, fillBots }: { code: string; fillBots?: boolean } = body;
      const room = store.rooms.get((code || "").toUpperCase());
      if (!room) {
        return NextResponse.json(
          { ok: false, error: "Oda bulunamadı." },
          { status: 404 }
        );
      }

      if (room.gameType === "pisti" && room.players.length < 2) {
        return NextResponse.json(
          {
            ok: false,
            error: "Online 1v1 Pişti başlatmak için odada 2 oyuncu olmalıdır.",
          },
          { status: 400 }
        );
      }

      if (room.gameType === "pisti_2v2") {
        // Balance existing players' teams first
        for (const p of room.players) {
          if (p.team !== "A" && p.team !== "B") {
            const cA = room.players.filter((x) => x.team === "A").length;
            p.team = cA < 2 ? "A" : "B";
          }
        }

        if (room.players.length < 4) {
          if (fillBots) {
            const botProfiles = [
              { nickname: "Ortak_Bot", avatar: "🤖" },
              { nickname: "Karo_Bot", avatar: "♠️" },
              { nickname: "Vale_Bot", avatar: "🃏" },
            ];
            let bIdx = 0;
            while (room.players.length < 4) {
              const cA = room.players.filter((x) => x.team === "A").length;
              const team: "A" | "B" = cA < 2 ? "A" : "B";
              const bp = botProfiles[bIdx % botProfiles.length];
              bIdx++;
              room.players.push({
                id: `bot-${room.code}-${bIdx}`,
                nickname: bp.nickname,
                avatar: bp.avatar,
                chips: 2500,
                team,
                isBot: true,
              });
            }
          } else {
            return NextResponse.json(
              {
                ok: false,
                error:
                  "2v2 Eşli Pişti için 4 oyuncu gereklidir (veya 'Botlarla Tamamla ve Başlat' seçeneğini kullanabilirsiniz).",
              },
              { status: 400 }
            );
          }
        }
      }

      room.status = "playing";
      room.winnerMessage = undefined;
      room.updatedAt = Date.now();

      if (room.gameType === "blackjack") {
        room.blackjack = createMultiplayerBlackjackData(
          room.players,
          room.betAmount
        );
        if (room.blackjack.dealerRevealed) {
          room.status = "finished";
          room.winnerMessage = "El tamamlandı!";
        }
      } else if (room.gameType === "pisti_2v2") {
        room.pisti = createMultiplayerPisti2v2Data(room.players);
      } else {
        room.pisti = createMultiplayerPistiData(
          room.players[0],
          room.players[1]
        );
      }

      return NextResponse.json({ ok: true, room });
    }

    if (action === "mpBlackjackAction") {
      const {
        code,
        playerId,
        move,
      }: {
        code: string;
        playerId: string;
        move: "hit" | "stand" | "double";
      } = body;

      const room = store.rooms.get((code || "").toUpperCase());
      if (!room || !room.blackjack || room.status !== "playing") {
        return NextResponse.json(
          { ok: false, error: "Aktif Blackjack masası bulunamadı." },
          { status: 400 }
        );
      }

      const bj = room.blackjack;
      const activeSeat = bj.seats[bj.activeSeatIndex];
      if (!activeSeat || activeSeat.playerId !== playerId) {
        return NextResponse.json(
          { ok: false, error: "Şu an sıra sizde değil." },
          { status: 400 }
        );
      }

      const draw = (): CardCode => bj.deck.shift()!;

      if (move === "hit") {
        activeSeat.hand.push(draw());
        activeSeat.score = calculateBlackjackScore(activeSeat.hand);
        if (activeSeat.score > 21) {
          activeSeat.status = "busted";
        } else if (activeSeat.score === 21) {
          activeSeat.status = "stood";
        }
      } else if (move === "double") {
        if (activeSeat.hand.length === 2) {
          activeSeat.bet *= 2;
          activeSeat.hand.push(draw());
          activeSeat.score = calculateBlackjackScore(activeSeat.hand);
          activeSeat.status = activeSeat.score > 21 ? "busted" : "stood";
        }
      } else if (move === "stand") {
        activeSeat.status = "stood";
      }

      // Advance to next seat that is still "playing"
      if (activeSeat.status !== "playing") {
        const nextIdx = bj.seats.findIndex(
          (s, idx) => idx > bj.activeSeatIndex && s.status === "playing"
        );
        if (nextIdx !== -1) {
          bj.activeSeatIndex = nextIdx;
        } else {
          finalizeMultiplayerBlackjack(bj);
          room.status = "finished";
          room.winnerMessage = "Tüm oyuncular hamlesini tamamladı!";
        }
      }

      room.updatedAt = Date.now();
      return NextResponse.json({ ok: true, room });
    }

    if (action === "mpPistiPlayCard") {
      const {
        code,
        playerId,
        card,
      }: { code: string; playerId: string; card: CardCode } = body;

      const room = store.rooms.get((code || "").toUpperCase());
      if (!room || !room.pisti || room.status !== "playing") {
        return NextResponse.json(
          { ok: false, error: "Aktif Pişti masası bulunamadı." },
          { status: 400 }
        );
      }

      const ps = room.pisti;
      if (ps.turnPlayerId !== playerId) {
        return NextResponse.json(
          { ok: false, error: "Şu an sıra sizde değil." },
          { status: 400 }
        );
      }

      const pIndex = ps.players.findIndex((p) => p.playerId === playerId);
      if (pIndex === -1) {
        return NextResponse.json(
          { ok: false, error: "Oyuncu bulunamadı." },
          { status: 400 }
        );
      }

      const currentPlayer = ps.players[pIndex];
      if (!currentPlayer.hand.includes(card)) {
        return NextResponse.json(
          { ok: false, error: "Bu kart elinizde yok." },
          { status: 400 }
        );
      }

      const applySingleTurn = (seatIdx: number, playedCard: CardCode) => {
        const actor = ps.players[seatIdx];
        actor.hand = actor.hand.filter((c) => c !== playedCard);
        const moveRes = processPistiMove(ps.board, playedCard);

        if (moveRes.captured) {
          actor.pistiCount += moveRes.pistiBonusCount;
          actor.captured.push(...moveRes.capturedCards);
          ps.lastCapturerId = actor.playerId;
          ps.board = [];
          ps.lastMove = {
            byPlayerId: actor.playerId,
            byNickname: actor.nickname,
            byTeam: actor.team,
            card: playedCard,
            capturedCount: moveRes.capturedCards.length,
            madePisti: moveRes.pistiBonusCount > 0,
            timestamp: Date.now(),
          };
        } else {
          ps.board.push(playedCard);
          ps.lastMove = {
            byPlayerId: actor.playerId,
            byNickname: actor.nickname,
            byTeam: actor.team,
            card: playedCard,
            capturedCount: 0,
            madePisti: false,
            timestamp: Date.now(),
          };
        }

        // Advance turn clockwise
        const nextIdx = (seatIdx + 1) % ps.players.length;
        ps.turnPlayerId = ps.players[nextIdx].playerId;

        const updateLiveScores = () => {
          for (const p of ps.players) {
            p.score = calculatePistiCardPoints(p.captured) + p.pistiCount * 10;
          }
          if (ps.mode === "2v2" || ps.players.length === 4) {
            const teamAPlayers = ps.players.filter((p) => p.team === "A");
            const teamBPlayers = ps.players.filter((p) => p.team === "B");
            const teamACap = teamAPlayers.flatMap((p) => p.captured);
            const teamBCap = teamBPlayers.flatMap((p) => p.captured);
            const teamAPisti = teamAPlayers.reduce(
              (acc, p) => acc + p.pistiCount,
              0
            );
            const teamBPisti = teamBPlayers.reduce(
              (acc, p) => acc + p.pistiCount,
              0
            );
            ps.teamAPistiCount = teamAPisti;
            ps.teamBPistiCount = teamBPisti;
            ps.teamACardCount = teamACap.length;
            ps.teamBCardCount = teamBCap.length;
            ps.teamAScore =
              calculatePistiCardPoints(teamACap) + teamAPisti * 10;
            ps.teamBScore =
              calculatePistiCardPoints(teamBCap) + teamBPisti * 10;
          }
        };

        // Check if all players' hands are empty
        const allHandsEmpty = ps.players.every((p) => p.hand.length === 0);
        const cardsNeededForNextRound = ps.players.length * 4;

        if (allHandsEmpty) {
          if (ps.deck.length >= cardsNeededForNextRound) {
            for (const p of ps.players) {
              for (let i = 0; i < 4; i++) {
                p.hand.push(ps.deck.shift()!);
              }
            }
            ps.roundNumber += 1;
            updateLiveScores();
          } else {
            // End of game: remaining board goes to last capturer
            if (ps.board.length > 0) {
              const lastWinner =
                ps.players.find((p) => p.playerId === ps.lastCapturerId) ??
                ps.players[0];
              lastWinner.captured.push(...ps.board);
              ps.board = [];
            }

            updateLiveScores();

            if (ps.mode === "2v2" || ps.players.length === 4) {
              const cA = ps.teamACardCount ?? 0;
              const cB = ps.teamBCardCount ?? 0;
              if (cA > cB) {
                ps.teamAScore = (ps.teamAScore ?? 0) + 3;
              } else if (cB > cA) {
                ps.teamBScore = (ps.teamBScore ?? 0) + 3;
              }

              const finalA = ps.teamAScore ?? 0;
              const finalB = ps.teamBScore ?? 0;

              for (const p of ps.players) {
                if (finalA > finalB) {
                  p.outcome = p.team === "A" ? "win" : "loss";
                  p.chipChange =
                    p.team === "A" ? room.betAmount : -room.betAmount;
                } else if (finalB > finalA) {
                  p.outcome = p.team === "B" ? "win" : "loss";
                  p.chipChange =
                    p.team === "B" ? room.betAmount : -room.betAmount;
                } else {
                  p.outcome = "push";
                  p.chipChange = 0;
                }
              }

              if (finalA > finalB) {
                room.winnerMessage = `🏆 🅰️ Altın Takım (Takım A) ${finalA} - ${finalB} Kazandı!`;
              } else if (finalB > finalA) {
                room.winnerMessage = `🏆 🅱️ Zümrüt Takım (Takım B) ${finalB} - ${finalA} Kazandı!`;
              } else {
                room.winnerMessage = `🤝 2v2 Maç ${finalA} - ${finalB} Berabere Bitti!`;
              }
            } else {
              // 1v1 scoring
              if (
                ps.players[0].captured.length > ps.players[1].captured.length
              ) {
                ps.players[0].score += 3;
              } else if (
                ps.players[1].captured.length > ps.players[0].captured.length
              ) {
                ps.players[1].score += 3;
              }

              const [pl1, pl2] = ps.players;
              if (pl1.score > pl2.score) {
                pl1.outcome = "win";
                pl1.chipChange = room.betAmount;
                pl2.outcome = "loss";
                pl2.chipChange = -room.betAmount;
                room.winnerMessage = `${pl1.nickname} ${pl1.score} - ${pl2.score} kazandı!`;
              } else if (pl2.score > pl1.score) {
                pl2.outcome = "win";
                pl2.chipChange = room.betAmount;
                pl1.outcome = "loss";
                pl1.chipChange = -room.betAmount;
                room.winnerMessage = `${pl2.nickname} ${pl2.score} - ${pl1.score} kazandı!`;
              } else {
                pl1.outcome = "push";
                pl1.chipChange = 0;
                pl2.outcome = "push";
                pl2.chipChange = 0;
                room.winnerMessage = `Oyun ${pl1.score} - ${pl2.score} berabere bitti!`;
              }
            }

            room.status = "finished";
          }
        } else {
          updateLiveScores();
        }
      };

      // 1. Apply the human player's move
      applySingleTurn(pIndex, card);

      // 2. If the room has bots in 2v2 and the next turn belongs to a bot, auto-play bot turns
      let safetyCounter = 0;
      while (room.status === "playing" && safetyCounter < 16) {
        const nextSeatIdx = ps.players.findIndex(
          (p) => p.playerId === ps.turnPlayerId
        );
        if (nextSeatIdx === -1) break;
        const nextActor = ps.players[nextSeatIdx];
        if (!nextActor.isBot || nextActor.hand.length === 0) break;
        const botCard = chooseSmartDealerCard(nextActor.hand, ps.board);
        applySingleTurn(nextSeatIdx, botCard);
        safetyCounter++;
      }

      room.updatedAt = Date.now();
      return NextResponse.json({ ok: true, room });
    }

    return NextResponse.json(
      { ok: false, error: "Geçersiz işlem." },
      { status: 400 }
    );
  } catch (err) {
    console.error("API error:", err);
    return NextResponse.json(
      { ok: false, error: "Sunucu hatası oluştu." },
      { status: 500 }
    );
  }
}

