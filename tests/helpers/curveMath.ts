import { BASE_DECIMAL_MODIFIER, LINEAR_DIV_CONSTANT } from "./config";

export const linearDefiniteIntegral = (a: number, b: number) => {
  let aArea = a ** 2 / 2;
  let bArea = b ** 2 / 2;
  return (bArea - aArea) / BASE_DECIMAL_MODIFIER / LINEAR_DIV_CONSTANT;
};

export const linearCurve = (x: number) => {
  return x / LINEAR_DIV_CONSTANT;
};
