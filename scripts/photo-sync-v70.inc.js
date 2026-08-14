/* HM PHOTO SYNC V70 — metadata edits must be visible immediately and verifiable end-to-end. */

function cmsV70AfterRender(){
  setTimeout(()=>{
    const apply=document.getElementById('cmsRenamePicked');
    if(apply){
      const n=(cmsMergePicked()||[]).length;
      apply.textContent=(n? n+'개에 ':'')+'이름·분류 적용';
      apply.style.minWidth='190px';
    }
    const merge=document.getElementById('cmsMergeRun');
    if(merge) merge.textContent='한 현장으로 합치기';
    const select=document.getElementById('cmsPhotoSelectModeBtn');
    if(select && !cmsPhotoSelectMode) select.textContent='☑ 여러 사진 한꺼번에 수정';
    cmsV70PaintStatus();
  },0);
}

function cmsV70SetStatus(type,text){
  state.cmsPhotoSyncNotice={type:type||'ok',text:String(text||''),at:Date.now()};
  cmsV70AfterRender();
}

function cmsV70PaintStatus(){
  const note=state.cmsPhotoSyncNotice;
  if(!note||!note.text) return;
  const zone=document.getElementById('cmsGalleryZone');
  const panel=zone&&zone.closest('.panel');
  if(!panel) return;
  let el=document.getElementById('cmsPhotoSyncNotice');
  if(!el){
    el=document.createElement('div');
    el.id='cmsPhotoSyncNotice';
    const h=panel.querySelector('h2');
    if(h&&h.nextSibling) panel.insertBefore(el,h.nextSibling); else panel.prepend(el);
  }
  const ok=note.type==='ok';
  el.style.cssText='margin:8px 0 14px;padding:10px 12px;border-radius:8px;font-size:12.5px;font-weight:700;line-height:1.55;border:1px solid '+(ok?'#a9d9be':'#e9ce9c')+';background:'+(ok?'var(--green-bg)':'var(--amber-bg)')+';color:'+(ok?'var(--green)':'#7a4e0e');
  el.textContent=(ok?'✓ ':'⚠ ')+note.text;
}

/* 선택을 바꿔도 이미 입력한 이름·분류를 잃지 않는다. */
function cmsPhotoTogglePick(id){
  cmsMergeCaptureDraft();
  if(cmsMergePick[id]) delete cmsMergePick[id]; else cmsMergePick[id]=true;
  render();
  cmsV70AfterRender();
}
function cmsPhotoPickAllVisible(ids){
  cmsMergeCaptureDraft();
  const list=ids||[];
  const allOn=list.length && list.every(id=>cmsMergePick[id]);
  if(allOn) list.forEach(id=>{ delete cmsMergePick[id]; });
  else list.forEach(id=>{ cmsMergePick[id]=true; });
  render();
  cmsV70AfterRender();
}
function cmsPhotoToggleSelectMode(){
  cmsPhotoSelectMode=!cmsPhotoSelectMode;
  cmsPhotoEdit=null;
  if(!cmsPhotoSelectMode){ cmsMergePick={}; cmsMergeDraft=null; }
  render();
  cmsV70AfterRender();
}

async function cmsV70VerifyPublic(payload){
  if(!payload || payload.status!=='published') return {ok:true,live:false,why:'비공개'};
  try{
    const url=CMS_API+'/api/v1/public/portfolio/'+encodeURIComponent(payload.slug)+'?_hm='+Date.now();
    const r=await fetch(url,{headers:{accept:'application/json'},cache:'no-store'});
    if(!r.ok) return {ok:false,live:false,why:'공개 API '+r.status};
    const d=await r.json();
    const title=String((d&&d.title)||'').trim();
    const category=String((d&&(d.category||d.industry))||'').trim();
    if(title!==payload.title) return {ok:false,live:false,why:'홈페이지 제목이 아직 옛값입니다'};
    if(category!==payload.industry) return {ok:false,live:false,why:'홈페이지 분류가 아직 옛값입니다'};
    return {ok:true,live:true,data:d};
  }catch(e){
    return {ok:false,live:false,why:'홈페이지 확인 실패: '+String(e&&e.message||e).slice(0,80)};
  }
}

/* PUT 200만 믿지 않는다. 저장한 뒤 공개 상세 API에서 실제 값을 다시 읽어 확인한다.
   그리고 전체 목록을 즉시 다시 읽어 옛 fallback으로 덮어쓰지 않는다. */
async function cmsGalleryPutAlbum(p,overrides={}){
  if(!p||!p.id) throw new Error('사진 묶음 정보를 찾지 못했어요');
  const payload=cmsGalleryAlbumPayload(p,overrides);
  const r=await cmsFetchRaw(CMS_BASE+'/portfolios/'+p.id,{method:'PUT',body:JSON.stringify(payload)});
  if(!(r.status>=200&&r.status<300)){
    let m=''; try{m=(await r.text()).replace(/\s+/g,' ').slice(0,200);}catch(e){}
    state.cmsErr='사진 정보 저장 실패 ('+r.status+') '+m;
    state.cmsSaveTried=['PUT '+CMS_BASE+'/portfolios/'+p.id,'보낸 값: '+JSON.stringify(payload).slice(0,300),'서버 응답: '+(m||'(내용 없음)')];
    cmsV70SetStatus('warn','저장에 실패했습니다. 아래 오류 내용을 확인해 주세요.');
    throw new Error('저장 실패 ('+r.status+') '+m);
  }

  // 화면은 즉시 새 값으로 바꾼다. 여기서 cmsLoadPortfolios()를 부르면 오래된 fallback이 다시 덮을 수 있다.
  p.title=payload.title;
  p.category=payload.industry;
  p.industry=payload.industry;
  p.slug=payload.slug;
  p.status=payload.status;
  cmsPortfolioDraftsSave();

  const live=await cmsV70VerifyPublic(payload);
  if(payload.status==='published'){
    if(live.ok && live.live){
      state.cmsErr=null; state.cmsSaveTried=null;
      cmsV70SetStatus('ok','ERP 저장 확인됨 · 홈페이지 공개값까지 확인됨');
    }else{
      state.cmsErr='ERP에는 저장했지만 홈페이지 공개값 확인이 끝나지 않았어요';
      state.cmsSaveTried=[live.why||'공개 API 확인 실패','현장: '+payload.title,'분류: '+(payload.industry||'(없음)')];
      cmsV70SetStatus('warn','ERP에는 저장했습니다 · 홈페이지 반영은 아직 확인되지 않았습니다');
    }
  }else{
    cmsV70SetStatus('ok','ERP에 저장됨 · 현재 비공개라 홈페이지에는 표시되지 않습니다');
  }
  return payload;
}

/* 여러 사진 정리는 한 버튼으로 끝낸다. 확인창을 또 띄우지 않고 메타데이터만 바로 적용한다. */
async function cmsGalleryRenamePicked(){
  const picked=cmsMergePicked();
  if(!picked.length){ toast('먼저 사진을 골라 주세요','warn'); return; }
  const t=document.getElementById('cmsMergeTitle');
  const c=document.getElementById('cmsMergeCategory');
  const title=String((t&&t.value)||'').trim().slice(0,200);
  const category=String((c&&c.value)||'').trim().slice(0,100);
  if(!title){ toast('현장 이름을 입력해 주세요','warn'); if(t)t.focus(); return; }

  const btn=document.getElementById('cmsRenamePicked');
  if(btn){ btn.disabled=true; btn.textContent='적용 중…'; }
  let done=0, failed=0, lastError='';
  try{
    cmsWakeOn();
    for(const p of picked){
      try{ await cmsGalleryPutAlbum(p,{title,category}); done++; }
      catch(e){ failed++; lastError=String(e&&e.message||e); }
    }
    cmsPortfolioDraftsSave();
  }finally{
    cmsWakeOff();
    cmsMergePick={}; cmsMergeDraft=null;
  }

  if(failed){
    cmsV70SetStatus('warn',done+'개 저장 · '+failed+'개 실패'+(lastError?' · '+lastError.slice(0,80):''));
    toast(done+'개 저장 · '+failed+'개 실패','warn');
  }else{
    if(!state.cmsErr) cmsV70SetStatus('ok',done+'개 ERP 저장됨 · 홈페이지 반영 확인 완료');
    toast(done+'개에 이름·분류를 적용했어요','ok');
    logActivity('홈페이지 사진 이름·분류 변경: '+title+' ('+done+'개)','변경');
  }
  render();
  cmsV70AfterRender();
}

/* 사진 한 장을 눌러 편집할 때도 같은 검증 흐름을 쓴다. */
async function cmsPhotoSaveEdit(){
  if(!cmsPhotoEdit) return;
  const p=(cmsPortfolios||[]).find(x=>x.id===cmsPhotoEdit.pid);
  if(!p){ toast('사진을 찾지 못했어요','warn'); return; }
  const t=document.getElementById('cmsPhotoTitle');
  const c=document.getElementById('cmsPhotoCategory');
  const title=String((t&&t.value)||'').trim();
  const category=String((c&&c.value)||'').trim();
  if(!title){ toast('현장 이름을 입력해 주세요','warn'); if(t)t.focus(); return; }
  const btn=document.getElementById('cmsPhotoSave');
  if(btn){ btn.disabled=true; btn.textContent='저장 중…'; }
  try{
    cmsWakeOn();
    await cmsGalleryPutAlbum(p,{title,category});
    cmsPortfolioDraftsSave();
    toast('저장했어요','ok');
    render();
    cmsV70AfterRender();
  }catch(e){ toast('저장 실패: '+(e&&e.message?e.message:e),'warn'); }
  finally{ cmsWakeOff(); }
}

/* 예전 묶음 편집 버튼 경로도 전체 목록 재로딩 없이 같은 방식으로 저장한다. */
async function cmsGalleryUpdateAlbum(id){
  const p=(cmsPortfolios||[]).find(x=>x.id===id);
  if(!p){ toast('사진 묶음을 찾지 못했어요','warn'); return; }
  const t=document.getElementById('cmsAlbumTitle_'+id);
  const c=document.getElementById('cmsAlbumCategory_'+id);
  const title=String((t&&t.value)||'').trim();
  const category=String((c&&c.value)||'').trim();
  if(!title){ toast('사진 묶음 이름을 입력해 주세요','warn'); if(t)t.focus(); return; }
  try{
    cmsWakeOn();
    await cmsGalleryPutAlbum(p,{title,category});
    cmsPortfolioDraftsSave();
    toast('사진 묶음 정보를 저장했어요','ok');
    render();
    cmsV70AfterRender();
  }catch(e){ toast('저장 실패: '+(e&&e.message?e.message:e),'warn'); }
  finally{ cmsWakeOff(); }
}
