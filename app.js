const canvas = document.getElementById("simCanvas");
const ctx = canvas.getContext("2d");

// UI element bindings
const v0Input = document.getElementById("v0");
const angleInput = document.getElementById("angle");
const y0Input = document.getElementById("y0");
const massInput = document.getElementById("mass");
const cdInput = document.getElementById("cd");
const areaInput = document.getElementById("area");
const planetSelect = document.getElementById("planet-select");
const launchBtn = document.getElementById("launch-btn");
const resetBtn = document.getElementById("reset-btn");

// Telemetry readouts
const tMetric = document.getElementById("t-metric");
const vMetric = document.getElementById("v-metric");
const hMetric = document.getElementById("h-metric");
const rMetric = document.getElementById("r-metric");
const keMetric = document.getElementById("ke-metric");
const peMetric = document.getElementById("pe-metric");

// Sync slider labels
[
  [v0Input, "v0-val"],
  [angleInput, "angle-val"],
  [y0Input, "y0-val"],
  [massInput, "mass-val"],
  [cdInput, "cd-val"],
  [areaInput, "area-val"],
].forEach(([input, labelId]) => {
  input.addEventListener("input", (e) => {
    document.getElementById(labelId).innerText = e.target.value;
  });
});

let gravity = 9.81;
let airDensity = 1.225;

planetSelect.addEventListener("change", (e) => {
  if (e.target.value !== "custom") {
    const [g, rho] = e.target.value.split(",").map(Number);
    gravity = g;
    airDensity = rho;
  }
});

let scale = 4; // Pixels per meter
const originOffset = { x: 50, y: 50 }; // Margin from bottom-left

function resizeCanvas() {
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;
  drawScene();
}
window.addEventListener("resize", resizeCanvas);

// State management
let trajectories = [];
let activeProjectile = null;

class Projectile {
  constructor(v0, angleDeg, y0, mass, cd, area, g, rho) {
    this.mass = mass;
    this.cd = cd;
    this.area = area;
    this.g = g;
    this.rho = rho;

    const rad = (angleDeg * Math.PI) / 180;
    this.x = 0;
    this.y = y0;
    this.vx = v0 * Math.cos(rad);
    this.vy = v0 * Math.sin(rad);

    this.path = [{ x: this.x, y: this.y }];
    this.time = 0;
    this.maxHeight = y0;
    this.isLanded = false;
  }

  update(dt) {
    if (this.isLanded) return;

    // Euler-Cromer / RK2 integration with quadratic drag
    const v = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    const fDrag = 0.5 * this.rho * this.cd * this.area * v * v;

    const ax = this.mass > 0 ? -(fDrag * (this.vx / (v || 1))) / this.mass : 0;
    const ay =
      this.mass > 0 ? -this.g - (fDrag * (this.vy / (v || 1))) / this.mass : -this.g;

    this.vx += ax * dt;
    this.vy += ay * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.time += dt;

    if (this.y > this.maxHeight) this.maxHeight = this.y;

    if (this.y <= 0) {
      this.y = 0;
      this.isLanded = true;
    }

    this.path.push({ x: this.x, y: this.y });
  }

  get kineticEnergy() {
    const v2 = this.vx * this.vx + this.vy * this.vy;
    return 0.5 * this.mass * v2;
  }

  get potentialEnergy() {
    return this.mass * this.g * Math.max(0, this.y);
  }
}

function toCanvasCoords(mX, mY) {
  return {
    x: originOffset.x + mX * scale,
    y: canvas.height - originOffset.y - mY * scale,
  };
}

function drawGrid() {
  const step = 20; // 20m increments
  ctx.strokeStyle = "#1b222d";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#484f58";
  ctx.font = "10px monospace";

  for (let x = 0; x * scale < canvas.width; x += step) {
    const pos = toCanvasCoords(x, 0);
    ctx.beginPath();
    ctx.moveTo(pos.x, 0);
    ctx.lineTo(pos.x, canvas.height - originOffset.y);
    ctx.stroke();
    ctx.fillText(`${x}m`, pos.x - 10, canvas.height - originOffset.y + 16);
  }

  for (let y = 0; y * scale < canvas.height; y += step) {
    const pos = toCanvasCoords(0, y);
    ctx.beginPath();
    ctx.moveTo(originOffset.x, pos.y);
    ctx.lineTo(canvas.width, pos.y);
    ctx.stroke();
    ctx.fillText(`${y}m`, 10, pos.y + 4);
  }

  // Baseline ground
  ctx.strokeStyle = "#30363d";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, canvas.height - originOffset.y);
  ctx.lineTo(canvas.width, canvas.height - originOffset.y);
  ctx.stroke();
}

function drawScene() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // Past paths
  trajectories.forEach((traj, idx) => {
    ctx.strokeStyle = `hsla(${idx * 45}, 70%, 50%, 0.4)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    traj.forEach((pt, i) => {
      const c = toCanvasCoords(pt.x, pt.y);
      if (i === 0) ctx.moveTo(c.x, c.y);
      else ctx.lineTo(c.x, c.y);
    });
    ctx.stroke();
  });

  // Current path
  if (activeProjectile) {
    ctx.strokeStyle = "#58a6ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    activeProjectile.path.forEach((pt, i) => {
      const c = toCanvasCoords(pt.x, pt.y);
      if (i === 0) ctx.moveTo(c.x, c.y);
      else ctx.lineTo(c.x, c.y);
    });
    ctx.stroke();

    // Draw active particle
    const ballPos = toCanvasCoords(activeProjectile.x, activeProjectile.y);
    ctx.fillStyle = "#f0883e";
    ctx.beginPath();
    ctx.arc(ballPos.x, ballPos.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Animation loop
let lastTimestamp = performance.now();

function step(now) {
  const dt = Math.min((now - lastTimestamp) / 1000, 0.05);
  lastTimestamp = now;

  if (activeProjectile && !activeProjectile.isLanded) {
    // Perform sub-stepping for numerical precision
    const subSteps = 8;
    for (let i = 0; i < subSteps; i++) {
      activeProjectile.update(dt / subSteps);
    }

    // Telemetry updates
    tMetric.innerText = `${activeProjectile.time.toFixed(2)} s`;
    const v = Math.sqrt(
      activeProjectile.vx ** 2 + activeProjectile.vy ** 2
    ).toFixed(2);
    vMetric.innerText = `${v} m/s`;
    hMetric.innerText = `${activeProjectile.maxHeight.toFixed(2)} m`;
    rMetric.innerText = `${activeProjectile.x.toFixed(2)} m`;
    keMetric.innerText = `${Math.round(activeProjectile.kineticEnergy)} J`;
    peMetric.innerText = `${Math.round(activeProjectile.potentialEnergy)} J`;

    if (activeProjectile.isLanded) {
      trajectories.push(activeProjectile.path);
    }
  }

  drawScene();
  requestAnimationFrame(step);
}

// Controls
launchBtn.addEventListener("click", () => {
  const v0 = parseFloat(v0Input.value);
  const angle = parseFloat(angleInput.value);
  const y0 = parseFloat(y0Input.value);
  const mass = parseFloat(massInput.value);
  const cd = parseFloat(cdInput.value);
  const area = parseFloat(areaInput.value);

  activeProjectile = new Projectile(
    v0,
    angle,
    y0,
    mass,
    cd,
    area,
    gravity,
    airDensity
  );
});

resetBtn.addEventListener("click", () => {
  trajectories = [];
  activeProjectile = null;
  tMetric.innerText = "0.00 s";
  vMetric.innerText = "0.00 m/s";
  hMetric.innerText = "0.00 m";
  rMetric.innerText = "0.00 m";
  keMetric.innerText = "0 J";
  peMetric.innerText = "0 J";
  drawScene();
});

// Init
resizeCanvas();
requestAnimationFrame(step);
  
