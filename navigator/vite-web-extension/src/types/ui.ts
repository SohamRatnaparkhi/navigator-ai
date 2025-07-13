import type { ChainOfThought } from "./api";

export type Message =
  | { type: "user"; text: string }
  | { type: "agent"; text: string }
  | { type: "cot"; cot: ChainOfThought }; 