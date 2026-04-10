/**
 * Steam / Smoke overlay — ambient fog that gets blown away by interaction.
 * Particles spawn continuously across the screen.
 * Mouse movement, scroll, and clicks push them away like wind.
 * pointer-events: none — does not block interactivity.
 */
(function () {
  'use strict';

  /* ────── CONFIG ────── */
  var CFG = {
    maxParticles: 400,
    spawnRate: 2,             // particles spawned per frame
    lifetime: [180, 360],     // frames (~3-6 sec at 60fps)
    size: [80, 200],          // px radius — large for overlap & merge
    growRate: 0.4,            // size increase per frame
    noiseScale: 0.002,        // simplex spatial frequency
    noiseTimeScale: 0.0008,   // simplex temporal frequency
    noiseDrift: 0.08,         // ambient drift from noise
    alphaMax: 0.45,           // peak opacity — visible white fog on light bg
    fadeInFrames: 30,         // slow fade in
    // interaction push
    mouseRadius: 300,         // px — area of influence
    mousePush: 3.2,           // force multiplier for movement
    scrollPush: 3.5,          // velocity added on scroll
    clickPush: 20,            // impulse radius blast on click
    clickRadius: 350,         // click blast radius
    damping: 0.96,            // velocity decay per frame
  };

  /* ────── SIMPLEX NOISE (2-D, public domain) ────── */
  var F2 = 0.5 * (Math.sqrt(3) - 1);
  var G2 = (3 - Math.sqrt(3)) / 6;
  var grad3 = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
  var perm = new Uint8Array(512);
  (function seedPerm() {
    var p = new Uint8Array(256);
    for (var i = 0; i < 256; i++) p[i] = i;
    for (var i = 255; i > 0; i--) {
      var j = (Math.random() * (i + 1)) | 0;
      var t = p[i]; p[i] = p[j]; p[j] = t;
    }
    for (var i = 0; i < 512; i++) perm[i] = p[i & 255];
  })();
  function simplex2(x, y) {
    var s = (x + y) * F2;
    var i = Math.floor(x + s), j = Math.floor(y + s);
    var t = (i + j) * G2;
    var X0 = i - t, Y0 = j - t;
    var x0 = x - X0, y0 = y - Y0;
    var i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    var x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    var x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    var ii = i & 255, jj = j & 255;
    function dot(gi, px, py) { var g = grad3[gi % 8]; return g[0]*px + g[1]*py; }
    var n0 = 0, n1 = 0, n2 = 0;
    var t0 = 0.5 - x0*x0 - y0*y0;
    if (t0 > 0) { t0 *= t0; n0 = t0 * t0 * dot(perm[ii+perm[jj]], x0, y0); }
    var t1 = 0.5 - x1*x1 - y1*y1;
    if (t1 > 0) { t1 *= t1; n1 = t1 * t1 * dot(perm[ii+i1+perm[jj+j1]], x1, y1); }
    var t2 = 0.5 - x2*x2 - y2*y2;
    if (t2 > 0) { t2 *= t2; n2 = t2 * t2 * dot(perm[ii+1+perm[jj+1]], x2, y2); }
    return 70 * (n0 + n1 + n2);
  }

  /* ────── SPRITE: soft white circle ────── */
  var SPRITE_SIZE = 256;
  var spriteCanvas;
  function buildSprite() {
    spriteCanvas = document.createElement('canvas');
    spriteCanvas.width = SPRITE_SIZE;
    spriteCanvas.height = SPRITE_SIZE;
    var sctx = spriteCanvas.getContext('2d');
    var half = SPRITE_SIZE / 2;
    var grad = sctx.createRadialGradient(half, half, 0, half, half, half);
    // Match background color #f2f2f2 = rgb(242,242,242)
    grad.addColorStop(0, 'rgba(242,242,242,1)');
    grad.addColorStop(0.15, 'rgba(242,242,242,0.8)');
    grad.addColorStop(0.35, 'rgba(242,242,242,0.4)');
    grad.addColorStop(0.55, 'rgba(242,242,242,0.15)');
    grad.addColorStop(0.75, 'rgba(242,242,242,0.04)');
    grad.addColorStop(1, 'rgba(242,242,242,0)');
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  }

  /* ────── CANVAS SETUP ────── */
  var canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;';
  document.body.appendChild(canvas);
  var ctx = canvas.getContext('2d');
  var W, H, dpr;

  function resize() {
    dpr = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildSprite();
  }
  window.addEventListener('resize', resize);
  resize();

  /* ────── PARTICLE POOL ────── */
  var pool = [];
  var aliveCount = 0;

  function rand(a, b) { return a + Math.random() * (b - a); }

  function spawn() {
    if (aliveCount >= CFG.maxParticles) return;
    var p;
    for (var i = 0; i < pool.length; i++) {
      if (!pool[i].alive) { p = pool[i]; break; }
    }
    if (!p) { p = {}; pool.push(p); }

    // spawn at random position across viewport
    p.x = rand(-80, W + 80);
    p.y = rand(-80, H + 80);
    p.vx = 0;
    p.vy = 0;
    p.size = rand(CFG.size[0], CFG.size[1]);
    p.maxLife = rand(CFG.lifetime[0], CFG.lifetime[1]) | 0;
    p.life = 0;
    p.alive = true;
    // unique noise offset so particles don't move in sync
    p.seed = Math.random() * 1000;
    aliveCount++;
  }

  /* ────── INPUT STATE ────── */
  var mouseX = -9999, mouseY = -9999;
  var mouseVX = 0, mouseVY = 0;
  var prevMouseX = -9999, prevMouseY = -9999;
  var mouseActive = false;

  document.addEventListener('mousemove', function (e) {
    mouseX = e.clientX;
    mouseY = e.clientY;
    if (prevMouseX < -5000) { prevMouseX = mouseX; prevMouseY = mouseY; }
    mouseVX = mouseX - prevMouseX;
    mouseVY = mouseY - prevMouseY;
    prevMouseX = mouseX;
    prevMouseY = mouseY;
    mouseActive = true;
  });

  document.addEventListener('mouseleave', function () {
    mouseActive = false;
    mouseX = -9999; mouseY = -9999;
    prevMouseX = -9999; prevMouseY = -9999;
  });

  // Click — radial blast
  var clickEvents = [];
  document.addEventListener('mousedown', function (e) {
    clickEvents.push({ x: e.clientX, y: e.clientY, frame: 0 });
  });

  // Scroll — push particles in scroll direction
  var scrollDelta = 0;
  var lastScrollY = window.scrollY || document.body.scrollTop || 0;
  function onScroll() {
    var sy = window.scrollY || document.body.scrollTop || 0;
    scrollDelta += sy - lastScrollY;
    lastScrollY = sy;
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  document.body.addEventListener('scroll', onScroll, { passive: true });

  /* ────── ANIMATION ────── */
  var frameCount = 0;

  function update() {
    frameCount++;

    // spawn ambient particles
    for (var s = 0; s < CFG.spawnRate; s++) spawn();

    // process click blasts (fade over 10 frames)
    var CLICK_DURATION = 10;

    for (var i = 0; i < pool.length; i++) {
      var p = pool[i];
      if (!p.alive) continue;

      p.life++;
      if (p.life >= p.maxLife) {
        p.alive = false;
        aliveCount--;
        continue;
      }

      // ambient drift via simplex noise
      var nx = simplex2(
        p.x * CFG.noiseScale + p.seed,
        p.y * CFG.noiseScale + frameCount * CFG.noiseTimeScale
      );
      var ny = simplex2(
        p.x * CFG.noiseScale + p.seed + 100,
        p.y * CFG.noiseScale + frameCount * CFG.noiseTimeScale + 100
      );
      p.vx += nx * CFG.noiseDrift;
      p.vy += ny * CFG.noiseDrift - 0.01; // very slight upward drift (steam rises)

      // mouse push — repel from cursor movement direction
      if (mouseActive) {
        var dx = p.x - mouseX;
        var dy = p.y - mouseY;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < CFG.mouseRadius && dist > 1) {
          var mouseSpeed = Math.sqrt(mouseVX * mouseVX + mouseVY * mouseVY);
          // force = stronger when closer, stronger when mouse moves faster
          var factor = (1 - dist / CFG.mouseRadius);
          factor = factor * factor; // quadratic falloff
          var push = factor * CFG.mousePush * Math.min(mouseSpeed / 10, 3);
          // push away from cursor along cursor→particle vector
          p.vx += (dx / dist) * push;
          p.vy += (dy / dist) * push;
          // also add some of mouse's own velocity direction
          if (mouseSpeed > 2) {
            p.vx += (mouseVX / mouseSpeed) * push * 0.5;
            p.vy += (mouseVY / mouseSpeed) * push * 0.5;
          }
        }
      }

      // scroll push — move particles opposite to scroll direction
      if (scrollDelta !== 0) {
        // all particles get pushed slightly
        var scrollForce = Math.min(Math.abs(scrollDelta), 40) / 40;
        var scrollDir = scrollDelta > 0 ? -1 : 1; // scroll down → push particles up
        p.vy += scrollDir * CFG.scrollPush * scrollForce * (0.5 + Math.random() * 0.5);
        p.vx += (Math.random() - 0.5) * CFG.scrollPush * scrollForce * 0.3;
      }

      // click blasts
      for (var c = 0; c < clickEvents.length; c++) {
        var cl = clickEvents[c];
        var cdx = p.x - cl.x;
        var cdy = p.y - cl.y;
        var cdist = Math.sqrt(cdx * cdx + cdy * cdy);
        if (cdist < CFG.clickRadius && cdist > 1) {
          var strength = (1 - cdist / CFG.clickRadius) * (1 - cl.frame / CLICK_DURATION);
          strength = Math.max(0, strength);
          p.vx += (cdx / cdist) * CFG.clickPush * strength;
          p.vy += (cdy / cdist) * CFG.clickPush * strength;
        }
      }

      // damping
      p.vx *= CFG.damping;
      p.vy *= CFG.damping;

      p.x += p.vx;
      p.y += p.vy;

      // grow slowly
      p.size += CFG.growRate;
    }

    // advance click events, remove expired
    for (var c = clickEvents.length - 1; c >= 0; c--) {
      clickEvents[c].frame++;
      if (clickEvents[c].frame > CLICK_DURATION) clickEvents.splice(c, 1);
    }

    // consume scroll delta
    scrollDelta = 0;

    // decay mouse velocity (for smooth falloff when mouse stops)
    mouseVX *= 0.85;
    mouseVY *= 0.85;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    for (var i = 0; i < pool.length; i++) {
      var p = pool[i];
      if (!p.alive) continue;

      var progress = p.life / p.maxLife;
      // smooth fade in / fade out
      var alpha;
      if (p.life < CFG.fadeInFrames) {
        alpha = (p.life / CFG.fadeInFrames) * CFG.alphaMax;
      } else {
        // fade out in last 40%
        var fadeOutStart = 0.6;
        if (progress > fadeOutStart) {
          alpha = CFG.alphaMax * (1 - (progress - fadeOutStart) / (1 - fadeOutStart));
        } else {
          alpha = CFG.alphaMax;
        }
      }
      if (alpha <= 0.001) continue;

      ctx.globalAlpha = alpha;
      var s = p.size;
      ctx.drawImage(spriteCanvas, p.x - s, p.y - s, s * 2, s * 2);
    }

    ctx.globalAlpha = 1;
  }

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
})();
