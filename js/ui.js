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
      if (saved) return migrate(JSON.parse(saved));
    } catch (e) { /* 저장소를 쓸 수 없으면 기본값 */ }
    return { subjects: S.defaultSubjects() };
  }

  function migrate(data) {
    data.subjects.forEach((s) => s.items.forEach((i) => {
      if (i.basePct === undefined) i.basePct = 30;
      delete i.base;
    }));
    return data;
  }

  function saveLocal() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* 무시 */ }
  }

  function save() {
    state.updatedAt = Date.now();
    saveLocal();
    saveCloud();
  }

  // ---------- 계정 저장 (claude.ai 링크로 열었을 때만) ----------
  // 본인만 볼 수 있는 data/users/<id>/calculator 문서에 저장해 다른 컴퓨터에서도 이어서 본다.

  let cloud = null;
  let cloudTimer = null;
  const SYNCED = '계정에 저장됨 · 같은 계정으로 열면 다른 컴퓨터에서도 보입니다';

  function setSync(text) {
    const el = document.getElementById('sync-status');
    if (el) el.textContent = text;
  }

  function hasData(st) {
    return !!st && Array.isArray(st.subjects) && st.subjects.some((s) => s.items.some((i) =>
      i.status === 'absent' || [i.score, i.avg, i.manual].some((v) => v !== '' && v != null)));
  }

  const plain = (v) => JSON.parse(JSON.stringify(v));

  async function pushCloud() {
    await cloud.set({ state: plain(state) });
  }

  function saveCloud() {
    if (!cloud) return;
    clearTimeout(cloudTimer);
    setSync('저장 중…');
    cloudTimer = setTimeout(async () => {
      try {
        await pushCloud();
        setSync(SYNCED);
      } catch (e) {
        setSync('계정에 저장하지 못했습니다. 이 기기에는 저장되어 있습니다.');
      }
    }, 800);
  }

  async function initCloud() {
    if (!window.claude || typeof window.claude.use !== 'function') return;
    setSync('계정 저장소에 연결하는 중…');
    try {
      const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      const uid = db && user ? await user.id() : null;
      if (!uid) {
        setSync('이 기기에만 저장됩니다 (claude.ai에 로그인하면 계정에 저장됩니다)');
        return;
      }
      const ref = db.doc('data/users/' + uid + '/calculator');
      const snap = await ref.get();
      const remote = snap.exists ? snap.data().state : null;
      cloud = ref;
      // 한쪽에만 입력값이 있으면 그쪽을, 둘 다 있으면 더 최근에 고친 쪽을 쓴다
      const useRemote = remote && hasData(remote) &&
        (!hasData(state) || (remote.updatedAt || 0) >= (state.updatedAt || 0));
      if (useRemote) {
        state = migrate(plain(remote));
        saveLocal();
        render();
      } else {
        await pushCloud();
      }
      setSync(SYNCED);
    } catch (e) {
      cloud = null;
      setSync('이 기기에만 저장됩니다');
    }
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

  function committeeHTML(s, it) {
    if (it.type !== 'exam') {
      return '<div class="recog-refs cm-note">위원회 예시는 정기시험 기준이라 수행평가는 참고값을 계산하지 않습니다. 학교에서 정한 값을 입력하세요.</div>';
    }
    const opts = R.committeeOptions(state.subjects, s, it);
    const ratioOn = it.committeeRatio !== false;
    const pctLabel = Math.round((R.ratioOf(it) ?? 1) * 100);
    const rows = opts.map((o) => {
      const pick = o.choices
        ? `<select class="cm-pick" data-s="${s.id}" data-i="${it.id}" data-f="similar" data-key="${s.id}:${it.id}:similar" aria-label="비슷한 과목">
            <option value="">과목 선택</option>
            ${o.choices.map((c) => `<option value="${c.id}"${c.id === o.selected ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}
          </select>`
        : '';
      const val = o.error
        ? `<div class="cm-err">${esc(o.error)}</div>`
        : `<div class="cm-detail">${esc(o.detail)}${ratioOn && o.ratio !== 1 ? ` · ${fmt(o.base)} × ${o.ratio}` : ''}</div>`;
      const use = o.error ? '' : `<button class="ghost small" data-act="use-committee" data-s="${s.id}" data-i="${it.id}" data-v="${o.value}">이 값 사용</button>`;
      return `<div class="cm-row">
        <div class="cm-main"><div class="cm-label">${esc(o.label)}</div>${pick}${val}</div>
        <div class="cm-side"><b>${o.error ? '–' : fmt(o.value)}</b>${use}</div>
      </div>`;
    }).join('');
    return `<div class="cm">
      <div class="cm-head"><span>위원회 심의 방법별 참고 점수</span>
        <label class="chk"><input type="checkbox" data-s="${s.id}" data-i="${it.id}" data-f="committeeRatio"
          data-key="${s.id}:${it.id}:committeeRatio"${ratioOn ? ' checked' : ''}> 인정 비율 ${pctLabel}% 적용</label></div>
      ${rows}
      <div class="recog-refs">다른 과목에서 이름이 같은 시험(${esc(it.name)})을 같은 시험으로 봅니다. 확정 점수는 위원회가 정합니다.</div>
    </div>`;
  }

  function recogHTML(s, it, r) {
    const rc = r.recog;
    if (!rc) return '';
    if (rc.error) return `<div class="recog warn">${esc(rc.error)}</div>`;
    if (rc.committee) {
      return `<div class="recog warn"><b>${esc(rc.rule)}</b><br>${esc(rc.note)}</div>${committeeHTML(s, it)}`;
    }
    return `<div class="recog">
      <div class="recog-head"><span>인정점</span><b>${fmt(rc.value)}</b></div>
      <div class="recog-rule">${esc(rc.rule)}</div>
      <div class="recog-formula">${esc(rc.formula)} ${rc.simple ? `= ${fmt(rc.value)}` : `≈ ${Number(rc.raw.toFixed(4))}${rc.capped ? ' → 만점 초과로 만점 처리' : ` → ${fmt(rc.value)}`}`}</div>
      ${rc.refsUsed.length ? `<div class="recog-refs">기준: ${esc(rc.refsUsed.join(', '))}</div>` : ''}
    </div>`;
  }

  function refsHTML(s, it) {
    const { candidates } = R.pickRefs(s, it);
    if (candidates.length < 2 || perfByBase(s, it)) return '';
    const boxes = candidates.map((o) => {
      const on = !Array.isArray(it.refs) || it.refs.includes(o.id);
      return `<label class="chk"><input type="checkbox" data-s="${s.id}" data-i="${it.id}" data-f="ref"
        data-ref="${o.id}" data-key="${s.id}:${it.id}:ref:${o.id}"${on ? ' checked' : ''}> ${esc(o.name)}</label>`;
    }).join('');
    return `<div class="refs"><span>기준으로 쓸 ${TYPE_LABEL[it.type]}</span>${boxes}</div>`;
  }

  // 수행평가를 모두 결시해 정기시험 점수로 계산할 때(⑦ 예시1-2)는 평균이 필요 없다
  function calcOpts() {
    return { perfMethod: state.perfMethod || 'basic' };
  }

  // 수행평가 결시를 기본점수(+ 정기시험 점수)로 계산해 평균·기준 영역이 필요 없는 경우
  function perfByBase(s, it) {
    if (it.type !== 'perf') return false;
    const m = calcOpts().perfMethod;
    return m === 'basic' || (m === 'base' && s.items.some((o) => o.type === 'exam' && R.isTaken(o)));
  }

  function needsAvg(s, it) {
    if (perfByBase(s, it)) return false;
    return it.type === 'exam' || R.pickRefs(s, it).candidates.length > 0;
  }

  function itemHTML(s, it, r) {
    const absent = it.status === 'absent';
    const basicOnly = it.type === 'perf' && calcOpts().perfMethod === 'basic';
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
        ${basicOnly ? '' : select(s, it, 'reason', it.reason, Object.entries(R.REASONS).map(([k, v]) => [k, v.label]), '결시 사유')}
        ${!basicOnly && it.reason === 'custom' ? field(s, it, 'customRatio', it.customRatio, { label: '인정 비율(%)' }) : ''}
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
        ${it.type === 'perf' ? field(s, it, 'basePct', it.basePct, { label: '기본점수(만점의 %)' }) : ''}
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
    const c = R.calculate(s, calcOpts());
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
      const c = R.calculate(s, calcOpts());
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
      const c = R.calculate(s, calcOpts());
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
    const pm = document.getElementById('perf-method');
    if (pm) pm.value = calcOpts().perfMethod;
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
      const c = R.calculate(s, calcOpts());
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
    if (f === 'committeeRatio') { it.committeeRatio = t.checked; return; }
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

  // 삭제·초기화는 한 번 더 눌러야 실행된다 (브라우저 확인창 대신)
  function armed(b, text) {
    if (b.dataset.armed === '1') return true;
    b.dataset.armed = '1';
    b.dataset.label = b.textContent;
    b.textContent = text;
    setTimeout(() => {
      if (b.isConnected) { b.dataset.armed = ''; b.textContent = b.dataset.label; }
    }, 3000);
    return false;
  }

  document.getElementById('perf-method').addEventListener('change', (e) => {
    state.perfMethod = e.target.value;
    save();
    render();
  });

  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'add-subject-form') return;
    e.preventDefault();
    const input = document.getElementById('new-subject');
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    const ns = S.standard(name);
    state.subjects.push(ns);
    editing.add(ns.id);
    input.value = '';
    save();
    render();
    document.getElementById(`subj-${ns.id}`).scrollIntoView({ behavior: 'smooth' });
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
      case 'use-committee': {
        const it = findItem(s, b.dataset.i);
        it.manual = b.dataset.v;
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
        if (!armed(b, '한 번 더 누르면 삭제')) return;
        s.items = s.items.filter((i) => i !== it);
        s.items.forEach((i) => { if (Array.isArray(i.refs)) i.refs = i.refs.filter((x) => x !== it.id); });
        break;
      }
      case 'del-subject':
        if (!armed(b, '한 번 더 누르면 삭제')) return;
        state.subjects = state.subjects.filter((x) => x !== s);
        editing.delete(s.id);
        break;
      case 'reset':
        if (!armed(b, '한 번 더 누르면 모두 지움')) return;
        state = { subjects: S.defaultSubjects() };
        editing.clear();
        break;
      default:
        return;
    }
    save();
    render();
  });

  render();
  initCloud();
})();
