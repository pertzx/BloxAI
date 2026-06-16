import test from 'node:test';
import assert from 'node:assert/strict';
import { PricingEngine } from '../src/services/PricingEngine.js';

test('margem de 50% gera multiplicador 2 e dobra o custo (exemplo da spec)', () => {
  assert.equal(PricingEngine.getMultiplier(50), 2);
  const charge = PricingEngine.computeCharge(2, 50);
  assert.equal(charge.chargedUsd, 4);
  assert.equal(charge.profitUsd, 2);
  assert.equal(charge.multiplier, 2);
});

test('margem de 60% gera multiplicador 2.5 (exemplo da spec)', () => {
  assert.equal(PricingEngine.getMultiplier(60), 2.5);
  const charge = PricingEngine.computeCharge(6, 60);
  assert.equal(charge.chargedUsd, 15);
  assert.equal(charge.profitUsd, 9);
});

test('margem de 0% não altera o custo', () => {
  const charge = PricingEngine.computeCharge(3.5, 0);
  assert.equal(charge.multiplier, 1);
  assert.equal(charge.chargedUsd, 3.5);
  assert.equal(charge.profitUsd, 0);
});

test('margem é travada em 99% para evitar multiplicador infinito', () => {
  // 1 / (1 - 0.99) ≈ 100 (com imprecisão de ponto flutuante); computeCharge arredonda.
  assert.ok(Math.abs(PricingEngine.getMultiplier(100) - 100) < 1e-6);
  assert.equal(PricingEngine.computeCharge(1, 100).multiplier, 100);
  assert.ok(Number.isFinite(PricingEngine.getMultiplier(1000)));
});

test('margem negativa é tratada como 0%', () => {
  assert.equal(PricingEngine.getMultiplier(-20), 1);
});

test('custo real negativo ou inválido é tratado como 0', () => {
  assert.equal(PricingEngine.computeCharge(-5, 50).chargedUsd, 0);
  assert.equal(PricingEngine.computeCharge('abc', 50).chargedUsd, 0);
});

test('resolveMargin usa override do usuário quando presente', () => {
  assert.equal(PricingEngine.resolveMargin({ marginPercent: 70 }), 70);
  assert.equal(PricingEngine.resolveMargin({ marginPercent: 150 }), 99); // clamp
});

test('a margem é preservada: gastar 100% do saldo gasta exatamente (1-M/100) de custo real', () => {
  // Cliente paga (e enxerga) $10. Com margem 50%, multiplicador 2.
  // Cada $1 de saldo consumido equivale a $0,50 de custo real.
  const margin = 50;
  const multiplier = PricingEngine.getMultiplier(margin);
  const walletPaidUsd = 10;
  const realCostToExhaust = walletPaidUsd / multiplier; // custo real até zerar o saldo
  assert.equal(realCostToExhaust, 5);
  // O lucro líquido é a margem aplicada sobre o valor pago.
  assert.equal(walletPaidUsd - realCostToExhaust, 5);
});
