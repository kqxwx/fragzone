/* FRAGZONE PORTAL FX — pointer-reactive glow, subtle particles and card tilt */
(() => {
  "use strict";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mobile = window.matchMedia("(max-width: 760px)").matches;
  if (reduced) return;
  const glow = document.createElement("div");
  glow.className = "fz-cursor-glow";
  glow.setAttribute("aria-hidden", "true");
  document.body.appendChild(glow);
  let pointerFrame = 0;
  window.addEventListener("pointermove", event => {
    if (event.pointerType === "touch") return;
    if (pointerFrame) cancelAnimationFrame(pointerFrame);
    pointerFrame = requestAnimationFrame(() => {
      document.documentElement.style.setProperty("--fz-pointer-x", event.clientX + "px");
      document.documentElement.style.setProperty("--fz-pointer-y", event.clientY + "px");
    });
  }, { passive: true });
  document.querySelectorAll(".stat, .popular-game").forEach(card => {
    card.dataset.fzTilt = "true";
    card.addEventListener("pointermove", event => {
      if (event.pointerType === "touch" || mobile) return;
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - .5;
      const y = (event.clientY - rect.top) / rect.height - .5;
      card.style.setProperty("--fz-tilt-x", (-y * 5).toFixed(2) + "deg");
      card.style.setProperty("--fz-tilt-y", (x * 5).toFixed(2) + "deg");
    }, { passive: true });
    card.addEventListener("pointerleave", () => {
      card.style.setProperty("--fz-tilt-x", "0deg");
      card.style.setProperty("--fz-tilt-y", "0deg");
    });
  });
  if (mobile) return;
  const canvas = document.createElement("canvas");
  canvas.className = "fz-particle-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;
  let width = 0, height = 0, particles = [];
  const colors = ["99,121,255", "168,121,255", "99,229,255", "255,105,200"];
  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    width = window.innerWidth; height = window.innerHeight;
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    canvas.style.width = width + "px"; canvas.style.height = height + "px";
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const count = Math.min(58, Math.max(24, Math.round(width / 25)));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * width, y: Math.random() * height, r: .5 + Math.random() * 1.7,
      speed: .12 + Math.random() * .34, drift: (Math.random() - .5) * .22,
      color: colors[Math.floor(Math.random() * colors.length)], phase: Math.random() * Math.PI * 2
    }));
  };
  let frame = 0;
  const draw = time => {
    ctx.clearRect(0, 0, width, height);
    for (const p of particles) {
      p.y -= p.speed; p.x += p.drift + Math.sin(time * .00035 + p.phase) * .12;
      if (p.y < -5) { p.y = height + 5; p.x = Math.random() * width; }
      if (p.x < -5) p.x = width + 5;
      if (p.x > width + 5) p.x = -5;
      ctx.beginPath(); ctx.fillStyle = "rgba(" + p.color + ",.72)";
      ctx.shadowBlur = 10; ctx.shadowColor = "rgba(" + p.color + ",.65)";
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0; frame = requestAnimationFrame(draw);
  };
  resize(); window.addEventListener("resize", resize, { passive: true });
  frame = requestAnimationFrame(draw);
  window.addEventListener("pagehide", () => cancelAnimationFrame(frame), { once: true });
})();
 
/* Load the screenshot-inspired layout after the existing live catalog scripts. */
(() => {
  const script = document.createElement("script");
  script.src = "/assets/arena-reference.js";
  script.defer = true;
  document.body.appendChild(script);
})();
