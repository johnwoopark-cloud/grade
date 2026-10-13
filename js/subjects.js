// 기본 과목 구성. 화면의 '구성 수정'에서 바꿀 수 있다.
// type: 'exam' = 정기시험, 'perf' = 수행평가
// weight = 반영비율(%), max = 만점(배점), base = 수행평가 기본점수
(function (root) {
  'use strict';

  function uid() {
    return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function item(name, type, weight, max, base) {
    return {
      id: uid(), name, type, weight, max, base: base || 0,
      status: 'taken', reason: 'sick', customRatio: '',
      score: '', avg: '', refs: null, manual: '',
    };
  }

  function standard(name) {
    return {
      id: uid(),
      name,
      items: [
        item('중간고사', 'exam', 30, 100),
        item('기말고사', 'exam', 30, 100),
        item('수행평가1', 'perf', 20, 20),
        item('수행평가2', 'perf', 20, 20),
      ],
    };
  }

  function defaultSubjects() {
    return [
      standard('국어'),
      standard('영어'),
      standard('수학'),
      standard('사회'),
      standard('과학'),
      {
        id: uid(),
        name: '과학실험',
        items: [item('수행평가1', 'perf', 50, 50), item('수행평가2', 'perf', 50, 50)],
      },
    ];
  }

  root.GradeSubjects = { uid, item, standard, defaultSubjects };
})(window);
