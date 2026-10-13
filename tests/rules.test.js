// 규정 캡처의 예시가 그대로 나오는지 확인한다. 실행: node tests/rules.test.js
const assert = require('node:assert/strict');
const { test } = require('node:test');
const R = require('../js/rules.js');

let n = 0;
function it(name, type, o) {
  return {
    id: 'x' + n++, name, type,
    weight: o.weight ?? 25, max: o.max ?? 100, base: o.base ?? 0,
    status: o.absent ? 'absent' : 'taken',
    reason: o.reason || 'sick', customRatio: o.customRatio ?? '',
    score: o.score ?? '', avg: o.avg ?? '', refs: o.refs ?? null, manual: o.manual ?? '',
  };
}
const valueOf = (subject, idx) => R.recognize(subject, subject.items[idx]).value;

test('⑥-1 정기시험 결시: 응시한 정기시험 기준 (국어 기말 질병 결시)', () => {
  const s = { items: [
    it('중간고사', 'exam', { score: 66.9, avg: 68.72 }),
    it('기말고사', 'exam', { absent: true, reason: 'sick', avg: 61.45 }),
  ] };
  assert.equal(valueOf(s, 1), 47.86);
});

test('⑥-2 정기시험 모두 결시: 수행평가 기준', () => {
  const a = { items: [
    it('중간고사', 'exam', { absent: true, reason: 'approved', avg: 80 }),
    it('기말고사', 'exam', { absent: true, reason: 'approved', avg: 74 }),
    it('수행평가A-1', 'perf', { score: 16, avg: 19, max: 20 }),
    it('수행평가A-2', 'perf', { score: 18, avg: 19, max: 20 }),
  ] };
  assert.equal(valueOf(a, 0), 71.58);
  assert.equal(valueOf(a, 1), 66.21);

  const b = { items: [
    it('중간고사', 'exam', { absent: true, reason: 'sick', avg: 50 }),
    it('기말고사', 'exam', { absent: true, reason: 'approved', avg: 48 }),
    it('수행평가B-1', 'perf', { score: 16, avg: 17, max: 20 }),
    it('수행평가B-2', 'perf', { score: 17, avg: 18, max: 20 }),
  ] };
  assert.equal(valueOf(b, 0), 37.71);
  assert.equal(valueOf(b, 1), 45.26);
});

test('⑦ 예시1-1 수행평가 결시: 다른 수행평가 영역 기준', () => {
  const a = { items: [
    it('A-1', 'perf', { score: 26, avg: 27, max: 30 }),
    it('A-2', 'perf', { score: 20, avg: 18, max: 20 }),
    it('A-3', 'perf', { absent: true, reason: 'approved', avg: 9, max: 10 }),
  ] };
  assert.equal(valueOf(a, 2), 9.2);

  const b = { items: [
    it('B-1', 'perf', { score: 89, avg: 91 }),
    it('B-2', 'perf', { absent: true, reason: 'sick', avg: 90 }),
    it('B-3', 'perf', { absent: true, reason: 'approved', avg: 88 }),
  ] };
  assert.equal(valueOf(b, 1), 70.42);
  assert.equal(valueOf(b, 2), 86.07);
});

test('⑦ 예시2 기준 영역 지정: 지정한 영역만 사용', () => {
  const s = { items: [
    it('영역1', 'perf', { score: 26, avg: 27, max: 30 }),
    it('영역2', 'perf', { absent: true, reason: 'approved', avg: 18, max: 20, refs: [] }),
    it('영역3', 'perf', { score: 9, avg: 9, max: 10 }),
  ] };
  s.items[1].refs = [s.items[0].id];
  // 26 × 18 ÷ 27 = 17.333…
  assert.equal(valueOf(s, 1), 17.33);
  s.items[1].refs = [];
  assert.ok(R.recognize(s, s.items[1]).error);
});

test('⑦ 예시1-2 수행평가 모두 결시: 정기시험 점수 기준', () => {
  const s = { items: [
    it('중간고사', 'exam', { score: 80, max: 100 }),
    it('기말고사', 'exam', { score: 90, max: 100 }),
    it('수행평가1', 'perf', { absent: true, reason: 'sick', max: 20, base: 8 }),
  ] };
  // 8 + (20 − 8) × 170 ÷ 200 × 0.8 = 16.16
  assert.equal(valueOf(s, 2), 16.16);
});

test('인정점은 만점을 넘을 수 없음', () => {
  const s = { items: [
    it('중간고사', 'exam', { score: 100, avg: 50 }),
    it('기말고사', 'exam', { absent: true, reason: 'approved', avg: 70 }),
  ] };
  const r = R.recognize(s, s.items[1]);
  assert.equal(r.value, 100);
  assert.equal(r.capped, true);
});

test('⑧ 점수가 하나도 없으면 위원회 심의 + 직접 입력값 사용', () => {
  const s = { items: [
    it('중간고사', 'exam', { absent: true, avg: 70, weight: 50, manual: 60 }),
    it('수행평가1', 'perf', { absent: true, avg: 15, max: 20, weight: 50, manual: 10 }),
  ] };
  assert.equal(R.recognize(s, s.items[0]).committee, true);
  const c = R.calculate(s);
  assert.equal(c.total, 55);
  assert.equal(c.complete, true);
});

test('최종 점수: 반영비율로 환산해 합산', () => {
  const s = { items: [
    it('중간고사', 'exam', { score: 66.9, avg: 68.72, weight: 30 }),
    it('기말고사', 'exam', { absent: true, reason: 'sick', avg: 61.45, weight: 30 }),
    it('수행평가1', 'perf', { score: 18, max: 20, weight: 20 }),
    it('수행평가2', 'perf', { score: 16, max: 20, weight: 20 }),
  ] };
  const c = R.calculate(s);
  // 66.9×0.3 + 47.86×0.3 + 18 + 16 = 20.07 + 14.358 + 34 = 68.428
  assert.equal(c.total, 68.43);
  assert.equal(c.weightSum, 100);
});
