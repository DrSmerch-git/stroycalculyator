/* ===========================================================
   StroyCalc - общий движок калькуляторов
   Подключается на каждой странице: <script src="../assets/calc.js"></script>
   Затем: Calc.mount(document.getElementById('calc'), { fields, compute })
   =========================================================== */

(function (global) {
  'use strict';

  /* ---------- цели Яндекс.Метрики ---------- */

  var YM_ID = 114374906;

  function goal(name) {
    try {
      if (typeof global.ym === 'function') global.ym(YM_ID, 'reachGoal', name);
    } catch (e) { /* счётчик заблокирован - расчёт не должен страдать */ }
  }

  /* ---------- форматирование ---------- */

  var fmtCache = {};

  function decFmt(dec) {
    var key = 'd' + dec;
    if (!fmtCache[key]) {
      fmtCache[key] = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: dec });
    }
    return fmtCache[key];
  }

  var moneyFmt = new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0
  });

  function toNum(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var s = String(v == null ? '' : v)
      .replace(/\u00a0/g, '')
      .replace(/\s/g, '')
      .replace(',', '.');
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  /** число с разделителями: fmt(1234.5) → «1 234,5» */
  function fmt(n, dec) {
    if (!isFinite(n)) return '—';
    return decFmt(dec == null ? 2 : dec).format(n);
  }

  /** деньги: money(1234.5) → «1 235 ₽», пустая строка если цена не задана */
  function money(n) {
    if (!n || !isFinite(n) || n <= 0) return '';
    return moneyFmt.format(Math.round(n));
  }

  /**
   * Округление вверх без артефактов плавающей точки.
   * 21.6 / 0.18 * 1.1 даёт 132.00000000000003, и обычный Math.ceil
   * превратил бы 132 плитки в 133. Поэтому сначала чистим до 1e-6.
   */
  function ceil(n) {
    if (!isFinite(n)) return 0;
    return Math.ceil(Math.round(n * 1e6) / 1e6);
  }

  /**
   * Русские склонения: plural(32, 'мешок', 'мешка', 'мешков') → 'мешка'
   */
  function plural(n, one, few, many) {
    var abs = Math.abs(Math.round(n)) % 100;
    var last = abs % 10;
    if (abs > 10 && abs < 20) return many;
    if (last === 1) return one;
    if (last >= 2 && last <= 4) return few;
    return many;
  }

  /* ---------- DOM-хелперы ---------- */

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v);
      });
    }
    (children || []).forEach(function (c) {
      if (c == null || c === false) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  /* ---------- поле ввода ---------- */

  function buildField(f) {
    var inputId = 'in-' + f.key;
    var row = h('div', { class: 'field', 'data-key': f.key });
    var label = h('label', { class: 'field-label', for: inputId, text: f.label });
    row.appendChild(label);

    var input;

    if (f.type === 'select') {
      input = h('select', { class: 'field-select', id: inputId });
      (f.options || []).forEach(function (o) {
        input.appendChild(h('option', { value: o.v, text: o.t }));
      });
      input.value = f.value != null ? String(f.value) : String((f.options && f.options[0] && f.options[0].v) || '');
      row.appendChild(input);
    } else {
      var wrap = h('div', { class: 'field-input' });
      input = h('input', {
        class: 'field-num',
        type: 'number',
        inputmode: 'decimal',
        id: inputId,
        min: f.min != null ? f.min : 0,
        max: f.max != null ? f.max : null,
        step: f.step != null ? f.step : 'any',
        value: f.value != null ? f.value : ''
      });
      wrap.appendChild(input);
      if (f.unit) wrap.appendChild(h('span', { class: 'field-unit', text: f.unit }));
      row.appendChild(wrap);
    }

    if (f.hint) row.appendChild(h('div', { class: 'field-hint', text: f.hint }));

    return { row: row, input: input, spec: f };
  }

  /* ---------- результат ---------- */

  function renderResult(card, res, spec) {
    card.innerHTML = '';

    if (!res || res.error) {
      card.appendChild(h('div', { class: 'result-empty', text: (res && res.error) || 'Заполните поля, чтобы увидеть расчёт.' }));
      return '';
    }

    var main = res.main || {};
    var mainBox = h('div', { class: 'result-main' }, [
      h('div', { class: 'result-label', text: main.label || 'Результат' }),
      h('div', { class: 'result-value', text: main.value || '—' }),
      main.sub ? h('div', { class: 'result-sub', text: main.sub }) : null
    ]);
    card.appendChild(mainBox);

    if (res.rows && res.rows.length) {
      var dl = h('dl', { class: 'result-rows' });
      res.rows.forEach(function (r) {
        if (!r || r.value === '' || r.value == null) return;
        dl.appendChild(h('div', { class: 'result-row' + (r.total ? ' result-row--total' : '') }, [
          h('dt', { text: r.label }),
          h('dd', { text: r.value })
        ]));
      });
      card.appendChild(dl);
    }

    if (res.formula && res.formula.length) {
      var details = h('details', { class: 'result-formula' }, [
        h('summary', { text: 'Как мы это посчитали' }),
        h('ul', {}, res.formula.map(function (line) {
          return h('li', { text: line });
        }))
      ]);
      if (spec && spec.openFormula) details.setAttribute('open', 'open');
      card.appendChild(details);
    }

    if (res.notes && res.notes.length) {
      var notes = h('div', { class: 'result-notes' });
      res.notes.forEach(function (n) {
        if (!n) return;
        notes.appendChild(h('div', {
          class: 'note' + (n.type === 'warn' ? ' note--warn' : ''),
          text: n.text
        }));
      });
      card.appendChild(notes);
    }

    var actions = h('div', { class: 'result-actions' });
    var btn = h('button', { class: 'btn', type: 'button', text: 'Скопировать расчёт' });
    var status = h('span', { class: 'copy-status', text: '' });

    btn.addEventListener('click', function () {
      var text = buildCopyText(res, spec);
      copyText(text).then(function (ok) {
        status.textContent = ok ? 'Скопировано' : 'Не удалось скопировать';
        if (ok) goal('calc_copy');
        setTimeout(function () { status.textContent = ''; }, 2200);
      });
    });

    actions.appendChild(btn);
    actions.appendChild(status);
    card.appendChild(actions);

    return buildCopyText(res, spec);
  }

  function buildCopyText(res, spec) {
    var lines = [];
    if (spec && spec.title) lines.push(spec.title);
    if (res.main) {
      lines.push((res.main.label || 'Итог') + ': ' + (res.main.value || ''));
      if (res.main.sub) lines.push(res.main.sub);
    }
    (res.rows || []).forEach(function (r) {
      if (r.value) lines.push('- ' + r.label + ': ' + r.value);
    });
    if (spec && spec.siteName) lines.push('- ' + spec.siteName);
    return lines.join('\n');
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }).catch(function () {
        return legacyCopy(text);
      });
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  /* ---------- сборка калькулятора ---------- */

  function mount(root, spec) {
    if (!root || !spec || !spec.fields || !spec.compute) return;

    var card = spec.resultEl || document.getElementById('result');
    var groups = {};
    var order = [];
    var byKey = {};

    var form = h('form', { class: 'calc-form', novalidate: 'novalidate' });
    form.addEventListener('submit', function (e) { e.preventDefault(); });

    spec.fields.forEach(function (f) {
      var g = f.group || 'Параметры';
      if (!groups[g]) {
        groups[g] = h('div', { class: 'calc-group' }, [h('div', { class: 'calc-group-title', text: g })]);
        order.push(g);
      }
      var built = buildField(f);
      byKey[f.key] = built;
      groups[g].appendChild(built.row);
    });

    order.forEach(function (g) { form.appendChild(groups[g]); });
    root.innerHTML = '';
    root.appendChild(form);

    function readValues() {
      var v = {};
      spec.fields.forEach(function (f) {
        var ctl = byKey[f.key].input;
        v[f.key] = f.type === 'select' ? ctl.value : toNum(ctl.value);
      });
      return v;
    }

    function syncVisibility(v) {
      spec.fields.forEach(function (f) {
        var row = byKey[f.key].row;
        var visible = !f.showIf || f.showIf(v);
        row.hidden = !visible;
      });
    }

    var userTouched = false;
    var calcGoalSent = false;

    function update() {
      var v = readValues();
      syncVisibility(v);
      var res;
      try {
        res = spec.compute(v);
      } catch (err) {
        res = { error: 'Не удалось посчитать: проверьте введённые значения.' };
      }
      if (card) renderResult(card, res, spec);

      if (userTouched && !calcGoalSent && res && !res.error && res.main) {
        calcGoalSent = true;
        goal('calc_done');
      }
    }

    // пересчёт при любом изменении
    form.addEventListener('input', function () { userTouched = true; update(); });
    form.addEventListener('change', function () { userTouched = true; update(); });

    // Enter в полях не должен отправлять форму
    form.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target && e.target.tagName === 'INPUT') e.preventDefault();
    });

    update();
    return { update: update, readValues: readValues };
  }

  /* ---------- публичное API ---------- */

  global.Calc = {
    mount: mount,
    fmt: fmt,
    money: money,
    ceil: ceil,
    plural: plural,
    toNum: toNum
  };
})(window);
