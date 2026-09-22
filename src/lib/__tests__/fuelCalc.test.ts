import { describe, it, expect } from 'vitest';
import {
  fixed2,
  parseStoredDate,
  computeFillUp,
  recomputeFillUps,
  type FillUp,
} from '../fuelCalc';

/** A fully-formed previous fill-up, for the cases that need one. */
function previousFillUp(overrides: Partial<FillUp> = {}): FillUp {
  return {
    id: 1,
    vehicleId: 'v1',
    date: '01.03.2024',
    odometer: 10000,
    liters: 40,
    totalPrice: 100,
    distance: null,
    consumption: null,
    pricePerLiter: 2.5,
    month: '03.2024',
    ...overrides,
  };
}

describe('fixed2', () => {
  it('always shows two decimals, even when they are zero', () => {
    expect(fixed2(12)).toBe('12.00');
    expect(fixed2(12.5)).toBe('12.50');
  });

  it('rounds to the nearest hundredth', () => {
    expect(fixed2(12.567)).toBe('12.57');
  });
});

describe('parseStoredDate', () => {
  it('reads the stored dd.mm.yyyy format', () => {
    const date = parseStoredDate('15.03.2024');
    expect(date.getFullYear()).toBe(2024);
    expect(date.getMonth()).toBe(2); // zero-based: March
    expect(date.getDate()).toBe(15);
  });
});

describe('computeFillUp', () => {
  const input = {
    vehicleId: 'v1',
    date: '15.03.2024',
    odometer: 10500,
    liters: 40,
    totalPrice: 100,
  };

  it('leaves distance and consumption null for the first entry', () => {
    const result = computeFillUp(input, null);
    expect(result.distance).toBeNull();
    expect(result.consumption).toBeNull();
    expect(result.pricePerLiter).toBe(2.5);
    expect(result.month).toBe('03.2024');
  });

  it('derives distance and consumption from the previous entry', () => {
    const result = computeFillUp(input, previousFillUp());
    expect(result.distance).toBe(500);
    expect(result.consumption).toBe(8); // 40L / 500km * 100
  });

  it('derives price per liter from the total price', () => {
    // TotalPrice is the stored value; price per liter is always derived from it.
    const result = computeFillUp({ ...input, liters: 45.5, totalPrice: 8190 }, null);
    expect(result.pricePerLiter).toBe(180);
  });

  it('rejects an odometer that did not advance', () => {
    expect(() => computeFillUp({ ...input, odometer: 10000 }, previousFillUp())).toThrow(
      /must be greater than the last logged odometer/
    );
  });

  it('rejects a date earlier than the previous fill-up', () => {
    expect(() => computeFillUp({ ...input, date: '01.02.2024' }, previousFillUp())).toThrow(
      /must not be earlier/
    );
  });

  it.each([
    ['odometer', { odometer: 0 }],
    ['liters', { liters: 0 }],
    ['total price', { totalPrice: 0 }],
  ])('rejects a non-positive %s', (_label, override) => {
    expect(() => computeFillUp({ ...input, ...override }, null)).toThrow();
  });
});

describe('recomputeFillUps', () => {
  it('chains the odometer across entries in the order given', () => {
    const result = recomputeFillUps('v1', [
      { date: '01.03.2024', odometer: 10000, liters: 40, totalPrice: 100 },
      { date: '15.03.2024', odometer: 10500, liters: 40, totalPrice: 100 },
    ]);

    expect(result[0].distance).toBeNull();
    expect(result[1].distance).toBe(500);
    expect(result[1].consumption).toBe(8);
  });

  it('nulls the derived fields instead of throwing on out-of-order rows', () => {
    // Unlike computeFillUp, a pull from the Sheet must never be blocked by one bad row.
    const result = recomputeFillUps('v1', [
      { date: '01.03.2024', odometer: 10000, liters: 40, totalPrice: 100 },
      { date: '15.03.2024', odometer: 9000, liters: 40, totalPrice: 100 },
    ]);

    expect(result[1].distance).toBeNull();
    expect(result[1].consumption).toBeNull();
    expect(result[1].pricePerLiter).toBe(2.5); // still derived from TotalPrice
  });

  it('defaults missing notes to an empty string', () => {
    const [row] = recomputeFillUps('v1', [
      { date: '01.03.2024', odometer: 10000, liters: 40, totalPrice: 100 },
    ]);
    expect(row.notes).toBe('');
  });
});
