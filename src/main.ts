// @ts-nocheck
import { PinballDat } from "./dat";
import { PinballGame } from "./physics";
import { GameRenderer } from "./renderer";
import { createFallbackModel, createModelFromDat } from "./tableModel";

const canvas = document.querySelector("#playfield");
const hud = {
  score: document.querySelector("#scoreValue"),
  ball: document.querySelector("#ballValue"),
  mode: document.querySelector("#modeValue"),
};
const assetStatus = document.querySelector("#assetStatus");
const datInput = document.querySelector("#datInput");
const dropZone = document.querySelector("#dropZone");
const debugButton = document.querySelector("#debugButton");
const launchButton = document.querySelector("#launchButton");

const model = createFallbackModel();
const game = new PinballGame(model);
const renderer = new GameRenderer(canvas, hud);
renderer.setModel(model);
assetStatus.textContent = model.title;
window.__spaceCadet = { game, renderer };

let lastTime = performance.now();

function keyToAction(event) {
  const key = event.key.toLowerCase();
  if (key === "arrowleft" || key === "z" || key === "shift") {
    return "left";
  }
  if (key === "arrowright" || key === "/" || key === "x") {
    return "right";
  }
  if (key === " " || key === "arrowdown" || key === "enter") {
    return "plunger";
  }
  return null;
}

function setTouchButton(button, pressed) {
  const action = button.dataset.touch;
  game.setInput(action, pressed);
  button.classList.toggle("isPressed", pressed);
}

async function loadDatFile(file) {
  if (!file) {
    return;
  }

  assetStatus.textContent = "Loading...";
  try {
    const dat = await PinballDat.fromFile(file);
    const datModel = createModelFromDat(dat);
    game.setModel(datModel);
    renderer.setModel(datModel);
    assetStatus.textContent = `${datModel.title} · ${datModel.edges.length} edges`;
  } catch (error) {
    console.error(error);
    assetStatus.textContent = "DAT parse failed";
  }
}

window.addEventListener("keydown", (event) => {
  const action = keyToAction(event);
  if (!action) {
    return;
  }
  event.preventDefault();
  game.setInput(action, true);
});

window.addEventListener("keyup", (event) => {
  const action = keyToAction(event);
  if (!action) {
    return;
  }
  event.preventDefault();
  game.setInput(action, false);
});

document.querySelector("#newGameButton").addEventListener("click", () => {
  game.newGame();
});

launchButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  launchButton.setPointerCapture(event.pointerId);
  launchButton.classList.add("isPressed");
  game.setInput("plunger", true);
});

launchButton.addEventListener("pointerup", (event) => {
  event.preventDefault();
  launchButton.classList.remove("isPressed");
  game.setInput("plunger", false);
});

launchButton.addEventListener("pointercancel", () => {
  launchButton.classList.remove("isPressed");
  game.setInput("plunger", false);
});

debugButton.addEventListener("click", () => {
  const enabled = debugButton.getAttribute("aria-pressed") !== "true";
  debugButton.setAttribute("aria-pressed", String(enabled));
  renderer.setDebug(enabled);
});

datInput.addEventListener("change", (event) => {
  loadDatFile(event.target.files[0]);
  event.target.value = "";
});

for (const button of document.querySelectorAll("[data-touch]")) {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    setTouchButton(button, true);
  });
  button.addEventListener("pointerup", (event) => {
    event.preventDefault();
    setTouchButton(button, false);
  });
  button.addEventListener("pointercancel", () => setTouchButton(button, false));
}

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("isDropTarget");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("isDropTarget");
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("isDropTarget");
  loadDatFile(event.dataTransfer.files[0]);
});

function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  game.step(dt);
  renderer.render(game);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
