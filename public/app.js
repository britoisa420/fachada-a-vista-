/* Fachada em Vista — interações do cliente (sem dependências) */
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  // ---------------- Comparação antes/depois ----------------
  function initCompare(el) {
    const range = $('.compare-range', el);
    const set = (v) => {
      v = Math.max(0, Math.min(100, v));
      el.style.setProperty('--pos', v + '%');
      range.value = String(Math.round(v));
      range.setAttribute('aria-valuetext', `${Math.round(v)}% antes, ${100 - Math.round(v)}% depois`);
    };
    set(50);
    range.addEventListener('input', () => set(Number(range.value)));
    let dragging = false;
    const fromEvent = (e) => {
      const r = el.getBoundingClientRect();
      set(((e.clientX - r.left) / r.width) * 100);
    };
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      dragging = true;
      el.setPointerCapture(e.pointerId);
      el.classList.add('is-dragging');
      fromEvent(e);
    });
    el.addEventListener('pointermove', (e) => dragging && fromEvent(e));
    const stop = () => { dragging = false; el.classList.remove('is-dragging'); };
    el.addEventListener('pointerup', stop);
    el.addEventListener('pointercancel', stop);
    el.addEventListener('lostpointercapture', stop);
  }

  // ---------------- Anexos com prévia, troca e remoção ----------------
  const ACCEPT = (input) => input.accept.split(',').map((s) => s.trim());
  function initSlot(slot) {
    const input = $('[data-input]', slot);
    const previews = $('[data-previews]', slot);
    const err = $('[data-error]', slot);
    const pickText = $('[data-pick-text]', slot);
    const max = Number(slot.dataset.multiple || 1);
    const maxMb = Number(slot.dataset.maxMb || 10);
    const isFachada = slot.dataset.name === 'fotos';
    let files = [];

    const showErr = (m) => { err.textContent = m || ''; err.hidden = !m; slot.classList.toggle('has-error', !!m); };
    const sync = () => {
      const dt = new DataTransfer();
      files.forEach((f) => dt.items.add(f));
      input.files = dt.files;
      render();
    };
    function render() {
      previews.innerHTML = '';
      files.forEach((f, i) => {
        const item = document.createElement('div');
        item.className = 'preview';
        if (/^image\//.test(f.type)) {
          const img = document.createElement('img');
          img.alt = 'Prévia: ' + f.name;
          img.src = URL.createObjectURL(f);
          img.onload = () => URL.revokeObjectURL(img.src);
          item.appendChild(img);
        } else {
          const ic = document.createElement('div');
          ic.className = 'file-icon';
          ic.textContent = (f.name.split('.').pop() || 'arquivo').toUpperCase();
          item.appendChild(ic);
        }
        const meta = document.createElement('div');
        meta.className = 'preview-meta';
        meta.innerHTML = '<span class="preview-name"></span><span class="preview-size"></span><span class="preview-actions"></span>';
        meta.querySelector('.preview-name').textContent = f.name;
        meta.querySelector('.preview-size').textContent = (f.size / 1048576).toFixed(1) + ' MB';
        const acts = meta.querySelector('.preview-actions');
        if (max === 1) {
          const swap = document.createElement('button');
          swap.type = 'button'; swap.className = 'btn btn-sm btn-outline'; swap.textContent = 'Trocar';
          swap.onclick = () => input.click();
          acts.appendChild(swap);
        }
        const rm = document.createElement('button');
        rm.type = 'button'; rm.className = 'btn btn-sm btn-ghost'; rm.textContent = 'Remover';
        rm.setAttribute('aria-label', 'Remover ' + f.name);
        rm.onclick = () => { files.splice(i, 1); showErr(''); sync(); };
        acts.appendChild(rm);
        item.appendChild(meta);
        previews.appendChild(item);
      });
      const label = $('.file-pick', slot);
      const collapse = max === 1 ? files.length > 0 : files.length >= max;
      label.classList.toggle('sr-only', collapse); // o input continua no DOM para o botão "Trocar"
      input.tabIndex = collapse ? -1 : 0;
      if (max > 1) pickText.textContent = files.length ? `Adicionar mais (${files.length}/${max})` : 'Adicionar imagens';
    }
    function checkDims(f) {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => { resolve([img.naturalWidth, img.naturalHeight]); URL.revokeObjectURL(img.src); };
        img.onerror = () => resolve(null);
        img.src = URL.createObjectURL(f);
      });
    }
    input.addEventListener('change', async () => {
      const picked = Array.from(input.files || []);
      if (!picked.length) { sync(); return; }
      const ok = [];
      for (const f of picked) {
        if (!ACCEPT(input).includes(f.type)) {
          showErr(/hei[cf]/i.test(f.type + f.name) ? 'Fotos HEIC não são aceitas. Envie em JPG (no iPhone: Ajustes › Câmera › Formatos › Mais compatível).' : `"${f.name}": formato não aceito.`);
          continue;
        }
        if (f.size > maxMb * 1048576) { showErr(`"${f.name}" tem ${(f.size / 1048576).toFixed(1)} MB. O limite é ${maxMb} MB.`); continue; }
        if (isFachada) {
          const d = await checkDims(f);
          if (d && Math.min(d[0], d[1]) < 480) { showErr(`A foto tem ${d[0]}×${d[1]} px e ficou pequena demais. Envie uma foto maior.`); continue; }
          if (d && d[1] > d[0] * 1.15) showErr('Dica: fotos na horizontal costumam mostrar melhor a fachada inteira.');
          else showErr('');
        } else showErr('');
        ok.push(f);
      }
      files = max === 1 ? (ok.length ? [ok[0]] : files) : files.concat(ok).slice(0, max);
      if (max > 1 && files.length + ok.length > max && ok.length) showErr(`Máximo de ${max} imagens.`);
      sync();
    });
    slot._files = () => files;
    render();
  }

  // ---------------- Envio de formulários com upload ----------------
  function fieldError(form, name, msg) {
    const input = form.querySelector(`[name="${name}"]`);
    const holder = form.querySelector(`[data-error-for="${name}"]`) || (input && input.closest('[data-file-slot]') && $('[data-error]', input.closest('[data-file-slot]')));
    if (holder) { holder.textContent = msg; holder.hidden = false; return holder; }
    if (input) {
      const field = input.closest('.field, .consent') || input.parentElement;
      field.classList.add('has-error');
      let p = field.querySelector('.field-error');
      if (!p) { p = document.createElement('p'); p.className = 'field-error'; field.appendChild(p); }
      p.textContent = msg; p.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      return field;
    }
  }
  function clearErrors(form) {
    $$('.field-error', form).forEach((p) => { if (!p.closest('[data-file-slot]') || !p.textContent.startsWith('Dica')) { p.hidden = true; p.textContent = ''; } });
    $$('.has-error', form).forEach((e) => e.classList.remove('has-error'));
    $$('[aria-invalid]', form).forEach((e) => e.removeAttribute('aria-invalid'));
    const box = $('[data-form-error]', form); if (box) box.innerHTML = '';
  }
  function validate(form) {
    const errs = {};
    $$('input[required], textarea[required], select[required]', form).forEach((el) => {
      if (el.type === 'file') {
        const slot = el.closest('[data-file-slot]');
        if (slot && !slot._files().length) errs[el.name] = 'Envie o arquivo.';
      } else if (el.type === 'checkbox') {
        if (!el.checked) errs[el.name] = 'Confirme para continuar.';
      } else if (!el.value.trim()) errs[el.name] = 'Campo obrigatório.';
      else if (el.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(el.value.trim())) errs[el.name] = 'Informe um e-mail válido.';
      else if (el.type === 'tel' && el.value.replace(/\D/g, '').length < 10) errs[el.name] = 'Informe o WhatsApp com DDD.';
    });
    $$('[data-required-group]', form).forEach((g) => {
      if (!$$('input:checked', g).length) errs[g.dataset.requiredGroup] = 'Selecione pelo menos uma opção.';
    });
    const outra = form.querySelector('input[value="outra"]');
    if (outra && outra.checked && !form.querySelector('[name="outra"]').value.trim()) errs.outra = 'Conte qual alteração deseja testar.';
    return errs;
  }
  function showErrors(form, message, fields) {
    const box = $('[data-form-error]', form);
    if (box) box.innerHTML = '<div class="alert alert-error" role="alert"></div>', box.firstChild.textContent = message;
    let first = box;
    if (fields) {
      let firstField = null;
      Object.entries(fields).forEach(([k, v]) => { const el = fieldError(form, k, v); if (!firstField && el) firstField = el; });
      if (firstField && !box) first = firstField;
    }
    (first || form).scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function initUploadForm(form) {
    const btn = $('button[type="submit"]', form);
    const prog = $('[data-progress]', form);
    let busy = false;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (busy) return;
      clearErrors(form);
      const errs = validate(form);
      if (Object.keys(errs).length) return showErrors(form, 'Revise os campos destacados.', errs);
      busy = true;
      btn.disabled = true;
      const label = btn.textContent;
      btn.textContent = 'Enviando…';
      if (prog) prog.hidden = false;
      const xhr = new XMLHttpRequest();
      xhr.open('POST', form.action);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.upload.onprogress = (ev) => {
        if (!prog || !ev.lengthComputable) return;
        const p = Math.round((ev.loaded / ev.total) * 100);
        $('[data-progress-bar]', prog).style.width = p + '%';
        $('[data-progress-text]', prog).textContent = p < 100 ? `Enviando arquivos… ${p}%` : 'Salvando pedido…';
      };
      const fail = (msg, fields) => {
        busy = false; btn.disabled = false; btn.textContent = label; if (prog) prog.hidden = true;
        showErrors(form, msg, fields);
      };
      xhr.onload = () => {
        let j = null;
        try { j = JSON.parse(xhr.responseText); } catch (_) {}
        if (xhr.status >= 200 && xhr.status < 300 && j && j.redirect) { form.dispatchEvent(new Event('fv:sent')); window.location.assign(j.redirect); return; }
        fail((j && j.error) || 'Não foi possível enviar. Verifique sua conexão e tente novamente.', j && j.fields);
      };
      xhr.onerror = () => fail('Falha de conexão. Seus dados continuam aqui: tente enviar de novo.');
      xhr.send(new FormData(form)); // o mesmo "idem" evita pedido duplicado se o envio for repetido
    });
  }

  // ---------------- Utilidades ----------------
  function toast(msg) {
    let t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2200);
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); }
    catch (_) { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    toast('Link copiado');
  }

  document.addEventListener('DOMContentLoaded', () => {
    $$('[data-compare]').forEach(initCompare);
    $$('[data-print]').forEach((b) => b.addEventListener('click', () => window.print()));
    // Simulação feita no /criar: volta anexada ao novo pedido
    const simSlot = $('[data-simulacao-slot]');
    if (simSlot) {
      const store = { get: (k) => { try { return sessionStorage.getItem(k); } catch (_) { return null; } }, clear: () => { try { sessionStorage.setItem('fv-sim', ''); } catch (_) {} } };
      const url = store.get('fv-sim');
      const hint = $('[data-sim-hint]');
      if (url && /^data:image\/(jpeg|png);base64,/.test(url)) {
        const [head, b64] = url.split(','); const bin = atob(b64); const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        const type = head.slice(5).split(';')[0];
        const file = new File([u8], 'simulacao.' + (type === 'image/png' ? 'png' : 'jpg'), { type });
        const dt = new DataTransfer(); dt.items.add(file);
        $('[data-sim-input]', simSlot).files = dt.files;
        $('[data-sim-img]', simSlot).src = url;
        simSlot.hidden = false;
        if (hint) hint.hidden = true;
        const nome = store.get('fv-sim-nome') || '';
        const t = $('input[name=titulo]'); if (t && !t.value && nome) t.value = 'Placa para ' + nome;
        $('[data-sim-remove]', simSlot).addEventListener('click', () => {
          $('[data-sim-input]', simSlot).value = ''; simSlot.hidden = true; if (hint) hint.hidden = false; store.clear();
        });
      }
      const f = simSlot.closest('form');
      if (f) f.addEventListener('fv:sent', store.clear);
    }
    $$('[data-file-slot]').forEach(initSlot);
    $$('[data-upload-form]').forEach(initUploadForm);

    $$('[data-toggle]').forEach((cb) => {
      const target = $(cb.dataset.toggle);
      const upd = () => { target.hidden = !cb.checked; };
      cb.addEventListener('change', upd); upd();
    });
    $$('[data-copy]').forEach((b) => b.addEventListener('click', () => copy(b.dataset.copy)));
    $$('[data-share]').forEach((b) => b.addEventListener('click', async () => {
      const url = b.dataset.share;
      if (navigator.share) { try { await navigator.share({ title: document.title, text: b.dataset.shareText || '', url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
      copy(url);
    }));
    $$('form[data-once]').forEach((f) => f.addEventListener('submit', (e) => {
      if (f.dataset.sent) { e.preventDefault(); return; }
      f.dataset.sent = '1';
      $$('button', f).forEach((b) => { b.disabled = true; b.dataset.label = b.textContent; b.textContent = 'Aguarde…'; });
    }));
    $$('form[data-confirm]').forEach((f) => f.addEventListener('submit', (e) => { if (!confirm(f.dataset.confirm)) e.preventDefault(); }));
    $$('[data-wa-text]').forEach((ta) => {
      const a = ta.parentElement.querySelector('[data-wa-phone]');
      const upd = () => {
        let n = (a.dataset.waPhone || '').replace(/\D/g, '');
        if (n.length === 10 || n.length === 11) n = '55' + n;
        a.href = `https://wa.me/${n}?text=${encodeURIComponent(ta.value)}`;
      };
      ta.addEventListener('input', upd);
    });

    // Retorno do checkout: consulta o status confirmado pelo servidor
    const poll = $('[data-poll]');
    if (poll && !$('.state-ok', poll)) {
      let n = 0;
      const tick = async () => {
        n++;
        try {
          const r = await fetch(poll.dataset.poll, { headers: { Accept: 'application/json' }, cache: 'no-store' });
          const j = await r.json();
          if (j.paid) {
            $('[data-poll-icon]', poll).className = 'state-ok';
            $('[data-poll-title]', poll).textContent = 'Pagamento confirmado';
            $('[data-poll-text]', poll).textContent = 'Tudo certo! Você já pode seguir.';
            const btn = $('[data-poll-btn]', poll);
            btn.className = 'btn btn-primary btn-lg btn-block';
            btn.textContent = poll.dataset.next.startsWith('/pacote') ? 'Ver meus créditos' : 'Acompanhar pedido';
            return;
          }
        } catch (_) {}
        setTimeout(tick, n < 20 ? 3000 : 10000);
      };
      setTimeout(tick, 1500);
    }
  });
})();
