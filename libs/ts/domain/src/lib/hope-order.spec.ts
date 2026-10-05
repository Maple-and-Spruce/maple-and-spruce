import { describe, expect, it } from 'vitest';
import { allocateHopeLessons } from './hope-order';

const week = (n: number) => new Date(Date.UTC(2026, 6, 1 + 7 * n, 19));
const lesson = (n: number, status?: 'submitted' | 'paid' | 'rejected', orderId?: string) => ({
  lessonId: `l${n}`,
  scheduledAt: week(n),
  submission: status ? { status, orderId } : undefined,
});
const order = (id: string, lessonCount: number, n: number) => ({
  id,
  lessonCount,
  orderedOn: week(n),
});

describe('allocateHopeLessons', () => {
  it('fills the oldest order with the oldest lessons, and the rest need an order', () => {
    const { states, remainingByOrder } = allocateHopeLessons(
      [lesson(3), lesson(1), lesson(2)],
      [order('o1', 2, 0)]
    );
    expect(states.get('l1')).toEqual({ kind: 'ready-to-invoice', orderId: 'o1' });
    expect(states.get('l2')).toEqual({ kind: 'ready-to-invoice', orderId: 'o1' });
    expect(states.get('l3')).toEqual({ kind: 'needs-order' });
    expect(remainingByOrder.get('o1')).toBe(0);
  });

  it('moves on to the next order when the first is used up', () => {
    const { states } = allocateHopeLessons(
      [lesson(1), lesson(2)],
      [order('newer', 4, 5), order('older', 1, 0)]
    );
    expect(states.get('l1')).toEqual({ kind: 'ready-to-invoice', orderId: 'older' });
    expect(states.get('l2')).toEqual({ kind: 'ready-to-invoice', orderId: 'newer' });
  });

  it('counts invoiced lessons against the order stamped on them', () => {
    const { states, remainingByOrder } = allocateHopeLessons(
      [lesson(1, 'submitted', 'o1'), lesson(2), lesson(3)],
      [order('o1', 2, 0)]
    );
    expect(states.get('l1')).toEqual({ kind: 'invoiced', orderId: 'o1' });
    expect(states.get('l2')).toEqual({ kind: 'ready-to-invoice', orderId: 'o1' });
    expect(states.get('l3')).toEqual({ kind: 'needs-order' });
    expect(remainingByOrder.get('o1')).toBe(0);
  });

  it('keeps claims from before orders as invoiced, using no order', () => {
    const { states, remainingByOrder } = allocateHopeLessons(
      [lesson(1, 'paid'), lesson(2)],
      [order('o1', 1, 0)]
    );
    expect(states.get('l1')).toEqual({ kind: 'invoiced', orderId: undefined });
    expect(states.get('l2')).toEqual({ kind: 'ready-to-invoice', orderId: 'o1' });
    expect(remainingByOrder.get('o1')).toBe(0);
  });

  it('puts a rejected invoice back to be invoiced again', () => {
    const { states } = allocateHopeLessons(
      [lesson(1, 'rejected', 'o1')],
      [order('o1', 1, 0)]
    );
    expect(states.get('l1')).toEqual({ kind: 'ready-to-invoice', orderId: 'o1' });
  });

  it('never reports negative room on an over-invoiced order', () => {
    const { remainingByOrder } = allocateHopeLessons(
      [lesson(1, 'submitted', 'o1'), lesson(2, 'submitted', 'o1')],
      [order('o1', 1, 0)]
    );
    expect(remainingByOrder.get('o1')).toBe(0);
  });
});
