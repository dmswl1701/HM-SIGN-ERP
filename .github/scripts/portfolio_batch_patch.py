from pathlib import Path
import re

path = Path('public/index.html')
s = path.read_text(encoding='utf-8')
original = s

# ------------------------------------------------------------
# 1) Styles: project-based upload workspace + queue/progress UI
# ------------------------------------------------------------
css_marker = "  .cms-asset select,.cms-asset button{width:100%; border:0; border-top:1px solid var(--border); padding:6px; font-size:11.5px; font-family:inherit; background:#fff; cursor:pointer;}\n"
css_block = r'''  .cms-project{border:1px solid var(--border); border-radius:12px; background:#fff; padding:16px; margin-bottom:14px;}
  .cms-project-head{display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:14px;}
  .cms-project-title{font-size:16px; font-weight:800; color:var(--navy); line-height:1.45;}
  .cms-project-meta{font-size:11px; color:var(--text-mute); margin-top:3px;}
  .cms-upload-zone{border:2px dashed #C9D4E5; border-radius:12px; background:#F8FAFD; padding:22px 16px; text-align:center; cursor:pointer; transition:.16s ease; user-select:none;}
  .cms-upload-zone:hover,.cms-upload-zone.is-drag{border-color:var(--navy); background:#EEF4FB;}
  .cms-upload-zone b{display:block; color:var(--navy); font-size:14px; margin-bottom:4px;}
  .cms-upload-zone span{font-size:11.5px; color:var(--text-mute); line-height:1.55;}
  .cms-upload-queue{display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:10px; margin-top:12px;}
  .cms-upload-item{border:1px solid var(--border); border-radius:9px; overflow:hidden; background:#fff; position:relative;}
  .cms-upload-item.is-failed{border-color:#D96E50; background:#FFF8F5;}
  .cms-upload-item.is-done{border-color:#86BFA0;}
  .cms-upload-item img{display:block; width:100%; aspect-ratio:4/3; object-fit:cover; background:#EEF1F6;}
  .cms-upload-item[draggable=true]{cursor:grab;}
  .cms-upload-item[draggable=true]:active{cursor:grabbing;}
  .cms-upload-info{padding:7px 8px; border-top:1px solid var(--border);}
  .cms-upload-name{font-size:10.5px; font-weight:700; color:var(--text); overflow:hidden; white-space:nowrap; text-overflow:ellipsis;}
  .cms-upload-status{font-size:10px; color:var(--text-mute); margin-top:3px; min-height:15px;}
  .cms-upload-item.is-failed .cms-upload-status{color:#B34C34;}
  .cms-upload-item.is-done .cms-upload-status{color:#2E7D55;}
  .cms-upload-item select{width:100%; border:0; border-top:1px solid var(--border); padding:7px; font-size:11px; background:#fff;}
  .cms-upload-remove{position:absolute; top:6px; right:6px; width:26px; height:26px; border:0; border-radius:50%; background:rgba(13,31,58,.82); color:#fff; cursor:pointer; font-size:14px; line-height:26px; padding:0;}
  .cms-upload-toolbar{display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:12px;}
  .cms-upload-summary{font-size:11.5px; color:var(--text-mute); margin-left:auto;}
  .cms-upload-progress{height:7px; background:#E8EDF5; border-radius:999px; overflow:hidden; margin-top:10px;}
  .cms-upload-progress>i{display:block; width:0%; height:100%; background:var(--navy); transition:width .2s ease;}
  .cms-existing-head{display:flex; justify-content:space-between; align-items:center; gap:10px; margin-top:18px; margin-bottom:8px;}
  .cms-existing-head b{font-size:12.5px; color:var(--navy);}
  .cms-flow{display:flex; gap:7px; flex-wrap:wrap; margin-top:10px;}
  .cms-flow span{font-size:10.5px; padding:5px 7px; border-radius:999px; background:#EEF2F8; color:var(--navy); font-weight:700;}
  @media(max-width:760px){
    .cms-project{padding:12px;}
    .cms-project-head{flex-direction:column;}
    .cms-upload-queue{grid-template-columns:repeat(2,minmax(0,1fr));}
    .cms-upload-summary{width:100%; margin-left:0;}
  }
'''
if '.cms-upload-zone{' not in s:
    assert css_marker in s, 'CSS marker not found'
    s = s.replace(css_marker, css_marker + css_block, 1)

# ------------------------------------------------------------
# 2) Replace portfolio core with persistent drafts + batch queue
# ------------------------------------------------------------
start = s.index('/* ---------- 시공사례(포트폴리오) ----------')
end = s.index('/* ---------- 문의 목록 정규화', start)
new_portfolio_core = r'''/* ---------- 시공사례(포트폴리오) ----------
   운영 원칙: "프로젝트 먼저 → 사진 여러 장 준비 → 일괄 업로드 → 대표/전후 분류 → 공개".
   새 프로젝트/초안은 브라우저에도 보조 저장하여, 공개 API에 아직 안 보이는 draft도 작업 중 사라지지 않게 한다. */
let cmsPortfolios = null;
let cmsAssets = {};
let cmsUploadQueues = {};  // portfolioId -> {items:[{id,file,url,role,status,error}], running:boolean}
const CMS_PORTFOLIO_DRAFT_KEY = 'hmCmsPortfolioDraftsV2';

function cmsUuid(){
  if(crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{
    const r = Math.random()*16|0, v = c==='x' ? r : (r&0x3|0x8);
    return v.toString(16);
  });
}
function cmsPortfolioDraftsLoad(){
  try{
    const a=JSON.parse(localStorage.getItem(CMS_PORTFOLIO_DRAFT_KEY)||'[]');
    return Array.isArray(a)?a:[];
  }catch(e){ return []; }
}
function cmsPortfolioDraftsSave(){
  try{
    const arr=(cmsPortfolios||[]).map(p=>({
      id:p.id,title:p.title||'',category:p.category||'',region:p.region||'',summary:p.summary||'',
      status:p.status||'draft',erpQuoteId:p.erpQuoteId||'',_local:true
    }));
    localStorage.setItem(CMS_PORTFOLIO_DRAFT_KEY,JSON.stringify(arr));
  }catch(e){}
}
function cmsPortfolioNormalize(p){
  return {
    id:p && p.id ? p.id : cmsUuid(),
    title:(p&&p.title)||'', category:(p&&p.category)||'', region:(p&&p.region)||'',
    summary:(p&&p.summary)||'', status:(p&&p.status)||'draft',
    erpQuoteId:(p&&(p.erpQuoteId||p.erp_quote_id))||'',
    slug:(p&&p.slug)||'', cover:(p&&(p.cover||p.cover_url||p.coverUrl))||''
  };
}
function cmsPortfolioArray(j){
  if(Array.isArray(j)) return j;
  if(!j || typeof j!=='object') return [];
  for(const k of ['portfolios','projects','items','data','rows','results','list','featuredProjects']){
    if(Array.isArray(j[k])) return j[k];
  }
  return [];
}
async function cmsRefreshAssets(portfolioId){
  try{
    const r=await cmsFetchRaw(CMS_BASE+'/portfolios/'+portfolioId+'/assets');
    if(r.status===200){
      const j=await r.json();
      cmsAssets[portfolioId]=Array.isArray(j)?j:(Array.isArray(j.assets)?j.assets:[]);
      return cmsAssets[portfolioId];
    }
  }catch(e){}
  return cmsAssets[portfolioId]||[];
}
async function cmsLoadPortfolios(){
  let remote=[];
  try{
    const r=await cmsFetchRaw(CMS_BASE+'/portfolios');
    if(r.status===200) remote=cmsPortfolioArray(await r.json());
  }catch(e){}
  if(!remote.length){
    try{
      const r=await fetch(CMS_API+'/api/v1/public/site',{headers:{accept:'application/json'}});
      const j=r.ok?await r.json():{};
      remote=cmsPortfolioArray(j);
    }catch(e){}
  }
  const byId=new Map();
  remote.map(cmsPortfolioNormalize).forEach(p=>byId.set(p.id,p));
  cmsPortfolioDraftsLoad().map(cmsPortfolioNormalize).forEach(p=>{ if(!byId.has(p.id)) byId.set(p.id,p); });
  cmsPortfolios=[...byId.values()];
  for(const p of cmsPortfolios) await cmsRefreshAssets(p.id);
}
async function cmsSavePortfolio(id, opts){
  opts=opts||{};
  const p=(cmsPortfolios||[]).find(x=>x.id===id); if(!p) return false;
  if(!(p.title||'').trim()){
    if(!opts.silent) toast('먼저 시공사례 제목을 입력해 주세요','warn');
    return false;
  }
  let ok=false;
  try{
    const r=await cmsFetchRaw(CMS_BASE+'/portfolios/'+id,{
      method:'PUT',
      body:JSON.stringify({
        title:p.title, category:p.category, region:p.region, summary:p.summary,
        status:p.status||'draft', erpQuoteId:p.erpQuoteId||undefined
      })
    });
    if(r.status>=200 && r.status<300){
      ok=true; p._saved=true;
      cmsPortfolioDraftsSave();
      if(!opts.silent) toast('시공사례를 저장했어요','ok');
      logActivity('홈페이지 시공사례 저장: '+p.title,'변경');
      state.cmsErr=null;
    }else{
      let m=''; try{m=(await r.text()).replace(/\s+/g,' ').slice(0,180);}catch(e){}
      state.cmsErr='시공사례 저장 실패 ('+r.status+') '+m;
      if(!opts.silent) toast('저장 실패','warn');
    }
  }catch(e){ state.cmsErr='시공사례 저장 실패: '+e.message; }
  if(!opts.noRender) render();
  return ok;
}
async function cmsDeletePortfolio(id){
  const p=(cmsPortfolios||[]).find(x=>x.id===id); if(!p) return;
  if(!confirm('「'+(p.title||'제목 없음')+'」을(를) 삭제할까요?\n\n등록된 사진도 함께 삭제될 수 있습니다.')) return;
  try{
    const r=await cmsFetchRaw(CMS_BASE+'/portfolios/'+id,{method:'DELETE'});
    if((r.status>=200&&r.status<300)||r.status===404){
      cmsPortfolios=cmsPortfolios.filter(x=>x.id!==id);
      delete cmsAssets[id];
      cmsQueueClear(id,true);
      cmsPortfolioDraftsSave();
      toast('삭제했어요','ok');
      logActivity('홈페이지 시공사례 삭제: '+p.title,'삭제');
    }else{
      let m=''; try{m=(await r.text()).replace(/\s+/g,' ').slice(0,140);}catch(e){}
      state.cmsErr='삭제 실패 ('+r.status+') '+m;
    }
  }catch(e){ state.cmsErr='삭제 실패: '+e.message; }
  render();
}

function cmsQueue(portfolioId){
  if(!cmsUploadQueues[portfolioId]) cmsUploadQueues[portfolioId]={items:[],running:false};
  return cmsUploadQueues[portfolioId];
}
function cmsQueueKey(id){ return String(id||'').replace(/[^a-zA-Z0-9_-]/g,'_'); }
function cmsQueueStats(q){
  const items=(q&&q.items)||[];
  return {
    total:items.length,
    ready:items.filter(x=>x.status==='ready').length,
    uploading:items.filter(x=>x.status==='uploading').length,
    done:items.filter(x=>x.status==='done').length,
    failed:items.filter(x=>x.status==='failed').length
  };
}
function cmsQueueStatusText(item){
  if(item.status==='uploading') return '업로드 중…';
  if(item.status==='done') return '업로드 완료';
  if(item.status==='failed') return item.error||'업로드 실패';
  return '업로드 대기';
}
function cmsQueueAdd(portfolioId, files){
  const q=cmsQueue(portfolioId);
  const input=[...files];
  if(!input.length) return;
  const limit=120;
  const picked=input.slice(0,limit);
  let added=0, skipped=0;
  for(const file of picked){
    if(!file || !/^image\/(jpeg|png|webp)$/i.test(file.type||'')){
      skipped++; continue;
    }
    if(file.size>25*1024*1024){ skipped++; continue; }
    const dup=q.items.some(x=>x.file && x.file.name===file.name && x.file.size===file.size && x.file.lastModified===file.lastModified);
    if(dup){ skipped++; continue; }
    q.items.push({
      id:'q_'+cmsUuid(), file, url:URL.createObjectURL(file), role:'gallery',
      status:'ready', error:'', result:null
    });
    added++;
  }
  if(input.length>limit) toast('한 번에 최대 '+limit+'장까지 준비합니다. 나머지는 다음 묶음으로 올려 주세요','warn');
  if(skipped) toast(skipped+'장은 중복·형식·용량 문제로 제외했어요','warn');
  if(added) toast(added+'장을 업로드 대기열에 준비했어요','ok');
  render();
}
function cmsQueueRemove(portfolioId,itemId){
  const q=cmsQueue(portfolioId); if(q.running) return;
  const i=q.items.findIndex(x=>x.id===itemId); if(i<0) return;
  try{URL.revokeObjectURL(q.items[i].url);}catch(e){}
  q.items.splice(i,1); render();
}
function cmsQueueClear(portfolioId,silent){
  const q=cmsQueue(portfolioId); if(q.running) return;
  q.items.forEach(x=>{try{URL.revokeObjectURL(x.url);}catch(e){}});
  q.items=[];
  if(!silent) toast('업로드 대기열을 비웠어요','ok');
  render();
}
function cmsQueueSetRole(portfolioId,itemId,role){
  const q=cmsQueue(portfolioId);
  const item=q.items.find(x=>x.id===itemId); if(!item) return;
  if(role==='cover') q.items.forEach(x=>{ if(x.id!==itemId && x.role==='cover') x.role='gallery'; });
  item.role=role;
}
function cmsQueueMove(portfolioId,fromId,toId){
  const q=cmsQueue(portfolioId); if(q.running||fromId===toId) return;
  const a=q.items.findIndex(x=>x.id===fromId), b=q.items.findIndex(x=>x.id===toId);
  if(a<0||b<0) return;
  const [item]=q.items.splice(a,1); q.items.splice(b,0,item); render();
}
function cmsQueueUpdateDom(portfolioId){
  const q=cmsQueue(portfolioId), st=cmsQueueStats(q), key=cmsQueueKey(portfolioId);
  const count=document.getElementById('cmsQCount_'+key);
  if(count) count.textContent='전체 '+st.total+' · 완료 '+st.done+' · 실패 '+st.failed+(q.running?' · 업로드 중':'');
  const bar=document.getElementById('cmsQBar_'+key);
  const progressed=st.done+st.failed;
  if(bar) bar.style.width=(st.total?Math.round(progressed/st.total*100):0)+'%';
  q.items.forEach(item=>{
    const el=document.getElementById('cmsQS_'+cmsQueueKey(item.id));
    const card=document.getElementById('cmsQI_'+cmsQueueKey(item.id));
    if(el) el.textContent=cmsQueueStatusText(item);
    if(card){ card.classList.toggle('is-failed',item.status==='failed'); card.classList.toggle('is-done',item.status==='done'); }
  });
}

async function cmsUploadAsset(portfolioId,file,role){
  const endpoint=CMS_BASE+'/portfolios/'+portfolioId+'/assets';
  const name=file.name||'photo.jpg';
  const attempts=['file','asset','image','upload','original'];
  const notes=[];
  for(const field of attempts){
    const fd=new FormData();
    fd.append(field,file,name);
    fd.append('role',role||'gallery');
    fd.append('kind',role||'gallery');
    fd.append('asset_kind',role||'gallery');
    fd.append('filename',name);
    fd.append('original_filename',name);
    fd.append('mime_type',file.type||'application/octet-stream');
    const r=await cmsFetchRaw(endpoint,{method:'POST',body:fd});
    if(r.status>=200&&r.status<300){
      const j=await r.json().catch(()=>({}));
      return j;
    }
    let text=''; try{text=(await r.text()).replace(/\s+/g,' ').slice(0,220);}catch(e){}
    notes.push(field+':'+r.status+(text?' '+text:''));
    if(!(r.status===400 && /invalid_upload|invalid.*file|missing.*file|upload.*invalid/i.test(text)))
      throw new Error(r.status+(text?' '+text:''));
  }
  const r=await cmsFetchRaw(endpoint,{
    method:'POST',body:file,
    headers:{'content-type':file.type||'application/octet-stream','x-file-name':encodeURIComponent(name),'x-upload-role':role||'gallery'}
  });
  if(r.status>=200&&r.status<300) return await r.json().catch(()=>({}));
  let text=''; try{text=(await r.text()).replace(/\s+/g,' ').slice(0,220);}catch(e){}
  notes.push('raw:'+r.status+(text?' '+text:''));
  throw new Error((text||'업로드 형식을 서버가 거부했습니다')+' · '+notes.join(' | '));
}

async function cmsStartUploadQueue(portfolioId,retryOnly){
  const q=cmsQueue(portfolioId); if(q.running) return;
  const p=(cmsPortfolios||[]).find(x=>x.id===portfolioId); if(!p) return;
  const targets=q.items.filter(x=>retryOnly?x.status==='failed':(x.status==='ready'||x.status==='failed'));
  if(!targets.length){ toast(retryOnly?'재시도할 사진이 없어요':'업로드할 사진을 먼저 준비해 주세요','warn'); return; }
  if(!(p.title||'').trim()){ toast('사진을 올리기 전에 프로젝트 제목을 입력해 주세요','warn'); return; }

  const saved=await cmsSavePortfolio(portfolioId,{silent:true,noRender:true});
  if(!saved){ toast('프로젝트 저장에 실패해 사진 업로드를 시작하지 않았어요','warn'); render(); return; }

  q.running=true;
  targets.forEach(x=>{x.status='ready';x.error='';});
  state.cmsErr=null; state.cmsSaveTried=null;
  render();

  let cursor=0;
  const worker=async()=>{
    while(true){
      const i=cursor++; if(i>=targets.length) return;
      const item=targets[i];
      item.status='uploading'; item.error=''; cmsQueueUpdateDom(portfolioId);
      try{
        item.result=await cmsUploadAsset(portfolioId,item.file,item.role);
        item.status='done';
      }catch(e){
        item.status='failed'; item.error=(e&&e.message?e.message:String(e)).slice(0,220);
      }
      cmsQueueUpdateDom(portfolioId);
    }
  };
  await Promise.all([worker(),worker()]);
  q.running=false;
  await cmsRefreshAssets(portfolioId);

  const failed=q.items.filter(x=>x.status==='failed');
  const done=q.items.filter(x=>x.status==='done');
  if(done.length) toast(done.length+'장 업로드 완료','ok');
  if(failed.length){
    state.cmsErr='사진 '+failed.length+'장 업로드 실패';
    state.cmsSaveTried=failed.map(x=>(x.file&&x.file.name?x.file.name:'사진')+' → '+x.error);
    toast('실패한 사진만 다시 시도할 수 있어요','warn');
  }else{
    q.items.forEach(x=>{try{URL.revokeObjectURL(x.url);}catch(e){}});
    q.items=[];
  }
  render();
}

function cmsDataUrlToFile(dataUrl,name){
  const m=/^data:([^;]+);base64,(.+)$/.exec(dataUrl||'');
  if(!m) return null;
  const bin=atob(m[2]), arr=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
  return new File([arr],name||'photo.jpg',{type:m[1]});
}
async function cmsAssetRole(portfolioId,assetId,role){
  try{
    const r=await cmsFetchRaw(CMS_BASE+'/portfolios/'+portfolioId+'/assets/'+assetId,{
      method:'PATCH',body:JSON.stringify({role})
    });
    if(r.status>=200&&r.status<300){ toast('사진 분류를 바꿨어요','ok'); await cmsRefreshAssets(portfolioId); }
    else{
      let m=''; try{m=(await r.text()).slice(0,140);}catch(e){}
      toast('변경 실패 ('+r.status+') '+m,'warn');
    }
  }catch(e){ toast('변경 실패: '+e.message,'warn'); }
}

'''
s = s[:start] + new_portfolio_core + s[end:]

# ------------------------------------------------------------
# 3) Replace portfolio tab UI with project-first batch UX
# ------------------------------------------------------------
ui_start = s.index("  if(tab==='portfolio'){")
ui_end = s.index("\n  if(tab==='seo'){", ui_start)
new_ui = r'''  if(tab==='portfolio'){
    const list=Array.isArray(cmsPortfolios)?cmsPortfolios:[];
    const sites=(state.quotes||[]).filter(q=>q.status==='시공완료'||q.status==='계약');
    body=`
    <div class="panel">
      <h2>시공사례 관리 (${list.length})</h2>
      <div class="aic-sub" style="margin:-8px 0 10px;line-height:1.7">
        한 공사를 <b>프로젝트 1개</b>로 만들고 사진을 한꺼번에 준비한 뒤 업로드합니다.
        기존 사진 800장도 <b>현장별 50~100장씩</b> 나눠 등록하는 방식으로 운영하세요.
      </div>
      <div class="cms-flow">
        <span>1 프로젝트 선택/생성</span><span>2 제목 확인</span><span>3 사진 여러 장 끌어놓기</span>
        <span>4 일괄 업로드</span><span>5 대표·전/후 분류</span><span>6 공개</span>
      </div>
      <div class="field" style="margin-top:14px">
        <label>ERP 현장에서 가져오기</label>
        <select id="cmsPjFromSite">
          <option value="">-- 현장 선택 --</option>
          ${sites.map(q=>`<option value="${esc(q.id)}">${esc(q.date)} · ${esc(q.client)} ${q.item?'· '+esc(q.item):''}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="aic-btn aic-btn-primary" id="cmsPjFromSiteAdd">＋ 이 현장을 시공사례로</button>
        <button type="button" class="aic-btn" id="cmsPjAdd">＋ 새 시공사례</button>
        <button type="button" class="aic-btn" id="cmsPjReload">↻ 서버 목록 새로고침</button>
      </div>
    </div>

    ${list.length?list.map((p,i)=>{
      const assets=cmsAssets[p.id]||[];
      const q=cmsQueue(p.id), st=cmsQueueStats(q), key=cmsQueueKey(p.id);
      const statusLabel=(p.status||'draft')==='published'?'공개':(p.status==='review'?'검토':'작성중');
      return `
      <div class="cms-project">
        <div class="cms-project-head">
          <div>
            <div class="cms-project-title">${esc(p.title||'새 시공사례')}</div>
            <div class="cms-project-meta">${esc(p.region||'지역 미입력')} · ${statusLabel} · 업로드 사진 ${assets.length}장</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button type="button" class="aic-btn cmsPjSave" data-id="${esc(p.id)}">💾 프로젝트 저장</button>
            <button type="button" class="aic-btn aic-btn-rej cmsPjDel" data-id="${esc(p.id)}">삭제</button>
          </div>
        </div>

        <div class="field"><label>프로젝트 제목 *</label><input type="text" class="cmsPj" data-id="${esc(p.id)}" data-f="title" value="${esc(p.title||'')}" placeholder="예: ○○병원 외부 채널간판 시공"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="field"><label>분류</label><input type="text" class="cmsPj" data-id="${esc(p.id)}" data-f="category" value="${esc(p.category||'')}" placeholder="예: 채널간판 / 병원 / 프랜차이즈"></div>
          <div class="field"><label>지역</label><input type="text" class="cmsPj" data-id="${esc(p.id)}" data-f="region" value="${esc(p.region||'')}" placeholder="예: 인천 중구"></div>
        </div>
        <div class="field"><label>한 줄 설명</label><textarea class="cmsPj" data-id="${esc(p.id)}" data-f="summary" rows="2" style="width:100%;padding:11px;border:1px solid var(--border);border-radius:7px;font-size:14px;font-family:inherit;line-height:1.7;resize:vertical">${esc(p.summary||'')}</textarea></div>
        <div class="field"><label>공개 상태</label>
          <select class="cmsPj" data-id="${esc(p.id)}" data-f="status">
            ${['draft','review','published'].map(v=>`<option value="${v}" ${(p.status||'draft')===v?'selected':''}>${v==='draft'?'작성중(홈페이지 비공개)':v==='review'?'검토':'공개'}</option>`).join('')}
          </select>
        </div>

        <div class="aic-docs">
          <div class="aic-doc-head">📥 새 사진 일괄 등록</div>
          <label class="cms-upload-zone cmsUploadZone" data-id="${esc(p.id)}">
            <b>사진 여러 장을 여기에 끌어놓거나 클릭해서 선택</b>
            <span>JPG · PNG · WebP / 장당 25MB 이하 · 한 번에 50~100장 권장 (최대 120장 준비)</span>
            <input type="file" class="cmsAssetStage" data-id="${esc(p.id)}" accept="image/jpeg,image/png,image/webp" multiple style="display:none">
          </label>

          ${st.total?`<div class="cms-upload-queue">
            ${q.items.map(item=>`<div class="cms-upload-item ${item.status==='failed'?'is-failed':item.status==='done'?'is-done':''}" id="cmsQI_${cmsQueueKey(item.id)}" draggable="${q.running?'false':'true'}" data-pid="${esc(p.id)}" data-qid="${esc(item.id)}">
              <img src="${esc(item.url)}" alt="업로드 대기 사진">
              ${q.running?'':`<button type="button" class="cms-upload-remove cmsQueueRemove" data-pid="${esc(p.id)}" data-qid="${esc(item.id)}" title="대기열에서 제거">×</button>`}
              <div class="cms-upload-info"><div class="cms-upload-name" title="${esc(item.file&&item.file.name||'')}">${esc(item.file&&item.file.name||'사진')}</div><div class="cms-upload-status" id="cmsQS_${cmsQueueKey(item.id)}">${esc(cmsQueueStatusText(item))}</div></div>
              <select class="cmsQueueRole" data-pid="${esc(p.id)}" data-qid="${esc(item.id)}" ${q.running?'disabled':''}>
                ${[['gallery','갤러리'],['cover','대표'],['before','시공전'],['after','시공후']].map(([v,l])=>`<option value="${v}" ${item.role===v?'selected':''}>${l}</option>`).join('')}
              </select>
            </div>`).join('')}
          </div>
          <div class="cms-upload-progress"><i id="cmsQBar_${key}" style="width:${st.total?Math.round((st.done+st.failed)/st.total*100):0}%"></i></div>
          <div class="cms-upload-toolbar">
            <button type="button" class="aic-btn aic-btn-primary cmsUploadStart" data-id="${esc(p.id)}" ${q.running?'disabled':''}>${q.running?'업로드 중…':'⬆ '+st.total+'장 일괄 업로드'}</button>
            ${st.failed?`<button type="button" class="aic-btn cmsUploadRetry" data-id="${esc(p.id)}" ${q.running?'disabled':''}>실패 ${st.failed}장만 재시도</button>`:''}
            <button type="button" class="aic-btn cmsUploadClear" data-id="${esc(p.id)}" ${q.running?'disabled':''}>대기열 비우기</button>
            <span class="cms-upload-summary" id="cmsQCount_${key}">전체 ${st.total} · 완료 ${st.done} · 실패 ${st.failed}</span>
          </div>`:'<div class="aic-sub" style="margin-top:9px;font-size:11.5px">선택한 사진은 바로 서버로 올라가지 않습니다. 미리 확인하고 대표/전/후를 정한 뒤 <b>일괄 업로드</b>를 누르세요.</div>'}
        </div>

        <div class="cms-existing-head"><b>✅ 서버에 등록된 사진 (${assets.length})</b><span style="font-size:10.5px;color:var(--text-mute)">대표/전/후 분류는 언제든 변경 가능</span></div>
        ${assets.length?`<div class="cms-assets">${assets.map(a=>{
          const src=a.preview_url||a.public_url||a.url||a.thumbnail_url||'';
          return `<div class="cms-asset">
            ${src?`<img src="${esc(src)}" alt="">`:'<div class="cms-asset-ph">미리보기 없음</div>'}
            <select class="cmsAssetRole" data-pid="${esc(p.id)}" data-aid="${esc(a.id)}">
              ${[['cover','대표'],['before','시공전'],['after','시공후'],['gallery','갤러리']].map(([v,l])=>`<option value="${v}" ${a.role===v?'selected':''}>${l}</option>`).join('')}
            </select>
          </div>`;}).join('')}</div>`:'<div class="aic-doc-empty">아직 서버에 등록된 사진이 없어요.</div>'}
      </div>`;}).join(''):'<div class="panel"><div class="empty">등록된 시공사례가 없어요. 위에서 현장을 가져오거나 새 시공사례를 만들어 주세요.</div></div>'}`;
  }
'''
s = s[:ui_start] + new_ui + s[ui_end:]

# ------------------------------------------------------------
# 4) Replace portfolio binding block for stage/drop/reorder/batch
# ------------------------------------------------------------
bind_start = s.index('  // 시공사례\n', s.index('function bindWebsiteAdmin'))
bind_end = s.index('\n  // 문의함\n', bind_start)
new_bind = r'''  // 시공사례
  document.querySelectorAll('.cmsPj').forEach(el=>el.addEventListener('change',()=>{
    const p=(cmsPortfolios||[]).find(x=>x.id===el.dataset.id);
    if(p){ p[el.dataset.f]=el.value; cmsPortfolioDraftsSave(); }
  }));
  document.querySelectorAll('.cmsPjSave').forEach(el=>el.addEventListener('click',()=>cmsSavePortfolio(el.dataset.id)));
  document.querySelectorAll('.cmsPjDel').forEach(el=>el.addEventListener('click',()=>cmsDeletePortfolio(el.dataset.id)));
  const ja=document.getElementById('cmsPjAdd');
  if(ja) ja.addEventListener('click',()=>{
    cmsPortfolios=cmsPortfolios||[];
    const p={id:cmsUuid(),title:'',category:'',region:'',summary:'',status:'draft',erpQuoteId:'',_local:true};
    cmsPortfolios.unshift(p); cmsPortfolioDraftsSave(); render();
  });
  const jf=document.getElementById('cmsPjFromSiteAdd');
  if(jf) jf.addEventListener('click',()=>{
    const sel=document.getElementById('cmsPjFromSite'), qid=sel?sel.value:'';
    if(!qid){toast('현장을 선택해 주세요','warn');return;}
    const q=(state.quotes||[]).find(x=>x.id===qid); if(!q)return;
    const exists=(cmsPortfolios||[]).find(x=>x.erpQuoteId===qid);
    if(exists){toast('이미 시공사례로 가져온 현장이에요','warn');return;}
    cmsPortfolios=cmsPortfolios||[];
    cmsPortfolios.unshift({
      id:cmsUuid(), title:q.client+(q.item?' — '+q.item:''),
      category:(typeof deriveChain==='function'?deriveChain(q.client):'')||'',
      region:q.region||'', summary:'', status:'draft', erpQuoteId:q.id, _local:true
    });
    cmsPortfolioDraftsSave();
    toast('현장을 가져왔어요. 제목 확인 후 사진을 한꺼번에 넣어 주세요','ok'); render();
  });
  const jr=document.getElementById('cmsPjReload');
  if(jr) jr.addEventListener('click',async()=>{await cmsLoadPortfolios();render();});

  document.querySelectorAll('.cmsAssetStage').forEach(el=>el.addEventListener('change',e=>{
    cmsQueueAdd(el.dataset.id,[...e.target.files]); e.target.value='';
  }));
  document.querySelectorAll('.cmsUploadZone').forEach(zone=>{
    zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('is-drag');});
    zone.addEventListener('dragleave',()=>zone.classList.remove('is-drag'));
    zone.addEventListener('drop',e=>{
      e.preventDefault();zone.classList.remove('is-drag');
      if(e.dataTransfer&&e.dataTransfer.files) cmsQueueAdd(zone.dataset.id,[...e.dataTransfer.files]);
    });
  });
  document.querySelectorAll('.cmsQueueRemove').forEach(el=>el.addEventListener('click',()=>cmsQueueRemove(el.dataset.pid,el.dataset.qid)));
  document.querySelectorAll('.cmsQueueRole').forEach(el=>el.addEventListener('change',()=>cmsQueueSetRole(el.dataset.pid,el.dataset.qid,el.value)));
  document.querySelectorAll('.cmsUploadStart').forEach(el=>el.addEventListener('click',()=>cmsStartUploadQueue(el.dataset.id,false)));
  document.querySelectorAll('.cmsUploadRetry').forEach(el=>el.addEventListener('click',()=>cmsStartUploadQueue(el.dataset.id,true)));
  document.querySelectorAll('.cmsUploadClear').forEach(el=>el.addEventListener('click',()=>cmsQueueClear(el.dataset.id,false)));

  let cmsDragQueueId=null, cmsDragPid=null;
  document.querySelectorAll('.cms-upload-item[draggable="true"]').forEach(el=>{
    el.addEventListener('dragstart',e=>{cmsDragQueueId=el.dataset.qid;cmsDragPid=el.dataset.pid;e.dataTransfer.effectAllowed='move';});
    el.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';});
    el.addEventListener('drop',e=>{e.preventDefault();if(cmsDragQueueId&&cmsDragPid===el.dataset.pid)cmsQueueMove(el.dataset.pid,cmsDragQueueId,el.dataset.qid);});
    el.addEventListener('dragend',()=>{cmsDragQueueId=null;cmsDragPid=null;});
  });

  document.querySelectorAll('.cmsAssetRole').forEach(el=>el.addEventListener('change',()=>
    cmsAssetRole(el.dataset.pid,el.dataset.aid,el.value)));
'''
s = s[:bind_start] + new_bind + s[bind_end:]

# ------------------------------------------------------------
# 5) Version stamp
# ------------------------------------------------------------
m = re.search(r"const APP_BUILD = '([^']+)';", s)
if m:
    s = s[:m.start()] + "const APP_BUILD = 'V43.0807.BATCH1';" + s[m.end():]
    s = re.sub(r"V43\.0807\.[0-9A-Za-z_-]+", "V43.0807.BATCH1", s)

if s == original:
    raise SystemExit('No changes made; refusing empty patch')

path.write_text(s, encoding='utf-8')
print('Patched portfolio batch uploader successfully')
