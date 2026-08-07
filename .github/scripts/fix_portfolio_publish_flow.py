from pathlib import Path

p=Path('public/index.html')
s=p.read_text(encoding='utf-8')
orig=s

s=s.replace("const APP_BUILD = 'V43.0807.BATCH2';", "const APP_BUILD = 'V43.0807.BATCH3';", 1)
s=s.replace("const m = txt.match(new RegExp(\"const APP_BUILD = 'V43.0807.BATCH2']+)'\"));", "const m = txt.match(new RegExp(\"const APP_BUILD = 'V43.0807.BATCH3']+)'\"));", 1)

old="""async function cmsSaveSite(){
  if(!cmsData) return;
  if(state.cmsReadOnly){"""
new="""async function cmsSaveSite(){
  if(!cmsData) return;
  // 시공사례 탭의 상단 저장 버튼은 일반 콘텐츠가 아니라 포트폴리오를 저장한다.
  // 공개 상태가 '공개'인 프로젝트만 public API / 홈페이지에 노출된다.
  if(state.cmsTab==='portfolio'){
    const list=(cmsPortfolios||[]).filter(x=>(x.title||'').trim());
    if(!list.length){ toast('저장할 시공사례가 없어요','warn'); return; }
    const btn=document.getElementById('cmsSaveBtn');
    if(btn){ btn.disabled=true; btn.textContent='저장 중...'; }
    let ok=0; const fails=[];
    try{
      for(const item of list){
        if(item.status==='published') await cmsEnsureCover(item.id);
        const saved=await cmsSavePortfolio(item.id,{silent:true,noRender:true});
        if(saved) ok++; else fails.push(item.title||item.id);
      }
      const published=list.filter(x=>x.status==='published').length;
      if(fails.length){
        state.cmsErr='시공사례 '+fails.length+'건 저장 실패';
        state.cmsSaveTried=fails;
        toast(ok+'건 저장, '+fails.length+'건 실패','warn');
      }else if(published){
        state.cmsErr=null; state.cmsSaveTried=null;
        toast('시공사례 '+ok+'건 저장 · 공개 '+published+'건 홈페이지 반영','ok');
      }else{
        state.cmsErr=null; state.cmsSaveTried=null;
        toast('저장은 완료됐지만 현재 모두 비공개입니다. 공개할 프로젝트에서 [홈페이지 공개]를 눌러 주세요','warn');
      }
    }finally{
      if(btn){ btn.disabled=false; btn.textContent='💾 시공사례 저장'; }
      render();
    }
    return;
  }
  if(state.cmsReadOnly){"""
assert old in s, 'cmsSaveSite marker missing'
s=s.replace(old,new,1)

old="""function cmsQueueAdd(portfolioId, files){
  const q=cmsQueue(portfolioId);
  const input=[...files];"""
new="""function cmsQueueAdd(portfolioId, files){
  const q=cmsQueue(portfolioId);
  const input=[...files];
  // 대표사진이 아직 없으면 첫 번째 새 사진을 자동으로 대표로 지정한다.
  let hasCover=(cmsAssets[portfolioId]||[]).some(x=>x.role==='cover') || q.items.some(x=>x.role==='cover');"""
assert old in s, 'queue marker missing'
s=s.replace(old,new,1)

old="""    q.items.push({
      id:'q_'+cmsUuid(), file, url:URL.createObjectURL(file), role:'gallery',
      status:'ready', error:'', result:null
    });"""
new="""    const autoRole=hasCover?'gallery':'cover';
    hasCover=true;
    q.items.push({
      id:'q_'+cmsUuid(), file, url:URL.createObjectURL(file), role:autoRole,
      status:'ready', error:'', result:null
    });"""
assert old in s, 'queue push marker missing'
s=s.replace(old,new,1)

marker="""async function cmsAssetRole(portfolioId,assetId,role){"""
helper="""async function cmsEnsureCover(portfolioId){
  const assets=cmsAssets[portfolioId]||[];
  if(!assets.length || assets.some(x=>x.role==='cover')) return true;
  const first=assets[0];
  if(!first || !first.id) return false;
  try{
    const r=await cmsFetchRaw(CMS_BASE+'/portfolios/'+portfolioId+'/assets/'+first.id,{
      method:'PATCH', body:JSON.stringify({role:'cover'})
    });
    if(r.status>=200&&r.status<300){
      assets.forEach(x=>{ if(x.id===first.id) x.role='cover'; else if(x.role==='cover') x.role='gallery'; });
      return true;
    }
  }catch(e){}
  return false;
}

async function cmsAssetRole(portfolioId,assetId,role){"""
assert marker in s, 'asset role marker missing'
s=s.replace(marker,helper,1)

old="""          <div style=\"display:flex;gap:6px;flex-wrap:wrap\">
            <button type=\"button\" class=\"aic-btn cmsPjSave\" data-id=\"${esc(p.id)}\">💾 프로젝트 저장</button>
            <button type=\"button\" class=\"aic-btn aic-btn-rej cmsPjDel\" data-id=\"${esc(p.id)}\">삭제</button>"""
new="""          <div style=\"display:flex;gap:6px;flex-wrap:wrap\">
            <button type=\"button\" class=\"aic-btn aic-btn-primary cmsPjPublish\" data-id=\"${esc(p.id)}\">${(p.status||'draft')==='published'?'🌐 공개중':'🌐 홈페이지 공개'}</button>
            <button type=\"button\" class=\"aic-btn cmsPjSave\" data-id=\"${esc(p.id)}\">💾 프로젝트 저장</button>
            <button type=\"button\" class=\"aic-btn aic-btn-rej cmsPjDel\" data-id=\"${esc(p.id)}\">삭제</button>"""
assert old in s, 'project buttons marker missing'
s=s.replace(old,new,1)

old="""        <button type=\"button\" class=\"btn\" id=\"cmsSaveBtn\">💾 홈페이지에 반영</button>"""
new="""        <button type=\"button\" class=\"btn\" id=\"cmsSaveBtn\">${tab==='portfolio'?'💾 시공사례 저장':'💾 홈페이지에 반영'}</button>"""
assert old in s, 'top save button marker missing'
s=s.replace(old,new,1)

old="""    <div class=\"aic-sub\">${esc(cmsSession.email||'')} 로 로그인됨 · 저장하면 홈페이지에 즉시 반영됩니다."""
new="""    <div class=\"aic-sub\">${esc(cmsSession.email||'')} 로 로그인됨 · ${tab==='portfolio'?'시공사례는 <b>공개</b> 상태인 프로젝트만 홈페이지에 표시됩니다.':'저장하면 홈페이지에 즉시 반영됩니다.'}"""
assert old in s, 'subtitle marker missing'
s=s.replace(old,new,1)

old="""  document.querySelectorAll('.cmsPjSave').forEach(el=>el.addEventListener('click',()=>cmsSavePortfolio(el.dataset.id)));
  document.querySelectorAll('.cmsPjDel').forEach(el=>el.addEventListener('click',()=>cmsDeletePortfolio(el.dataset.id)));"""
new="""  document.querySelectorAll('.cmsPjPublish').forEach(el=>el.addEventListener('click',async()=>{
    const p=(cmsPortfolios||[]).find(x=>x.id===el.dataset.id); if(!p) return;
    p.status='published';
    await cmsEnsureCover(p.id);
    const ok=await cmsSavePortfolio(p.id,{silent:true,noRender:true});
    if(ok){
      cmsPortfolioDraftsSave();
      toast('홈페이지에 공개했어요','ok');
      await cmsLoadPortfolios();
      render();
    }else{
      toast('공개 저장에 실패했어요','warn'); render();
    }
  }));
  document.querySelectorAll('.cmsPjSave').forEach(el=>el.addEventListener('click',()=>cmsSavePortfolio(el.dataset.id)));
  document.querySelectorAll('.cmsPjDel').forEach(el=>el.addEventListener('click',()=>cmsDeletePortfolio(el.dataset.id)));"""
assert old in s, 'publish binding marker missing'
s=s.replace(old,new,1)

if s==orig:
    raise SystemExit('no changes')
p.write_text(s,encoding='utf-8')
print('patched ERP publish flow')
