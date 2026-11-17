  // ---------- settings as widgets ----------
  // "Setting" shows chosen rows from Settings; "Settings section" shows a whole section. Each control in the widget is
  // a stand-in for the real one in Settings: changing it sets the real control and sends it the same input/change
  // event, and pressing a button presses the real button, so the app's own code does the work exactly as it does in
  // Settings. The stand-ins re-read the real controls with the live widgets, so a change made anywhere shows here.
  function stPane(){ return document.getElementById('sidebar-pane-settings'); }
  function stRowTitle(row){
    var t = row.querySelector('.settings-row-title'); if (!t) return '';
    var c = t.cloneNode(true); c.querySelectorAll('[id]').forEach(function(x){ x.remove(); });
    return c.textContent.replace(/\s+/g, ' ').trim();
  }
  function stCtrls(row){
    return Array.prototype.filter.call(row.querySelectorAll('input[id], select[id], button[id]'), function(c){
      return c.type !== 'file' && c.type !== 'hidden' && c.closest('.settings-row') === row && !c.closest('.ls-slot, .pw-box'); });
  }
  function stGroupName(sec){ var g = sec.closest('.pp-sg'), t = g && g.querySelector(':scope > .pp-sg-title'); return t ? t.textContent.trim() : 'Settings'; }
  function stKey(sec){ var S = window.__ppSettings; return S ? S.key(sec) : sec.id || ''; }
  // Every section in Settings and the rows in it that have a control.
  function stCatalogue(){
    var pane = stPane(), out = []; if (!pane) return out;
    pane.querySelectorAll('.settings-section').forEach(function(sec){
      if (sec.closest('.ls-slot, .pw-box')) return;
      var rows = [];
      sec.querySelectorAll('.settings-row').forEach(function(row){
        if (row.closest('.settings-section') !== sec) return;
        var cs = stCtrls(row); if (!cs.length) return;
        var t = stRowTitle(row) || cs[0].getAttribute('aria-label') || cs[0].getAttribute('title') || ''; if (!t) return;
        rows.push({ id: cs[0].id, title: t });
      });
      if (!rows.length) return;
      var lab = sec.querySelector('.settings-section-label');
      out.push({ key: stKey(sec), group: stGroupName(sec), label: lab ? lab.textContent.trim() : rows[0].title, rows: rows });
    });
    return out;
  }
  function stSection(key){
    var pane = stPane(); if (!pane || !key) return null;
    var list = pane.querySelectorAll('.settings-section');
    for (var i = 0; i < list.length; i++) if (!list[i].closest('.ls-slot, .pw-box') && stKey(list[i]) === key) return list[i];
    return null;
  }
  // The choosers in a widget's own settings sheet.
  function stPickHTML(k, v, label){
    var cat = stCatalogue(), groups = {};
    cat.forEach(function(s){ (groups[s.group] = groups[s.group] || []).push(s); });
    return '<div class="pw-f"><label>' + esc(label) + '</label><select data-k="' + k + '"><option value="">None</option>' + Object.keys(groups).map(function(g){
      return groups[g].map(function(s){ return '<optgroup label="' + esc(g + ' › ' + s.label) + '">' + s.rows.map(function(r){
        return '<option value="' + esc(r.id) + '"' + (v === r.id ? ' selected' : '') + '>' + esc(r.title) + '</option>'; }).join('') + '</optgroup>'; }).join('');
    }).join('') + '</select></div>';
  }
  function stSecPickHTML(k, v, label){
    var cat = stCatalogue();
    return '<div class="pw-f"><label>' + esc(label) + '</label><select data-k="' + k + '"><option value="">Choose a section…</option>' + cat.map(function(s){
      return '<option value="' + esc(s.key) + '"' + (v === s.key ? ' selected' : '') + '>' + esc(s.group + ' › ' + s.label) + '</option>'; }).join('') + '</select></div>';
  }

  function stCtlHTML(c){
    var id = esc(c.id), dis = c.disabled ? ' disabled' : '';
    if (c.tagName === 'SELECT') return '<select class="pw-st-sel" data-st="' + id + '"' + dis + ' aria-label="' + esc(stLabel(c)) + '">' + stOpts(c) + '</select>';
    if (c.tagName === 'BUTTON') return '<button type="button" class="pw-st-btn" data-st="' + id + '"' + dis + '>' + esc((c.textContent || '').trim() || c.getAttribute('aria-label') || 'Open') + '</button>';
    if (c.type === 'checkbox') return '<label class="pw-st-sw"><input type="checkbox" data-st="' + id + '"' + (c.checked ? ' checked' : '') + dis + ' aria-label="' + esc(stLabel(c)) + '"><i></i></label>';
    if (c.type === 'range') return '<input type="range" class="pw-st-range" data-st="' + id + '" min="' + esc(c.min) + '" max="' + esc(c.max) + '" step="' + esc(c.step || 1) + '" value="' + esc(c.value) + '"' + dis + ' aria-label="' + esc(stLabel(c)) + '">';
    if (c.type === 'color') return '<input type="color" data-st="' + id + '" value="' + esc(c.value) + '"' + dis + '>';
    if (c.type === 'number' || c.type === 'text') return '<input type="' + c.type + '" class="pw-st-num" data-st="' + id + '" value="' + esc(c.value) + '"' + (c.min ? ' min="' + esc(c.min) + '"' : '') + (c.max ? ' max="' + esc(c.max) + '"' : '') + dis + '>';
    return '';
  }
  function stLabel(c){ var r = c.closest('.settings-row'); return (r && stRowTitle(r)) || c.getAttribute('aria-label') || c.id; }
  function stOpts(c){ return Array.prototype.map.call(c.options, function(x){ return '<option value="' + esc(x.value) + '"' + (x.selected ? ' selected' : '') + '>' + esc(x.textContent) + '</option>'; }).join(''); }
  function stRowHTML(id, o){
    var c = document.getElementById(id);
    if (!c || c.closest('.pw-box')) return '<div class="pw-st-row pw-st-gone">A setting that is not in this version</div>';
    var row = c.closest('.settings-row'), cs = row ? stCtrls(row) : [c];
    var sub = row && o.desc ? row.querySelector('.settings-row-sub') : null;
    return '<div class="pw-st-row" data-st-row="' + esc(id) + '"><div class="pw-st-txt"><b>' + esc(row ? stRowTitle(row) : stLabel(c)) + '</b><span class="pw-st-v"></span>' +
      (sub ? '<small>' + esc(sub.textContent.trim()) + '</small>' : '') + '</div><div class="pw-st-ctl">' + cs.map(stCtlHTML).join('') + '</div></div>';
  }
  function stWrap(o, head, inner){
    return '<div class="pw-st' + (o.card === false ? '' : ' pw-st-card') + '" data-pw-live="setting">' + (head ? '<div class="pw-st-h">' + esc(head) + '</div>' : '') + inner + '</div>';
  }
  function stLive(el){
    el.querySelectorAll('[data-st-row]').forEach(function(r){
      var c = document.getElementById(r.dataset.stRow), row = c && c.closest('.settings-row');
      // a row Settings itself hides (it only applies in some cases) is hidden here too
      var off = !c || (row && (row.hidden || row.style.display === 'none'));
      if (r.classList.contains('pw-st-off') !== !!off) r.classList.toggle('pw-st-off', !!off);
      var v = row && row.querySelector('.settings-row-title [id]'), vt = v ? v.textContent.trim() : '', ve = r.querySelector('.pw-st-v');
      if (ve && ve.textContent !== vt) ve.textContent = vt;
    });
    el.querySelectorAll('[data-st]').forEach(function(p){
      if (p === document.activeElement) return;
      var c = document.getElementById(p.dataset.st); if (!c) return;
      if (p.disabled !== c.disabled) p.disabled = c.disabled;
      if (p.type === 'checkbox'){ if (p.checked !== c.checked) p.checked = c.checked; }
      else if (p.tagName === 'SELECT'){
        if (p.options.length !== c.options.length || Array.prototype.some.call(c.options, function(x, i){ return p.options[i].value !== x.value || p.options[i].textContent !== x.textContent; })) p.innerHTML = stOpts(c);
        if (p.value !== c.value) p.value = c.value;
      }
      else if (p.tagName === 'BUTTON'){ var bt = (c.textContent || '').trim(); if (bt && p.textContent !== bt) p.textContent = bt; }
      else if (p.value !== c.value) p.value = c.value;
    });
  }
  // A change in a stand-in goes to the real control.
  function stRelay(e){
    var p = e.target; if (!p || !p.dataset || !p.dataset.st || !p.closest('.pw-box')) return;
    var c = document.getElementById(p.dataset.st); if (!c || c === p) return;
    if (e.type === 'click'){ if (p.tagName === 'BUTTON' && !body.classList.contains('pw-editing')){ e.stopPropagation(); c.click(); setTimeout(liveSoon, 60); } return; }
    if (p.type === 'checkbox'){
      if (c.checked === p.checked) return;
      c.checked = p.checked; c.dispatchEvent(new Event('input', { bubbles:true })); c.dispatchEvent(new Event('change', { bubbles:true }));
    } else {
      if (c.value !== p.value) c.value = p.value;
      c.dispatchEvent(new Event(e.type, { bubbles:true }));
    }
    setTimeout(liveSoon, 60);
  }
  document.addEventListener('input', stRelay); document.addEventListener('change', stRelay); document.addEventListener('click', stRelay, true);

  T.setting = { name:'Setting', icon:'toggle', kind:'box', zones:['home','page','player','video'], w:'full', desc:'Any switch, slider or choice from Settings, working right here',
    fields:[['s1','Setting','setting',''],['s2','Second','setting',''],['s3','Third','setting',''],['s4','Fourth','setting',''],['s5','Fifth','setting',''],['s6','Sixth','setting',''],
            ['title','Heading','text',''],['desc','Show the descriptions','toggle',false],['card','On a card','toggle',true]],
    render:function(o){
      var ids = ['s1','s2','s3','s4','s5','s6'].map(function(k){ return o[k]; }).filter(Boolean);
      if (!ids.length) return stWrap(o, o.title, '<div class="pw-st-empty">' + svg('toggle') + '<span>Choose settings to show here in this widget’s settings.</span></div>');
      return stWrap(o, o.title, ids.map(function(id){ return stRowHTML(id, o); }).join(''));
    },
    live: stLive };
  T.setsec = { name:'Settings section', icon:'sliders', kind:'box', zones:['home','page','player','video'], w:'full', desc:'A whole part of Settings, like the equalizer or subtitles',
    fields:[['sec','Section','setsec',''],['title','Heading','text',''],['desc','Show the descriptions','toggle',false],['card','On a card','toggle',true]],
    render:function(o){
      var sec = stSection(o.sec), cat = sec ? stCatalogue().find(function(s){ return s.key === o.sec; }) : null;
      if (!cat) return stWrap(o, o.title, '<div class="pw-st-empty">' + svg('sliders') + '<span>' + (o.sec ? 'That section is not in this version.' : 'Choose a section of Settings in this widget’s settings.') + '</span></div>');
      return stWrap(o, o.title != null && o.title !== '' ? o.title : cat.label, cat.rows.map(function(r){ return stRowHTML(r.id, o); }).join(''));
    },
    live: stLive };
