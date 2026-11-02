(function (root) {
  'use strict';
  const normalizePath = path => String(path || '').replace(/\\/g, '/').toLowerCase();
  const hash = value => { let n = 2166136261; for (let i=0;i<value.length;i++) n=Math.imul(n ^ value.charCodeAt(i),16777619); return (n>>>0).toString(36); };
  function category(file) {
    const ext = String(file.name || '').split('.').pop().toLowerCase();
    if (file.isImage || /^image\//.test(file.type || '') || /^(png|jpe?g|webp|gif|svg|bmp|avif)$/.test(ext)) return 'Images';
    if (ext === 'pdf') return 'PDFs';
    if (/^(js|jsx|ts|tsx|py|java|c|cpp|cs|html|css|json|sql|sh|ps1|yml|yaml)$/.test(ext)) return 'Code';
    if (/^(txt|md|doc|docx|rtf|odt|csv|xlsx?|pptx?)$/.test(ext)) return 'Documents';
    return 'Other';
  }
  function collect(sessions) {
    const assets = new Map();
    const add = (file, sessionId, session, ref) => {
      if (!file || !file.name) return;
      const path = file.path || file.filePath || '';
      const key = path ? 'path:'+normalizePath(path) : file.assetId ? 'id:'+file.assetId : file.dataUrl ? 'image:'+hash(file.dataUrl) : 'legacy:'+sessionId+':'+ref.messageIndex+':'+file.name;
      let asset=assets.get(key);
      if (!asset) { asset={key,name:file.name,path,size:Number(file.size)||0,type:file.type||'',dataUrl:file.dataUrl||'',category:category(file),at:Date.parse(session.updatedAt||session.createdAt)||Number(file.at)||0,refs:[],chats:[]};assets.set(key,asset); }
      if (!asset.dataUrl && file.dataUrl) asset.dataUrl=file.dataUrl;
      asset.refs.push({sessionId,...ref,name:file.name});
      if (!asset.chats.some(chat=>chat.id===sessionId)) asset.chats.push({id:sessionId,title:session.title||'New chat',projectId:session.projectId||'personal',messageIndex:ref.messageIndex});
    };
    for (const [sessionId,session] of Object.entries(sessions || {})) {
      const represented = new Set();
      (session.messages || []).forEach((message,messageIndex) => {
        if (message.isAi || message.sender === 'Ultron' || message.sender === 'Brown') return;
        for (const field of ['attachments','references']) (message[field] || []).forEach((file,index)=>{
          add(file,sessionId,session,{messageIndex,field,index});represented.add(messageIndex+':'+file.name);
        });
      });
      (session.activity?.uploads || []).forEach((file,index)=>{
        if (!represented.has(file.messageIndex+':'+file.name)) add(file,sessionId,session,{field:'uploads',index,messageIndex:file.messageIndex});
      });
    }
    return [...assets.values()];
  }
  function remove(sessions, asset) {
    for (const [sessionId,session] of Object.entries(sessions)) {
      const refs=asset.refs.filter(ref=>ref.sessionId===sessionId);
      if (!refs.length) continue;
      (session.messages || []).forEach((message,messageIndex)=>{
        for(const field of ['attachments','references']) if(Array.isArray(message[field])) {
          const indexes=new Set(refs.filter(ref=>ref.field===field&&ref.messageIndex===messageIndex).map(ref=>ref.index));
          message[field]=message[field].filter((_,index)=>!indexes.has(index));
        }
      });
      if(Array.isArray(session.activity?.uploads)) session.activity.uploads=session.activity.uploads.filter((file,index)=>!refs.some(ref=>ref.field==='uploads'?ref.index===index:ref.messageIndex===file.messageIndex&&file.name===ref.name));
    }
  }
  const previewUrl = asset => {
    if (asset.category!=='Images') return '';
    if (/^data:image\/(?:png|jpeg|webp|gif|bmp|avif);base64,/i.test(asset.dataUrl)) return asset.dataUrl;
    if (/^[a-z]:[\\/]/i.test(asset.path)) return 'file:///'+asset.path.replace(/\\/g,'/').split('/').map(encodeURIComponent).join('/').replace(/^([a-z])%3A/i,'$1:');
    return '';
  };
  function init(hooks) {
    let dialog=null, selected=null, query='',filter='All',sort='newest',view='grid';
    let previewObserver;
    const previews=new Map(), previewQueue=[];let previewJobs=0;
    const pumpPreviews=()=>{while(previewJobs<2&&previewQueue.length){const {asset,resolve}=previewQueue.shift();previewJobs++;Promise.resolve().then(()=>hooks.preview?.(asset.path)).catch(()=>null).then(resolve).finally(()=>{previewJobs--;pumpPreviews();});}};
    const loadPreview=asset=>{
      if(!previews.has(asset.key))previews.set(asset.key,new Promise(resolve=>{previewQueue.push({asset,resolve});pumpPreviews();}));
      return previews.get(asset.key);
    };
    const node=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!=null)el.textContent=text;return el;};
    const action=(label,callback,cls='')=>{const el=node('button',cls,label);el.type='button';el.onclick=()=>Promise.resolve().then(callback).catch(error=>hooks.error?.(error));return el;};
    function close() {
      if (!dialog) return;
      previewObserver?.disconnect();
      dialog.remove();dialog=null;
      document.querySelector('.chat-main')?.classList.remove('assets-open');
      document.getElementById('nav-assets')?.classList.remove('active');
      hooks.afterClose?.();
    }
    function open() {
      if(dialog?.isConnected){dialog.focus();return;}
      hooks.beforeOpen?.();
      previews.clear();
      const main=document.querySelector('.chat-main');if(!main)throw Error('The Assets page could not open.');
      dialog=node('section','brown-assets-dialog brown-assets-page');dialog.setAttribute('aria-label','Assets');dialog.setAttribute('tabindex','-1');
      main.classList.add('assets-open');document.getElementById('nav-assets')?.classList.add('active');
      const header=node('header','brown-assets-header'),titles=node('div');titles.append(node('h2',null,'Assets'),node('p',null,'Files shared across your chats'));
      header.append(titles);
      const tools=node('div','brown-assets-toolbar');const search=node('input');search.type='search';search.placeholder='Search files or chats';search.setAttribute('aria-label','Search assets');search.value=query;
      const filters=node('select');filters.setAttribute('aria-label','Filter assets');for(const name of ['All','Images','PDFs','Documents','Code','Other']){const option=node('option',null,name);filters.append(option);}filters.value=filter;
      const sortOptions=[['newest','Newest first'],['name','Name A–Z']];
      const sorting=node('button','brown-assets-sort');sorting.type='button';sorting.setAttribute('aria-label','Sort assets');sorting.setAttribute('aria-haspopup','menu');sorting.setAttribute('aria-expanded','false');
      sorting.title='Filter and sort';sorting.innerHTML='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>';
      const sortMenu=node('div','brown-assets-sort-menu');sortMenu.setAttribute('popover','auto');sortMenu.setAttribute('role','menu');sortMenu.setAttribute('aria-label','Sort order');
      const refreshSort=()=>{sorting.title='Filter and sort · '+sortOptions.find(([value])=>value===sort)[1];for(const item of sortMenu.children)item.setAttribute('aria-checked',String(item.dataset.value===sort));};
      for(const [value,label] of sortOptions){const item=action(label,()=>{sort=value;refreshSort();sortMenu.hidePopover();sorting.focus();draw();},'brown-assets-sort-option');item.dataset.value=value;item.setAttribute('role','menuitemradio');sortMenu.append(item);}
      const openSort=()=>{
        sortMenu.showPopover();const rect=sorting.getBoundingClientRect();
        sortMenu.style.left=Math.max(8,Math.min(rect.right-sortMenu.offsetWidth,window.innerWidth-sortMenu.offsetWidth-8))+'px';
        sortMenu.style.top=Math.max(8,Math.min(rect.bottom+6,window.innerHeight-sortMenu.offsetHeight-8))+'px';
        sortMenu.querySelector('[aria-checked="true"]').focus();
      };
      sorting.onclick=()=>sortMenu.matches(':popover-open')?sortMenu.hidePopover():openSort();
      sorting.onkeydown=event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();openSort();}};
      sortMenu.addEventListener('toggle',event=>sorting.setAttribute('aria-expanded',String(event.newState==='open')));
      sortMenu.onkeydown=event=>{
        const items=[...sortMenu.children],index=items.indexOf(document.activeElement);
        if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length].focus();}
        if(event.key==='Escape'){event.preventDefault();sortMenu.hidePopover();sorting.focus();}
      };
      refreshSort();

      const tabs=node('div','brown-assets-tabs');tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Asset types');
      for(const name of ['All','Images','PDFs','Documents','Code','Other']) {const tab=action(name,()=>{filter=name;filters.value=name;draw();},'brown-assets-tab');tab.dataset.filter=name;tabs.append(tab);}
      const gridView=action('▦',()=>{view='grid';draw();},'brown-assets-view');gridView.setAttribute('aria-label','Grid view');
      const listView=action('☷',()=>{view='list';draw();},'brown-assets-view');listView.setAttribute('aria-label','List view');
      gridView.innerHTML='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>';
      listView.innerHTML='<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M8 5h13M8 12h13M8 19h13M3 5h1M3 12h1M3 19h1"/></svg>';
      filters.hidden=true;tools.append(tabs,search,filters,sorting,gridView,listView);const body=node('div','brown-assets-body'),grid=node('div','brown-assets-grid'),detail=node('aside','brown-assets-detail');body.append(grid,detail);
      const count=node('p','brown-assets-count');count.setAttribute('role','status');dialog.append(header,tools,count,body,sortMenu);
      let detailMotion=null, detailEpoch=0;
      const reducedMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const closeDetail=async()=>{
        const epoch=++detailEpoch;
        detailMotion?.cancel();
        if(!reducedMotion()) {
          detailMotion=detail.animate([{opacity:1,transform:'translateX(0)'},{opacity:0,transform:'translateX(16px)'}],{duration:160,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'});
          try {await detailMotion.finished;} catch {return;}
        }
        if(epoch!==detailEpoch||!dialog?.isConnected)return;
        selected=null;draw();
        grid.querySelector('.brown-asset-card')?.focus({preventScroll:true});
      };
      const draw=()=>{
        previewObserver?.disconnect();
        previewObserver=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){previewObserver.unobserve(entry.target);entry.target.loadAssetPreview?.();}},{root:grid,rootMargin:'200px'});
        const wasHidden=detail.hidden || !body.classList.contains('has-detail');
        ++detailEpoch;detailMotion?.cancel();detailMotion=null;
        for(const tab of tabs.children)tab.setAttribute('aria-pressed',String(tab.dataset.filter===filter));
        gridView.setAttribute('aria-pressed',String(view==='grid'));listView.setAttribute('aria-pressed',String(view==='list'));grid.classList.toggle('is-list',view==='list');
        const all=collect(hooks.sessions());const matching=all.filter(asset=>(filter==='All'||asset.category===filter)&&[asset.name,asset.path,...asset.chats.map(chat=>chat.title)].some(value=>value.toLowerCase().includes(query.toLowerCase()))).sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):b.at-a.at);
        count.textContent=matching.length+' '+(matching.length===1?'asset':'assets')+' · '+all.length+' total';grid.replaceChildren();detail.replaceChildren();
        selected=matching.find(asset=>asset.key===selected)?.key||null;detail.hidden=!selected;body.classList.toggle('has-detail',Boolean(selected));
        if(selected&&wasHidden&&!reducedMotion()) detailMotion=detail.animate([{opacity:0,transform:'translateX(20px)'},{opacity:1,transform:'translateX(0)'}],{duration:220,easing:'cubic-bezier(.16,1,.3,1)'});
        if(!matching.length){grid.append(node('p','brown-assets-empty',all.length?'No matching assets.':'No files shared yet. Attach a file in a chat to see it here.'));return;}
        for(const asset of matching){const card=action('',()=>{selected=asset.key;draw();},'brown-asset-card');card.setAttribute('aria-pressed',String(asset.key===selected));
          card.dataset.kind=asset.category;
          const thumb=node('div','brown-asset-thumb');
          const glyph=node('span','brown-asset-file-glyph');glyph.innerHTML='<svg viewBox="0 0 48 56" width="42" height="50" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M28 3H9a5 5 0 0 0-5 5v40a5 5 0 0 0 5 5h30a5 5 0 0 0 5-5V19Z"/><path d="M28 3v12a4 4 0 0 0 4 4h12"/></svg>';thumb.append(glyph,node('span',null,asset.name.includes('.')?asset.name.split('.').pop().toUpperCase():'FILE'));
          thumb.loadAssetPreview=()=>showPreview(asset,thumb);previewObserver.observe(thumb);
          const name=node('strong',null,asset.name);name.title=asset.name;card.append(name,thumb,node('span','brown-asset-meta',asset.category+' · '+asset.chats.length+' '+(asset.chats.length===1?'chat':'chats')));grid.append(card);
        }
        if(!selected)return;
        const asset=matching.find(asset=>asset.key===selected);detail.append(node('h3',null,asset.name),node('p','brown-asset-meta',asset.category+(asset.size?' · '+(asset.size/1024).toFixed(1)+' KB':'')));
        const url=previewUrl(asset),preview=node('div','brown-asset-detail-preview');preview.hidden=true;detail.append(preview);showPreview(asset,preview);
        if(asset.path){const path=node('p','brown-asset-path',asset.path);detail.append(path);const actions=node('div','brown-asset-actions');actions.append(action('Open file',()=>hooks.openFile(asset.path)),action('Show in folder',()=>hooks.reveal(asset.path)));detail.append(actions);}
        else if(!url)detail.append(node('p','brown-asset-meta','Original file unavailable for this older upload. You can still open its chat.'));
        detail.append(action('×',closeDetail,'brown-assets-detail-close'));
        detail.append(node('h4',null,'Used in chats'));for(const chat of asset.chats)detail.append(action(chat.title,async()=>{await hooks.openChat(chat.id,chat.title,chat.messageIndex);close();},'brown-asset-chat'));
        detail.append(action('Delete asset',async()=>{
          if(hooks.busy?.())throw Error('Stop the current response before deleting an asset.');
          const confirmed=await hooks.confirm({title:'Delete asset?',message:`Remove "${asset.name}" from attached files in all ${asset.chats.length} linked chat(s)? Original files and chat text will be kept.`,confirmText:'Delete asset',cancelText:'Cancel',destructive:true});
          if(confirmed){if(hooks.busy?.())throw Error('Stop the current response before deleting an asset.');const sessions=hooks.sessions(),fresh=collect(sessions).find(item=>item.key===asset.key);if(fresh){
            const backups=fresh.chats.map(chat=>{const session=sessions[chat.id];return {session,uploads:session.activity?.uploads,messages:(session.messages||[]).map(message=>({message,attachments:message.attachments,references:message.references}))};});
            remove(sessions,fresh);
            try {await hooks.save();} catch(error) {for(const backup of backups){if(backup.session.activity)backup.session.activity.uploads=backup.uploads;for(const entry of backup.messages){entry.message.attachments=entry.attachments;entry.message.references=entry.references;}}draw();throw error;}
            await hooks.changed?.();
          }}
          if(dialog?.isConnected)draw();else open();
        },'brown-asset-delete'));
      };
      async function showPreview(asset,container,fromDisk=false) {
        let result;
        if(!fromDisk&&/^data:image\//i.test(previewUrl(asset)))result={dataUrl:previewUrl(asset)};
        else if(asset.path&&hooks.preview)result=await loadPreview(asset);
        if(!container.isConnected)return;
        const url=result?.dataUrl||(!fromDisk?previewUrl(asset):'');
        if(url&&(/^(?:data:image\/(?:png|jpeg|webp|gif|bmp|avif);base64,|file:\/\/\/)/i.test(url))){
          const image=node('img');image.alt='Preview of '+asset.name;image.loading='eager';
          image.onerror=()=>{image.remove();if(!fromDisk&&asset.path&&hooks.preview)showPreview(asset,container,true);};
          // Keep the file icon until loading succeeds.
          image.hidden=true;container.append(image);image.onload=()=>{if(!container.isConnected)return;image.hidden=false;container.replaceChildren(image);container.hidden=false;container.classList.add('has-preview');};
          image.src=url;
        }else if(result?.text){const text=node('pre','brown-asset-text-preview',result.text);container.replaceChildren(text);container.hidden=false;container.classList.add('has-preview');}
      }
      search.oninput=()=>{query=search.value;draw();};filters.onchange=()=>{filter=filters.value;draw();};
      main.append(dialog);draw();search.focus();
    }
    return {open,close,isOpen:()=>Boolean(dialog?.isConnected)};
  }
  const api={collect,remove,category,init};if(typeof module!=='undefined')module.exports=api;root.BrownAssetsGallery=api;
})(typeof window==='undefined'?globalThis:window);
