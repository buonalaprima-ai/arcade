// Shared arcade shell for every Buonalaprima Arcade game — the single source of
// truth for: the HUD (back pill, score column, independent music/SFX toggles),
// the start / game-over cards, the leaderboard panel, the WebAudio SFX + music
// engine, and the common lifecycle wiring. Games keep only their canvas,
// game logic, palette and song data.
//
// Usage (inside a game's inline script, loaded after this file):
//   Arcade.init({
//     gameId: 'sizzle', emoji: '🍢', emojiAnim: 'spin',
//     title: 'Sizzle', subtitle: 'Tap the instant …', hint: 'tap … 🔥',
//     onPlay: () => { /* reset game state, state = 'playing' */ },
//     isPlaying: () => state === 'playing'
//   });
//   Arcade.setSong({ secPerStep, steps, volume, onStep(step, time, io){ … } });
(function(){
  "use strict";
  const A = {};
  let cfg = null, els = null;

  // ---------- audio: independent music / SFX mute, persisted collection-wide ----------
  let actx = null;
  // one-time migration from the per-game mute keys that predate the shared shell
  (function migrateLegacyPrefs(){
    const legacyMuted = localStorage.getItem('pancakeTowerMuted') === '1' || localStorage.getItem('sizzleMuted') === '1';
    if (legacyMuted){
      if (localStorage.getItem('arcadeMusicMuted') == null) localStorage.setItem('arcadeMusicMuted', '1');
      if (localStorage.getItem('arcadeSfxMuted') == null) localStorage.setItem('arcadeSfxMuted', '1');
    }
  })();
  let musicMuted = localStorage.getItem('arcadeMusicMuted') === '1';
  let sfxMuted   = localStorage.getItem('arcadeSfxMuted') === '1';

  function ensureAudio(){
    if (actx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { actx = new AC(); } catch (e){ actx = null; }   // e.g. too many contexts from stale tabs
  }
  // must be called from a user gesture; also recovers a context suspended (or
  // WebKit-'interrupted' after a call/Siri) by iOS
  function resumeAudio(){
    ensureAudio();
    if (actx && actx.state !== 'running') actx.resume();
  }
  function tone(f, dur, type, vol, delay){
    if (sfxMuted || !actx) return;
    const t = actx.currentTime + (delay || 0);
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = f;
    o.connect(g); g.connect(actx.destination);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.03);
  }
  function buzz(ms){
    if (navigator.vibrate) navigator.vibrate(ms);
  }

  // ---------- music engine (look-ahead scheduler, burst-safe) ----------
  let song = null, musicGain = null, noiseBuffer = null;
  let musicOn = false, musicTimer = null, stepIndex = 0, nextStepTime = 0;

  function musicVolume(){
    if (musicMuted || !song) {
      return 0;
    }
    return song.volume || 0.42;
  }
  function mNote(freq, time, dur, type, peak){
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, time);
    o.connect(g); g.connect(musicGain);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(peak, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.start(time); o.stop(time + dur + 0.03);
  }
  function mHat(time){
    const src = actx.createBufferSource(); src.buffer = noiseBuffer;
    const hp = actx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
    const g = actx.createGain();
    src.connect(hp); hp.connect(g); g.connect(musicGain);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(0.05, time + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    src.start(time); src.stop(time + 0.06);
  }
  const IO = { note: mNote, hat: mHat };

  function musicScheduler(){
    if (!musicOn || !actx || !song) {
      return;
    }
    // resync after a suspend/resume so we never "catch up" a huge burst of past notes
    if (nextStepTime < actx.currentTime) nextStepTime = actx.currentTime + 0.05;
    let guard = 0;
    while (nextStepTime < actx.currentTime + 0.12 && guard++ < 16){
      song.onStep(stepIndex, nextStepTime, IO);
      nextStepTime += song.secPerStep;
      stepIndex = (stepIndex + 1) % song.steps;
    }
  }
  function startMusic(){
    ensureAudio();
    if (!actx || musicOn || !song) {
      return;
    }
    if (actx.state !== 'running') actx.resume();
    if (!musicGain){ musicGain = actx.createGain(); musicGain.connect(actx.destination); }
    if (!noiseBuffer){
      noiseBuffer = actx.createBuffer(1, Math.floor(actx.sampleRate * 0.2), actx.sampleRate);
      const ch = noiseBuffer.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    }
    musicGain.gain.cancelScheduledValues(actx.currentTime);
    musicGain.gain.setValueAtTime(0.0001, actx.currentTime);
    musicGain.gain.linearRampToValueAtTime(musicVolume(), actx.currentTime + 0.3);
    musicOn = true; stepIndex = 0; nextStepTime = actx.currentTime + 0.08;
    musicTimer = setInterval(musicScheduler, 25);
  }
  function stopMusic(){
    musicOn = false;
    if (musicTimer){ clearInterval(musicTimer); musicTimer = null; }
    if (musicGain && actx){
      musicGain.gain.cancelScheduledValues(actx.currentTime);
      musicGain.gain.setValueAtTime(musicGain.gain.value, actx.currentTime);
      musicGain.gain.linearRampToValueAtTime(0.0001, actx.currentTime + 0.15);
    }
  }
  function applyMusicGain(){
    if (musicGain && actx) musicGain.gain.setTargetAtTime(musicVolume(), actx.currentTime, 0.03);
  }

  // ---------- leaderboard panel ----------
  let lbPrefetch = null, lbPendingScore = 0;

  function cleanName(s){ return String(s).replace(/[^A-Za-z0-9 _-]/g, '').slice(0, 12); }
  function renderBoard(list, meRank){
    if (!list || !list.length){ els.lbList.innerHTML = ''; return; }
    els.lbList.innerHTML = list.map((e, i) => {
      const cls = (i + 1) === meRank ? ' class="me"' : '';
      const sc = Math.max(0, Math.floor(Number(e.score) || 0));
      return '<li' + cls + '><span class="lb-rank">' + (i + 1) + '</span>' +
             '<span class="lb-name">' + cleanName(e.name) + '</span>' +
             '<span class="lb-score">' + sc + '</span></li>';
    }).join('');
  }
  async function showLeaderboard(finalScore){
    if (!window.Leaderboard || !window.Leaderboard.isConfigured()){
      els.lbBox.classList.add('hidden');
      return;
    }
    lbPendingScore = finalScore;
    els.lbBox.classList.remove('hidden');
    els.lbEntry.classList.add('hidden');
    els.lbList.innerHTML = '';
    els.lbStatus.textContent = 'loading leaderboard…';
    const board = await (lbPrefetch || window.Leaderboard.top(cfg.gameId, 10));
    lbPrefetch = null;
    if (!board){ els.lbStatus.textContent = 'leaderboard unavailable'; return; }
    renderBoard(board, -1);
    els.lbStatus.textContent = '';
    const qualifies = finalScore > 0 && (board.length < 10 || finalScore > board[board.length - 1].score);
    if (qualifies){
      els.lbEntry.classList.remove('hidden');
      els.lbName.value = localStorage.getItem('arcadeName') ||
        localStorage.getItem('pancakeName') || localStorage.getItem('sizzleName') || '';   // legacy per-game keys
      try { els.lbName.focus(); } catch (e){ /* focus is best-effort */ }
    }
  }
  async function saveScore(){
    if (els.lbSave.disabled) return;   // a submit is already in flight (Enter can bypass the disabled button)
    const name = window.Leaderboard.sanitizeName(els.lbName.value);
    localStorage.setItem('arcadeName', name);
    els.lbSave.disabled = true;
    els.lbStatus.textContent = 'sending…';
    const res = await window.Leaderboard.submit(cfg.gameId, name, lbPendingScore);
    els.lbSave.disabled = false;
    if (!res){ els.lbStatus.textContent = 'send failed, try again'; return; }
    els.lbEntry.classList.add('hidden');
    renderBoard(res.top || [], res.rank || -1);
    els.lbStatus.textContent = (res.rank && res.rank > 0) ? ('you are #' + res.rank + ' 🎉') : 'saved!';
  }

  // ---------- injected markup ----------
  function markup(c){
    const anim = c.emojiAnim === 'spin' ? 'anim-spin' : 'anim-bob';
    return '' +
    '<div id="hud"><div class="topbar">' +
      '<a class="pill" href="../" aria-label="All games">‹</a>' +
      '<div id="scoreWrap" class="hidden"><div id="score">0</div><div id="best">best 0</div><div id="strikes"></div></div>' +
      '<div class="pillcol">' +
        '<button class="pill" id="musicBtn" aria-label="Music on/off">🎵</button>' +
        '<button class="pill" id="sfxBtn" aria-label="Sound effects on/off">🔊</button>' +
      '</div>' +
    '</div></div>' +
    '<div id="hint" class="hidden">' + c.hint + '</div>' +
    '<div class="overlay" id="startOverlay"><div class="card">' +
      '<div class="emoji"><span class="' + anim + '">' + c.emoji + '</span></div>' +
      '<div class="title">' + c.title + '</div>' +
      '<p class="subtitle">' + c.subtitle + '</p>' +
      '<button class="btn" id="playBtn">Play</button>' +
      '<a class="menu-link" href="../">← all games</a>' +
    '</div></div>' +
    '<div class="overlay hidden" id="overOverlay"><div class="card">' +
      '<div class="emoji" id="overEmoji">' + c.emoji + '</div>' +
      '<div class="title" id="overTitle"></div>' +
      '<div class="bigscore"><span id="finalScore">0</span></div>' +
      '<div class="newbest" id="newBest"></div>' +
      '<div class="lb hidden" id="lbBox">' +
        '<div class="lb-entry hidden" id="lbEntry">' +
          '<span class="lb-entry-label">You made the board!</span>' +
          '<div class="lb-entry-row">' +
            '<input class="lb-input" id="lbName" maxlength="12" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="your name" aria-label="Your name">' +
            '<button class="lb-ok" id="lbSave">OK</button>' +
          '</div>' +
        '</div>' +
        '<ol class="lb-list" id="lbList"></ol>' +
        '<div class="lb-status" id="lbStatus"></div>' +
      '</div>' +
      '<button class="btn" id="retryBtn">Play again</button>' +
      '<a class="menu-link" href="../">← all games</a>' +
    '</div></div>';
  }

  function setMutedClass(el, muted){
    if (muted) el.classList.add('muted');
    else el.classList.remove('muted');
    if (el.setAttribute) el.setAttribute('aria-pressed', String(!muted));
  }
  function refreshAudioButtons(){
    setMutedClass(els.musicBtn, musicMuted);
    setMutedClass(els.sfxBtn, sfxMuted);
  }

  // ---------- public API ----------
  A.init = function(c){
    cfg = c;
    const app = document.getElementById('app');
    if (app && app.insertAdjacentHTML) app.insertAdjacentHTML('beforeend', markup(c));
    const $ = (id) => document.getElementById(id);
    els = {
      score: $('score'), best: $('best'), strikes: $('strikes'), scoreWrap: $('scoreWrap'),
      hint: $('hint'), startOverlay: $('startOverlay'), overOverlay: $('overOverlay'),
      overEmoji: $('overEmoji'), overTitle: $('overTitle'), finalScore: $('finalScore'),
      newBest: $('newBest'), playBtn: $('playBtn'), retryBtn: $('retryBtn'),
      musicBtn: $('musicBtn'), sfxBtn: $('sfxBtn'),
      lbBox: $('lbBox'), lbEntry: $('lbEntry'), lbName: $('lbName'),
      lbSave: $('lbSave'), lbList: $('lbList'), lbStatus: $('lbStatus')
    };
    A.els = els;
    refreshAudioButtons();

    els.musicBtn.addEventListener('click', () => {
      musicMuted = !musicMuted;
      localStorage.setItem('arcadeMusicMuted', musicMuted ? '1' : '0');
      if (!musicMuted) resumeAudio();
      applyMusicGain();
      refreshAudioButtons();
    });
    els.sfxBtn.addEventListener('click', () => {
      sfxMuted = !sfxMuted;
      localStorage.setItem('arcadeSfxMuted', sfxMuted ? '1' : '0');
      if (!sfxMuted) resumeAudio();
      refreshAudioButtons();
    });
    els.playBtn.addEventListener('click', A.play);
    els.retryBtn.addEventListener('click', A.play);
    els.lbSave.addEventListener('click', saveScore);
    els.lbName.addEventListener('input', () => { els.lbName.value = cleanName(els.lbName.value); });
    els.lbName.addEventListener('keydown', (e) => {
      // e.key is the reliable one on mobile virtual keyboards (e.code can be empty)
      if (e.key === 'Enter' || e.code === 'Enter'){ e.preventDefault(); saveScore(); }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible'){
        resumeAudio();
        if (cfg.isPlaying && cfg.isPlaying()) startMusic();
      } else {
        stopMusic();
      }
    });
    return A;
  };

  A.play = function(){
    resumeAudio();
    els.startOverlay.classList.add('hidden');
    els.overOverlay.classList.add('hidden');
    els.lbBox.classList.add('hidden');
    els.scoreWrap.classList.remove('hidden');
    els.hint.classList.remove('hidden');
    startMusic();
    if (cfg.onPlay) cfg.onPlay();
  };

  // o: { score, isBest, title, emoji } — fills the card, reveals it after a
  // short beat and runs the shared leaderboard flow (with prefetch).
  A.gameOver = function(o){
    stopMusic();
    els.finalScore.textContent = o.score;
    els.newBest.textContent = (o.isBest && o.score > 0) ? '🎉 new record!' : '';
    els.overTitle.textContent = o.title;
    els.overEmoji.textContent = o.emoji;
    lbPrefetch = (window.Leaderboard && window.Leaderboard.isConfigured())
      ? window.Leaderboard.top(cfg.gameId, 10)
      : null;
    setTimeout(() => {
      els.overOverlay.classList.remove('hidden');
      els.scoreWrap.classList.add('hidden');
      showLeaderboard(o.score);
    }, 650);
  };

  A.hideHint = function(){ els.hint.classList.add('hidden'); };
  A.setScore = function(n){ els.score.textContent = n; };
  A.setBest = function(n){ els.best.textContent = 'best ' + n; };
  A.setStrikes = function(s){ els.strikes.textContent = s; };
  A.overlayVisible = function(){
    return !els.startOverlay.classList.contains('hidden') || !els.overOverlay.classList.contains('hidden');
  };
  A.isTyping = function(e){
    const t = e.target;
    return !!(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable));
  };
  A.setSong = function(s){ song = s; };
  A.audio = { resume: resumeAudio, tone: tone, buzz: buzz, startMusic: startMusic, stopMusic: stopMusic };

  window.Arcade = A;
  if (typeof globalThis !== 'undefined') globalThis.Arcade = A;   // window is a plain stub under the jsc test env
})();
