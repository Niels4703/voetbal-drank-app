(() => {
  const ready = (fn) => document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', fn, { once: true })
    : fn();

  ready(() => {
    if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return;
    const client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    const groupId = window.FOOTBALL_GROUP_ID || 'vriendengroep';
    const dateInput = document.querySelector('#next-match-date');
    const anchor = document.querySelector('#attendance-panel');
    if (!dateInput || !anchor) return;

    const style = document.createElement('style');
    style.textContent = `
      .guest-controls { margin-top: 14px; padding: 14px; background: rgba(255,255,255,.05); border-radius: 14px; }
      .guest-controls-row { display:flex; align-items:center; justify-content:space-between; gap:12px; }
      .guest-controls h3 { margin:0; font-size:1rem; }
      .guest-controls p { margin:4px 0 0; color:#a9b4c0; font-size:.82rem; }
      .guest-counter { display:flex; align-items:center; gap:10px; }
      .guest-counter button { width:30px; height:30px; border:0; border-radius:8px; background:rgba(255,255,255,.1); color:#edf2f7; font-size:1.2rem; cursor:pointer; }
      .guest-counter button:disabled { opacity:.4; cursor:not-allowed; }
      .guest-count { min-width:24px; text-align:center; font-weight:800; }
    `;
    document.head.appendChild(style);

    const section = document.createElement('section');
    section.className = 'guest-controls';
    section.innerHTML = `
      <div class="guest-controls-row">
        <div><h3>Gastspelers</h3><p>Tel gasten mee voor deze wedstrijd</p></div>
        <div class="guest-counter">
          <button type="button" data-guest-change="-1" aria-label="Gastspeler verwijderen">−</button>
          <span class="guest-count">0</span>
          <button type="button" data-guest-change="1" aria-label="Gastspeler toevoegen">+</button>
        </div>
      </div>
    `;
    anchor.insertAdjacentElement('afterend', section);
    const countElement = section.querySelector('.guest-count');
    const buttons = [...section.querySelectorAll('button')];
    let guestCount = 0;

    const date = () => dateInput.value || new Date().toISOString().slice(0, 10);
    const render = () => {
      countElement.textContent = String(guestCount);
      buttons[0].disabled = guestCount === 0;
    };
    const load = async () => {
      const { data, error } = await client.from('match_settings')
        .select('guest_count').eq('group_id', groupId).maybeSingle();
      if (error) { console.error('Gastspelers laden mislukt', error); return; }
      guestCount = Math.max(0, Number(data?.guest_count || 0));
      render();
    };
    const save = async (change) => {
      const next = Math.max(0, guestCount + change);
      const { error } = await client.from('match_settings').upsert({
        group_id: groupId,
        next_match_date: date(),
        current_status: 'open',
        guest_count: next,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'group_id' });
      if (error) { alert(error.message); return; }
      guestCount = next;
      render();
      window.dispatchEvent(new CustomEvent('guest-count-changed', { detail: next }));
    };
    buttons.forEach((button) => button.addEventListener('click', () => save(Number(button.dataset.guestChange))));
    dateInput.addEventListener('change', load);
    load();
  });
})();
