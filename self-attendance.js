(() => {
  const waitForApp = (callback) => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback, { once: true });
    } else {
      callback();
    }
  };

  waitForApp(() => {
    if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return;

    const client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    const groupId = window.FOOTBALL_GROUP_ID || 'vriendengroep';
    const dateInput = document.querySelector('#next-match-date');
    const anchor = document.querySelector('.assignment-card');
    if (!anchor || !dateInput) return;

    const style = document.createElement('style');
    style.textContent = `
      .self-attendance {
        margin-top: 18px;
        padding: 16px;
        background: rgba(42, 49, 57, 0.92);
        border: 1px solid rgba(181, 197, 214, 0.12);
        border-radius: 18px;
      }
      .self-attendance-title {
        margin: 0;
        font-size: 1.05rem;
      }
      .self-attendance-help {
        margin: 5px 0 12px;
        color: #a9b4c0;
        font-size: .86rem;
      }
      .self-attendance-controls {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .self-attendance select {
        flex: 1;
        min-width: 0;
        padding: 11px 12px;
        color: #edf2f7;
        background: rgba(255,255,255,.06);
        border: 1px solid rgba(181,197,214,.18);
        border-radius: 10px;
        font: inherit;
      }
      .self-toggle {
        width: 52px;
        height: 30px;
        padding: 0;
        border: 0;
        border-radius: 999px;
        background: rgba(255,255,255,.18);
        cursor: pointer;
        position: relative;
        flex: 0 0 auto;
      }
      .self-toggle::after {
        content: '';
        position: absolute;
        top: 4px;
        left: 4px;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: white;
        transition: left .15s ease;
      }
      .self-toggle.active { background: #34d399; }
      .self-toggle.active::after { left: 26px; }
      .self-toggle:disabled { opacity: .45; cursor: not-allowed; }
      .self-attendance-status {
        margin-top: 10px;
        color: #a9b4c0;
        font-size: .86rem;
      }
      .self-attendance-status.present { color: #6ee7b7; }
    `;
    document.head.appendChild(style);

    const section = document.createElement('section');
    section.className = 'self-attendance';
    section.innerHTML = `
      <h2 class="self-attendance-title">Ben je erbij?</h2>
      <p class="self-attendance-help">Kies je naam en zet het schuifje aan of uit.</p>
      <div class="self-attendance-controls">
        <select aria-label="Kies je naam">
          <option value="">Kies je naam</option>
        </select>
        <button class="self-toggle" type="button" aria-label="Aanwezigheid aanpassen" aria-pressed="false" disabled></button>
      </div>
      <div class="self-attendance-status">Nog geen naam gekozen</div>
    `;
    anchor.parentNode.insertBefore(section, anchor);

    const select = section.querySelector('select');
    const toggle = section.querySelector('.self-toggle');
    const status = section.querySelector('.self-attendance-status');
    let players = [];
    let present = new Set();

    const currentDate = () => dateInput.value || new Date().toISOString().slice(0, 10);

    const load = async () => {
      const date = currentDate();
      const [playersResult, attendanceResult] = await Promise.all([
        client.from('players').select('id,name').eq('group_id', groupId).order('name'),
        client.from('attendance').select('player_id').eq('group_id', groupId).eq('round_date', date),
      ]);
      if (playersResult.error || attendanceResult.error) {
        console.error('Aanwezigheid laden mislukt', playersResult.error || attendanceResult.error);
        status.textContent = 'Aanwezigheid kon niet worden geladen';
        return;
      }
      players = playersResult.data || [];
      present = new Set((attendanceResult.data || []).map((row) => row.player_id));
      const previous = select.value;
      select.innerHTML = '<option value="">Kies je naam</option>' + players
        .map((player) => `<option value="${escapeHtml(player.id)}">${escapeHtml(player.name)}</option>`)
        .join('');
      if (players.some((player) => player.id === previous)) select.value = previous;
      update();
    };

    const update = () => {
      const selectedId = select.value;
      const isPresent = selectedId ? present.has(selectedId) : false;
      toggle.disabled = !selectedId;
      toggle.classList.toggle('active', isPresent);
      toggle.setAttribute('aria-pressed', String(isPresent));
      if (!selectedId) status.textContent = 'Nog geen naam gekozen';
      else if (isPresent) {
        status.textContent = 'Je bent aangemeld voor deze wedstrijd ✓';
        status.classList.add('present');
      } else {
        status.textContent = 'Je bent afgemeld voor deze wedstrijd';
        status.classList.remove('present');
      }
    };

    select.addEventListener('change', update);
    toggle.addEventListener('click', async () => {
      const playerId = select.value;
      if (!playerId) return;
      const shouldAttend = !present.has(playerId);
      toggle.disabled = true;
      const result = shouldAttend
        ? await client.from('attendance').upsert({
            group_id: groupId,
            round_date: currentDate(),
            player_id: playerId,
            assigned_player_id: null,
          }, { onConflict: 'group_id,round_date,player_id' })
        : await client.from('attendance').delete().match({
            group_id: groupId,
            round_date: currentDate(),
            player_id: playerId,
          });
      if (result.error) {
        alert(result.error.message);
      } else {
        await load();
      }
      toggle.disabled = false;
      update();
    });

    dateInput.addEventListener('change', load);
    client.channel('self-attendance')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance', filter: `group_id=eq.${groupId}` }, load)
      .subscribe();

    const escapeHtml = (value) => String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    load();
  });
})();
