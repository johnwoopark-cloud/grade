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
    // 기본점수는 만점의 basePct% (기본 30%)
    const basePct = num(item.basePct) ?? 30;
    const base = round2((max * basePct) / 100);
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

    // 응시로 되어 있는데 원점수가 비어 있으면, 점수가 '없는' 것과 구분해 먼저 입력을 요청한다
    const blank = subject.items.filter(
      (o) => o.id !== item.id && o.status === 'taken' && num(o.score) === null
    );
    if (blank.length) {
      return {
        error: `먼저 ${blank.map((o) => `'${o.name}'`).join(', ')}의 원점수를 입력하세요. 보지 못한 항목이면 결시로 바꾸세요.`,
      };
    }

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
          note: '같은 학기에 이 과목의 정기시험·수행평가 점수가 모두 없어 학업성적관리위원회 심의로 정합니다. 아래 방법별 참고 점수를 확인하고, 학교에서 정한 인정점을 맨 아래에 입력하세요.',
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

  // 제22조 ⑧ 위원회 심의용 참고값. 다른 과목에서 이름이 같은 정기시험을 '같은 정기시험'으로 본다.
  // 점수는 모두 100점 기준 비율로 맞춘 뒤 결시 항목의 만점으로 환산한다.
  function committeeOptions(subjects, subject, item) {
    if (item.type !== 'exam') return [];
    const max = num(item.max);
    const ratio = item.committeeRatio === false ? 1 : ratioOf(item) ?? 1;
    const f = (n) => String(round2(n));
    const pct = (o) => (num(o.score) / num(o.max)) * 100;
    const takenExam = (o) => o && o.type === 'exam' && isTaken(o) && num(o.max) > 0;
    const sameExam = (s) => s.items.find((o) => o.type === 'exam' && o.name === item.name);
    const others = subjects.filter((s) => s.id !== subject.id);
    const mean = (a) => sum(a) / a.length;

    function finish(o) {
      if (o.pct === undefined) return o;
      const base = (o.pct * max) / 100;
      let value = round2(base * ratio);
      if (value > max) value = max;
      return { ...o, base: round2(base), value, ratio };
    }

    const opts = [];

    // ① 같은 정기시험에서 응시한 동교과(군) 유사 과목 점수
    const simChoices = others.filter((s) => takenExam(sameExam(s)));
    const sim = simChoices.find((s) => s.id === item.similar);
    opts.push({
      key: 'similar',
      label: '① 같은 시험의 비슷한 과목 점수',
      choices: simChoices.map((s) => ({ id: s.id, name: s.name })),
      selected: sim ? sim.id : '',
      ...(sim
        ? { pct: pct(sameExam(sim)), detail: `${sim.name} ${item.name} ${sameExam(sim).score}/${sameExam(sim).max}` }
        : { error: simChoices.length ? '비슷한 과목을 고르세요.' : `다른 과목의 ${item.name} 점수가 없습니다.` }),
    });

    // ② 같은 정기시험에서 응시한 다른 과목 점수의 평균
    const p2 = others.filter((s) => takenExam(sameExam(s))).map((s) => ({ s, p: pct(sameExam(s)) }));
    opts.push(p2.length
      ? { key: 'otherSubjects', label: '② 같은 시험의 다른 과목 점수 평균', pct: mean(p2.map((x) => x.p)),
          detail: `${p2.map((x) => `${x.s.name} ${f(x.p)}`).join(', ')} → 평균 ${f(mean(p2.map((x) => x.p)))}` }
      : { key: 'otherSubjects', label: '② 같은 시험의 다른 과목 점수 평균', error: `다른 과목의 ${item.name} 점수가 없습니다.` });

    // ③ 같은 학기 다른 정기시험에서 응시한 과목 점수의 평균
    const p3 = subjects.flatMap((s) => s.items
      .filter((o) => o.name !== item.name && takenExam(o))
      .map((o) => ({ s, o, p: pct(o) })));
    opts.push(p3.length
      ? { key: 'otherExams', label: '③ 같은 학기 다른 시험의 과목 점수 평균', pct: mean(p3.map((x) => x.p)),
          detail: `${p3.map((x) => `${x.s.name} ${x.o.name} ${f(x.p)}`).join(', ')} → 평균 ${f(mean(p3.map((x) => x.p)))}` }
      : { key: 'otherExams', label: '③ 같은 학기 다른 시험의 과목 점수 평균', error: '같은 학기 다른 정기시험 점수가 없습니다.' });

    // ④ 같은 정기시험 해당 과목의 과목평균
    const a4 = num(item.avg);
    opts.push(a4 !== null
      ? { key: 'subjectAvg', label: '④ 같은 시험 이 과목의 과목평균', pct: (a4 / max) * 100, detail: `${subject.name} ${item.name} 과목평균 ${a4}` }
      : { key: 'subjectAvg', label: '④ 같은 시험 이 과목의 과목평균', error: `위의 '이 시험 과목평균'을 입력하세요.` });

    // ⑤ 같은 정기시험 전 과목의 과목평균
    const p5 = subjects
      .map((s) => ({ s, o: sameExam(s) }))
      .filter((x) => x.o && num(x.o.avg) !== null && num(x.o.max) > 0)
      .map((x) => ({ ...x, p: (num(x.o.avg) / num(x.o.max)) * 100 }));
    opts.push(p5.length
      ? { key: 'allAvg', label: '⑤ 같은 시험 전 과목의 과목평균', pct: mean(p5.map((x) => x.p)),
          detail: `${p5.map((x) => `${x.s.name} ${f(x.p)}`).join(', ')} → 평균 ${f(mean(p5.map((x) => x.p)))}` }
      : { key: 'allAvg', label: '⑤ 같은 시험 전 과목의 과목평균', error: `각 과목 ${item.name}의 과목평균을 입력하세요.` });

    return opts.map(finish);
  }

  const api = { REASONS, num, round2, ratioOf, isTaken, pickRefs, recognize, calculate, committeeOptions };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GradeRules = api;
})(typeof window !== 'undefined' ? window : globalThis);
