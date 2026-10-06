let VALID_SET = new Set();
    async function loadWordList() {
      const urls = [
        "https://cdn.jsdelivr.net/gh/heisencoder/wordle@main/solutions.txt",
        "https://cdn.jsdelivr.net/gh/heisencoder/wordle@main/guesses.txt"
      ];
      const texts = await Promise.all(urls.map(u => fetch(u).then(r => {
        if (!r.ok) throw new Error("word list " + r.status);
        return r.text();
      })));
      texts.forEach(t => {
        t.split(/\s+/).forEach(w => {
          w = w.trim().toUpperCase();
          if (w.length === 5) VALID_SET.add(w);
        });
      });
    }
    const SIDE_POS = {
      top:    [0,1,2,3,4],
      right:  [4,5,6,7,8],
      bottom: [9,10,11,12,8],
      left:   [0,14,15,16,9]
    };
    const POS_SIDES = {
      0: ["top","left"], 1: ["top"], 2: ["top"], 3: ["top"], 4: ["top","right"],
      5: ["right"], 6: ["right"], 7: ["right"], 8: ["right","bottom"],
      9: ["bottom","left"], 10: ["bottom"], 11: ["bottom"], 12: ["bottom"],
      14: ["left"], 15: ["left"], 16: ["left"]
    };
    const STORAGE_KEY = "spellunk_daily_v3";
    const UNLOCK_KEY = "spellunk_unlocks_v1";
    const STATS_KEY = "spellunk_stats_v1";

    let secrets = {};
    let todayTheme = "";
    let currentSide = "top";
    const START_GUESSES = 8;
    const SIDE_BONUS = 2;
    let guessesLeft = START_GUESSES;
    let currentGuess = "";
    let solved = { top:false, right:false, bottom:false, left:false };
    let tileLetters = Array(17).fill("");
    let tileColors = Array(17).fill("empty");
    let sideKeyColors = { top: {}, right: {}, bottom: {}, left: {} };
    let sideGuessCounts = { top: 0, right: 0, bottom: 0, left: 0 };
    let sideHistory = { top: [], right: [], bottom: [], left: [] };
    let gameOver = false;
    let won = false;
    let statsRecorded = false;
    let today = "";
    let items = { green: true, yellow: true, map: false };
    let cave = null;
    let currentRoom = "entrance";
    let roomState = {};
    let entranceRewarded = false;
    let unlocks = { light: false, theme: "dark" };
    const ARROW = { top: "\u2191", right: "\u2192", bottom: "\u2193", left: "\u2190" };
    const OPPOSITE = { top: "bottom", right: "left", bottom: "top", left: "right" };
    let reveals = [];
    let pulsePos = null;
    let pulseTimer = null;
    let lettersHidden = false;

    const boardEl = document.getElementById("board");
    const guessRow = document.getElementById("guessRow");
    const messageEl = document.getElementById("message");
    const guessesLeftEl = document.getElementById("guessesLeft");
        const helpModal = document.getElementById("helpModal");
    const endModal = document.getElementById("endModal");

    function emptyHistory() {
      return { top: [], right: [], bottom: [], left: [] };
    }
    function localDateKey() {
      const d = new Date();
      return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
    }
    function puzzleIndexForDate(key) {
      let h = 2166136261;
      for (let i = 0; i < key.length; i++) {
        h ^= key.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return Math.abs(h) % PUZZLES.length;
    }
    function saveState() {
      const state = {
        date: today, guessesLeft, currentSide, currentGuess, solved,
        tileLetters, tileColors, sideKeyColors, sideGuessCounts, sideHistory,
        gameOver, won, statsRecorded, items, reveals, cave, currentRoom, roomState, entranceRewarded
      };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
    }
    function loadState() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const s = JSON.parse(raw);
        if (!s || s.date !== today) return null;
        return s;
      } catch (e) { return null; }
    }
    function applyPuzzleWords() {
      const p = PUZZLES[puzzleIndexForDate(today)];
      secrets = { top: p[0], right: p[1], bottom: p[2], left: p[3] };
      todayTheme = p[4] || "";
    }
    function startFresh() {
      applyPuzzleWords();
      guessesLeft = START_GUESSES; currentGuess = "";
      solved = { top:false, right:false, bottom:false, left:false };
      tileLetters = Array(17).fill("");
      tileColors = Array(17).fill("empty");
      sideKeyColors = { top: {}, right: {}, bottom: {}, left: {} };
      sideGuessCounts = { top: 0, right: 0, bottom: 0, left: 0 };
      sideHistory = emptyHistory();
      items = { green: 1, yellow: 1, map: 0 };
      reveals = [];
      currentRoom = "entrance";
      roomState = {};
      cave = null;
      entranceRewarded = false;
      gameOver = false; won = false; statsRecorded = false; currentSide = "top";
    }
    function restore(s) {
      applyPuzzleWords();
      guessesLeft = s.guessesLeft;
      currentSide = s.currentSide || "top";
      currentGuess = s.currentGuess || "";
      solved = s.solved;
      tileLetters = s.tileLetters;
      tileColors = s.tileColors;
      sideKeyColors = s.sideKeyColors;
      sideGuessCounts = s.sideGuessCounts || { top: 0, right: 0, bottom: 0, left: 0 };
      sideHistory = s.sideHistory || emptyHistory();
      ["top","right","bottom","left"].forEach(function(side) {
        if (!Array.isArray(sideHistory[side])) sideHistory[side] = [];
      });
      gameOver = !!s.gameOver; won = !!s.won; statsRecorded = !!s.statsRecorded;
      items = normalizeItems(s.items);
      reveals = Array.isArray(s.reveals) ? s.reveals : [];
      cave = s.cave || null;
      currentRoom = s.currentRoom || "entrance";
      roomState = s.roomState || {};
      entranceRewarded = !!s.entranceRewarded;
    }
    function initPuzzle() {
      today = localDateKey();
      const saved = loadState();
      if (saved) restore(saved);
      else { startFresh(); saveState(); }
      updateUI();
      hideMessage();
      if (guessesLeft <= 0) showOutOfGuesses();
      else if (gameOver) showEnd(won);
    }
    function paintCurrentSideGuess() {
      const hist = sideHistory[currentSide];
      if (!hist || !hist.length) return;
      const last = hist[hist.length - 1];
      const positions = SIDE_POS[currentSide];
      for (let i = 0; i < 5; i++) {
        const pos = positions[i];
        tileLetters[pos] = last.word[i];
        tileColors[pos] = last.colors[i];
      }
    }
    function tilePx() {
      return window.matchMedia("(max-width: 360px)").matches ? 46 : 52;
    }
    function renderSideHistory() {
      const nearest = Math.round(tilePx() * 0.75 * 0.85);
      ["top","right","bottom","left"].forEach(function(side) {
        const el = document.getElementById("history-" + side);
        if (!el) return;
        el.innerHTML = "";
        const show = side === currentSide;
        el.classList.toggle("visible", show);
        if (!show) return;
        const hist = sideHistory[side] || [];
        if (hist.length < 2) return;
        const older = hist.slice(0, -1).slice().reverse();
        older.forEach(function(entry, i) {
          const size = Math.max(12, nearest - i * 4);
          const word = document.createElement("div");
          word.className = "history-word";
          word.style.setProperty("--h-size", size + "px");
          word.style.opacity = "0.75";
          for (let j = 0; j < 5; j++) {
            const t = document.createElement("div");
            t.className = "history-tile " + (entry.colors[j] || "absent");
            t.textContent = entry.word[j] || "";
            word.appendChild(t);
          }
          el.appendChild(word);
        });
      });
    }
    function updateUI() {
      paintCurrentSideGuess();
      applyReveals();
      for (let i = 0; i < 17; i++) {
        const el = boardEl.querySelector('[data-pos="' + i + '"]');
        if (!el) continue;
        el.textContent = tileLetters[i];
        el.className = "tile " + (tileColors[i] || "empty");
        if (tileLetters[i]) el.classList.add("filled");
        if (i === pulsePos) el.classList.add("revealed-pulse");
      }
      document.querySelectorAll(".tile[data-pos]").forEach(t => t.classList.remove("selected-side"));
      SIDE_POS[currentSide].forEach(pos => {
        const el = boardEl.querySelector('[data-pos="' + pos + '"]');
        if (el) el.classList.add("selected-side");
      });
      guessRow.querySelectorAll(".guess-tile").forEach((t,i) => { t.textContent = currentGuess[i] || ""; });
      guessesLeftEl.textContent = Math.max(0, guessesLeft - bonusHold);
      guessRow.style.display = currentRoom !== "entrance" && roomState[currentRoom] && roomState[currentRoom].solved ? "none" : "flex";
      placeBranchArrows();
      const roomsEl = document.getElementById("roomsEntered");
      const totalEl = document.getElementById("roomsTotal");
      if (roomsEl) roomsEl.textContent = 1 + Object.keys(roomState || {}).length;
      if (totalEl) totalEl.textContent = itemCount("map") && cave && cave.nodes ? Object.keys(cave.nodes).length : "X";
      const mapBtn = document.getElementById("mapBtn");
      if (mapBtn) mapBtn.hidden = itemCount("map") < 1;
      showRoom();
      renderSideHistory();
      renderKeyboard();
    }
    function renderKeyboard() {
      const rows = ["qwertyuiop".split(""), "asdfghjkl".split(""), ["Enter", ..."zxcvbnm".split(""), "Back"]];
      const kb = document.getElementById("keyboard");
      kb.innerHTML = "";
      rows.forEach(row => {
        const rowEl = document.createElement("div");
        rowEl.className = "kb-row";
        row.forEach(k => {
          const btn = document.createElement("button");
          btn.className = "key" + (k.length > 1 ? " wide" : "");
          btn.textContent = k === "Back" ? "⌫" : k;
          const col = currentRoom === "entrance"
            ? sideKeyColors[currentSide][k.toUpperCase()]
            : pathKeyColor(k.toUpperCase());
          if (col) btn.classList.add(col);
          btn.addEventListener("click", () => handleKey(k));
          rowEl.appendChild(btn);
        });
        kb.appendChild(rowEl);
      });
    }
    function showMessage(msg, duration) {
      if (duration === undefined) duration = 1800;
      messageEl.textContent = msg;
      messageEl.style.opacity = "1";
      if (duration) setTimeout(hideMessage, duration);
    }
    function hideMessage() { messageEl.style.opacity = "0"; }
    function evaluateGuess(guess, secret) {
      const result = Array(5).fill("absent");
      const secretArr = secret.split("");
      const guessArr = guess.split("");
      const used = Array(5).fill(false);
      for (let i = 0; i < 5; i++) {
        if (guessArr[i] === secretArr[i]) { result[i] = "correct"; used[i] = true; }
      }
      for (let i = 0; i < 5; i++) {
        if (result[i] === "correct") continue;
        for (let j = 0; j < 5; j++) {
          if (!used[j] && guessArr[i] === secretArr[j]) { result[i] = "present"; used[j] = true; break; }
        }
      }
      return result;
    }
    function hintViolation(guess, side) {
      const hist = sideHistory[side] || [];
      if (!hist.length) return null;
      const locked = [null, null, null, null, null];
      const required = {};
      hist.forEach(function(entry) {
        const counts = {};
        for (let i = 0; i < 5; i++) {
          const ch = entry.word[i];
          const c = entry.colors[i];
          if (c === "correct") locked[i] = ch;
          if (c === "correct" || c === "present") counts[ch] = (counts[ch] || 0) + 1;
        }
        Object.keys(counts).forEach(function(ch) {
          required[ch] = Math.max(required[ch] || 0, counts[ch]);
        });
      });
      for (let i = 0; i < 5; i++) {
        if (locked[i] && guess[i] !== locked[i]) {
          return "Letter " + (i + 1) + " must be " + locked[i];
        }
      }
      const guessCounts = {};
      for (let i = 0; i < 5; i++) guessCounts[guess[i]] = (guessCounts[guess[i]] || 0) + 1;
      const missing = Object.keys(required).filter(function(ch) {
        return (guessCounts[ch] || 0) < required[ch];
      });
      if (missing.length) {
        return "Guess must include " + missing.join(", ");
      }
      return null;
    }
    function submitGuess() {
      if (currentRoom !== "entrance") { submitPathGuess(); return; }
      if (gameOver) {
        showMessage("Come back tomorrow for a new puzzle");
        showEnd(won);
        return;
      }
      if (currentGuess.length !== 5) { showMessage("Too few letters"); return; }
      const guess = currentGuess.toUpperCase();
      if (!VALID_SET.has(guess)) { showMessage("Not a recognized word"); return; }
      if (solved[currentSide]) { showMessage("This side is already solved"); return; }
      const hintErr = hintViolation(guess, currentSide);
      if (hintErr) { showMessage(hintErr, 2200); return; }
      const secret = secrets[currentSide];
      const colors = evaluateGuess(guess, secret);
      const positions = SIDE_POS[currentSide];
      sideHistory[currentSide].push({ word: guess, colors: colors.slice() });
      for (let i = 0; i < 5; i++) {
        const pos = positions[i];
        tileLetters[pos] = guess[i];
        tileColors[pos] = colors[i];
      }
      const rank = { correct: 3, present: 2, absent: 1, empty: 0 };
      const kc = sideKeyColors[currentSide];
      for (let i = 0; i < 5; i++) {
        const ch = guess[i];
        const c = colors[i];
        if (!kc[ch] || rank[c] > rank[kc[ch]]) kc[ch] = c;
      }
      guessesLeft--;
      sideGuessCounts[currentSide]++;
      currentGuess = "";
      let solvedSide = false;
      if (guess === secret) {
        solved[currentSide] = true;
        solvedSide = true;
        awardGuessBonus();
        positions.forEach((pos, i) => { tileLetters[pos] = secret[i]; tileColors[pos] = "correct"; });
        showMessage("Side solved!");
      }
      const allSolved = Object.values(solved).every(Boolean);
      if (allSolved && !entranceRewarded) grantEntranceItem();
      if (allSolved) { gameOver = true; won = true; }
      else if (guessesLeft <= 0) { gameOver = true; won = false; showOutOfGuesses(); }
      saveState(); updateUI();
      if (solvedSide) burstConfetti();
      if (gameOver) {
        setTimeout(function(){ showEnd(won); }, solvedSide ? 2600 : 600);
        return;
      }
    }
    function pathKeyColor(letter) {
      const node = cave && cave.nodes[currentRoom];
      const st = roomState[currentRoom];
      if (!node) return "";
      const rank = { correct: 3, present: 2, absent: 1, empty: 0 };
      let best = letter === node.via ? "correct" : "";
      (st && st.history || []).forEach(function(entry) {
        for (let i = 0; i < 5; i++) {
          if (entry.word[i] !== letter || !entry.colors[i]) continue;
          if (!best || rank[entry.colors[i]] > rank[best]) best = entry.colors[i];
        }
      });
      return best;
    }
    function branchIndex(word, via) {
      for (let i = 1; i <= 3; i++) if (word[i] === via) return i;
      return Math.max(0, word.indexOf(via));
    }
    function triangleButton(dir, onClick) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "branch-arrow " + dir;
      btn.setAttribute("aria-label", "Continue " + dir);
      btn.addEventListener("click", onClick);
      return btn;
    }
    function placeBranchArrows() {
      const layer = document.getElementById("branchArrows");
      if (!layer) return;
      layer.innerHTML = "";
      if (currentRoom !== "entrance" || !cave) return;
      const wrap = document.getElementById("squareWrap");
      ["top","right","bottom","left"].forEach(function(side) {
        if (!solved[side]) return;
        const childId = caveChild("entrance", side);
        if (!childId) return;
        const child = cave.nodes[childId];
        const idx = branchIndex(secrets[side], child.via);
        const pos = SIDE_POS[side][idx];
        const tile = boardEl.querySelector('[data-pos="' + pos + '"]');
        if (!tile) return;
        const btn = triangleButton(side, function() { travelTo(childId, side); });
        const tr = tile.getBoundingClientRect();
        const wr = wrap.getBoundingClientRect();
        const x = tr.left - wr.left;
        const y = tr.top - wr.top;
        if (side === "right") { btn.style.left = (x + tr.width + 6) + "px"; btn.style.top = (y + tr.height / 2 - 16) + "px"; }
        if (side === "left") { btn.style.left = (x - 32) + "px"; btn.style.top = (y + tr.height / 2 - 16) + "px"; }
        if (side === "top") { btn.style.left = (x + tr.width / 2 - 16) + "px"; btn.style.top = (y - 32) + "px"; }
        if (side === "bottom") { btn.style.left = (x + tr.width / 2 - 16) + "px"; btn.style.top = (y + tr.height + 6) + "px"; }
        layer.appendChild(btn);
      });
    }
    function itemCount(key) {
      const value = items[key];
      if (value === true) return 1;
      if (value === false || value == null) return 0;
      return Number(value) || 0;
    }
    function normalizeItems(raw) {
      const src = raw || {};
      function count(value, fallback) {
        if (value === true) return 1;
        if (value === false || value == null) return fallback;
        return Number(value) || 0;
      }
      return { green: count(src.green, 1), yellow: count(src.yellow, 1), map: count(src.map, 0) };
    }
    function addItem(key) {
      items[key] = itemCount(key) + 1;
    }
    function grantEntranceItem() {
      entranceRewarded = true;
      const pool = ["green", "yellow", "map"];
      const pick = pool[Math.floor(Math.random() * pool.length)];
      const names = { green: "Green hint", yellow: "Yellow hint", map: "Map" };
      if (pick === "map") addItem("map");
      else addItem(pick);
      const text = document.getElementById("rewardText");
      if (text) text.textContent = pick === "map" ? "You got a map." : "You got a new " + names[pick] + "!";
      const modal = document.getElementById("rewardModal");
      if (modal) modal.classList.add("show");
    }
    function guessesUsed() {
      return ["top","right","bottom","left"].reduce(function(sum, side) {
        return sum + (sideGuessCounts[side] || 0);
      }, 0);
    }
    let bonusHold = 0;
    function awardGuessBonus() {
      guessesLeft += SIDE_BONUS;
      bonusHold += SIDE_BONUS;
      setTimeout(popBonus, 1400);
      setTimeout(function() {
        bonusHold = Math.max(0, bonusHold - SIDE_BONUS);
        updateUI();
        saveState();
      }, 2600);
    }
    function popBonus() {
      const el = document.getElementById("bonusPop");
      if (!el) return;
      el.classList.remove("show");
      void el.offsetWidth;
      el.classList.add("show");
    }
    function burstConfetti() {
      const layer = document.getElementById("confetti");
      if (!layer) return;
      const colors = ["#4ade80", "#22c55e", "#86efac", "#facc15", "#ffffff", "#1b6714"];
      ["left", "right"].forEach(function(side) {
        for (let i = 0; i < 26; i++) {
          const piece = document.createElement("span");
          piece.className = "confetti-piece";
          piece.style.background = colors[i % colors.length];
          piece.style.top = (8 + Math.random() * 78) + "%";
          piece.style[side] = (Math.random() * 8) + "px";
          const outward = 50 + Math.random() * 130;
          piece.style.setProperty("--dx", ((side === "left" ? 1 : -1) * outward) + "px");
          piece.style.setProperty("--dy", (-70 + Math.random() * 160) + "px");
          piece.style.setProperty("--rot", (180 + Math.random() * 360) + "deg");
          piece.style.animationDelay = (Math.random() * 90) + "ms";
          if (Math.random() < 0.35) {
            piece.style.width = "6px";
            piece.style.height = "6px";
            piece.style.borderRadius = "50%";
          }
          layer.appendChild(piece);
          setTimeout(function() { piece.remove(); }, 950);
        }
      });
    }
    function emptySides() {
      return { top:0, right:0, bottom:0, left:0 };
    }
    function defaultStats() {
      return { played:0, wins:0, currentStreak:0, maxStreak:0, winGuessSum:0,
        sides: emptySides(), lastPlayedDate:"", lastWinDate:"" };
    }
    function loadStats() {
      try {
        const raw = localStorage.getItem(STATS_KEY);
        if (!raw) return defaultStats();
        const prev = JSON.parse(raw);
        const st = defaultStats();
        st.played = prev.played || 0;
        st.wins = prev.wins || 0;
        st.currentStreak = prev.currentStreak || 0;
        st.maxStreak = prev.maxStreak || 0;
        st.winGuessSum = prev.winGuessSum || 0;
        st.lastPlayedDate = prev.lastPlayedDate || "";
        st.lastWinDate = prev.lastWinDate || "";
        st.sides = Object.assign(emptySides(), prev.sides || {});
        return st;
      } catch (e) { return defaultStats(); }
    }
    function saveStats(st) {
      const clean = {
        played: st.played || 0,
        wins: st.wins || 0,
        currentStreak: st.currentStreak || 0,
        maxStreak: st.maxStreak || 0,
        winGuessSum: st.winGuessSum || 0,
        sides: Object.assign(emptySides(), st.sides || {}),
        lastPlayedDate: st.lastPlayedDate || "",
        lastWinDate: st.lastWinDate || ""
      };
      try { localStorage.setItem(STATS_KEY, JSON.stringify(clean)); } catch (e) {}
    }
    function yesterdayOf(key) {
      const p = key.split("-").map(Number);
      const d = new Date(p[0], p[1]-1, p[2]);
      d.setDate(d.getDate()-1);
      return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
    }
    function recordStatsIfNeeded(didWin) {
      if (statsRecorded) return;
      const st = loadStats();
      if (st.lastPlayedDate === today) { statsRecorded = true; saveState(); return; }
      const used = guessesUsed();
      st.played += 1;
      st.winGuessSum += used;
      ["top","right","bottom","left"].forEach(function(side){
        if (solved[side]) st.sides[side] = (st.sides[side] || 0) + 1;
      });
      if (didWin) {
        st.wins += 1;
        if (st.lastWinDate === yesterdayOf(today)) st.currentStreak += 1;
        else st.currentStreak = 1;
        st.lastWinDate = today;
        if (st.currentStreak > st.maxStreak) st.maxStreak = st.currentStreak;
      } else st.currentStreak = 0;
      st.lastPlayedDate = today;
      saveStats(st); statsRecorded = true; saveState();
    }
    function renderStats() {
      const st = loadStats();
      document.getElementById("statStreak").textContent = st.currentStreak;
      document.getElementById("statBest").textContent = st.maxStreak;
      document.getElementById("statAvg").textContent = st.played ? (st.winGuessSum / st.played).toFixed(1) : "—";
      const sides = st.sides || emptySides();
      const maxSide = Math.max(sides.top || 0, sides.right || 0, sides.bottom || 0, sides.left || 0, 1);
      ["top","right","bottom","left"].forEach(function(side) {
        const n = sides[side] || 0;
        document.getElementById("n-" + side).textContent = n;
        document.getElementById("bar-" + side).style.width = Math.round((n / maxSide) * 100) + "%";
      });
    }
    function showStats() {
      const modal = document.getElementById("statsModal");
      modal.classList.add("show");
      renderStats();
      requestAnimationFrame(renderStats);
    }
    function showEnd(didWin) {
      recordStatsIfNeeded(didWin);
      const title = document.getElementById("endTitle");
      const body = document.getElementById("endBody");
      if (didWin) {
        title.textContent = "Congratulations!";
        title.style.color = "var(--correct)";
        const used = guessesUsed();
        let extra = "";
        if (used <= 8) extra = "That's amazing!";
        else if (used >= START_GUESSES) extra = "Barely got it today, but you got it.";
        body.innerHTML = "<p>You solved today's square in " + used + " guess" + (used===1?"":"es") + ".</p>" +
          (extra ? "<p>" + extra + "</p>" : "") +
          (todayTheme ? "<p class='reveal'>Theme: " + todayTheme + "</p>" : "");
      } else {
        title.textContent = "Better luck next time";
        title.style.color = "#f87171";
        function line(label, side) {
          const n = sideGuessCounts[side] || 0;
          return "<p><strong>" + label + ":</strong> " + secrets[side] + " (" + n + " guess" + (n===1?"":"es") + ")</p>";
        }
        body.innerHTML =
          "<p class='reveal'>Today's square was:</p>" +
          line("Top","top") + line("Right","right") + line("Bottom","bottom") + line("Left","left") +
          (todayTheme ? "<p class='reveal'>Theme: <em>" + todayTheme + "</em></p>" : "");
      }
      endModal.classList.add("show");
    }
    function handleKey(key) {
      if (gameOver) { if (key === "Enter") showEnd(won); return; }
      if (key === "Enter") submitGuess();
      else if (key === "Back" || key === "Backspace") {
        currentGuess = currentGuess.slice(0, -1); updateUI(); saveState();
      } else if (/^[a-zA-Z]$/.test(key) && currentGuess.length < 5) {
        currentGuess += key.toUpperCase(); updateUI();
      }
    }
    document.addEventListener("keydown", function(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (helpModal.classList.contains("show") || endModal.classList.contains("show") ||
          document.getElementById("statsModal").classList.contains("show") ||
          document.getElementById("itemsModal").classList.contains("show") ||
          document.getElementById("mapModal").classList.contains("show") ||
          document.getElementById("outModal").classList.contains("show")) return;
      if (e.key === "Enter") handleKey("Enter");
      else if (e.key === "Backspace") { e.preventDefault(); handleKey("Back"); }
      else if (/^[a-zA-Z]$/.test(e.key)) handleKey(e.key);
    });
    function selectSide(side) {
      if (!SIDE_POS[side] || side === currentSide) return;
      currentSide = side; currentGuess = ""; updateUI(); saveState();
    }
    function sideFromTile(pos) {
      const sides = POS_SIDES[pos];
      if (!sides || !sides.length) return null;
      if (sides.length === 1) return sides[0];
      if (sides[0] === currentSide) return sides[1];
      if (sides[1] === currentSide) return sides[0];
      return sides[0];
    }
    function applyLettersHidden() {
      document.body.classList.toggle("letters-hidden", lettersHidden);
      const btn = document.getElementById("cameraBtn");
      if (!btn) return;
      btn.classList.toggle("active", lettersHidden);
      btn.setAttribute("aria-pressed", lettersHidden ? "true" : "false");
      btn.title = lettersHidden ? "Show letters" : "Hide letters";
      btn.setAttribute("aria-label", btn.title);
    }
    function toggleLetters() {
      lettersHidden = !lettersHidden;
      try { localStorage.setItem("spellunk_hide_letters", lettersHidden ? "1" : "0"); } catch (e) {}
      applyLettersHidden();
    }
    boardEl.querySelectorAll(".tile[data-pos]").forEach(function(tile) {
      tile.addEventListener("click", function() {
        const side = sideFromTile(tile.dataset.pos);
        if (side) selectSide(side);
      });
    });
    function closeMenu() {
      const menu = document.getElementById("menuDropdown");
      const btn = document.getElementById("menuBtn");
      if (menu) menu.hidden = true;
      if (btn) btn.setAttribute("aria-expanded", "false");
    }
    function toggleMenu() {
      const menu = document.getElementById("menuDropdown");
      const btn = document.getElementById("menuBtn");
      if (!menu || !btn) return;
      const open = menu.hidden;
      menu.hidden = !open;
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    }
    document.getElementById("menuBtn").addEventListener("click", function(e) {
      e.preventDefault();
      e.stopPropagation();
      toggleMenu();
    });
    document.getElementById("menuDropdown").addEventListener("click", function(e) {
      e.stopPropagation();
    });
    document.getElementById("helpBtn").addEventListener("click", function(){
      closeMenu();
      helpModal.classList.add("show");
    });
    document.getElementById("closeHelp").addEventListener("click", function(){ helpModal.classList.remove("show"); });
    document.getElementById("closeEndBtn").addEventListener("click", function(){ endModal.classList.remove("show"); });
    document.getElementById("statsBtn").addEventListener("click", function(){
      closeMenu();
      showStats();
    });
    document.getElementById("closeStats").addEventListener("click", function(){
      document.getElementById("statsModal").classList.remove("show");
    });
    document.addEventListener("click", function(e) {
      const wrap = document.querySelector(".menu-wrap");
      if (wrap && !wrap.contains(e.target)) closeMenu();
    });
    document.addEventListener("keydown", function(e) {
      if (e.key === "Escape") closeMenu();
    });
    function boardPositions() {
      return [0,1,2,3,4,5,6,7,8,9,10,11,12,14,15,16];
    }
    function correctLetterAt(pos) {
      const sides = POS_SIDES[pos] || [];
      if (!sides.length) return "";
      const idx = SIDE_POS[sides[0]].indexOf(pos);
      return idx < 0 ? "" : secrets[sides[0]][idx];
    }
    function cellIncomplete(pos) {
      const sides = POS_SIDES[pos] || [];
      if (!sides.length || !sides.some(function(side) { return !solved[side]; })) return false;
      return !(tileColors[pos] === "correct" && tileLetters[pos] === correctLetterAt(pos));
    }
    function applyReveals() {
      reveals.forEach(function(reveal) {
        if (!cellIncomplete(reveal.pos) && reveal.color !== "correct") return;
        if (reveal.color === "correct" && solved[(POS_SIDES[reveal.pos] || [])[0]] && (POS_SIDES[reveal.pos] || []).every(function(side) { return solved[side]; })) return;
        tileLetters[reveal.pos] = reveal.letter;
        tileColors[reveal.pos] = reveal.color;
      });
    }
    function pulseTile(pos) {
      pulsePos = pos;
      clearTimeout(pulseTimer);
      pulseTimer = setTimeout(function() {
        pulsePos = null;
        updateUI();
      }, 2000);
    }
    function rememberReveal(pos, letter, color) {
      reveals = reveals.filter(function(reveal) { return reveal.pos !== pos; });
      reveals.push({ pos: pos, letter: letter, color: color });
      tileLetters[pos] = letter;
      tileColors[pos] = color;
      const sides = POS_SIDES[pos] || [];
      sides.forEach(function(side) {
        const kc = sideKeyColors[side];
        const rank = { correct: 3, present: 2, absent: 1 };
        if (!kc[letter] || rank[color] > rank[kc[letter]]) kc[letter] = color;
      });
    }
    function useGreenItem() {
      if (currentRoom !== "entrance") return usePathReveal("correct");
      const spots = boardPositions().filter(cellIncomplete);
      if (!spots.length) { showMessage("No open letters to reveal"); return false; }
      const pos = spots[Math.floor(Math.random() * spots.length)];
      rememberReveal(pos, correctLetterAt(pos), "correct");
      return pos;
    }
    function useYellowItem() {
      if (currentRoom !== "entrance") return usePathReveal("present");
      const options = [];
      boardPositions().filter(cellIncomplete).forEach(function(pos) {
        const correct = correctLetterAt(pos);
        const letters = {};
        (POS_SIDES[pos] || []).forEach(function(side) {
          if (solved[side]) return;
          secrets[side].split("").forEach(function(ch) {
            if (ch !== correct) letters[ch] = true;
          });
        });
        Object.keys(letters).forEach(function(ch) { options.push({ pos: pos, letter: ch }); });
      });
      if (!options.length) { showMessage("No open letters to reveal"); return false; }
      const pick = options[Math.floor(Math.random() * options.length)];
      rememberReveal(pick.pos, pick.letter, "present");
      return pick.pos;
    }
    function usePathReveal(kind) {
      const node = cave && cave.nodes[currentRoom];
      const st = node && roomState[currentRoom];
      if (!node || !st || st.solved) { showMessage("No open letters to reveal"); return false; }
      const open = [1, 2, 3, 4].filter(function(i) {
        const last = st.history.length ? st.history[st.history.length - 1] : null;
        return !last || last.colors[i] !== "correct";
      });
      if (!open.length) { showMessage("No open letters to reveal"); return false; }
      const i = open[Math.floor(Math.random() * open.length)];
      let letter = node.word[i];
      if (kind === "present") {
        const choices = node.word.split("").filter(function(ch, idx) { return ch !== node.word[i] && idx !== i; });
        letter = choices[Math.floor(Math.random() * choices.length)] || letter;
      }
      const last = st.history.length ? st.history[st.history.length - 1] : null;
      const word = last ? last.word.split("") : [node.via, "", "", "", ""];
      const colors = last ? last.colors.slice() : ["correct", "", "", "", ""];
      word[0] = node.via;
      colors[0] = "correct";
      (st.history || []).forEach(function(entry) {
        for (let n = 1; n < 5; n++) {
          if (entry.colors[n] === "correct") {
            word[n] = entry.word[n];
            colors[n] = "correct";
          }
        }
      });
      st.history.push({ word: word.join("").padEnd(5, " ").slice(0, 5), colors: colors });
      const entry = st.history[st.history.length - 1];
      entry.word = (entry.word.substring(0, i) + letter + entry.word.substring(i + 1)).slice(0, 5);
      entry.colors[i] = kind === "present" ? "present" : "correct";
      renderPath();
      const tile = document.getElementById("pathWord").children[i];
      if (tile) tile.classList.add("revealed-pulse");
      return i;
    }
    function renderItems() {
      const list = document.getElementById("itemsList");
      const empty = document.getElementById("itemsEmpty");
      if (!list || !empty) return;
      list.innerHTML = "";
      const defs = [];
      if (items.green) defs.push({ key: "green", name: "Green hint", detail: "Reveal one correct letter", swatch: "correct", mark: "A" });
      if (items.yellow) defs.push({ key: "yellow", name: "Yellow hint", detail: "Reveal one misplaced letter", swatch: "present", mark: "B" });
      empty.hidden = defs.length > 0;
      defs.forEach(function(def) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "item-btn";
        const count = itemCount(def.key);
        btn.innerHTML = "<div class='item-swatch " + def.swatch + "'>" + def.mark + "</div><div><strong>" + def.name + "</strong><span>" + def.detail + "</span></div>" + (count > 1 ? "<span class='item-count'>" + count + "x</span>" : "");
        btn.addEventListener("click", function() {
          if (def.key === "map") { openMap(); document.getElementById("itemsModal").classList.remove("show"); return; }
          if (gameOver && currentRoom === "entrance") { showMessage("Come back tomorrow for a new puzzle"); return; }
          const pos = def.key === "green" ? useGreenItem() : useYellowItem();
          if (pos === false) return;
          items[def.key] = Math.max(0, itemCount(def.key) - 1);
          pulseTile(pos);
          saveState();
          updateUI();
          renderItems();
          document.getElementById("itemsModal").classList.remove("show");
        });
        list.appendChild(btn);
      });
    }
    document.getElementById("packBtn").addEventListener("click", function(){
      renderItems();
      document.getElementById("itemsModal").classList.add("show");
    });
    document.getElementById("mapBtn").addEventListener("click", openMap);
    document.getElementById("closeItems").addEventListener("click", function(){
      document.getElementById("itemsModal").classList.remove("show");
    });
    document.getElementById("cameraBtn").addEventListener("click", toggleLetters);
    try { lettersHidden = localStorage.getItem("spellunk_hide_letters") === "1"; } catch (e) {}
    applyLettersHidden();
    window.addEventListener("resize", function(){ renderSideHistory(); });

    function loadUnlocks() {
      try { unlocks = Object.assign({ light: false, theme: "dark" }, JSON.parse(localStorage.getItem(UNLOCK_KEY) || "{}")); }
      catch (e) { unlocks = { light: false, theme: "dark" }; }
    }
    function saveUnlocks() {
      try { localStorage.setItem(UNLOCK_KEY, JSON.stringify(unlocks)); } catch (e) {}
    }
    function applyTheme() {
      loadUnlocks();
      document.body.classList.toggle("theme-light", unlocks.theme === "light" && unlocks.light);
      const lightBtn = document.getElementById("themeLight");
      if (lightBtn) {
        lightBtn.disabled = !unlocks.light;
        lightBtn.textContent = unlocks.light ? (unlocks.theme === "light" ? "Using" : "Use") : "Locked";
      }
    }
    function caveChild(id, dir) {
      if (!cave || !cave.nodes[id]) return null;
      const hit = (cave.nodes[id].children || []).find(function(ch) { return ch.dir === dir; });
      return hit ? hit.id : null;
    }
    function seededRand(key) {
      let h = 2166136261;
      for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
      return function() {
        h = Math.imul(h ^ (h >>> 15), h | 1);
        h ^= h + Math.imul(h ^ (h >>> 7), 61 | h);
        return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
      };
    }
    function pickThemedWord(start, used, themeBag, rand) {
      const pool = [];
      VALID_SET.forEach(function(word) {
        if (word[0] !== start || used[word]) return;
        let score = 0;
        for (let i = 0; i < word.length; i++) if (themeBag.indexOf(word[i]) >= 0) score++;
        pool.push({ word: word, score: score });
      });
      if (!pool.length) return null;
      pool.sort(function(a, b) { return b.score - a.score || (a.word < b.word ? -1 : 1); });
      const top = pool.slice(0, Math.min(30, pool.length));
      return top[Math.floor(rand() * top.length)].word;
    }
    function buildCave() {
      const rand = seededRand(today + "|" + secrets.top + secrets.right + secrets.bottom + secrets.left);
      const used = {};
      ["top","right","bottom","left"].forEach(function(side) { used[secrets[side]] = true; });
      const themeBag = (todayTheme + secrets.top + secrets.right + secrets.bottom + secrets.left).toUpperCase();
      const nodes = { entrance: { id: "entrance", kind: "square", children: [], x: 0, y: 0, word: "" } };
      const turns = { top: ["top","left","right"], right: ["right","top","bottom"], bottom: ["bottom","left","right"], left: ["left","top","bottom"] };
      const occupied = { "0,0": true };
      let made = 0;
      const target = 12 + Math.floor(rand() * 5);
      function place(parent, dir) {
        let x = parent.x, y = parent.y;
        if (dir === "top") y -= 1;
        if (dir === "bottom") y += 1;
        if (dir === "left") x -= 1;
        if (dir === "right") x += 1;
        let guard = 0;
        while (occupied[x + "," + y] && guard < 6) {
          if (dir === "top" || dir === "bottom") x += guard % 2 ? 1 : -1;
          else y += guard % 2 ? 1 : -1;
          guard++;
        }
        occupied[x + "," + y] = true;
        return { x: x, y: y };
      }
      function addChain(parentId, dir) {
        if (made >= target) return;
        const parent = nodes[parentId];
        const parentWord = parentId === "entrance" ? secrets[dir] : parent.word;
        const mids = [parentWord[1], parentWord[2], parentWord[3]];
        const start = mids[Math.floor(rand() * mids.length)];
        const word = pickThemedWord(start, used, themeBag, rand);
        if (!word) return;
        used[word] = true;
        const id = "w" + made++;
        const pos = place(parent, dir);
        nodes[id] = { id: id, word: word, parentId: parentId, dir: dir, children: [], kind: "word", via: start, x: pos.x, y: pos.y };
        parent.children.push({ dir: dir, id: id });
        if (rand() < 0.7) addChain(id, turns[dir][Math.floor(rand() * 3)]);
      }
      ["top","right","bottom","left"].forEach(function(side) { addChain("entrance", side); });
      let safety = 0;
      while (made < target && safety < 40) {
        safety++;
        const ids = Object.keys(nodes).filter(function(id) { return id !== "entrance"; });
        if (!ids.length) break;
        const id = ids[Math.floor(rand() * ids.length)];
        addChain(id, turns[nodes[id].dir][Math.floor(rand() * 3)]);
      }
      let boss = null, best = -1;
      Object.keys(nodes).forEach(function(id) {
        if (id === "entrance") return;
        let depth = 0, cur = nodes[id];
        while (cur && cur.parentId) { depth++; cur = nodes[cur.parentId]; }
        if (depth > best) { best = depth; boss = id; }
      });
      Object.keys(nodes).forEach(function(id) {
        if (id === "entrance" || nodes[id].children.length) return;
        nodes[id].kind = id === boss ? "boss" : "item";
      });
      cave = { nodes: nodes, words: made + 4 };
    }
    function ensureCave() {
      if (!cave || !cave.nodes || !cave.nodes.entrance) buildCave();
      Object.keys(cave.nodes).forEach(function(id) {
        const node = cave.nodes[id];
        if (id === "entrance" || (node.children && node.children.length)) return;
        if (node.kind !== "boss") node.kind = "item";
        const st = roomState[id];
        if (st && st.solved && !st.awarded) {
          st.awarded = true;
          const pool = ["green", "yellow", "map"];
          showItemReward(pool[Math.floor(Math.random() * pool.length)]);
        }
      });
      saveState();
    }
    function showItemReward(pick) {
      const names = { green: "Green hint", yellow: "Yellow hint", map: "Map" };
      addItem(pick);
      const text = document.getElementById("rewardText");
      if (text) text.textContent = pick === "map" ? "You got a map." : "You got a new " + (names[pick] || "item") + "!";
      const modal = document.getElementById("rewardModal");
      if (modal) modal.classList.add("show");
    }
    function progressCounts() {
      let letters = 0;
      tileColors.forEach(function(color, i) { if (color === "correct" && tileLetters[i]) letters++; });
      let words = ["top","right","bottom","left"].filter(function(side) { return solved[side]; }).length;
      Object.keys(roomState || {}).forEach(function(id) {
        const st = roomState[id];
        if (!st) return;
        if (st.solved) { words++; letters += 5; return; }
        const seen = {};
        (st.history || []).forEach(function(entry) {
          for (let i = 0; i < 5; i++) {
            if (entry.colors[i] === "correct" && !seen[i]) { seen[i] = true; letters++; }
          }
        });
      });
      return { letters: letters, words: words };
    }
    let outTimer = null;
    function nextGuessUnlock() {
      const next = new Date();
      next.setHours(24, 0, 0, 0);
      return next.getTime();
    }
    function formatWait(ms) {
      const total = Math.max(0, Math.ceil(ms / 1000));
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      if (h) return h + "h " + m + "m " + s + "s";
      if (m) return m + "m " + s + "s";
      return s + "s";
    }
    function showOutOfGuesses() {
      const counts = progressCounts();
      const body = document.getElementById("outBody");
      const detail = counts.words
        ? "Nice! You got " + counts.letters + " letters, and " + counts.words + " words, correctly."
        : "Nice! You got " + counts.letters + " letters correctly.";
      function paint() {
        if (!body) return;
        body.innerHTML = "All out of guesses. More will unlock in " + formatWait(nextGuessUnlock() - Date.now()) + ".<span class='out-gap'>" + detail + "</span>";
      }
      paint();
      clearInterval(outTimer);
      outTimer = setInterval(paint, 1000);
      const modal = document.getElementById("outModal");
      if (modal) modal.classList.add("show");
    }
    function showRoom() {
      const path = document.getElementById("pathScreen");
      const square = document.getElementById("squareWrap");
      const onPath = currentRoom !== "entrance";
      if (path) path.classList.toggle("show", onPath);
      if (square) square.style.display = onPath ? "none" : "block";
      const back = document.getElementById("pathBack");
      if (back) back.classList.toggle("show", onPath);
      if (onPath) renderPath();
    }
    function renderPath() {
      const node = cave && cave.nodes[currentRoom];
      if (!node) return;
      const st = roomState[currentRoom] || { history: [], solved: false };
      const wordEl = document.getElementById("pathWord");
      const histEl = document.getElementById("pathHistory");
      const last = st.history && st.history.length ? st.history[st.history.length - 1] : null;
      const locked = ["", "", "", "", ""];
      (st.history || []).forEach(function(entry) {
        for (let n = 0; n < 5; n++) if (entry.colors[n] === "correct") locked[n] = entry.word[n];
      });
      locked[0] = node.via;
      wordEl.innerHTML = "";
      for (let i = 0; i < 5; i++) {
        const tile = document.createElement("div");
        const letter = st.solved ? node.word[i] : (locked[i] || (last ? last.word[i] : "") || (i === 0 ? node.via : ""));
        const color = st.solved || locked[i] || i === 0 ? "correct" : (last ? last.colors[i] : "");
        tile.className = "path-tile " + color;
        tile.textContent = letter || "";
        wordEl.appendChild(tile);
      }
      if (st.solved) {
        (node.children || []).forEach(function(ch) {
          const child = cave.nodes[ch.id];
          const idx = branchIndex(node.word, child.via);
          const tile = wordEl.children[idx];
          if (!tile) return;
          const btn = triangleButton(ch.dir, function() { travelTo(ch.id, ch.dir); });
          const x = tile.offsetLeft;
          const y = tile.offsetTop;
          if (ch.dir === "right") { btn.style.left = (x + tile.offsetWidth + 8) + "px"; btn.style.top = (y + tile.offsetHeight / 2 - 16) + "px"; }
          if (ch.dir === "left") { btn.style.left = (x - 34) + "px"; btn.style.top = (y + tile.offsetHeight / 2 - 16) + "px"; }
          if (ch.dir === "top") { btn.style.left = (x + tile.offsetWidth / 2 - 16) + "px"; btn.style.top = (y - 34) + "px"; }
          if (ch.dir === "bottom") { btn.style.left = (x + tile.offsetWidth / 2 - 16) + "px"; btn.style.top = (y + tile.offsetHeight + 8) + "px"; }
          wordEl.appendChild(btn);
        });
      }
      histEl.innerHTML = "";
      const arrowBelow = st.solved && (node.children || []).some(function(ch) { return ch.dir === "bottom"; });
      histEl.classList.toggle("dim", !!arrowBelow);
      histEl.style.opacity = arrowBelow ? "0.2" : "";
      const older = (st.history || []).slice(0, -1).slice().reverse();
      older.forEach(function(entry, i) {
        const row = document.createElement("div");
        row.className = "history-word";
        const size = Math.max(18, 40 - i * 4);
        row.style.setProperty("--h-size", size + "px");
        row.style.opacity = arrowBelow ? "0.2" : "0.75";
        for (let j = 0; j < 5; j++) {
          const t = document.createElement("div");
          t.className = "history-tile " + (entry.colors[j] || "absent");
          t.textContent = entry.word[j] || "";
          row.appendChild(t);
        }
        histEl.appendChild(row);
      });
      guessesLeftEl.textContent = Math.max(0, guessesLeft - bonusHold);
      const back = document.getElementById("pathBack");
      if (back) back.classList.toggle("show", currentRoom !== "entrance");
    }
    function travelTo(id, dir) {
      const stage = document.getElementById("stage");
      stage.className = "stage slide-out-" + dir;
      setTimeout(function() {
        currentRoom = id;
        if (id !== "entrance" && !roomState[id]) {
          roomState[id] = { history: [], solved: false, awarded: false };
        }
        currentGuess = "";
        const back = document.getElementById("pathBack");
        if (back) back.classList.toggle("show", id !== "entrance");
        showRoom();
        updateUI();
        stage.className = "stage";
        saveState();
      }, 460);
    }
    function submitPathGuess() {
      const node = cave.nodes[currentRoom];
      const st = roomState[currentRoom] || (roomState[currentRoom] = { history: [], solved: false, awarded: false });
      if (st.solved) { showMessage("This path is already cleared"); return; }
      if (guessesLeft <= 0) { showOutOfGuesses(); return; }
      if (currentGuess.length !== 5) { showMessage("Too few letters"); return; }
      const guess = currentGuess.toUpperCase();
      if (guess[0] !== node.via) { showMessage("Must start with " + node.via); return; }
      if (!VALID_SET.has(guess)) { showMessage("Not a recognized word"); return; }
      const colors = evaluateGuess(guess, node.word);
      colors[0] = "correct";
      st.history.push({ word: guess, colors: colors });
      guessesLeft--;
      currentGuess = "";
      if (guess === node.word) {
        st.solved = true;
        awardGuessBonus();
        burstConfetti();
        const children = node.children || [];
        if (!children.length && node.kind !== "boss" && !st.awarded) {
          st.awarded = true;
          node.kind = "item";
          const pool = ["green", "yellow", "map"];
          showItemReward(pool[Math.floor(Math.random() * pool.length)]);
        } else if (node.kind === "boss" && !st.awarded) {
          st.awarded = true;
          loadUnlocks();
          unlocks.light = true;
          saveUnlocks();
          applyTheme();
          showMessage("Light theme unlocked in Themes", 2400);
        } else if (children.length) {
          showMessage("Path cleared");
        }
      }
      if (guessesLeft <= 0) showOutOfGuesses();
      saveState();
      updateUI();
    }
    function openMap() {
      if (!itemCount("map")) { showMessage("You have not found a map"); return; }
      const board = document.getElementById("mapBoard");
      board.innerHTML = "";
      const grid = {};
      const squareAt = {
        0: [0, 0], 1: [1, 0], 2: [2, 0], 3: [3, 0], 4: [4, 0],
        5: [4, 1], 6: [4, 2], 7: [4, 3], 8: [4, 4],
        9: [0, 4], 10: [1, 4], 11: [2, 4], 12: [3, 4],
        14: [0, 1], 15: [0, 2], 16: [0, 3]
      };
      const step = { right: [1, 0], left: [-1, 0], bottom: [0, 1], top: [0, -1] };
      function put(x, y, letter, color, room) {
        const key = x + "," + y;
        const prev = grid[key];
        const rank = { correct: 3, present: 2, "": 1 };
        const unlocked = room === "entrance" || !!(room && roomState[room]);
        if (!prev || (rank[color] || 0) >= (rank[prev.color] || 0)) grid[key] = { x: x, y: y, letter: letter || "", color: color || "", room: unlocked ? room : (prev && prev.room) || "" };
        else if (!prev.letter && letter) prev.letter = letter;
        if (grid[key] && unlocked) grid[key].room = room;
      }
      boardPositions().forEach(function(pos) {
        const at = squareAt[pos];
        const color = tileColors[pos] === "correct" || tileColors[pos] === "present" ? tileColors[pos] : "";
        put(at[0], at[1], color ? tileLetters[pos] : "", color, "entrance");
      });
      function knownPath(node) {
        const st = roomState[node.id];
        const letters = ["", "", "", "", ""];
        const colors = ["", "", "", "", ""];
        if (st && st.solved) return { letters: node.word.split(""), colors: ["correct", "correct", "correct", "correct", "correct"] };
        (st && st.history || []).forEach(function(entry) {
          for (let i = 0; i < 5; i++) {
            if (entry.colors[i] === "correct") { letters[i] = entry.word[i]; colors[i] = "correct"; }
            else if (entry.colors[i] === "present" && colors[i] !== "correct") { letters[i] = entry.word[i]; colors[i] = "present"; }
          }
        });
        return { letters: letters, colors: colors };
      }
      function walk(parentId, child) {
        const parent = cave.nodes[parentId];
        let ax, ay;
        if (parentId === "entrance") {
          const idx = branchIndex(secrets[child.dir], child.via);
          const at = squareAt[SIDE_POS[child.dir][idx]];
          ax = at[0]; ay = at[1];
        } else {
          const idx = branchIndex(parent.word, child.via);
          const move = step[parent.dir];
          ax = parent.ax + move[0] * idx;
          ay = parent.ay + move[1] * idx;
        }
        child.ax = ax; child.ay = ay;
        const known = knownPath(child);
        const move = step[child.dir];
        for (let i = 0; i < 5; i++) put(ax + move[0] * i, ay + move[1] * i, known.letters[i], known.colors[i], child.id);
        (child.children || []).forEach(function(link) { walk(child.id, cave.nodes[link.id]); });
      }
      (cave.nodes.entrance.children || []).forEach(function(link) { walk("entrance", cave.nodes[link.id]); });
      const cells = Object.keys(grid).map(function(key) { return grid[key]; });
      let minX = 0, minY = 0, maxX = 4, maxY = 4;
      cells.forEach(function(cell) {
        minX = Math.min(minX, cell.x); minY = Math.min(minY, cell.y);
        maxX = Math.max(maxX, cell.x); maxY = Math.max(maxY, cell.y);
      });
      const size = 18;
      const wrap = document.createElement("div");
      wrap.className = "map-grid";
      wrap.style.width = ((maxX - minX + 1) * size) + "px";
      wrap.style.height = ((maxY - minY + 1) * size) + "px";
      wrap.style.left = "12px";
      wrap.style.top = "12px";
      cells.forEach(function(cell) {
        const el = document.createElement("div");
        el.className = "map-cell" + (cell.color ? " " + cell.color : "");
        el.style.left = ((cell.x - minX) * size) + "px";
        el.style.top = ((cell.y - minY) * size) + "px";
        el.textContent = cell.letter || "";
        if (cell.room) {
          el.classList.add("open");
          el.addEventListener("click", function() {
            document.getElementById("mapModal").classList.remove("show");
            if (cell.room === currentRoom) return;
            const node = cave.nodes[cell.room];
            travelTo(cell.room, (node && node.dir) || "right");
          });
        }
        wrap.appendChild(el);
      });
      board.appendChild(wrap);
      document.getElementById("mapModal").classList.add("show");
    }
    document.getElementById("closeOut").addEventListener("click", function() {
      document.getElementById("outModal").classList.remove("show");
    });
    document.getElementById("closeReward").addEventListener("click", function() {
      document.getElementById("rewardModal").classList.remove("show");
    });
    document.getElementById("pathBack").addEventListener("click", function() {
      if (currentRoom === "entrance" || !cave) return;
      const node = cave.nodes[currentRoom];
      travelTo(node.parentId, OPPOSITE[node.dir] || "left");
    });
    document.getElementById("themesBtn").addEventListener("click", function() {
      closeMenu();
      applyTheme();
      document.getElementById("themesModal").classList.add("show");
    });
    document.getElementById("closeThemes").addEventListener("click", function() {
      document.getElementById("themesModal").classList.remove("show");
    });
    document.getElementById("closeMap").addEventListener("click", function() {
      document.getElementById("mapModal").classList.remove("show");
    });
    document.getElementById("themeDark").addEventListener("click", function() {
      loadUnlocks(); unlocks.theme = "dark"; saveUnlocks(); applyTheme();
    });
    document.getElementById("themeLight").addEventListener("click", function() {
      loadUnlocks();
      if (!unlocks.light) return;
      unlocks.theme = "light";
      saveUnlocks();
      applyTheme();
    });
    loadWordList().then(function() {
      initPuzzle();
      ensureCave();
      applyTheme();
      showRoom();
      if (!localStorage.getItem("spellunk_seen")) {
        helpModal.classList.add("show");
        localStorage.setItem("spellunk_seen", "1");
      }
    }).catch(function() {
      document.getElementById("message").style.opacity = "1";
      document.getElementById("message").textContent = "Could not load word list. Refresh to try again.";
    });
