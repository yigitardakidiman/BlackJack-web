"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Coins,
  Crown,
  Lock,
  LogOut,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  User,
  Users,
} from "lucide-react";
import { LeaderboardEntry } from "@/lib/types";

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [players, setPlayers] = useState<LeaderboardEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  const broadcastUpdate = () => {
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      const bc = new BroadcastChannel("royal_casino_realtime");
      bc.postMessage({ ts: Date.now() });
      bc.close();
    }
  };

  const fetchPlayers = useCallback(async (activeToken: string) => {
    try {
      const res = await fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "adminGetPlayers",
          token: activeToken,
        }),
      });
      const data = await res.json();
      if (res.status === 401) {
        sessionStorage.removeItem("royal_casino_admin_token");
        setToken(null);
        return;
      }
      if (data.ok && Array.isArray(data.players)) {
        setPlayers(data.players);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem("royal_casino_admin_token");
    if (saved) {
      setToken(saved);
      fetchPlayers(saved);
    }
  }, [fetchPlayers]);

  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      fetchPlayers(token);
    }, 3000);
    return () => clearInterval(interval);
  }, [token, fetchPlayers]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "adminLogin",
          username,
          password,
        }),
      });
      const data = await res.json();
      if (data.ok && data.token) {
        sessionStorage.setItem("royal_casino_admin_token", data.token);
        setToken(data.token);
        fetchPlayers(data.token);
        showToast("Yönetici paneline giriş yapıldı.");
      } else {
        setLoginError(data.error || "Giriş başarısız.");
      }
    } catch {
      setLoginError("Sunucu bağlantı hatası.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("royal_casino_admin_token");
    setToken(null);
    setUsername("");
    setPassword("");
  };

  const handlePlayerAction = async (
    targetPlayerId: string,
    op:
      | "add_chips"
      | "remove_chips"
      | "set_chips"
      | "reset_player"
      | "delete_player",
    amount?: number,
    label?: string
  ) => {
    if (!token) return;
    try {
      const res = await fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "adminManagePlayer",
          token,
          targetPlayerId,
          op,
          amount,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        if (Array.isArray(data.players)) {
          setPlayers(data.players);
        }
        broadcastUpdate();
        showToast(label || "İşlem başarıyla uygulandı.");
      } else {
        showToast(data.error || "İşlem uygulanamadı.");
      }
    } catch {
      showToast("Sunucu hatası oluştu.");
    }
  };

  const filteredPlayers = players.filter((p) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      p.nickname.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
    );
  });

  const totalChips = players.reduce((acc, p) => acc + p.chips, 0);
  const zeroChipPlayers = players.filter((p) => p.chips <= 0).length;

  // ====================================================
  // LOGIN VIEW
  // ====================================================
  if (!token) {
    return (
      <div className="min-h-screen casino-felt-bg text-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl bg-slate-950/90 border border-amber-500/40 p-7 sm:p-8 shadow-2xl space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 shadow-lg">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <div>
                <h1 className="font-display text-2xl font-bold text-amber-300">
                  ADMIN PANELİ
                </h1>
                <p className="text-xs text-slate-400">
                  Royal Velvet Çip & Oyuncu Yönetimi
                </p>
              </div>
            </div>
            <a
              href="/"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/10 text-xs text-slate-300 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Masaya Dön
            </a>
          </div>

          {loginError && (
            <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1.5">
                Yönetici Kullanıcı Adı
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Kullanıcı adınız"
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1.5">
                Şifre
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-bold text-sm hover:brightness-110 transition cursor-pointer disabled:opacity-50"
            >
              {loading ? "Giriş Yapılıyor..." : "Yönetici Girişi Yap"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ====================================================
  // ADMIN DASHBOARD VIEW
  // ====================================================
  return (
    <div className="min-h-screen casino-felt-bg text-slate-100 p-3 sm:p-8">
      {/* Toast */}
      {toast && (
        <div className="fixed top-3 inset-x-3 sm:inset-x-auto sm:top-5 sm:right-5 z-50 flex items-center gap-2.5 px-4 py-3 sm:px-5 sm:py-3.5 rounded-2xl bg-slate-950/95 border border-amber-400/50 text-amber-200 shadow-2xl animate-pop-banner">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs sm:text-sm font-medium">{toast}</span>
        </div>
      )}

      <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
        {/* Top Bar */}
        <header className="flex flex-wrap items-center justify-between gap-3 sm:gap-4 rounded-3xl bg-slate-950/85 border border-amber-500/30 p-4 sm:p-6 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 shadow-lg shrink-0">
              <Crown className="w-6 h-6 sm:w-7 sm:h-7" />
            </div>
            <div>
              <h1 className="font-display text-base sm:text-2xl font-bold text-amber-300">
                ROYAL VELVET — YÖNETİCİ PANELİ
              </h1>
              <p className="text-[11px] sm:text-xs text-slate-400">
                Oyuncu Bakiyeleri, Çip Dağıtımı ve İstatistik Yönetimi
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => fetchPlayers(token)}
              className="flex-1 sm:flex-initial justify-center inline-flex items-center gap-1.5 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/10 text-xs font-semibold text-slate-200 transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Yenile
            </button>
            <a
              href="/"
              className="flex-1 sm:flex-initial justify-center inline-flex items-center gap-1.5 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-xs font-semibold text-emerald-300 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Masaya Dön
            </a>
            <button
              type="button"
              onClick={handleLogout}
              className="flex-1 sm:flex-initial justify-center inline-flex items-center gap-1.5 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-xs font-semibold text-rose-300 transition cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Çıkış
            </button>
          </div>
        </header>

        {/* Summary KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <div className="rounded-2xl bg-slate-950/80 border border-white/10 p-4 sm:p-5 flex items-center justify-between">
            <div>
              <div className="text-[11px] sm:text-xs uppercase tracking-wider text-slate-400">
                Toplam Oyuncu
              </div>
              <div className="font-mono-num text-xl sm:text-2xl font-extrabold text-white mt-0.5 sm:mt-1">
                {players.length}
              </div>
            </div>
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center text-emerald-300">
              <Users className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
          </div>

          <div className="rounded-2xl bg-slate-950/80 border border-white/10 p-4 sm:p-5 flex items-center justify-between">
            <div>
              <div className="text-[11px] sm:text-xs uppercase tracking-wider text-slate-400">
                Dolaşımdaki Toplam Çip
              </div>
              <div className="font-mono-num text-xl sm:text-2xl font-extrabold text-amber-400 mt-0.5 sm:mt-1">
                {totalChips.toLocaleString("tr-TR")} Çip
              </div>
            </div>
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-300">
              <Coins className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
          </div>

          <div className="rounded-2xl bg-slate-950/80 border border-white/10 p-4 sm:p-5 flex items-center justify-between">
            <div>
              <div className="text-[11px] sm:text-xs uppercase tracking-wider text-slate-400">
                Çipi Biten (0 Çip) Oyuncular
              </div>
              <div className="font-mono-num text-xl sm:text-2xl font-extrabold text-rose-400 mt-0.5 sm:mt-1">
                {zeroChipPlayers}
              </div>
            </div>
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-rose-500/15 border border-rose-400/30 flex items-center justify-center text-rose-300">
              <AlertCircle className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
          </div>
        </div>

        {/* Player Management Card / Table */}
        <div className="rounded-3xl bg-slate-950/85 border border-amber-500/30 overflow-hidden shadow-2xl">
          <div className="p-4 sm:p-6 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 sm:gap-4">
            <div>
              <h2 className="font-display text-base sm:text-lg font-bold text-amber-300">
                Oyuncu Listesi ve Çip Yönetimi
              </h2>
              <p className="text-xs text-slate-400">
                Oyunculara anlık çip ekleyebilir, çip silebilir, bakiyelerini
                sabitleyebilir veya sıfırlayabilirsiniz.
              </p>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Oyuncu adı veya ID ara..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* MOBILE PLAYER CARDS (< lg) */}
          <div className="lg:hidden divide-y divide-white/10">
            {filteredPlayers.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500">
                Eşleşen oyuncu bulunamadı.
              </div>
            ) : (
              filteredPlayers.map((player) => {
                const customVal = customAmounts[player.id] ?? "";
                const parsedCustom = Math.max(
                  0,
                  Math.floor(Number(customVal) || 0)
                );

                return (
                  <div key={`mob-${player.id}`} className="p-4 space-y-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-10 h-10 rounded-xl bg-slate-900 border border-amber-400/30 flex items-center justify-center text-lg shrink-0">
                          {player.avatar}
                        </span>
                        <div className="min-w-0">
                          <div className="font-bold text-sm text-white truncate">
                            {player.nickname}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono-num truncate">
                            {player.wins}G / {player.losses}M / {player.draws}B
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div
                          className={`font-mono-num text-base font-extrabold ${
                            player.chips <= 0
                              ? "text-rose-400"
                              : "text-amber-400"
                          }`}
                        >
                          {player.chips.toLocaleString("tr-TR")} Çip
                        </div>
                        <div className="inline-flex items-center gap-1 mt-1">
                          <button
                            type="button"
                            onClick={() =>
                              handlePlayerAction(
                                player.id,
                                "reset_player",
                                undefined,
                                `${player.nickname} sıfırlandı (1000 Çip).`
                              )
                            }
                            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs"
                            title="1000 Çipe Sıfırla"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handlePlayerAction(
                                player.id,
                                "delete_player",
                                undefined,
                                `${player.nickname} listeden silindi.`
                              )
                            }
                            className="p-1.5 rounded-lg bg-rose-950/80 border border-rose-500/30 text-rose-300 text-xs"
                            title="Oyuncuyu Sil"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Quick Chips Row */}
                    <div className="grid grid-cols-5 gap-1.5">
                      {[250, 500, 1000].map((amt) => (
                        <button
                          key={`m-add-${amt}`}
                          type="button"
                          onClick={() =>
                            handlePlayerAction(
                              player.id,
                              "add_chips",
                              amt,
                              `${player.nickname} hesabına +${amt} çip eklendi.`
                            )
                          }
                          className="py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-mono-num font-bold"
                        >
                          +{amt}
                        </button>
                      ))}
                      {[250, 500].map((amt) => (
                        <button
                          key={`m-sub-${amt}`}
                          type="button"
                          onClick={() =>
                            handlePlayerAction(
                              player.id,
                              "remove_chips",
                              amt,
                              `${player.nickname} hesabından -${amt} çip düşüldü.`
                            )
                          }
                          className="py-1.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-mono-num font-bold"
                        >
                          -{amt}
                        </button>
                      ))}
                    </div>

                    {/* Custom Input Row */}
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={0}
                        step={50}
                        value={customVal}
                        onChange={(e) =>
                          setCustomAmounts((prev) => ({
                            ...prev,
                            [player.id]: e.target.value,
                          }))
                        }
                        placeholder="Özel tutar..."
                        className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white font-mono-num focus:outline-none focus:border-amber-400"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (parsedCustom <= 0) return;
                          handlePlayerAction(
                            player.id,
                            "add_chips",
                            parsedCustom,
                            `${player.nickname} hesabına +${parsedCustom} çip eklendi.`
                          );
                        }}
                        className="p-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (parsedCustom <= 0) return;
                          handlePlayerAction(
                            player.id,
                            "remove_chips",
                            parsedCustom,
                            `${player.nickname} hesabından -${parsedCustom} çip silindi.`
                          );
                        }}
                        className="p-2 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (customVal.trim() === "") return;
                          handlePlayerAction(
                            player.id,
                            "set_chips",
                            parsedCustom,
                            `${player.nickname} bakiyesi ${parsedCustom} çip olarak sabitlendi.`
                          );
                        }}
                        className="px-3 py-2 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs font-semibold"
                      >
                        Sabitle
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* DESKTOP TABLE (lg+) */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-900/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-white/10">
                  <th className="py-3.5 px-4">Oyuncu</th>
                  <th className="py-3.5 px-4">İstatistik (G/M/B)</th>
                  <th className="py-3.5 px-4">Mevcut Çip</th>
                  <th className="py-3.5 px-4">Hızlı Çip Ekle / Düş</th>
                  <th className="py-3.5 px-4">Özel Tutar / Sabitle</th>
                  <th className="py-3.5 px-4 text-right">Sıfırla / Sil</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredPlayers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-10 text-center text-xs text-slate-500"
                    >
                      Eşleşen oyuncu bulunamadı.
                    </td>
                  </tr>
                ) : (
                  filteredPlayers.map((player) => {
                    const customVal = customAmounts[player.id] ?? "";
                    const parsedCustom = Math.max(
                      0,
                      Math.floor(Number(customVal) || 0)
                    );

                    return (
                      <tr
                        key={player.id}
                        className="hover:bg-white/5 transition"
                      >
                        {/* Player Info */}
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            <span className="w-10 h-10 rounded-xl bg-slate-900 border border-amber-400/30 flex items-center justify-center text-lg shrink-0">
                              {player.avatar}
                            </span>
                            <div>
                              <div className="font-bold text-white flex items-center gap-2">
                                <span>{player.nickname}</span>
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono-num">
                                ID: {player.id}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* W/L/D */}
                        <td className="py-4 px-4 font-mono-num text-xs">
                          <span className="text-emerald-400 font-bold">
                            {player.wins}G
                          </span>{" "}
                          /{" "}
                          <span className="text-rose-400 font-bold">
                            {player.losses}M
                          </span>{" "}
                          /{" "}
                          <span className="text-slate-400">
                            {player.draws}B
                          </span>
                        </td>

                        {/* Current Chips */}
                        <td className="py-4 px-4">
                          <span
                            className={`font-mono-num text-base font-extrabold ${
                              player.chips <= 0
                                ? "text-rose-400"
                                : "text-amber-400"
                            }`}
                          >
                            {player.chips.toLocaleString("tr-TR")} Çip
                          </span>
                        </td>

                        {/* Quick Add / Subtract Buttons */}
                        <td className="py-4 px-4">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {[250, 500, 1000].map((amt) => (
                              <button
                                key={`add-${amt}`}
                                type="button"
                                onClick={() =>
                                  handlePlayerAction(
                                    player.id,
                                    "add_chips",
                                    amt,
                                    `${player.nickname} hesabına +${amt} çip eklendi.`
                                  )
                                }
                                className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-mono-num font-bold transition cursor-pointer"
                              >
                                +{amt}
                              </button>
                            ))}
                            {[250, 500].map((amt) => (
                              <button
                                key={`sub-${amt}`}
                                type="button"
                                onClick={() =>
                                  handlePlayerAction(
                                    player.id,
                                    "remove_chips",
                                    amt,
                                    `${player.nickname} hesabından -${amt} çip düşüldü.`
                                  )
                                }
                                className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 text-xs font-mono-num font-bold transition cursor-pointer"
                              >
                                -{amt}
                              </button>
                            ))}
                          </div>
                        </td>

                        {/* Custom Amount Input (Add / Remove / Set Exact) */}
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={0}
                              step={50}
                              value={customVal}
                              onChange={(e) =>
                                setCustomAmounts((prev) => ({
                                  ...prev,
                                  [player.id]: e.target.value,
                                }))
                              }
                              placeholder="Tutar..."
                              className="w-24 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white font-mono-num focus:outline-none focus:border-amber-400"
                            />
                            <button
                              type="button"
                              title="Girilen tutarı ekle"
                              onClick={() => {
                                if (parsedCustom <= 0) return;
                                handlePlayerAction(
                                  player.id,
                                  "add_chips",
                                  parsedCustom,
                                  `${player.nickname} hesabına +${parsedCustom} çip eklendi.`
                                );
                              }}
                              className="p-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-500/40 text-emerald-300 transition cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Girilen tutarı sil"
                              onClick={() => {
                                if (parsedCustom <= 0) return;
                                handlePlayerAction(
                                  player.id,
                                  "remove_chips",
                                  parsedCustom,
                                  `${player.nickname} hesabından -${parsedCustom} çip silindi.`
                                );
                              }}
                              className="p-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/35 border border-rose-500/40 text-rose-300 transition cursor-pointer"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Bakiyeyi bu tutara sabitle"
                              onClick={() => {
                                if (customVal.trim() === "") return;
                                handlePlayerAction(
                                  player.id,
                                  "set_chips",
                                  parsedCustom,
                                  `${player.nickname} bakiyesi ${parsedCustom} çip olarak sabitlendi.`
                                );
                              }}
                              className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/40 text-amber-300 text-xs font-semibold transition cursor-pointer"
                            >
                              Sabitle
                            </button>
                          </div>
                        </td>

                        {/* Reset & Delete */}
                        <td className="py-4 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              title="Oyuncuyu 1000 çipe ve 0 istatistiğe sıfırla"
                              onClick={() =>
                                handlePlayerAction(
                                  player.id,
                                  "reset_player",
                                  undefined,
                                  `${player.nickname} sıfırlandı (1000 Çip).`
                                )
                              }
                              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              title="Oyuncuyu tamamen sil"
                              onClick={() =>
                                handlePlayerAction(
                                  player.id,
                                  "delete_player",
                                  undefined,
                                  `${player.nickname} listeden silindi.`
                                )
                              }
                              className="p-2 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-500/30 text-rose-300 transition cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

