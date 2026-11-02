(function (root) {
    'use strict';
    const folder = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v2H6a2 2 0 0 0-2 1.5L2 19V7Z"/><path d="M4 10h17l-3 10H2Z"/></svg>';
    const chevron = '<svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m7 4 6 6-6 6"/></svg>';
    const plus = '<svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg>';
    const clock = '<svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="M10 6v4l3 2"/></svg>';
    function contentState(initial) {
      let seen = null, open = initial !== false;
      return { get open() { return open; }, toggle() { open = !open; }, sync(ids) {
        if (seen === null) open = ids.length > 0 && initial !== false;
        else if (!ids.length && seen.size) open = false;
        else if (ids.some(id => !seen.has(id))) open = true;
        seen = new Set(ids);
      } };
    }
    function setDisclosure(section, body, button, open) {
      section.classList.toggle('is-collapsed', !open);
      body.classList.toggle('is-open', open);
      body.setAttribute('aria-hidden', String(!open)); body.inert = !open;
      button.setAttribute('aria-expanded', String(open));
    }
    function init({ container, store, storage, hooks }) {
      let saved, closed = new Set(), showAll = false;
      try { saved = storage.getItem('brown-project-sidebar-open'); closed = new Set(JSON.parse(storage.getItem('brown-project-sidebar-closed') || '[]')); } catch {}
      const sectionState = contentState(saved === null || saved === undefined ? undefined : saved !== 'false');
      const groups = new Map();
      const node = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; };
      const button = (cls, text, title, action) => { const el = node('button', cls, text); el.type = 'button'; el.title = title; el.setAttribute('aria-label', title); el.addEventListener('click', event => { event.stopPropagation(); Promise.resolve().then(action).catch(error => hooks.error(error)); }); return el; };
      const persist = () => { try { storage.setItem('brown-project-sidebar-open', String(sectionState.open)); storage.setItem('brown-project-sidebar-closed', JSON.stringify([...closed])); } catch {} };
      function render() {
        if (!container) return;
        const state = hooks.state(), projects = store.list().filter(project => project.id !== 'personal');
        sectionState.sync(projects.map(p => p.id));
        persist();
        const previousHeading = container.querySelector(':scope > .project-sidebar-heading');
        const body = container.querySelector(':scope > .sidebar-collapse') || node('div', 'sidebar-collapse');
        const list = body.querySelector('.project-sidebar-list') || node('div', 'project-sidebar-list');
        const heading = node('div', 'project-sidebar-heading');
        const toggle = button('project-sidebar-section-toggle', null, 'Toggle projects', () => { sectionState.toggle(); persist(); setDisclosure(container, body, toggle, sectionState.open); });
        const headingIcon = node('span', 'sidebar-section-icon'); headingIcon.innerHTML = folder;
        const arrow = node('span', 'project-sidebar-chevron'); arrow.innerHTML = chevron;
        toggle.append(headingIcon, node('span', '', 'Projects'), arrow);
        const create = button('project-sidebar-icon-button', null, 'Create project', () => hooks.create()); create.innerHTML = plus;
        heading.append(toggle, create);
        if (previousHeading) previousHeading.replaceWith(heading); else container.prepend(heading);
        if (!list.parentElement) body.append(list);
        if (!body.parentElement) container.append(body);
        list.replaceChildren();
        setDisclosure(container, body, toggle, sectionState.open);
        if (!projects.length) list.append(node('p', 'project-sidebar-empty', 'No Projects'));
        for (const project of showAll ? projects : projects.slice(0, 5)) {
          const sessions = Object.values(state.sessions).filter(session => session.projectId === project.id).sort((a,b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
          if (!groups.has(project.id)) groups.set(project.id, contentState(closed.has(project.id) ? false : undefined));
          const groupState = groups.get(project.id); groupState.sync(sessions.map(s => s.id));
          if (groupState.open) closed.delete(project.id); else closed.add(project.id);
          const group = node('div', 'project-sidebar-group' + (store.active() === project.id ? ' is-active' : '') + (sessions.length ? ' has-chats' : '')); group.dataset.projectId = project.id;
          const row = node('div', 'project-sidebar-project');
          const select = button('project-sidebar-name', null, project.name, () => {
            groupState.toggle(); if (groupState.open) closed.delete(project.id); else closed.add(project.id); persist(); setDisclosure(group, collapse, select, groupState.open);
          });
          const icon = node('span', 'project-sidebar-folder'); icon.innerHTML = folder; select.append(icon, node('span', 'project-sidebar-label', project.name));
          const projectArrow = node('span', 'project-sidebar-chevron'); projectArrow.innerHTML = chevron; projectArrow.setAttribute('aria-hidden', 'true'); select.append(projectArrow);
          if (store.active() === project.id) select.setAttribute('aria-current', 'true');
          const actions = node('div', 'project-sidebar-project-actions');
          const add = button('project-sidebar-icon-button', null, 'New chat in ' + project.name, () => hooks.newChat(project.id)); add.innerHTML = plus;
          const projectMenu = button('project-sidebar-icon-button', '⋯', 'Settings for ' + project.name, () => hooks.menu ? hooks.menu(project.id, projectMenu) : hooks.settings(project.id));
          projectMenu.setAttribute('aria-haspopup', 'menu'); projectMenu.setAttribute('aria-expanded', 'false');
          actions.append(add, projectMenu);
          row.append(select, actions); group.append(row); list.append(group);
          const collapse = node('div', 'sidebar-collapse project-sidebar-chat-collapse'), chats = node('div', 'project-sidebar-chats'); collapse.append(chats); group.append(collapse); setDisclosure(group, collapse, select, groupState.open);
          if (!sessions.length) chats.append(node('div', 'project-sidebar-empty', 'No chats'));
          for (const session of sessions) {
            const chat = node('div', 'nav-item session-history-item' + (state.currentSessionId === session.id ? ' active' : '')); chat.dataset.sessionId = session.id;
            const connector=node('span','project-chat-connector');connector.setAttribute('aria-hidden','true');connector.innerHTML='<svg viewBox="0 0 36 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M.75 1v1a6 6 0 0 0 6 6h27m-5-4 5 4-5 4"/></svg>';chat.append(connector);
            const openChat = button('project-sidebar-chat-title session-row-text', null, session.title || 'New chat', () => hooks.openChat(session.id, session.title));
            const title = node('span', 'nav-text'); title.append(node('span', 'nav-text-inner', session.title || 'New chat')); openChat.append(title); chat.append(openChat);
            if (session.starred) {
              const star = node('span', 'session-star-badge', '★');
              star.title = 'Starred chat'; star.setAttribute('aria-label', 'Starred chat'); chat.prepend(star);
            }
            const menu = button('session-menu-btn', '⋯', 'Chat options', () => hooks.chatMenu(session.id, menu));
            menu.setAttribute('aria-haspopup', 'menu'); menu.setAttribute('aria-expanded', 'false');
            chat.append(menu); chats.append(chat);
          }
        }
        if (projects.length > 5) list.append(button('project-sidebar-show-more', showAll ? 'Show fewer' : 'Show more', 'Show more projects', () => { showAll = !showAll; render(); }));
        persist();
      }
      render(); return { render };
    }
    function initRecents({ container, list, storage, hooks }) {
      if (!container || !list) return { render() {} };
      const button = container.querySelector('.project-sidebar-section-toggle'), body = container.querySelector('.sidebar-collapse');
      let saved; try { saved = storage.getItem('brown-recents-sidebar-open'); } catch {}
      const state = contentState(saved === null || saved === undefined ? undefined : saved !== 'false');
      button.querySelector('.sidebar-section-icon').innerHTML = clock;
      button.querySelector('.project-sidebar-chevron').innerHTML = chevron;
      const create = container.querySelector('.recents-new-chat');
      if (create) {
        create.innerHTML = plus;
        create.addEventListener('click', event => {
          event.stopPropagation();
          Promise.resolve().then(() => hooks.newChat?.()).catch(error => hooks.error?.(error));
        });
      }
      button.addEventListener('click', () => { state.toggle(); try { storage.setItem('brown-recents-sidebar-open', String(state.open)); } catch {} setDisclosure(container, body, button, state.open); });
      function render() {
        const sessions = hooks.sessions();
        state.sync(Object.keys(sessions).filter(id => (sessions[id].projectId || 'personal') === 'personal'));
        try { storage.setItem('brown-recents-sidebar-open', String(state.open)); } catch {}
        if (!list.children.length) { const empty = document.createElement('p'); empty.className = 'project-sidebar-empty'; empty.textContent = 'No chats'; list.append(empty); }
        setDisclosure(container, body, button, state.open);
      }
      render(); return { render };
    }
    root.BrownProjectSidebar = { init, initRecents, contentState };
    if (typeof module !== 'undefined')
        module.exports = { init, initRecents, contentState };
})(typeof window === 'undefined' ? globalThis : window);
