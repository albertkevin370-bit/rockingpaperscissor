/* ===== RPS Arena: shared script for all 4 pages =====
   - background music + sound effects (generated in code, no audio file needed)
   - smooth page changes so the music keeps playing between pages
   - game logic (same rules as your Python files)            */

(() => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------- tiny storage helper (keeps score between pages) ---------- */
  const store = {
    get(key, fallback) {
      try {
        const v = sessionStorage.getItem(key);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { sessionStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
    },
  };

  /* ---------- audio ---------- */
  let ctx, master;
  let soundOn = store.get("sound", true);
  let playing = false;
  let timer, nextTime = 0, step = 0;

  const STEP_LEN = 60 / 112 / 2;                       // 112 BPM, eighth notes
  const CHORDS = [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]]; // Am F C G
  const PATTERN = [0, 1, 2, 3, 2, 1, 2, 3];
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function ensureAudio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return true;
  }

  function tone(t, midi, dur, type, vol, dest) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = hz(midi);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function schedule() {
    while (nextTime < ctx.currentTime + 0.3) {
      const chord = CHORDS[Math.floor(step / 8) % 4];
      const i = step % 8;
      const notes = [chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[0] + 24];
      tone(nextTime, notes[PATTERN[i]], 0.22, "triangle", 0.16, master);
      if (i === 0 || i === 4) tone(nextTime, chord[0] - 12, 0.45, "sawtooth", 0.1, master);
      step++;
      nextTime += STEP_LEN;
    }
  }

  function startMusic() {
    if (playing || !ensureAudio()) return;
    playing = true;
    nextTime = ctx.currentTime + 0.05;
    master.gain.setTargetAtTime(0.5, ctx.currentTime, 0.3);
    timer = setInterval(schedule, 100);
  }

  function stopMusic() {
    if (!playing) return;
    playing = false;
    clearInterval(timer);
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
  }

  function sfx(name) {
    if (!soundOn || !ensureAudio()) return;
    const t = ctx.currentTime;
    const out = ctx.destination;
    const seq = (notes, type, gap, dur, vol) =>
      notes.forEach((n, i) => tone(t + i * gap, n, dur, type, vol, out));
    if (name === "click") seq([76], "square", 0, 0.08, 0.1);
    if (name === "tick")  seq([60], "square", 0, 0.07, 0.1);
    if (name === "start") seq([67, 72, 76], "square", 0.1, 0.15, 0.1);
    if (name === "win")   seq([72, 76, 79, 84], "square", 0.12, 0.2, 0.1);
    if (name === "lose")  seq([64, 60, 55, 48], "sawtooth", 0.14, 0.22, 0.1);
    if (name === "tie")   seq([67, 67], "triangle", 0.16, 0.2, 0.14);
  }

  /* ---------- sound button (top right) ---------- */
  const soundBtn = document.getElementById("soundBtn");
  function paintSoundBtn() {
    soundBtn.setAttribute("aria-pressed", String(soundOn));
    soundBtn.textContent = soundOn ? "♪ Sound on" : "♪ Sound off";
  }
  paintSoundBtn();

  soundBtn.addEventListener("click", () => {
    ensureAudio();
    soundOn = !soundOn;
    store.set("sound", soundOn);
    paintSoundBtn();
    if (soundOn) startMusic(); else stopMusic();
  });

  // Browsers only allow sound after a tap, so music starts on the first tap anywhere.
  function firstTap(e) {
    if (e.target.closest && e.target.closest("#soundBtn")) return;
    window.removeEventListener("pointerdown", firstTap, true);
    window.removeEventListener("keydown", firstTap, true);
    if (soundOn) { ensureAudio(); startMusic(); }
  }
  window.addEventListener("pointerdown", firstTap, true);
  window.addEventListener("keydown", firstTap, true);

  /* ---------- smooth page changes (keeps the music playing) ---------- */
  async function go(url, push = true) {
    const app = document.getElementById("app");
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("bad response");
      const doc = new DOMParser().parseFromString(await res.text(), "text/html");
      const nextApp = doc.getElementById("app");
      if (!nextApp) throw new Error("no app");
      app.classList.add("leave");
      await wait(220);
      app.replaceWith(nextApp);
      document.title = doc.title;
      if (push) history.pushState({}, "", url);
      window.scrollTo(0, 0);
      boot();
    } catch (e) {
      window.location.href = url;   // fallback: normal page load
    }
  }
  window.addEventListener("popstate", () => go(window.location.href, false));

  /* ---------- page 1: welcome ---------- */
  function initHome(app) {
    const msg = app.querySelector("#msg");
    app.querySelector("#yesBtn").addEventListener("click", async () => {
      store.set("results", []);
      msg.textContent = "Great! Let's get started.";
      sfx("start");
      await wait(900);
      go("page2.html");
    });
    app.querySelector("#noBtn").addEventListener("click", () => {
      msg.textContent = "No worries! Maybe next time.";
      sfx("click");
    });
  }

  /* ---------- pages 2-4: one round each ---------- */
  const ICON = { rock: "✊", paper: "✋", scissors: "✌️" };
  const BEATS = { rock: "scissors", paper: "rock", scissors: "paper" };
  const TOTAL_ROUNDS = 3;

  function initRound(app) {
    const round = Number(app.dataset.round);
    const results = store.get("results", []);

    // progress dots
    app.querySelectorAll(".pips li").forEach((li, i) => {
      if (i < round - 1 && results[i]) li.classList.add(results[i]);
      if (i === round - 1) li.classList.add("on");
    });

    const choices = app.querySelectorAll(".choice");
    const arena = app.querySelector(".arena");
    const youCard = app.querySelector("#youCard");
    const cpuCard = app.querySelector("#cpuCard");
    const youName = app.querySelector("#youName");
    const cpuName = app.querySelector("#cpuName");
    const result = app.querySelector("#result");
    const summary = app.querySelector(".summary");
    const nextBtn = app.querySelector("#nextBtn");

    choices.forEach((btn) => {
      btn.addEventListener("click", async () => {
        const user = btn.dataset.choice;
        const options = Object.keys(ICON);
        const computer = options[Math.floor(Math.random() * options.length)];

        choices.forEach((b) => (b.disabled = true));
        btn.classList.add("picked");
        sfx("click");

        // "rock... paper... scissors..." shake before the reveal
        arena.hidden = false;
        youCard.textContent = cpuCard.textContent = "✊";
        youName.textContent = cpuName.textContent = "";
        youCard.classList.add("shake");
        cpuCard.classList.add("shake");
        for (let i = 0; i < 3; i++) { sfx("tick"); await wait(350); }
        youCard.classList.remove("shake");
        cpuCard.classList.remove("shake");

        youCard.textContent = ICON[user];
        cpuCard.textContent = ICON[computer];
        youCard.classList.add("pop");
        cpuCard.classList.add("pop");
        youName.textContent = user;
        cpuName.textContent = computer;

        let outcome, text;
        if (user === computer) { outcome = "tie"; text = "It's a tie!"; }
        else if (BEATS[user] === computer) { outcome = "win"; text = "You win!"; }
        else { outcome = "lose"; text = "You lose!"; }

        result.textContent = text;
        result.className = "result " + outcome;
        sfx(outcome);

        results[round - 1] = outcome;
        store.set("results", results);

        if (round < TOTAL_ROUNDS) {
          nextBtn.textContent = "Next round";
          nextBtn.onclick = () => { sfx("click"); go("page" + (round + 2) + ".html"); };
        } else {
          const wins = results.filter((r) => r === "win").length;
          const losses = results.filter((r) => r === "lose").length;
          const ties = results.filter((r) => r === "tie").length;
          const verdict = wins > losses ? "You won the match!"
                        : wins < losses ? "The computer won the match."
                        : "The match is a draw.";
          summary.innerHTML =
            '<p class="verdict">' + verdict + "</p>" +
            "<p>Wins: " + wins + " · Losses: " + losses + " · Ties: " + ties + "</p>";
          summary.hidden = false;
          nextBtn.textContent = "Play again";
          nextBtn.onclick = () => { store.set("results", []); sfx("click"); go("index.html"); };
        }
        await wait(500);
        nextBtn.hidden = false;
      });
    });
  }

  /* ---------- start whichever page we are on ---------- */
  function boot() {
    const app = document.getElementById("app");
    if (app.dataset.page === "home") initHome(app);
    if (app.dataset.page === "round") initRound(app);
  }
  boot();
})();
