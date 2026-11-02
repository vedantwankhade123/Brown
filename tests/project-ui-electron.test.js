const {app,BrowserWindow,session}=require('electron');
const path=require('path'),fs=require('fs');
app.whenReady().then(async()=>{
  const w=new BrowserWindow({show:false,width:1100,height:850,webPreferences:{offscreen:true,backgroundThrottling:false,partition:'workspace-ui-test'}});
  try {
    w.webContents.session.webRequest.onBeforeRequest((d,done)=>done({cancel:d.resourceType==='script'}));
    await w.loadFile(path.resolve('src/renderer/index.html'));
    w.webContents.debugger.attach('1.3');
    await w.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
    for(const file of ['project-workspaces.js','model-health.js','project-workspace-ui.js','project-sidebar.js'])await w.webContents.executeJavaScript(fs.readFileSync('src/renderer/'+file,'utf8'));
    for (const [width,height] of [[1100,850],[900,600]]) {
    w.setSize(width,height);await new Promise(resolve=>setTimeout(resolve,120));
    const result=await w.webContents.executeJavaScript(`(async()=>{
      function checkCentered(dialog) {
        const r=dialog.getBoundingClientRect();
        if(Math.abs(r.left+r.width/2-innerWidth/2)>1||Math.abs(r.top+r.height/2-innerHeight/2)>1)throw Error('Dialog is not centered: '+JSON.stringify({left:r.left,top:r.top,width:r.width,height:r.height}));
        if(r.width>520||r.height>Math.min(640,innerHeight-48))throw Error('Dialog is not compact');
      }
      localStorage.clear();window.indexCalls=0;window.testWorkspaceStore=BrownProjectWorkspaces.createStore(localStorage);
      window.fetch=async url=>new Response(JSON.stringify(url.endsWith('version')?{version:'test'}:url.endsWith('tags')?{models:[{name:'phi3',size:2000000000}]}:{models:[]}));
      window.selectedProject=null;window.chosenModel=null;
      const panels=BrownWorkspaceUI.init({store:testWorkspaceStore,api:{ragGetStats:async()=>({success:true,sources:[{path:'D:/auth',name:'auth',isDirectory:true}]}),selectDirectory:async()=>({filePaths:['D:/auth','D:/docs','D:/extra']}),ragAddSources:async paths=>{window.indexCalls=(window.indexCalls||0)+1;return {success:true};},getSystemEnvironment:async()=>({freeMemoryGB:6})},hooks:{models:()=>[{name:'phi3'}],busy:()=>false,activate:async p=>{selectedProject=p;},chooseModel:name=>{chosenModel=name;}}});
      await panels.projects();
      let dialog=document.querySelector('dialog');checkCentered(dialog);
      if(dialog.getBoundingClientRect().width>440)throw Error('New workspace panel is too wide');
      if(getComputedStyle(dialog).overflowY!=='hidden'||dialog.scrollHeight>dialog.clientHeight+1)throw Error('Create form scrolls');
      if(dialog.querySelector('select')||dialog.querySelector('textarea'))throw Error('Creation contains unnecessary preferences');
      const name=dialog.querySelector('[aria-label="Project name"]');name.value='Authentication';name.dispatchEvent(new Event('input'));
      dialog.querySelector('.brown-project-add').click();await new Promise(r=>setTimeout(r,20));
      if(window.indexCalls)throw Error('Folder picker indexed before Create was clicked');
      if(dialog.querySelectorAll('.brown-project-folder-row').length!==1)throw Error('Project must have exactly one selected folder');
      if(dialog.querySelector('.brown-project-folder-card').scrollHeight>dialog.querySelector('.brown-project-folder-card').clientHeight+1)throw Error('Folder controls are clipped');
      if(dialog.querySelector('.brown-project-add'))throw Error('Add is available after selecting a folder');
      dialog.querySelector('[aria-label="Remove D:/auth"]').click();
      if(!dialog.querySelector('.brown-project-add'))throw Error('Cannot select a replacement folder');
      dialog.querySelector('.brown-project-add').click();await new Promise(r=>setTimeout(r,20));
      dialog.querySelector('.brown-project-submit').click();await new Promise(r=>setTimeout(r,80));
      if(!selectedProject||selectedProject.name!=='Authentication'||window.indexCalls!==0)throw Error('Workspace creation must not index files');
      if(testWorkspaceStore.scope().length)throw Error('New workspace enabled knowledge without permission');
      await panels.projects(testWorkspaceStore.active());dialog=document.querySelector('dialog');checkCentered(dialog);
      if(getComputedStyle(dialog).overflowY!=='hidden'||dialog.scrollHeight>dialog.clientHeight+1)throw Error('Project settings scroll');
      if(dialog.querySelector('.brown-project-folder-card').getBoundingClientRect().height>60)throw Error('Selected folder has unnecessary empty space');
      [...dialog.querySelectorAll('button')].find(x=>x.textContent==='Index folder').click();await new Promise(r=>setTimeout(r,20));
      if(window.indexCalls!==1||!dialog.querySelector('[aria-label="Use project files for answers"]').checked)throw Error('Optional project indexing failed');
      [...dialog.querySelectorAll('.brown-project-tabs button')].find(x=>x.textContent==='Instructions').click();
      dialog.querySelector('[aria-label="Project instructions"]').value='Use TypeScript.';
      [...dialog.querySelectorAll('.brown-project-tabs button')].find(x=>x.textContent==='Model').click();
      if(dialog.textContent.includes('Use a local model for offline answers.'))throw Error('Unnecessary model helper text remains');
      const modelTrigger=dialog.querySelector('.brown-project-model-trigger');modelTrigger.click();
      const modelMenu=dialog.querySelector('.brown-project-model-menu');if(modelMenu.hidden)throw Error('Styled model menu did not open');
      modelMenu.querySelector('[data-value="phi3"]').click();
      if(!modelMenu.hidden||modelTrigger.textContent.indexOf('phi3')<0)throw Error('Model menu selection failed');
      if(dialog.scrollHeight>dialog.clientHeight+1)throw Error('Preferences view scrolls the modal');
      dialog.querySelector('.brown-project-submit').click();await new Promise(r=>setTimeout(r,80));
      if(testWorkspaceStore.get().instructions!=='Use TypeScript.'||testWorkspaceStore.scope()[0]!=='D:/auth'||testWorkspaceStore.get().model!=='phi3')throw Error('Project preferences failed');
      await panels.projects();dialog=document.querySelector('dialog');dialog.querySelector('.brown-project-cancel').click();await new Promise(r=>setTimeout(r,20));
      if(testWorkspaceStore.list().length!==2||window.indexCalls!==1)throw Error('Cancel created or indexed a project');
      await panels.health();
      const health=document.querySelector('dialog');if(!health?.textContent.includes('Ollama test'))throw Error('Health status absent');
      checkCentered(health);
      [...health.querySelectorAll('button')].find(x=>x.textContent==='Use model').click();
      if(chosenModel!=='phi3')throw Error('Model selection failed');
      const bounds=health.getBoundingClientRect();if(bounds.left<0||bounds.right>innerWidth||bounds.bottom>innerHeight)throw Error('Dialog exceeds viewport');
      health.close();
      const projectId=testWorkspaceStore.active(),sessions={one:{id:'one',projectId,title:'Explain authentication',updatedAt:'2026-10-31'}};
      let opened=null;
      BrownProjectSidebar.init({container:document.getElementById('sidebar-projects'),store:testWorkspaceStore,storage:localStorage,hooks:{state:()=>({sessions,currentSessionId:'one'}),activate:async id=>testWorkspaceStore.select(id),newChat(){},openChat:id=>{opened=id;},settings(){},create(){},rename(){},remove(){},error:error=>{throw error;}}});
      const nested=document.querySelector('#sidebar-projects .project-sidebar-chat-title');if(!nested||!nested.textContent.includes('Explain authentication'))throw Error('Sidebar project chat is missing');
      const activeProjectStyle=getComputedStyle(document.querySelector('#sidebar-projects .project-sidebar-group.is-active > .project-sidebar-project'));
      if(activeProjectStyle.backgroundImage!=='none'||activeProjectStyle.backgroundColor!=='rgba(0, 0, 0, 0)')throw Error('Project title should not have an active background');
      if(!getComputedStyle(nested.closest('.session-history-item')).backgroundImage.includes('linear-gradient'))throw Error('Active project chat is not highlighted');
      nested.click();await new Promise(r=>setTimeout(r,0));if(opened!=='one')throw Error('Sidebar chat navigation failed');
      const rowBounds=nested.getBoundingClientRect(),sidebarBounds=document.getElementById('left-sidebar').getBoundingClientRect();
      if(rowBounds.right>sidebarBounds.right||rowBounds.left<sidebarBounds.left)throw Error('Nested chat exceeds sidebar bounds');
      const projectSection=document.getElementById('sidebar-projects'),projectBody=projectSection.querySelector(':scope > .sidebar-collapse'),projectToggle=projectSection.querySelector('.project-sidebar-section-toggle');
      await new Promise(r=>setTimeout(r,260));
      const expandedHeight=projectBody.getBoundingClientRect().height;projectToggle.click();await new Promise(r=>setTimeout(r,60));
      const movingHeight=projectBody.getBoundingClientRect().height;
      if(projectBody!==projectSection.querySelector(':scope > .sidebar-collapse'))throw Error('Collapse rebuilt the animated element');
      if(!(movingHeight>0&&movingHeight<expandedHeight))throw Error('Projects collapse is not animated: '+JSON.stringify({movingHeight,expandedHeight}));
      await new Promise(r=>setTimeout(r,250));if(projectBody.getBoundingClientRect().height>1||!projectBody.inert)throw Error('Projects did not fully collapse');
      projectToggle.click();await new Promise(r=>setTimeout(r,280));if(projectBody.getBoundingClientRect().height<expandedHeight-1)throw Error('Projects did not expand');
      const recentList=document.getElementById('session-history-list');recentList.innerHTML='<div class="nav-item session-history-item"><span class="nav-text">Personal chat</span></div>';
      const recentState={personal:{id:'personal'}};const recentSection=document.getElementById('sidebar-recents');
      let recentChatCreated=false;
      const recentView=BrownProjectSidebar.initRecents({container:recentSection,list:recentList,storage:localStorage,hooks:{sessions:()=>recentState,newChat:()=>{recentChatCreated=true;}}});
      const recentPlus=recentSection.querySelector('[aria-label="New chat in Recents"]');
      if(!recentPlus?.querySelector('svg'))throw Error('Recents plus button is missing');
      recentPlus.click();await new Promise(r=>setTimeout(r,0));if(!recentChatCreated)throw Error('Recents plus does not create a general chat');
      await new Promise(r=>setTimeout(r,260));const recentBody=recentSection.querySelector('.sidebar-collapse'),recentToggle=recentSection.querySelector('.project-sidebar-section-toggle');
      if(recentToggle.getAttribute('aria-expanded')!=='true')throw Error('Populated Recents did not open by default');
      for(const heading of [projectToggle,recentToggle]) {
        if(getComputedStyle(heading).color!=='rgb(153, 153, 153)')throw Error('Sidebar title is missing the neutral gray');
        for(const icon of heading.querySelectorAll('svg'))if(getComputedStyle(icon).color!=='rgb(153, 153, 153)')throw Error('Sidebar icon is missing the neutral gray');
      }
      const projectTextLeft=projectToggle.children[1].getBoundingClientRect().left;
      for(const title of [projectSection.querySelector('.project-sidebar-label')]) {
        if(Math.abs(projectTextLeft-title.getBoundingClientRect().left)>1)throw Error('Project name or chat title does not align with Projects heading text');
      }
      if(nested.querySelector('.nav-text').getBoundingClientRect().left-projectTextLeft<20)throw Error('Chat titles are not indented for tree branches');
      const branch=nested.closest('.session-history-item').querySelector('.project-chat-connector');
      if(!branch?.querySelector('svg')||getComputedStyle(branch).pointerEvents!=='none')throw Error('Project chat arrow is missing or blocks clicks');
      if(Math.abs(recentToggle.querySelector('.sidebar-section-icon').getBoundingClientRect().left-recentList.querySelector('.nav-text').getBoundingClientRect().left)>1)throw Error('Recent title does not align with its section icon');
      if(getComputedStyle(projectSection.querySelector('.project-sidebar-heading')).backgroundColor!=='rgba(0, 0, 0, 0)'||getComputedStyle(recentSection.querySelector('.project-sidebar-heading')).backgroundColor!=='rgba(0, 0, 0, 0)')throw Error('Sidebar heading has a background');
      recentToggle.click();await new Promise(r=>setTimeout(r,280));if(recentBody.getBoundingClientRect().height>1||!recentBody.inert)throw Error('Recents collapse failed');
      recentState.second={id:'second'};recentView.render();await new Promise(r=>setTimeout(r,280));if(recentToggle.getAttribute('aria-expanded')!=='true')throw Error('New recent chat did not expand Recents');
      return {project:testWorkspaceStore.get().name,model:chosenModel,dialogWidth:bounds.width,sidebarChat:opened};
    })()`);
    console.log('PASS: compact project creation/settings without modal scrolling, deferred indexing, cancellation, preferences, health and sidebar at '+width+'x'+height+'.',JSON.stringify(result));
    }
    w.destroy();app.exit(0);
  }catch(error){console.error(error);w.destroy();app.exit(1);}
});
