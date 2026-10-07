import { ROW_H, ROW_W } from "./components/EmployeeRow.jsx";
import { CARD_H_BASE, CARD_W } from "./components/EmployeeCard.jsx";

export const W = 1920;
export const H = 1080;

// The scrolling list is drawn at ROW_K × the product's natural row size.
export const ROW_K = 1.36;
export const ROW_PITCH = (ROW_H + 8) * ROW_K;
export const ROW_RECT = {
  x: 1830 - ROW_W * ROW_K,
  y: H / 2 - (ROW_H * ROW_K) / 2,
  w: ROW_W * ROW_K,
  h: ROW_H * ROW_K,
};

export const CARD_RECT = {
  x: 1830 - CARD_W,
  y: (H - CARD_H_BASE) / 2,
  w: CARD_W,
  h: CARD_H_BASE,
};

export const TEXT_X = 110;
export const TEXT_W = 720;
