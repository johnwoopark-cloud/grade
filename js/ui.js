// 화면 입력과 결과 표시
(function () {
  'use strict';
  const R = window.GradeRules;
  const S = window.GradeSubjects;
  const STORE = 'grade-calc-v1';
  const TYPE_LABEL = { exam: '정기시험', perf: '수행평가' };

  let state = load();
  const editing = new Set();
  const app = document.getElementById('app');
  const summary = document.getElementById('summary');

  function load() {
    try {
      const saved = localStorage.getItem(STORE);
      if (saved) return JSON.parse(saved);
    } catch (e) { /* 저장소를 쓸 수 없으면 기본값 */ }
    return { subjects: S.defaultSubjects() };
  }

  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* 무시 */ }
  }

  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function fmt(n) {
    return n === null || n === undefined ? '–' : String(R.round2(n));
  }

  function field(s, it, f, value, opts = {}) {
    const key = `${s.id}:${it ? it.id : ''}:${f}`;
    const attrs = `data-s="${s.id}" data-i="${it ? it.id : ''}" data-f="${f}" data-key="${key}"`;
    const extra = opts.text ? '' : 'inputmode="decimal" autocomplete="off"';
    return `<label class="fld ${opts.cls || ''}"><span>${opts.label}</span>
      <input type="text" ${extra} ${attrs} value="${esc(value)}" placeholder="${esc(opts.ph || '')}"></label>`;
  }

  function select(s, it, f, value, options, label) {
    const key = `${s.id}:${it.id}:${f}`;
    return `<label class="fld"><span>${label}</span>
      <select data-s="${s.id}" data-i="${it.id}" data-f="${f}" data-key="${key}">
      ${options.map(([v, t]) => `<option value="${v}"${v === value ? ' selected' : ''}>${esc(t)}</option>`).join('')}
      </select></label>`;
  }

  // ---------- 렌더링 ----------

  function recogHTML(s, it, r) {
    const rc = r.recog;
    if (!rc) return '';
    if (rc.error) return `<div class="recog warn">${esc(rc.error)}</div>`;
    if (rc.committee) {
      return `<div class="recog warn"><b>${esc(rc.rule)}</b><br>${esc(rc.note)}</div>`;
    }
    return `<div class="recog">
      <div class="recog-head"><span>인정점</span><b>${fmt(rc.value)}</b></div>
      <div class="recog-rule">${esc(rc.rule)}</div>
      <div class="recog-formula">${esc(rc.formula)} ≈ ${Number(rc.raw.toFixed(4))}${rc.capped ? ' → 만점 초과로 만점 처리' : ` → ${fmt(rc.value)}`}</div>
      <div class="recog-refs">기준: ${esc(rc.refsUsed.join(', '))}</div>
    </div>`;
  }

  function refsHTML(s, it) {
    const { candidates } = R.pickRefs(s, it);
    if (candidates.length < 2) return '';
    const boxes = candidates.map((o) => {
      const on = !Array.isArray(it.refs) || it.refs.includes(o.id);
      return `<label class="chk"><input type="checkbox" data-s="${s.id}" data-i="${it.id}" data-f="ref"
        data-ref="${o.id}" data-key="${s.id}:${it.id}:ref:${o.id}"${on ? ' checked' : ''}> ${esc(o.name)}</label>`;
    }).join('');
    return `<div class="refs"><span>기준으로 쓸 ${TYPE_LABEL[it.type]}</span>${boxes}</div>`;
  }

  // 수행평가를 모두 결시해 정기시험 점수로 계산할 때(⑦ 예시1-2)는 평균이 필요 없다
  function needsAvg(s, it) {
    return it.type === 'exam' || R.pickRefs(s, it).candidates.length > 0;
  }

  function itemHTML(s, it, r) {
    const absent = it.status === 'absent';
    const meta = `${TYPE_LABEL[it.type]} · 반영 ${esc(it.weight)}% · 만점 ${esc(it.max)}`;
    let body = '';
    if (!absent) {
      body = `<div class="row">
        ${field(s, it, 'score', it.score, { label: '원점수' })}
        ${field(s, it, 'avg', it.avg, { label: it.type === 'exam' ? '과목평균' : '영역 평균', ph: '모르면 비워두기' })}
      </div>`;
      if (r.overMax) body += '<div class="recog warn">원점수가 만점보다 큽니다.</div>';
    } else {
      body = `<div class="row">
        ${select(s, it, 'reason', it.reason, Object.entries(R.REASONS).map(([k, v]) => [k, v.label]), '결시 사유')}
        ${it.reason === 'custom' ? field(s, it, 'customRatio', it.customRatio, { label: '인정 비율(%)' }) : ''}
        ${needsAvg(s, it) ? field(s, it, 'avg', it.avg, { label: it.type === 'exam' ? '이 시험 과목평균' : '이 영역 평균' }) : ''}
      </div>
      ${refsHTML(s, it)}
      <div data-out="${s.id}:${it.id}:recog">${recogHTML(s, it, r)}</div>
      ${r.recog && r.recog.committee ? `<div class="row">${field(s, it, 'manual', it.manual, { label: '학교에서 정한 인정점' })}</div>` : ''}`;
    }
    return `<div class="item${absent ? ' absent' : ''}">
      <div class="item-head">
        <div><div class="item-name">${esc(it.name)}</div><div class="item-meta">${meta}</div></div>
        <div class="seg">
          <button data-act="status" data-s="${s.id}" data-i="${it.id}" data-v="taken" class="${absent ? '' : 'on'}">응시</button>
          <button data-act="status" data-s="${s.id}" data-i="${it.id}" data-v="absent" class="${absent ? 'on' : ''}">결시</button>
        </div>
      </div>
      ${body}
      <div class="reflected">반영점수 <b data-out="${s.id}:${it.id}:refl">${fmt(r.reflected)}</b> / ${esc(it.weight)}</div>
    </div>`;
  }

  function editItemHTML(s, it) {
    return `<div class="item edit">
      <div class="row">
        ${field(s, it, 'name', it.name, { label: '항목 이름', text: true, cls: 'wide' })}
        ${select(s, it, 'type', it.type, [['exam', '정기시험'], ['perf', '수행평가']], '구분')}
      </div>
      <div class="row">
        ${field(s, it, 'weight', it.weight, { label: '반영비율(%)' })}
        ${field(s, it, 'max', it.max, { label: '만점(배점)' })}
        ${it.type === 'perf' ? field(s, it, 'base', it.base, { label: '기본점수' }) : ''}
        <button class="ghost danger" data-act="del-item" data-s="${s.id}" data-i="${it.id}">항목 삭제</button>
      </div>
    </div>`;
  }

  function totalHTML(c) {
    const warn = c.weightSum !== 100 ? `<div class="recog warn">반영비율 합계가 ${c.weightSum}%입니다. 100%가 되도록 '구성 수정'에서 맞춰 주세요.</div>` : '';
    return `<div class="total"><span>최종 점수</span><b>${fmt(c.total)}</b><span class="of">/ ${c.weightSum}</span>
      ${c.complete ? '' : '<span class="pending">입력이 덜 끝났어요</span>'}</div>${warn}`;
  }

  function subjectHTML(s) {
    const c = R.calculate(s);
    const isEdit = editing.has(s.id);
    const items = s.items.map((it, k) => (isEdit ? editItemHTML(s, it) : itemHTML(s, it, c.items[k]))).join('');
    const head = isEdit
      ? `<div class="row">${field(s, null, 'name', s.name, { label: '과목 이름', text: true, cls: 'wide' })}</div>`
      : `<h2>${esc(s.name)}</h2>`;
    const tools = isEdit
      ? `<div class="tools">
          <button class="ghost" data-act="add-item" data-s="${s.id}">+ 항목 추가</button>
          <button class="ghost danger" data-act="del-subject" data-s="${s.id}">과목 삭제</button>
          <button data-act="toggle-edit" data-s="${s.id}">수정 완료</button>
        </div>`
      : '';
    return `<section class="card" id="subj-${s.id}">
      <div class="card-head">${head}
        ${isEdit ? '' : `<button class="ghost small" data-act="toggle-edit" data-s="${s.id}">구성 수정</button>`}
      </div>
      ${items}${tools}
      <div data-out="${s.id}:total">${totalHTML(c)}</div>
    </section>`;
  }

  function summaryHTML() {
    const rows = state.subjects.map((s) => {
      const c = R.calculate(s);
      const absent = s.items.filter((i) => i.status === 'absent').length;
      return `<tr><td><a href="#subj-${s.id}">${esc(s.name)}</a></td>
        <td class="num">${fmt(c.total)}${c.complete ? '' : ' <span class="pending">입력 중</span>'}</td>
        <td class="num">${absent ? `결시 ${absent}` : ''}</td></tr>`;
    }).join('');
    return `<table><thead><tr><th>과목</th><th class="num">최종 점수</th><th class="num"></th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  // 입력에 따라 화면 구성(기준 항목 체크박스, 직접 입력칸, 경고)이 바뀌는지 판단하는 값
  function layoutKey() {
    return state.subjects.map((s) => {
      const c = R.calculate(s);
      return s.items.map((it, k) => {
        const r = c.items[k];
        return [R.isTaken(it), !!(r.recog && r.recog.committee), r.overMax].map(Number).join('');
      }).join(',');
    }).join('|');
  }
  let lastLayout = '';

  function render() {
    lastLayout = layoutKey();
    const active = document.activeElement;
    const key = active && active.dataset ? active.dataset.key : null;
    const caret = active && active.type === 'text' ? active.selectionStart : null;
    app.innerHTML = state.subjects.map(subjectHTML).join('');
    summary.innerHTML = summaryHTML();
    if (key) {
      const el = document.querySelector(`[data-key="${CSS.escape(key)}"]`);
      if (el) {
        el.focus();
        if (caret !== null && el.type === 'text') el.setSelectionRange(caret, caret);
      }
    }
  }

  // 입력 중에는 입력칸을 다시 그리지 않고 결과만 갱신한다
  function updateResults() {
    state.subjects.forEach((s) => {
      const c = R.calculate(s);
      s.items.forEach((it, k) => {
        const r = c.items[k];
        const refl = document.querySelector(`[data-out="${s.id}:${it.id}:refl"]`);
        if (refl) refl.textContent = fmt(r.reflected);
        const rec = document.querySelector(`[data-out="${s.id}:${it.id}:recog"]`);
        if (rec) rec.innerHTML = recogHTML(s, it, r);
      });
      const tot = document.querySelector(`[data-out="${s.id}:total"]`);
      if (tot) tot.innerHTML = totalHTML(c);
    });
    summary.innerHTML = summaryHTML();
  }

  // ---------- 상태 변경 ----------

  const findSubject = (id) => state.subjects.find((s) => s.id === id);
  const findItem = (s, id) => s.items.find((i) => i.id === id);

  function setField(t) {
    const s = findSubject(t.dataset.s);
    if (!s) return;
    const f = t.dataset.f;
    if (!t.dataset.i) { s[f] = t.value; return; }
    const it = findItem(s, t.dataset.i);
    if (f === 'ref') {
      if (!Array.isArray(it.refs)) it.refs = R.pickRefs(s, it).candidates.map((o) => o.id);
      const id = t.dataset.ref;
      it.refs = t.checked ? [...new Set([...it.refs, id])] : it.refs.filter((x) => x !== id);
      return;
    }
    it[f] = t.value;
    if (f === 'type') it.refs = null;
  }

  const isTextInput = (t) => t.tagName === 'INPUT' && t.type !== 'checkbox';

  app.addEventListener('input', (e) => {
    const t = e.target;
    if (!t.dataset.f) return;
    setField(t);
    save();
    if (isTextInput(t) && layoutKey() === lastLayout) updateResults();
    else render();
  });

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const s = findSubject(b.dataset.s);
    switch (b.dataset.act) {
      case 'status': {
        const it = findItem(s, b.dataset.i);
        it.status = b.dataset.v;
        break;
      }
      case 'toggle-edit':
        editing.has(s.id) ? editing.delete(s.id) : editing.add(s.id);
        break;
      case 'add-item':
        s.items.push(S.item(`수행평가${s.items.filter((i) => i.type === 'perf').length + 1}`, 'perf', 0, 20));
        break;
      case 'del-item': {
        const it = findItem(s, b.dataset.i);
        if (!confirm(`'${it.name}' 항목을 삭제할까요?`)) return;
        s.items = s.items.filter((i) => i !== it);
        s.items.forEach((i) => { if (Array.isArray(i.refs)) i.refs = i.refs.filter((x) => x !== it.id); });
        break;
      }
      case 'del-subject':
        if (!confirm(`'${s.name}' 과목을 삭제할까요?`)) return;
        state.subjects = state.subjects.filter((x) => x !== s);
        editing.delete(s.id);
        break;
      case 'add-subject': {
        const name = prompt('추가할 과목 이름', '');
        if (!name) return;
        const ns = S.standard(name.trim());
        state.subjects.push(ns);
        editing.add(ns.id);
        break;
      }
      case 'reset':
        if (!confirm('입력한 점수와 과목 구성을 모두 지우고 처음 상태로 되돌릴까요?')) return;
        state = { subjects: S.defaultSubjects() };
        editing.clear();
        break;
      case 'print':
        window.print();
        return;
      default:
        return;
    }
    save();
    render();
  });

  render();
})();
