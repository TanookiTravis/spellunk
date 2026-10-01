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
    const STORAGE_KEY = "spellunk_daily_v1";
    const STATS_KEY = "spellunk_stats_v1";

    let secrets = {};
    let todayTheme = "";
    let currentSide = "top";
    const START_GUESSES = 12;
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
        gameOver, won, statsRecorded
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
    }
    function initPuzzle() {
      today = localDateKey();
      const saved = loadState();
      if (saved) restore(saved);
      else { startFresh(); saveState(); }
      updateUI();
      hideMessage();
      if (gameOver) showEnd(won);
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
      for (let i = 0; i < 17; i++) {
        const el = boardEl.querySelector('[data-pos="' + i + '"]');
        if (!el) continue;
        el.textContent = tileLetters[i];
        el.className = "tile " + (tileColors[i] || "empty");
        if (tileLetters[i]) el.classList.add("filled");
      }
      document.querySelectorAll(".tile[data-pos]").forEach(t => t.classList.remove("selected-side"));
      SIDE_POS[currentSide].forEach(pos => {
        const el = boardEl.querySelector('[data-pos="' + pos + '"]');
        if (el) el.classList.add("selected-side");
      });
      guessRow.querySelectorAll(".guess-tile").forEach((t,i) => { t.textContent = currentGuess[i] || ""; });
      guessesLeftEl.textContent = guessesLeft;
      ["top","right","bottom","left"].forEach(function(side) {
        const el = document.getElementById("count-" + side);
        const n = sideGuessCounts[side] || 0;
        el.textContent = n;
        el.classList.toggle("hidden", n === 0);
      });
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
          const col = sideKeyColors[currentSide][k.toUpperCase()];
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
        guessesLeft += SIDE_BONUS;
        positions.forEach((pos, i) => { tileLetters[pos] = secret[i]; tileColors[pos] = "correct"; });
        showMessage("Side solved!");
      }
      const allSolved = Object.values(solved).every(Boolean);
      if (allSolved) { gameOver = true; won = true; }
      else if (guessesLeft <= 0) { gameOver = true; won = false; }
      saveState(); updateUI();
      if (solvedSide) { popBonus(); burstConfetti(); }
      if (gameOver) {
        setTimeout(function(){ showEnd(won); }, solvedSide ? 1100 : 600);
        return;
      }
    }
    function guessesUsed() {
      return ["top","right","bottom","left"].reduce(function(sum, side) {
        return sum + (sideGuessCounts[side] || 0);
      }, 0);
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
          document.getElementById("statsModal").classList.contains("show")) return;
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
    document.getElementById("helpBtn").addEventListener("click", function(){ helpModal.classList.add("show"); });
    document.getElementById("closeHelp").addEventListener("click", function(){ helpModal.classList.remove("show"); });
    document.getElementById("closeEndBtn").addEventListener("click", function(){ endModal.classList.remove("show"); });
    document.getElementById("statsBtn").addEventListener("click", showStats);
    document.getElementById("closeStats").addEventListener("click", function(){
      document.getElementById("statsModal").classList.remove("show");
    });
    document.getElementById("cameraBtn").addEventListener("click", toggleLetters);
    try { lettersHidden = localStorage.getItem("spellunk_hide_letters") === "1"; } catch (e) {}
    applyLettersHidden();
    window.addEventListener("resize", function(){ renderSideHistory(); });
    loadWordList().then(function() {
      initPuzzle();
      if (!localStorage.getItem("spellunk_seen")) {
        helpModal.classList.add("show");
        localStorage.setItem("spellunk_seen", "1");
      }
    }).catch(function() {
      document.getElementById("message").style.opacity = "1";
      document.getElementById("message").textContent = "Could not load word list. Refresh to try again.";
    });
