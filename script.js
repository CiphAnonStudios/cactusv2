/* ==========================================================================
   PIXEL CACTUS CLASH - ENHANCED ARCADE VERSION
   - Procedural Pixel Icons Only (No Emojis)
   - Punchy Hammer Smash with Deflection & Hit-Stop Feedback
   - Game Over Direct Return to Main Menu
   - Interactive In-Arena Trading & Workshop Stands (after 25-50 cacti drops)
   - Studio Logo Support in Bottom Corner
   ========================================================================== */

(function () {
  'use strict';

  // --- AUDIO SYNTHESIZER ---
  const AudioEngine = {
    ctx: null,
    muted: false,
    init() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) this.ctx = new AudioCtx();
      }
    },
    tone(freq, type, dur, endFreq = null, vol = 0.16) {
      if (this.muted) return;
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      if (endFreq) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(10, endFreq), this.ctx.currentTime + dur);
      }
      gain.gain.setValueAtTime(vol, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + dur);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + dur);
    },
    warning() { this.tone(360, 'square', 0.08, 180, 0.14); },
    fall() { this.tone(540, 'sawtooth', 0.55, 80, 0.12); },
    plop(scale = 1) {
      this.tone(130 * (1 / scale), 'triangle', 0.28, 25, 0.45);
      setTimeout(() => this.tone(65, 'square', 0.35, 15, 0.4), 40);
    },
    spikeShot() { this.tone(700, 'square', 0.06, 220, 0.12); },
    hammerSwing() { this.tone(200, 'sine', 0.12, 50, 0.2); },
    hammerHit() {
      this.tone(140, 'square', 0.1, 30, 0.38);
      this.tone(70, 'triangle', 0.16, 20, 0.42);
    },
    deflect() {
      this.tone(850, 'square', 0.08, 1200, 0.25);
    },
    dash() { this.tone(420, 'triangle', 0.15, 950, 0.2); },
    pickup() {
      this.tone(523, 'square', 0.06, null, 0.12);
      setTimeout(() => this.tone(784, 'square', 0.1, null, 0.15), 50);
    },
    hurt() { this.tone(110, 'sawtooth', 0.26, 25, 0.4); },
    coin() {
      this.tone(659, 'triangle', 0.08, null, 0.18);
      setTimeout(() => this.tone(987, 'triangle', 0.14, null, 0.22), 70);
    },
    interact() { this.tone(440, 'triangle', 0.1, null, 0.2); },
    destroy() {
      this.tone(140, 'sawtooth', 0.35, 20, 0.4);
      this.tone(75, 'square', 0.3, 15, 0.35);
    }
  };

  // --- SAVE SYSTEM ---
  const SAVE_KEY = 'PIXEL_CACTUS_CLASH_SAVE_v4';
  let SaveData = {
    money: 0,
    cactusParts: 0,
    wave: 1,
    upgrades: {
      hammerSpeed: 0,
      hammerStrength: 0,
      harvestYield: 0,
      moveSpeed: 0,
      dashLength: 0,
      dashCooldown: 0,
      partValue: 0,
      shockwaveDash: 0,
      tempShield: 0,
      magnetPickup: 0
    }
  };

  function loadSave() {
    try {
      const data = localStorage.getItem(SAVE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        SaveData.money = parsed.money || 0;
        SaveData.cactusParts = parsed.cactusParts || 0;
        SaveData.wave = parsed.wave || 1;
        SaveData.upgrades = Object.assign(SaveData.upgrades, parsed.upgrades || {});
      }
    } catch (e) {
      console.warn(e);
    }
  }

  function saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(SaveData));
    } catch (e) {
      console.warn(e);
    }
  }

  loadSave();

  // Upgrades Configuration
  const UPGRADES_DB = {
    hammerSpeed: { name: 'Hammer Speed', desc: 'Faster swing recovery', max: 5, base: 25, mult: 1.8 },
    hammerStrength: { name: 'Hammer Power', desc: 'Heavier blunt crush damage', max: 5, base: 30, mult: 1.9 },
    harvestYield: { name: 'Harvest Yield', desc: 'More parts crushed per cactus', max: 5, base: 35, mult: 2.0 },
    moveSpeed: { name: 'Block Agility', desc: 'Faster arena movement', max: 5, base: 25, mult: 1.7 },
    dashLength: { name: 'Dash Distance', desc: 'Dash further across arena', max: 4, base: 40, mult: 2.0 },
    dashCooldown: { name: 'Dash Recharge', desc: 'Dash recharges much faster', max: 5, base: 45, mult: 1.85 },
    partValue: { name: 'Market Rates', desc: 'Earn +$4 per sold cactus part', max: 5, base: 50, mult: 2.1 },
    shockwaveDash: { name: 'Shockwave Dash', desc: 'Dash shockwave deletes spikes', max: 1, base: 180, mult: 1 },
    tempShield: { name: 'Shield Aura', desc: 'Absorbs 1 hit per wave', max: 1, base: 140, mult: 1 },
    magnetPickup: { name: 'Part Magnet', desc: 'Attracts distant cactus parts', max: 4, base: 60, mult: 1.9 }
  };

  function getUpgradeCost(key) {
    const item = UPGRADES_DB[key];
    const lvl = SaveData.upgrades[key] || 0;
    if (lvl >= item.max) return null;
    return Math.floor(item.base * Math.pow(item.mult, lvl));
  }

  // --- FULLSCREEN CANVAS SETUP ---
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  let screenW = window.innerWidth;
  let screenH = window.innerHeight;

  function resizeCanvas() {
    screenW = window.innerWidth;
    screenH = window.innerHeight;
    canvas.width = screenW;
    canvas.height = screenH;
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Screen Shake & Hit-Stop
  let shakeTime = 0;
  let shakeMag = 0;
  let hitStopTime = 0;

  function triggerShake(magnitude, duration) {
    shakeMag = magnitude;
    shakeTime = duration;
  }

  function triggerHitStop(seconds) {
    hitStopTime = seconds;
  }

  // --- GAME STATES ---
  const STATES = {
    MENU: 'MENU',
    PLAYING: 'PLAYING',
    GAMEOVER: 'GAMEOVER'
  };
  let gameState = STATES.MENU;

  // --- INPUTS ---
  const keys = {};

  window.addEventListener('keydown', (e) => {
    AudioEngine.init();
    const key = e.key.toLowerCase();
    keys[key] = true;
    keys[e.code] = true;

    if (gameState === STATES.GAMEOVER) {
      // Return to main menu on any key press
      gameState = STATES.MENU;
      return;
    }

    if (e.code === 'i') {
      e.preventDefault();
      if (gameState === STATES.PLAYING) Player.attack();
    }

    if (key === 'Space') {
      if (gameState === STATES.PLAYING) Player.dash();
    }

    if (e.key === 'Escape') closeAllModals();

    if (gameState === STATES.PLAYING) {
      if (key === 'e') checkStandsInteraction();
    }
  });

  window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    keys[key] = false;
    keys[e.code] = false;
  });

  canvas.addEventListener('mousedown', (e) => {
    AudioEngine.init();
    if (gameState === STATES.MENU) {
      const bw = 240, bh = 56;
      const bx = screenW / 2 - bw / 2;
      const by = screenH / 2 + 20;
      if (e.clientX >= bx && e.clientX <= bx + bw && e.clientY >= by && e.clientY <= by + bh) {
        startNewGame();
      }
    } else if (gameState === STATES.PLAYING) {
      if (!checkStandsInteraction(e.clientX, e.clientY)) {
        Player.attack();
      }
    } else if (gameState === STATES.GAMEOVER) {
      // Return to Main Menu on click
      gameState = STATES.MENU;
    }
  });

  // Mobile virtual joystick & buttons
  const joystickBase = document.getElementById('joystick-base');
  const joystickStick = document.getElementById('joystick-stick');
  const btnDash = document.getElementById('btn-dash');
  const btnAttack = document.getElementById('btn-attack');

  let touchX = 0, touchY = 0;
  let activeTouchId = null;

  joystickBase.addEventListener('touchstart', (e) => {
    AudioEngine.init();
    e.preventDefault();
    const t = e.changedTouches[0];
    activeTouchId = t.identifier;
    handleJoystickMove(t);
  }, { passive: false });

  window.addEventListener('touchmove', (e) => {
    if (activeTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === activeTouchId) {
        handleJoystickMove(e.changedTouches[i]);
        break;
      }
    }
  }, { passive: false });

  const resetJoystick = (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === activeTouchId) {
        activeTouchId = null;
        touchX = 0;
        touchY = 0;
        joystickStick.style.transform = 'translate(-50%, -50%)';
        break;
      }
    }
  };
  window.addEventListener('touchend', resetJoystick);
  window.addEventListener('touchcancel', resetJoystick);

  function handleJoystickMove(touch) {
    const rect = joystickBase.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = touch.clientX - cx;
    const dy = touch.clientY - cy;
    const dist = Math.hypot(dx, dy);
    const maxR = rect.width / 2;
    const ang = Math.atan2(dy, dx);
    const clampedDist = Math.min(dist, maxR);

    touchX = Math.cos(ang) * (clampedDist / maxR);
    touchY = Math.sin(ang) * (clampedDist / maxR);

    const sx = Math.cos(ang) * clampedDist;
    const sy = Math.sin(ang) * clampedDist;
    joystickStick.style.transform = `translate(calc(-50% + ${sx}px), calc(-50% + ${sy}px))`;
  }

  btnDash.addEventListener('touchstart', (e) => {
    e.preventDefault();
    AudioEngine.init();
    if (gameState === STATES.PLAYING) Player.dash();
  });

  btnAttack.addEventListener('touchstart', (e) => {
    e.preventDefault();
    AudioEngine.init();
    if (gameState === STATES.PLAYING) {
      if (!checkStandsInteraction()) Player.attack();
    }
  });

  // --- PARTICLES & COMBAT FEEDBACK ---
  let particles = [];
  function addDust(x, y, count = 8, color = '#e8c288', sizeMax = 5) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = Math.random() * 3 + 1;
      particles.push({
        x: x + (Math.random() - 0.5) * 16,
        y: y + (Math.random() - 0.5) * 10,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd * 0.6,
        size: Math.floor(Math.random() * sizeMax) + 3,
        color: color,
        life: 1,
        decay: Math.random() * 0.04 + 0.03
      });
    }
  }

  function addCactusChunks(x, y, count = 15) {
    const pal = ['#2ed573', '#1e824c', '#55efc4', '#ffa502'];
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = Math.random() * 5 + 2;
      particles.push({
        x, y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 2,
        size: Math.floor(Math.random() * 6) + 4,
        color: pal[Math.floor(Math.random() * pal.length)],
        life: 1,
        decay: 0.032
      });
    }
  }

  let shockwaves = [];
  function addShockwave(x, y, radius = 55, color = '#ffd32a') {
    shockwaves.push({ x, y, r: 10, maxR: radius, color, life: 1 });
  }

  let floatingTexts = [];
  function addFloatText(x, y, text, color = '#ffd32a', size = 16) {
    floatingTexts.push({ x, y, text, color, size, life: 1, vy: -1.2 });
  }

  let droppedParts = [];
  function dropParts(x, y, count) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = Math.random() * 55 + 15;
      droppedParts.push({
        x, y,
        targetX: Math.max(30, Math.min(screenW - 30, x + Math.cos(ang) * dist)),
        targetY: Math.max(30, Math.min(screenH - 30, y + Math.sin(ang) * dist)),
        progress: 0,
        bob: Math.random() * Math.PI * 2
      });
    }
  }

  let spikes = [];
  function fireSpike(x, y, vx, vy, speed) {
    spikes.push({
      x, y,
      vx: vx * speed,
      vy: vy * speed,
      size: 10,
      trail: []
    });
  }

  // --- PROCEDURAL PIXEL ICONS (NO EMOJIS) ---
  const PixelIcons = {
    // 8x8 Heart (Full or Empty)
    drawHeart(ctx, x, y, isFull = true) {
      ctx.save();
      ctx.translate(x, y);
      const fill = isFull ? '#ff4757' : '#332b45';
      const border = isFull ? '#b31b28' : '#1d1729';

      ctx.fillStyle = border;
      ctx.fillRect(1, 0, 2, 1); ctx.fillRect(4, 0, 2, 1);
      ctx.fillRect(0, 1, 4, 1); ctx.fillRect(3, 1, 4, 1);
      ctx.fillRect(0, 2, 7, 2);
      ctx.fillRect(1, 4, 5, 1);
      ctx.fillRect(2, 5, 3, 1);
      ctx.fillRect(3, 6, 1, 1);

      ctx.fillStyle = fill;
      ctx.fillRect(1, 1, 2, 1); ctx.fillRect(4, 1, 2, 1);
      ctx.fillRect(1, 2, 5, 2);
      ctx.fillRect(2, 4, 3, 1);
      ctx.fillRect(3, 5, 1, 1);

      if (isFull) {
        ctx.fillStyle = '#ff8a94';
        ctx.fillRect(1, 1, 1, 1);
      }
      ctx.restore();
    },

    // 8x8 Shiny Gold Coin
    drawCoin(ctx, x, y) {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = '#b37402';
      ctx.fillRect(2, 0, 4, 8);
      ctx.fillRect(0, 2, 8, 4);

      ctx.fillStyle = '#ffd32a';
      ctx.fillRect(2, 1, 4, 6);
      ctx.fillRect(1, 2, 6, 4);

      ctx.fillStyle = '#fff48f';
      ctx.fillRect(2, 2, 2, 2);

      ctx.fillStyle = '#b37402';
      ctx.fillRect(4, 3, 1, 2);
      ctx.restore();
    },

    // 8x8 Cactus Harvest Part Token
    drawCactusToken(ctx, x, y) {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = '#1e824c';
      ctx.fillRect(2, 0, 4, 8);
      ctx.fillRect(0, 2, 8, 4);

      ctx.fillStyle = '#2ed573';
      ctx.fillRect(2, 1, 4, 6);
      ctx.fillRect(1, 2, 6, 4);

      ctx.fillStyle = '#ffa502';
      ctx.fillRect(3, 3, 2, 2);
      ctx.restore();
    }
  };

  // --- BLOCK PLAYER WITH EYES & HEAVY PIXEL HAMMER ---
  const Player = {
    x: screenW / 2,
    y: screenH / 2,
    baseSpeed: 4.0,
    facing: 'down',
    eyeLookX: 0,
    eyeLookY: 2,
    blinkTimer: 2.5,
    isBlinking: false,
    squashX: 1,
    squashY: 1,

    health: 4,
    maxHealth: 4,
    shield: 0,
    invincibleTimer: 0,

    // Dash
    dashing: false,
    dashTimer: 0,
    dashCooldownTimer: 0,
    dashVx: 0,
    dashVy: 0,
    dashTrail: [],

    // Heavy Hammer Attack
    isAttacking: false,
    attackTimer: 0,
    attackCooldown: 0,

    reset() {
      this.x = screenW / 2;
      this.y = screenH / 2;
      this.health = this.maxHealth;
      this.shield = SaveData.upgrades.tempShield ? 1 : 0;
      this.dashing = false;
      this.dashTimer = 0;
      this.dashCooldownTimer = 0;
      this.isAttacking = false;
      this.invincibleTimer = 0;
      this.dashTrail.length = 0;
    },

    getSpeed() {
      return this.baseSpeed + (SaveData.upgrades.moveSpeed * 0.45);
    },

    getHammerDelay() {
      return Math.max(0.18, 0.44 - (SaveData.upgrades.hammerSpeed * 0.05));
    },

    getHammerDamage() {
      return 26 + (SaveData.upgrades.hammerStrength * 14);
    },

    getDashDuration() {
      return 0.17 + (SaveData.upgrades.dashLength * 0.035);
    },

    getDashCooldown() {
      return Math.max(0.55, 1.4 - (SaveData.upgrades.dashCooldown * 0.16));
    },

    dash() {
      if (this.dashCooldownTimer > 0 || this.dashing) return;
      AudioEngine.dash();
      this.dashing = true;
      this.dashTimer = this.getDashDuration();
      this.dashCooldownTimer = this.getDashCooldown();

      let dx = 0, dy = 0;
      if (keys['w'] || keys['arrowup']) dy -= 1;
      if (keys['s'] || keys['arrowdown']) dy += 1;
      if (keys['a'] || keys['arrowleft']) dx -= 1;
      if (keys['d'] || keys['arrowright']) dx += 1;

      if (touchX !== 0 || touchY !== 0) {
        dx = touchX;
        dy = touchY;
      }

      if (dx === 0 && dy === 0) {
        if (this.facing === 'up') dy = -1;
        else if (this.facing === 'down') dy = 1;
        else if (this.facing === 'left') dx = -1;
        else if (this.facing === 'right') dx = 1;
      }

      const len = Math.hypot(dx, dy) || 1;
      const spd = 12.5;
      this.dashVx = (dx / len) * spd;
      this.dashVy = (dy / len) * spd;

      addDust(this.x, this.y + 12, 10, '#ffffff');

      if (SaveData.upgrades.shockwaveDash) {
        spikes = spikes.filter(spk => {
          const d = Math.hypot(spk.x - this.x, spk.y - this.y);
          if (d < 110) {
            addDust(spk.x, spk.y, 6, '#ffd32a');
            return false;
          }
          return true;
        });
      }
    },

    attack() {
      if (this.attackCooldown > 0 || this.dashing) return;
      AudioEngine.hammerSwing();
      this.isAttacking = true;
      this.attackTimer = 0.20;
      this.attackCooldown = this.getHammerDelay();

      // Punchy Ground Shockwave on Swing
      const smashX = this.x + (this.facing === 'left' ? -22 : this.facing === 'right' ? 22 : 0);
      const smashY = this.y + (this.facing === 'up' ? -22 : this.facing === 'down' ? 22 : 0);
      addShockwave(smashX, smashY, 48, '#ffffff');

      // Spike Deflection: Smash wipes or deflects close spikes!
      let deflected = false;
      spikes = spikes.filter(spk => {
        const d = Math.hypot(spk.x - smashX, spk.y - smashY);
        if (d < 58) {
          addDust(spk.x, spk.y, 6, '#ffd32a');
          deflected = true;
          return false;
        }
        return true;
      });
      if (deflected) AudioEngine.deflect();

      // Check hit on grounded cacti
      let hitAny = false;
      activeCacti.forEach(cactus => {
        if (cactus.state === 'GROUNDED') {
          const hitRange = (cactus.width / 2) + 52;
          const dist = Math.hypot(smashX - cactus.x, smashY - cactus.y);
          if (dist <= hitRange) {
            cactus.hit(this.getHammerDamage());
            hitAny = true;
          }
        }
      });

      if (hitAny) {
        triggerHitStop(0.04); // Satisfying micro freeze-frame
      }
    },

    takeDamage(amount = 1) {
      if (this.invincibleTimer > 0 || this.dashing) return;

      if (this.shield > 0) {
        this.shield--;
        AudioEngine.tone(600, 'square', 0.2, 1200, 0.2);
        addFloatText(this.x, this.y - 30, 'SHIELD SAVED!', '#00e1ff', 16);
        this.invincibleTimer = 0.8;
        return;
      }

      this.health -= amount;
      this.invincibleTimer = 1.0;
      AudioEngine.hurt();
      triggerShake(9, 0.35);
      addDust(this.x, this.y, 12, '#ff4757');
      addFloatText(this.x, this.y - 30, '-1 HP', '#ff2222', 20);

      if (this.health <= 0) {
        gameState = STATES.GAMEOVER;
        saveGame();
      }
    },

    update(dt) {
      if (this.dashCooldownTimer > 0) this.dashCooldownTimer -= dt;
      if (this.attackCooldown > 0) this.attackCooldown -= dt;
      if (this.attackTimer > 0) {
        this.attackTimer -= dt;
        if (this.attackTimer <= 0) this.isAttacking = false;
      }
      if (this.invincibleTimer > 0) this.invincibleTimer -= dt;

      // Eye blink
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) {
        this.isBlinking = true;
        if (this.blinkTimer < -0.15) {
          this.isBlinking = false;
          this.blinkTimer = Math.random() * 3 + 2;
        }
      }

      if (this.dashing) {
        this.dashTimer -= dt;
        this.x += this.dashVx;
        this.y += this.dashVy;
        this.squashX = 1.25;
        this.squashY = 0.8;

        if (Math.random() < 0.6) {
          this.dashTrail.push({ x: this.x, y: this.y, life: 0.22, facing: this.facing });
        }
        if (this.dashTimer <= 0) this.dashing = false;
      } else {
        let mx = 0, my = 0;
        if (keys['w'] || keys['arrowup']) my -= 1;
        if (keys['s'] || keys['arrowdown']) my += 1;
        if (keys['a'] || keys['arrowleft']) mx -= 1;
        if (keys['d'] || keys['arrowright']) mx += 1;

        if (touchX !== 0 || touchY !== 0) {
          mx = touchX;
          my = touchY;
        }

        if (mx !== 0 || my !== 0) {
          const mag = Math.hypot(mx, my) || 1;
          const spd = this.getSpeed();
          this.x += (mx / mag) * spd;
          this.y += (my / mag) * spd;

          this.eyeLookX = (mx / mag) * 4;
          this.eyeLookY = (my / mag) * 4;
          this.squashX = 1 + Math.sin(Date.now() * 0.02) * 0.08;
          this.squashY = 1 - Math.sin(Date.now() * 0.02) * 0.08;

          if (Math.abs(mx) > Math.abs(my)) {
            this.facing = mx > 0 ? 'right' : 'left';
          } else {
            this.facing = my > 0 ? 'down' : 'up';
          }

          if (Math.random() < 0.15) addDust(this.x, this.y + 14, 1);
        } else {
          this.eyeLookX *= 0.8;
          this.eyeLookY = 2;
          this.squashX = 1;
          this.squashY = 1;
        }
      }

      const pad = 24;
      this.x = Math.max(pad, Math.min(screenW - pad, this.x));
      this.y = Math.max(pad + 40, Math.min(screenH - pad, this.y));

      for (let i = this.dashTrail.length - 1; i >= 0; i--) {
        this.dashTrail[i].life -= dt;
        if (this.dashTrail[i].life <= 0) this.dashTrail.splice(i, 1);
      }
    },

    draw(ctx) {
      this.dashTrail.forEach(t => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, t.life / 0.22) * 0.45;
        drawBlockPlayer(ctx, t.x, t.y, t.facing, 0, 0, false, 1, 1, '#00d2d3');
        ctx.restore();
      });

      if (this.invincibleTimer > 0 && Math.floor(Date.now() / 60) % 2 === 0) return;

      // Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.ellipse(this.x, this.y + 16, 16 * this.squashX, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      if (this.shield > 0) {
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 24 + Math.sin(Date.now() * 0.008) * 2, 0, Math.PI * 2);
        ctx.stroke();
      }

      drawBlockPlayer(
        ctx,
        this.x,
        this.y,
        this.facing,
        this.eyeLookX,
        this.eyeLookY,
        this.isBlinking,
        this.squashX,
        this.squashY,
        null,
        this.isAttacking,
        this.attackTimer
      );
    }
  };

  function drawBlockPlayer(ctx, x, y, facing, eyeX, eyeY, blinking, sqX, sqY, tintColor = null, attacking = false, attackTimer = 0) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale(sqX, sqY);

    const bSize = 30;
    const bodyColor = tintColor || '#ffa801';
    const shadeColor = tintColor || '#d35400';
    const highlight = tintColor || '#ffd32a';

    // Block Body
    ctx.fillStyle = bodyColor;
    ctx.fillRect(-bSize / 2, -bSize / 2, bSize, bSize);

    // Beveled edges
    ctx.fillStyle = highlight;
    ctx.fillRect(-bSize / 2, -bSize / 2, bSize, 4);
    ctx.fillStyle = shadeColor;
    ctx.fillRect(-bSize / 2, bSize / 2 - 4, bSize, 4);
    ctx.fillRect(bSize / 2 - 4, -bSize / 2, 4, bSize);

    // Expressive Eyes
    if (!blinking) {
      const eW = 6, eH = 8;
      const eyeSpacing = 10;
      const eyeBaseY = -3;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-eyeSpacing / 2 - eW + eyeX, eyeBaseY + eyeY, eW, eH);
      ctx.fillRect(eyeSpacing / 2 + eyeX, eyeBaseY + eyeY, eW, eH);

      ctx.fillStyle = '#0f0f1c';
      ctx.fillRect(-eyeSpacing / 2 - eW + eyeX + 1 + (eyeX > 0 ? 1 : 0), eyeBaseY + eyeY + 2 + (eyeY > 0 ? 2 : 0), 3, 4);
      ctx.fillRect(eyeSpacing / 2 + eyeX + 1 + (eyeX > 0 ? 1 : 0), eyeBaseY + eyeY + 2 + (eyeY > 0 ? 2 : 0), 3, 4);
    } else {
      ctx.fillStyle = '#0f0f1c';
      ctx.fillRect(-9, 1, 7, 2);
      ctx.fillRect(3, 1, 7, 2);
    }

    // HEAVY PIXEL HAMMER
    const wood = '#8b5a2b';
    const iron = '#718093';
    const ironLight = '#dcdde1';
    const side = (facing === 'left' ? -1 : 1);

    if (attacking) {
      ctx.save();
      const swingProg = (0.20 - attackTimer) / 0.20;
      const angle = Math.sin(swingProg * Math.PI) * 2.2;
      ctx.translate(side * 14, -4);
      ctx.rotate(side * angle);

      ctx.fillStyle = wood;
      ctx.fillRect(-2, -26, 4, 30);

      ctx.fillStyle = iron;
      ctx.fillRect(-12, -34, 24, 12);
      ctx.fillStyle = ironLight;
      ctx.fillRect(-12, -34, 4, 12);
      ctx.fillRect(-12, -34, 24, 3);
      ctx.restore();
    } else {
      ctx.fillStyle = wood;
      ctx.fillRect(side * 12, -10, 3, 22);
      ctx.fillStyle = iron;
      ctx.fillRect(side * 12 - 5, -16, 14, 8);
    }

    ctx.restore();
  }

  // --- MULTI-CACTUS SYSTEM ---
  const CACTUS_TYPES = {
    SMALL: { name: 'Small', hpMult: 0.6, scale: 0.7, spikes: 6, speed: 4.8, drops: 2 },
    MEDIUM: { name: 'Medium', hpMult: 1.0, scale: 1.0, spikes: 10, speed: 3.8, drops: 4 },
    GIANT: { name: 'Giant', hpMult: 2.2, scale: 1.5, spikes: 16, speed: 3.2, drops: 8 }
  };

  class CactusInstance {
    constructor(x, y, typeKey) {
      this.x = x;
      this.y = y;
      this.type = CACTUS_TYPES[typeKey] || CACTUS_TYPES.MEDIUM;
      this.scale = this.type.scale;
      this.width = 46 * this.scale;
      this.height = 68 * this.scale;

      const baseWaveHp = 42 + (SaveData.wave * 14);
      this.maxHp = Math.round(baseWaveHp * this.type.hpMult);
      this.hp = this.maxHp;

      this.state = 'WARNING';
      this.warnTimer = 1.9;
      this.yHeight = 400;
      this.fallSpeed = 0;
      this.plopTimer = 0;
      this.shakeTimer = 0;
      this.soundWarned = false;
    }

    hit(dmg) {
      if (this.state !== 'GROUNDED') return;
      this.hp -= dmg;
      this.shakeTimer = 0.16;
      AudioEngine.hammerHit();
      addCactusChunks(this.x, this.y, 8);
      addFloatText(this.x + (Math.random() - 0.5) * 30, this.y - 30, `-${dmg}`, '#fffa40', 17);
      triggerShake(4, 0.14);

      if (this.hp <= 0) {
        this.destroy();
      }
    }

    destroy() {
      this.state = 'DESTROYED';
      AudioEngine.destroy();
      triggerShake(8 * this.scale, 0.35);
      addCactusChunks(this.x, this.y, 25 * this.scale);
      addDust(this.x, this.y, 16, '#2ed573');

      const bonusYield = SaveData.upgrades.harvestYield * 2;
      const totalDrops = this.type.drops + bonusYield;
      dropParts(this.x, this.y, totalDrops);
      addFloatText(this.x, this.y - 40, `+${totalDrops} PARTS!`, '#2ed573', 18);
    }

    fireSpikes() {
      AudioEngine.spikeShot();
      triggerShake(6 * this.scale, 0.2);
      const count = this.type.spikes + Math.min(8, Math.floor(SaveData.wave * 0.5));
      const step = (Math.PI * 2) / count;
      const offset = Math.random() * Math.PI;

      for (let i = 0; i < count; i++) {
        const ang = offset + i * step;
        fireSpike(this.x, this.y + 6, Math.cos(ang), Math.sin(ang), this.type.speed);
      }
    }

    update(dt) {
      if (this.shakeTimer > 0) this.shakeTimer -= dt;

      if (this.state === 'WARNING') {
        this.warnTimer -= dt;
        if (!this.soundWarned && this.warnTimer < 0.9) {
          AudioEngine.warning();
          this.soundWarned = true;
        }
        if (this.warnTimer <= 0) {
          this.state = 'FALLING';
          this.fallSpeed = 6;
          AudioEngine.fall();
        }
      } else if (this.state === 'FALLING') {
        this.fallSpeed += 30 * dt;
        this.yHeight -= this.fallSpeed;

        if (this.yHeight <= 0) {
          this.yHeight = 0;
          this.state = 'IMPACT';
          this.plopTimer = 0.7;
          AudioEngine.plop(this.scale);
          triggerShake(10 * this.scale, 0.4);
          addDust(this.x, this.y + 16 * this.scale, 20 * this.scale, '#d8aa6d', 6);
          addCactusChunks(this.x, this.y, 10);
          this.fireSpikes();
        }
      } else if (this.state === 'IMPACT') {
        this.plopTimer -= dt;
        if (this.plopTimer <= 0) {
          this.state = 'GROUNDED';
        }
      }
    }

    draw(ctx) {
      if (this.state === 'DESTROYED') return;

      const shadowRatio = Math.max(0.2, 1 - (this.yHeight / 400) * 0.7);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.beginPath();
      ctx.ellipse(this.x, this.y + 16 * this.scale, 26 * this.scale * shadowRatio, 12 * this.scale * shadowRatio, 0, 0, Math.PI * 2);
      ctx.fill();

      // Warning Reticle
      if (this.state === 'WARNING') {
        const pulse = Math.sin(Date.now() * 0.016);
        ctx.strokeStyle = (Math.floor(Date.now() / 100) % 2 === 0) ? '#ff4757' : '#ffd32a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 36 * this.scale + pulse * 4, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#ff4757';
        ctx.font = 'bold 13px Courier New';
        ctx.textAlign = 'center';
        ctx.fillText('DROP ZONE', this.x, this.y - 44 * this.scale);
      }

      ctx.save();
      let dx = this.x;
      let dy = this.y - this.yHeight;
      if (this.shakeTimer > 0) {
        dx += (Math.random() - 0.5) * 6;
        dy += (Math.random() - 0.5) * 6;
      }
      ctx.translate(Math.round(dx), Math.round(dy));
      ctx.scale(this.scale, this.scale);
      renderPixelCactusGraphic(ctx);
      ctx.restore();

      if (this.state === 'IMPACT' && this.plopTimer > 0.2) {
        ctx.save();
        ctx.translate(this.x, this.y - 50 * this.scale);
        ctx.fillStyle = '#ffd32a';
        ctx.strokeStyle = '#d63031';
        ctx.lineWidth = 4;
        ctx.font = '900 28px Courier New';
        ctx.textAlign = 'center';
        ctx.strokeText('PLOP!', 0, 0);
        ctx.fillText('PLOP!', 0, 0);
        ctx.restore();
      }

      if (this.state === 'GROUNDED') {
        const barW = 54 * this.scale;
        const barH = 7;
        const bx = this.x - barW / 2;
        const by = this.y - 56 * this.scale;

        ctx.fillStyle = '#0a0a14';
        ctx.fillRect(bx - 2, by - 2, barW + 4, barH + 4);

        const hpPct = Math.max(0, this.hp / this.maxHp);
        ctx.fillStyle = hpPct > 0.35 ? '#2ed573' : '#ff4757';
        ctx.fillRect(bx, by, Math.round(barW * hpPct), barH);
      }
    }
  }

  function renderPixelCactusGraphic(ctx) {
    const mainG = '#2ed573';
    const darkG = '#1e824c';
    const lightG = '#7bed9f';
    const spike = '#ffffff';

    ctx.fillStyle = mainG;
    ctx.fillRect(-14, -36, 28, 52);
    ctx.fillStyle = darkG;
    ctx.fillRect(-14, -36, 6, 52);
    ctx.fillStyle = lightG;
    ctx.fillRect(4, -34, 4, 50);

    ctx.fillStyle = mainG;
    ctx.fillRect(-28, -20, 16, 10);
    ctx.fillRect(-28, -32, 10, 16);
    ctx.fillStyle = darkG;
    ctx.fillRect(-28, -32, 3, 16);

    ctx.fillStyle = mainG;
    ctx.fillRect(12, -14, 16, 10);
    ctx.fillRect(18, -28, 10, 18);
    ctx.fillStyle = lightG;
    ctx.fillRect(24, -28, 3, 18);

    ctx.fillStyle = spike;
    ctx.fillRect(-16, -26, 3, 2);
    ctx.fillRect(-16, -10, 3, 2);
    ctx.fillRect(14, -28, 3, 2);
    ctx.fillRect(14, -8, 3, 2);

    ctx.fillStyle = '#ff4757';
    ctx.fillRect(-6, -42, 12, 6);
  }

  // --- CONTINUOUS SPAWNER: 25 TO 50 CACTI PER WAVE ---
  let activeCacti = [];
  let totalCactiForWave = 30;
  let cactiSpawnedSoFar = 0;
  let cactiSpawnTimer = 0;
  let waveFinished = false;

  function initWave(waveNum) {
    activeCacti = [];
    spikes = [];
    droppedParts = [];
    waveFinished = false;
    cactiSpawnedSoFar = 0;

    const target = 25 + Math.min(25, (waveNum - 1) * 5 + Math.floor(Math.random() * 6));
    totalCactiForWave = Math.min(50, Math.max(25, target));
    cactiSpawnTimer = 0.5;

    Stands.active = false;
  }

  function updateWaveSpawner(dt) {
    if (cactiSpawnedSoFar < totalCactiForWave) {
      cactiSpawnTimer -= dt;
      if (cactiSpawnTimer <= 0) {
        cactiSpawnedSoFar++;
        cactiSpawnTimer = Math.max(0.7, 2.0 - (SaveData.wave * 0.05));

        const pad = 90;
        const spawnX = pad + Math.random() * (screenW - pad * 2);
        const spawnY = pad + 60 + Math.random() * (screenH - pad * 2 - 60);

        let type = 'MEDIUM';
        const roll = Math.random();
        if (roll < 0.40) type = 'SMALL';
        else if (roll > 0.82) type = 'GIANT';

        activeCacti.push(new CactusInstance(spawnX, spawnY, type));
      }
    }

    if (cactiSpawnedSoFar >= totalCactiForWave && !waveFinished) {
      const remainingAlive = activeCacti.filter(c => c.state !== 'DESTROYED').length;
      if (remainingAlive === 0) {
        waveFinished = true;
        Stands.spawn();
        AudioEngine.coin();
        addFloatText(screenW / 2, screenH / 2 - 70, 'WAVE CLEARED! SHOPS ARE OPEN!', '#2ed573', 24);
      }
    }
  }

  // --- IN-ARENA INTERACTIVE STANDS ---
  const Stands = {
    active: false,
    sellStand: { x: 0, y: 0, w: 84, h: 64 },
    shopStand: { x: 0, y: 0, w: 84, h: 64 },
    nextPortal: { x: 0, y: 0, r: 42 },

    spawn() {
      this.active = true;
      const cy = screenH / 2;
      this.sellStand.x = screenW / 2 - 170;
      this.sellStand.y = cy;

      this.shopStand.x = screenW / 2 + 170;
      this.shopStand.y = cy;

      this.nextPortal.x = screenW / 2;
      this.nextPortal.y = cy + 110;

      addDust(this.sellStand.x, this.sellStand.y, 16, '#ffa502');
      addDust(this.shopStand.x, this.shopStand.y, 16, '#2ed573');
    },

    draw(ctx) {
      if (!this.active) return;

      drawPixelStand(ctx, this.sellStand.x, this.sellStand.y, '#ffa502', '#e67e22', 'SELL', 'STAND');
      drawPixelStand(ctx, this.shopStand.x, this.shopStand.y, '#3742fa', '#2f3542', 'SHOP', 'UPGRADES');

      // Next Wave Portal
      ctx.save();
      ctx.translate(this.nextPortal.x, this.nextPortal.y);
      const pulse = Math.sin(Date.now() * 0.008) * 4;
      ctx.fillStyle = 'rgba(46, 213, 115, 0.2)';
      ctx.beginPath();
      ctx.arc(0, 0, this.nextPortal.r + pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#2ed573';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, this.nextPortal.r + pulse, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText('NEXT WAVE', 0, 4);
      ctx.font = '10px Courier New';
      ctx.fillText('[ENTER / E]', 0, 18);
      ctx.restore();

      const distSell = Math.hypot(Player.x - this.sellStand.x, Player.y - this.sellStand.y);
      const distShop = Math.hypot(Player.x - this.shopStand.x, Player.y - this.shopStand.y);
      const distPort = Math.hypot(Player.x - this.nextPortal.x, Player.y - this.nextPortal.y);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px Courier New';
      ctx.textAlign = 'center';
      if (distSell < 75) ctx.fillText('CLICK / [E] TO SELL', this.sellStand.x, this.sellStand.y - 48);
      if (distShop < 75) ctx.fillText('CLICK / [E] TO UPGRADE', this.shopStand.x, this.shopStand.y - 48);
      if (distPort < 55) ctx.fillText('START NEXT WAVE!', this.nextPortal.x, this.nextPortal.y - 50);
    }
  };

  function drawPixelStand(ctx, x, y, canopyCol, woodCol, text1, text2) {
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = woodCol;
    ctx.fillRect(-36, 0, 72, 30);
    ctx.fillStyle = '#2c1e13';
    ctx.fillRect(-36, 26, 72, 4);

    ctx.fillStyle = '#533b24';
    ctx.fillRect(-34, -28, 6, 28);
    ctx.fillRect(28, -28, 6, 28);

    ctx.fillStyle = canopyCol;
    ctx.fillRect(-40, -38, 80, 14);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-28, -38, 12, 14);
    ctx.fillRect(8, -38, 12, 14);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(text1, 0, 14);
    ctx.fillText(text2, 0, 24);

    ctx.restore();
  }

  function checkStandsInteraction(clickX = null, clickY = null) {
    if (!Stands.active) return false;

    const dSell = clickX !== null
      ? Math.hypot(clickX - Stands.sellStand.x, clickY - Stands.sellStand.y)
      : Math.hypot(Player.x - Stands.sellStand.x, Player.y - Stands.sellStand.y);

    if (dSell < 65) {
      AudioEngine.interact();
      openSellModal();
      return true;
    }

    const dShop = clickX !== null
      ? Math.hypot(clickX - Stands.shopStand.x, clickY - Stands.shopStand.y)
      : Math.hypot(Player.x - Stands.shopStand.x, Player.y - Stands.shopStand.y);

    if (dShop < 65) {
      AudioEngine.interact();
      openShopModal();
      return true;
    }

    const dPort = clickX !== null
      ? Math.hypot(clickX - Stands.nextPortal.x, clickY - Stands.nextPortal.y)
      : Math.hypot(Player.x - Stands.nextPortal.x, Player.y - Stands.nextPortal.y);

    if (dPort < 50) {
      SaveData.wave++;
      saveGame();
      AudioEngine.coin();
      initWave(SaveData.wave);
      return true;
    }

    return false;
  }

  // --- MODALS ---
  const modalContainer = document.getElementById('modal-container');
  const sellModal = document.getElementById('sell-modal');
  const shopModal = document.getElementById('shop-modal');
  const sellPartsCount = document.getElementById('sell-parts-count');
  const sellRateText = document.getElementById('sell-rate-text');
  const btnSellOne = document.getElementById('btn-sell-one');
  const btnSellAll = document.getElementById('btn-sell-all');
  const btnCloseSell = document.getElementById('btn-close-sell');
  const shopGoldDisplay = document.getElementById('shop-gold-display');
  const upgradesList = document.getElementById('upgrades-list');
  const btnCloseShop = document.getElementById('btn-close-shop');

  function openSellModal() {
    modalContainer.classList.remove('hidden');
    sellModal.classList.remove('hidden');
    shopModal.classList.add('hidden');
    updateSellModalUI();
  }

  function updateSellModalUI() {
    const rate = 10 + (SaveData.upgrades.partValue * 4);
    sellPartsCount.textContent = `Parts In Bag: ${SaveData.cactusParts}`;
    sellRateText.textContent = `Market Rate: $${rate} Gold / Part`;
  }

  btnSellOne.addEventListener('click', () => {
    if (SaveData.cactusParts > 0) {
      SaveData.cactusParts--;
      const rate = 10 + (SaveData.upgrades.partValue * 4);
      SaveData.money += rate;
      saveGame();
      AudioEngine.pickup();
      updateSellModalUI();
    }
  });

  btnSellAll.addEventListener('click', () => {
    if (SaveData.cactusParts > 0) {
      const rate = 10 + (SaveData.upgrades.partValue * 4);
      SaveData.money += SaveData.cactusParts * rate;
      SaveData.cactusParts = 0;
      saveGame();
      AudioEngine.coin();
      updateSellModalUI();
    }
  });

  btnCloseSell.addEventListener('click', closeAllModals);

  function openShopModal() {
    modalContainer.classList.remove('hidden');
    shopModal.classList.remove('hidden');
    sellModal.classList.add('hidden');
    renderUpgradesList();
  }

  function renderUpgradesList() {
    shopGoldDisplay.textContent = `GOLD: $${SaveData.money}`;
    upgradesList.innerHTML = '';

    Object.keys(UPGRADES_DB).forEach(key => {
      const item = UPGRADES_DB[key];
      const lvl = SaveData.upgrades[key] || 0;
      const cost = getUpgradeCost(key);

      const row = document.createElement('div');
      row.className = 'upgrade-row';

      const info = document.createElement('div');
      info.className = 'upg-info';
      info.innerHTML = `
        <div class="upg-title">${item.name} (Lv. ${lvl}/${item.max})</div>
        <div class="upg-desc">${item.desc}</div>
      `;
      row.appendChild(info);

      const btn = document.createElement('button');
      btn.className = 'pixel-btn btn-buy';

      if (lvl >= item.max) {
        btn.textContent = 'MAX';
        btn.className += ' btn-max';
      } else {
        btn.textContent = `$${cost} BUY`;
        if (SaveData.money < cost) {
          btn.className += ' btn-max';
        } else {
          btn.addEventListener('click', () => {
            if (SaveData.money >= cost) {
              SaveData.money -= cost;
              SaveData.upgrades[key] = (SaveData.upgrades[key] || 0) + 1;
              saveGame();
              AudioEngine.coin();
              renderUpgradesList();
            }
          });
        }
      }

      row.appendChild(btn);
      upgradesList.appendChild(row);
    });
  }

  btnCloseShop.addEventListener('click', closeAllModals);

  function closeAllModals() {
    modalContainer.classList.add('hidden');
    sellModal.classList.add('hidden');
    shopModal.classList.add('hidden');
  }

  function startNewGame() {
    closeAllModals();
    Player.reset();
    initWave(SaveData.wave);
    gameState = STATES.PLAYING;
  }

  // --- GAME LOOP ---
  let lastTime = performance.now();

  function loop(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    if (hitStopTime > 0) {
      hitStopTime -= dt;
    } else {
      update(dt);
    }

    render();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    if (shakeTime > 0) shakeTime -= dt;

    if (gameState === STATES.PLAYING) {
      Player.update(dt);
      updateWaveSpawner(dt);

      activeCacti.forEach(c => c.update(dt));

      const magnetLevel = SaveData.upgrades.magnetPickup;
      const magnetRadius = 70 + magnetLevel * 60;

      for (let i = droppedParts.length - 1; i >= 0; i--) {
        const drop = droppedParts[i];
        if (drop.progress < 1) {
          drop.progress += dt * 3.5;
          drop.x += (drop.targetX - drop.x) * 0.15;
          drop.y += (drop.targetY - drop.y) * 0.15;
        }

        if (magnetLevel > 0) {
          const mDist = Math.hypot(Player.x - drop.x, Player.y - drop.y);
          if (mDist < magnetRadius) {
            drop.x += (Player.x - drop.x) * 0.08 * magnetLevel;
            drop.y += (Player.y - drop.y) * 0.08 * magnetLevel;
          }
        }

        const pDist = Math.hypot(Player.x - drop.x, Player.y - drop.y);
        if (pDist < 26) {
          AudioEngine.pickup();
          SaveData.cactusParts++;
          saveGame();
          addFloatText(drop.x, drop.y - 10, '+1 PART', '#2ed573', 14);
          addDust(drop.x, drop.y, 6, '#2ed573');
          droppedParts.splice(i, 1);
        }
      }

      for (let i = spikes.length - 1; i >= 0; i--) {
        const spk = spikes[i];
        spk.x += spk.vx;
        spk.y += spk.vy;

        if (Math.random() < 0.35) {
          spk.trail.push({ x: spk.x, y: spk.y, life: 0.16 });
        }
        for (let t = spk.trail.length - 1; t >= 0; t--) {
          spk.trail[t].life -= dt;
          if (spk.trail[t].life <= 0) spk.trail.splice(t, 1);
        }

        const pDist = Math.hypot(Player.x - spk.x, Player.y - spk.y);
        if (pDist < 18) {
          Player.takeDamage(1);
          spikes.splice(i, 1);
          continue;
        }

        if (spk.x < -30 || spk.x > screenW + 30 || spk.y < -30 || spk.y > screenH + 30) {
          spikes.splice(i, 1);
        }
      }
    }

    // Shockwaves
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const sw = shockwaves[i];
      sw.r += (sw.maxR - sw.r) * 0.25;
      sw.life -= dt * 3.5;
      if (sw.life <= 0) shockwaves.splice(i, 1);
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
      if (p.life <= 0) particles.splice(i, 1);
    }

    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const ft = floatingTexts[i];
      ft.y += ft.vy;
      ft.life -= dt * 1.3;
      if (ft.life <= 0) floatingTexts.splice(i, 1);
    }
  }

  function render() {
    ctx.save();

    if (shakeTime > 0) {
      const ox = (Math.random() - 0.5) * shakeMag * 2;
      const oy = (Math.random() - 0.5) * shakeMag * 2;
      ctx.translate(ox, oy);
    }

    ctx.fillStyle = '#100c1e';
    ctx.fillRect(0, 0, screenW, screenH);

    if (gameState === STATES.MENU) {
      drawMenu();
    } else if (gameState === STATES.PLAYING) {
      drawArena();
      drawGame();
      drawHUD();
    } else if (gameState === STATES.GAMEOVER) {
      drawGameOver();
    }

    ctx.restore();
  }

  function drawArena() {
    const ts = 48;
    for (let x = 0; x < screenW; x += ts) {
      for (let y = 0; y < screenH; y += ts) {
        ctx.fillStyle = ((Math.floor(x / ts) + Math.floor(y / ts)) % 2 === 0) ? '#171126' : '#1e1631';
        ctx.fillRect(x, y, ts, ts);
      }
    }

    ctx.strokeStyle = '#3d2b56';
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, screenW - 12, screenH - 12);
  }

  function drawGame() {
    Stands.draw(ctx);

    // Shockwave Rings
    shockwaves.forEach(sw => {
      ctx.save();
      ctx.strokeStyle = sw.color;
      ctx.lineWidth = 3;
      ctx.globalAlpha = Math.max(0, sw.life);
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });

    droppedParts.forEach(drop => {
      const bob = Math.sin(Date.now() * 0.007 + drop.bob) * 3;
      ctx.fillStyle = '#2ed573';
      ctx.fillRect(drop.x - 7, drop.y - 7 + bob, 14, 14);
      ctx.fillStyle = '#ffa502';
      ctx.fillRect(drop.x - 2, drop.y - 2 + bob, 4, 4);
    });

    spikes.forEach(spk => {
      spk.trail.forEach(t => {
        ctx.fillStyle = 'rgba(255, 165, 2, 0.45)';
        ctx.fillRect(t.x - 3, t.y - 3, 6, 6);
      });

      ctx.save();
      ctx.translate(spk.x, spk.y);
      ctx.rotate(Math.atan2(spk.vy, spk.vx));
      ctx.fillStyle = '#ffd32a';
      ctx.beginPath();
      ctx.moveTo(9, 0);
      ctx.lineTo(-7, -4);
      ctx.lineTo(-3, 0);
      ctx.lineTo(-7, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });

    activeCacti.forEach(c => c.draw(ctx));

    Player.draw(ctx);

    particles.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    });

    floatingTexts.forEach(ft => {
      ctx.fillStyle = ft.color;
      ctx.font = `bold ${ft.size}px Courier New`;
      ctx.textAlign = 'center';
      ctx.fillText(ft.text, ft.x, ft.y);
    });
  }

  // --- HUD (PROCEDURAL PIXEL ICONS ONLY) ---
  function drawHUD() {
    ctx.fillStyle = 'rgba(10, 8, 20, 0.9)';
    ctx.fillRect(0, 0, screenW, 50);
    ctx.strokeStyle = '#3d2b56';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 48, screenW, 2);

    // Draw Hearts
    for (let i = 0; i < Player.maxHealth; i++) {
      PixelIcons.drawHeart(ctx, 20 + i * 20, 18, i < Player.health);
    }

    // Money (Coin Icon + Gold)
    PixelIcons.drawCoin(ctx, 125, 20);
    ctx.font = 'bold 15px Courier New';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd32a';
    ctx.fillText(`$${SaveData.money}`, 140, 32);

    // Parts (Cactus Token Icon + Count)
    PixelIcons.drawCactusToken(ctx, 235, 20);
    ctx.fillStyle = '#2ed573';
    ctx.fillText(`PARTS: ${SaveData.cactusParts}`, 250, 32);

    // Wave Indicator
    ctx.fillStyle = '#a55eea';
    ctx.fillText(`WAVE: ${SaveData.wave}`, 380, 32);

    // Drops Quota
    const remainingToDefeat = (totalCactiForWave - cactiSpawnedSoFar) + activeCacti.filter(c => c.state !== 'DESTROYED').length;
    ctx.fillStyle = remainingToDefeat > 0 ? '#ff4757' : '#2ed573';
    ctx.fillText(remainingToDefeat > 0 ? `DROPS: ${cactiSpawnedSoFar}/${totalCactiForWave}` : `SHOPS OPEN`, 490, 32);

    // Dash Cooldown Bar
    const cdPct = Math.max(0, Player.dashCooldownTimer / Player.getDashCooldown());
    const mw = 84, mh = 16;
    const mx = Math.min(screenW - mw - 20, 750);
    const my = 18;
    ctx.fillStyle = '#1e272e';
    ctx.fillRect(mx, my, mw, mh);
    ctx.fillStyle = cdPct === 0 ? '#00d2d3' : '#576574';
    ctx.fillRect(mx, my, Math.round(mw * (1 - cdPct)), mh);
    ctx.strokeStyle = '#ffffff';
    ctx.strokeRect(mx, my, mw, mh);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px Courier New';
    ctx.fillText('DASH [I]', mx + 16, my + 12);
  }

  // --- MAIN MENU ---
  function drawMenu() {
    ctx.fillStyle = '#0f0a1c';
    ctx.fillRect(0, 0, screenW, screenH);

    const t = Date.now() * 0.001;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 50; i++) {
      const sx = (i * 123) % screenW;
      const sy = (i * 77 + t * 14) % screenH;
      ctx.fillRect(sx, sy, 2, 2);
    }

    ctx.fillStyle = '#2ed573';
    ctx.strokeStyle = '#051b11';
    ctx.lineWidth = 10;
    ctx.font = '900 48px Courier New';
    ctx.textAlign = 'center';
    ctx.strokeText('PIXEL CACTUS CLASH', screenW / 2, screenH / 2 - 90);
    ctx.fillText('PIXEL CACTUS CLASH', screenW / 2, screenH / 2 - 90);

    ctx.fillStyle = '#ffd32a';
    ctx.font = 'bold 15px Courier New';
    ctx.fillText('RETRO PIXEL SURVIVAL & HAMMER SMASH', screenW / 2, screenH / 2 - 45);

    // Current Bank
    ctx.fillStyle = '#ffd32a';
    ctx.font = 'bold 16px Courier New';
    ctx.fillText(`SAVED GOLD: $${SaveData.money}   |   SAVED PARTS: ${SaveData.cactusParts}`, screenW / 2, screenH / 2 - 10);

    // Play Button
    const bw = 240, bh = 56;
    const bx = screenW / 2 - bw / 2;
    const by = screenH / 2 + 25;

    ctx.fillStyle = '#1e824c';
    ctx.fillRect(bx, by + 4, bw, bh);
    ctx.fillStyle = '#2ed573';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillRect(bx, by, bw, 4);

    ctx.fillStyle = '#0a2314';
    ctx.font = '900 24px Courier New';
    ctx.fillText('START GAME', screenW / 2, by + 37);

    ctx.fillStyle = '#a4b0be';
    ctx.font = '13px Courier New';
    ctx.fillText('WASD: Move  |  SPACE / CLICK: Hammer Smash & Deflect  |  I: Dash', screenW / 2, screenH / 2 + 130);
  }

  // --- GAME OVER: RETURNS TO MAIN MENU ---
  function drawGameOver() {
    ctx.fillStyle = 'rgba(10, 6, 18, 0.94)';
    ctx.fillRect(0, 0, screenW, screenH);

    ctx.fillStyle = '#ff4757';
    ctx.font = '900 48px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', screenW / 2, screenH / 2 - 90);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 17px Courier New';
    ctx.fillText(`WAVE REACHED: ${SaveData.wave}`, screenW / 2, screenH / 2 - 25);
    ctx.fillText(`PARTS IN BAG: ${SaveData.cactusParts}`, screenW / 2, screenH / 2 + 5);
    ctx.fillText(`TOTAL GOLD: $${SaveData.money}`, screenW / 2, screenH / 2 + 35);

    // Return to Main Menu Prompt
    const bw = 280, bh = 50;
    const bx = screenW / 2 - bw / 2;
    const by = screenH / 2 + 85;

    ctx.fillStyle = '#1e2499';
    ctx.fillRect(bx, by + 4, bw, bh);
    ctx.fillStyle = '#3742fa';
    ctx.fillRect(bx, by, bw, bh);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Courier New';
    ctx.fillText('MAIN MENU [CLICK / KEY]', screenW / 2, by + 32);
  }

  // Start Loop
  requestAnimationFrame(loop);

})();
