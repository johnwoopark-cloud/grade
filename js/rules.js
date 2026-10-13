// 인정점 산출 규칙 (학업성적관리규정 제22조)
// 브라우저에서는 window.GradeRules, Node(테스트)에서는 module.exports 로 사용한다.
(function (root) {
  'use strict';

  // 제22조 ④ 결시 사유별 인정 비율
  const REASONS = {
    sick: { label: '질병 (80%)', ratio: 0.8 },
    approved: { label: '출석인정 (100%)', ratio: 1 },
    custom: { label: '기타 (직접 입력)', ratio: null },
  };

  function num(v) {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // 소수 셋째 자리에서 반올림하여 둘째 자리까지
  function round2(x) {
    return Math.round(Number((x * 100).toPrecision(12))) / 100;
  }

  function sum(arr) {
    return arr.reduce((a, b) => a + b, 0);
  }

  function sumExpr(arr) {
    return arr.length > 1 ? '(' + arr.join(' + ') + ')' : String(arr[0]);
  }

  function ratioOf(item) {
    if (item.reason === 'custom') {
      const p = num(item.customRatio);
      return p === null ? null : p / 100;
    }
    return (REASONS[item.reason] || REASONS.sick).ratio;
  }

  function isTaken(item) {
    return item.status === 'taken' && num(item.score) !== null;
  }

  // 같은 종류(정기시험/수행평가)에서 응시한 항목들. item.refs 가 배열이면 그 항목만 기준으로 쓴다(⑦ 예시2).
  function pickRefs(subject, item) {
    const candidates = subject.items.filter(
      (o) => o.id !== item.id && o.type === item.type && isTaken(o)
    );
    const refs = Array.isArray(item.refs)
      ? candidates.filter((o) => item.refs.includes(o.id))
      : candidates;
    return { candidates, refs };
  }

  // 응시 점수의 합 × (결시 항목 평균) ÷ (응시 항목 평균의 합) × 인정 비율
  // ⑥-1, ⑥-2, ⑦ 예시1-1, ⑦ 예시2-1 이 모두 이 식이다.
  function byAverageRatio(item, refs, ratio) {
    const avg = num(item.avg);
    if (avg === null) {
      const what = item.type === 'exam' ? '과목평균' : '영역 평균';
      return { error: `결시한 '${item.name}'의 ${what}을 입력하세요.` };
    }
    const missing = refs.find((r) => num(r.avg) === null);
    if (missing) return { error: `기준 항목 '${missing.name}'의 평균을 입력하세요.` };
    const scores = refs.map((r) => num(r.score));
    const avgs = refs.map((r) => num(r.avg));
    const avgSum = sum(avgs);
    if (avgSum <= 0) return { error: '기준 항목 평균의 합이 0입니다.' };
    return {
      raw: (sum(scores) * avg) / avgSum * ratio,
      formula: `${sumExpr(scores)} × ${avg} ÷ ${sumExpr(avgs)} × ${ratio}`,
      refsUsed: refs.map((r) => r.name),
    };
  }

  // ⑦ 예시1-2: 기본점수 + {(배점 − 기본점수) × 응시 정기시험 원점수 합 ÷ 응시 정기시험 배점 합} × 인정 비율
  function byExamRate(item, exams, ratio) {
    const max = num(item.max);
    const base = num(item.base) || 0;
    const missing = exams.find((e) => !(num(e.max) > 0));
    if (missing) return { error: `정기시험 '${missing.name}'의 만점을 입력하세요.` };
    const scores = exams.map((e) => num(e.score));
    const maxes = exams.map((e) => num(e.max));
    return {
      raw: base + ((max - base) * sum(scores)) / sum(maxes) * ratio,
      formula: `${base} + (${max} − ${base}) × ${sumExpr(scores)} ÷ ${sumExpr(maxes)} × ${ratio}`,
      refsUsed: exams.map((e) => e.name),
    };
  }

  function recognize(subject, item) {
    const ratio = ratioOf(item);
    if (ratio === null) return { error: '인정 비율(%)을 입력하세요.' };
    const max = num(item.max);
    if (!(max > 0)) return { error: `'${item.name}'의 만점을 입력하세요.` };

    let result;
    const same = pickRefs(subject, item);
    if (same.candidates.length) {
      if (!same.refs.length) return { error: '기준으로 쓸 항목을 하나 이상 선택하세요.' };
      result = byAverageRatio(item, same.refs, ratio);
      result.rule =
        item.type === 'exam'
          ? '제22조 ⑥-1 · 응시한 정기시험의 평균점수비율'
          : '제22조 ⑦ · 응시한 다른 수행평가 영역의 평균점수비율';
    } else {
      const otherType = item.type === 'exam' ? 'perf' : 'exam';
      const others = subject.items.filter((o) => o.type === otherType && isTaken(o));
      if (!others.length) {
        return {
          committee: true,
          rule: '제22조 ⑧ · 학업성적관리위원회 심의',
          note: '같은 학기에 이 과목의 정기시험·수행평가 점수가 모두 없어 학업성적관리위원회 심의로 정합니다. 학교에서 정한 인정점을 직접 입력하세요.',
        };
      }
      if (item.type === 'exam') {
        result = byAverageRatio(item, others, ratio);
        result.rule = '제22조 ⑥-2 · 응시한 수행평가 영역의 평균점수비율';
      } else {
        result = byExamRate(item, others, ratio);
        result.rule = '제22조 ⑦ 예시1-2 · 응시한 정기시험 점수 기준';
      }
    }
    if (result.error) return result;

    let value = round2(result.raw);
    if (value > max) {
      value = max;
      result.capped = true; // 인정점은 만점을 넘을 수 없음
    }
    result.value = value;
    return result;
  }

  function calculate(subject) {
    const items = subject.items.map((item) => {
      const max = num(item.max);
      const weight = num(item.weight);
      let effective = null;
      let recog = null;
      if (item.status === 'absent') {
        recog = recognize(subject, item);
        if (recog.committee) effective = num(item.manual);
        else if (!recog.error) effective = recog.value;
      } else {
        effective = num(item.score);
      }
      const overMax = effective !== null && max > 0 && effective > max;
      const reflected =
        effective !== null && max > 0 && weight !== null ? (effective / max) * weight : null;
      return { id: item.id, effective, reflected, recog, overMax };
    });
    const weightSum = sum(subject.items.map((i) => num(i.weight) || 0));
    return {
      items,
      total: round2(sum(items.map((r) => r.reflected || 0))),
      weightSum: round2(weightSum),
      complete: items.length > 0 && items.every((r) => r.reflected !== null),
    };
  }

  const api = { REASONS, num, round2, ratioOf, isTaken, pickRefs, recognize, calculate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GradeRules = api;
})(typeof window !== 'undefined' ? window : globalThis);
