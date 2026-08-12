/* 한 묶음에 넣을 수 있는 사진 수 (2026-08-13 실측으로 정한 값)
   홈페이지가 묶음을 열 때 CMS Worker 는 사진 1장마다 주소 2개(원본·썸네일)에 서명한다.
   그래서 바깥 요청을 2N+3 번 쓰는데, Cloudflare Worker 는 요청 하나에 바깥 요청 50번이 한계다.
   → 24장부터 503 이 떨어져 그 묶음이 홈페이지에서 아예 안 열린다 (목록에서 실제로 확인함).
   여유를 두고 20장에서 끊는다. 이 숫자를 올리려면 Worker 가 서명을 한 번에 모아 하도록
   먼저 고쳐야 한다. */
const CMS_ALBUM_MAX=20;

function cmsGalleryCategoryOf(p){
  return String((p&&(p.category||p.industry))||'').trim();
}
function cmsGalleryCategories(){
  const out=[];
  (cmsPortfolios||[]).forEach(p=>{
    const c=cmsGalleryCategoryOf(p);
    if(c && !out.includes(c)) out.push(c);
  });
  return out.sort((a,b)=>a.localeCompare(b,'ko'));
}
function cmsGalleryAlbumPayload(p,overrides={}){
  const id=p&&p.id;
  return {
    title:String(overrides.title!=null?overrides.title:(p&&p.title)||'시공사진').trim().slice(0,200)||'시공사진',
    slug:String((p&&p.slug)||cmsGalleryHiddenSlug(id)).trim().slice(0,200),
    industry:String(overrides.category!=null?overrides.category:cmsGalleryCategoryOf(p)).trim().slice(0,100),
    region:String((p&&p.region)||'').trim().slice(0,100),
    summary:String((p&&p.summary)||'').trim().slice(0,5000),
    materials:Array.isArray(p&&p.materials)?p.materials.slice(0,30):[],
    featured:Boolean(p&&p.featured),
    status:['draft','review','published'].includes(p&&p.status)?p.status:'published'
  };
}
async function cmsGalleryPutAlbum(p,overrides={}){
  if(!p||!p.id) throw new Error('사진 묶음 정보를 찾지 못했어요');
  const payload=cmsGalleryAlbumPayload(p,overrides);
  const r=await cmsFetchRaw(CMS_BASE+'/portfolios/'+p.id,{method:'PUT',body:JSON.stringify(payload)});
  if(!(r.status>=200&&r.status<300)){
    let m=''; try{m=(await r.text()).replace(/\s+/g,' ').slice(0,120);}catch(e){}
    throw new Error('사진 묶음 저장 실패 ('+r.status+')'+(m?' '+m:''));
  }
  return payload;
}
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
    await cmsLoadPortfolios();
    cmsPortfolioDraftsSave();
    toast('사진 묶음 정보를 저장했어요','ok');
    render();
  }catch(e){ toast('저장 실패: '+(e&&e.message?e.message:e),'warn'); }
  finally{ cmsWakeOff(); }
}
async function cmsGalleryDeleteAlbum(id){
  const p=(cmsPortfolios||[]).find(x=>x.id===id);
  if(!p) return;
  const n=(cmsAssets[id]||[]).length;
  if(!confirm('"'+(p.title||'시공사진')+'" 묶음을 삭제할까요?\n\n사진 '+n+'장도 홈페이지에서 함께 삭제됩니다.')) return;
  try{
    cmsWakeOn();
    const r=await cmsFetchRaw(CMS_BASE+'/portfolios/'+id,{method:'DELETE'});
    if(!(r.status>=200&&r.status<300) && r.status!==404) throw new Error('삭제 실패 ('+r.status+')');
    cmsPortfolios=(cmsPortfolios||[]).filter(x=>x.id!==id);
    delete cmsAssets[id];
    cmsQueueClear(id,true);
    cmsPortfolioDraftsSave();
    toast('사진 묶음을 삭제했어요','ok');
    render();
  }catch(e){ toast('묶음 삭제 실패: '+(e&&e.message?e.message:e),'warn'); }
  finally{ cmsWakeOff(); }
}
async function cmsGalleryRenameCategory(oldName){
  const next=prompt('분류 이름을 수정해 주세요',oldName);
  if(next===null) return;
  const name=String(next).trim().slice(0,100);
  if(!name){ toast('분류 이름은 비워둘 수 없어요','warn'); return; }
  if(name===oldName) return;
  const targets=(cmsPortfolios||[]).filter(p=>cmsGalleryCategoryOf(p)===oldName);
  try{
    cmsWakeOn();
    for(const p of targets) await cmsGalleryPutAlbum(p,{category:name});
    await cmsLoadPortfolios();
    cmsPortfolioDraftsSave();
    toast('"'+oldName+'" → "'+name+'" 분류를 바꿨어요','ok');
    render();
  }catch(e){ toast('분류 수정 실패: '+(e&&e.message?e.message:e),'warn'); }
  finally{ cmsWakeOff(); }
}
async function cmsGalleryDeleteCategory(name){
  const targets=(cmsPortfolios||[]).filter(p=>cmsGalleryCategoryOf(p)===name);
  if(!confirm('"'+name+'" 분류를 삭제할까요?\n\n사진은 삭제되지 않고 '+targets.length+'개 묶음의 분류만 비워집니다.')) return;
  try{
    cmsWakeOn();
    for(const p of targets) await cmsGalleryPutAlbum(p,{category:''});
    await cmsLoadPortfolios();
    cmsPortfolioDraftsSave();
    toast('분류를 삭제했어요 · 사진은 그대로예요','ok');
    render();
  }catch(e){ toast('분류 삭제 실패: '+(e&&e.message?e.message:e),'warn'); }
  finally{ cmsWakeOff(); }
}
function cmsGalleryNewCategory(){
  const name=prompt('새 분류 이름\n예: 셀프빨래방, 베이커리, 음식점, 카페');
  if(name===null) return;
  const value=String(name).trim().slice(0,100);
  if(!value) return;
  const input=document.getElementById('cmsGalleryCategory');
  if(input){ input.value=value; input.focus(); }
  toast('분류를 선택했어요 · 사진을 올리면 자동 추가됩니다','ok');
}
async function cmsGalleryAddFiles(id,fileList){
  if(cmsGalleryUploadState.running){ toast('지금 다른 사진을 올리는 중이에요','warn'); return; }
  const raw=[...(fileList||[])];
  const seen=new Set(),valid=[]; let skipped=0;
  for(const f of raw.slice(0,120)){
    const key=[f&&f.name,f&&f.size,f&&f.lastModified].join('|');
    if(!f || !/^image\/(jpeg|png|webp)$/i.test(f.type||'') || f.size>15*1024*1024 || seen.has(key)){ skipped++; continue; }
    seen.add(key); valid.push(f);
  }
  if(raw.length>120) skipped+=raw.length-120;
  if(!valid.length){ toast('올릴 수 있는 사진이 없어요','warn'); return; }
  const existing=(cmsAssets[id]||[]).length;
  const room=CMS_ALBUM_MAX-existing;
  if(room<=0){
    toast('이 묶음은 사진 '+CMS_ALBUM_MAX+'장이 다 찼어요 · 새 묶음으로 올려 주세요','warn');
    return;
  }
  if(valid.length>room){
    const over=valid.length-room;
    valid.length=room;   // const 배열이라 길이를 줄여 잘라낸다
    alert('한 묶음에는 사진 '+CMS_ALBUM_MAX+'장까지만 들어갑니다.\n\n'
      +room+'장을 채우고, 나머지 '+over+'장은 올리지 않았습니다.\n남은 사진은 새 묶음으로 올려 주세요.');
  }
  const G=cmsGalleryUploadState={running:true,total:valid.length,done:0,failed:0,previews:[],errors:[]};
  cmsWakeOn(); render();
  let cursor=0;
  const worker=async()=>{
    while(true){
      const i=cursor++; if(i>=valid.length) return;
      try{
        const role=(existing===0 && i===0)?'cover':'gallery';
        await cmsUploadAsset(id,valid[i],role,existing+i);
        G.done++;
      }catch(e){ G.failed++; G.errors.push((valid[i].name||'사진')+' → '+(e&&e.message?e.message:String(e))); }
      cmsGalleryUpdateProgress();
    }
  };
  try{
    await Promise.all([worker(),worker(),worker()]);
    if(G.done){
      await cmsEnsureCover(id).catch(()=>false);
      await cmsRefreshAssets(id);
    }
  }finally{
    cmsWakeOff();
    G.running=false;
    await cmsLoadPortfolios();
    cmsPortfolioDraftsSave();
  }
  if(skipped) toast(skipped+'장은 중복·형식·용량 문제로 제외했어요','warn');
  if(G.failed){
    state.cmsErr='사진 '+G.failed+'장 업로드 실패';
    state.cmsSaveTried=G.errors.slice();
    toast(G.done+'장 추가 · '+G.failed+'장 실패','warn');
  }else{
    state.cmsErr=null; state.cmsSaveTried=null;
    toast(G.done+'장 추가했어요','ok');
  }
  render();
}
function cmsRenderPhotoGallery(){
  const list=Array.isArray(cmsPortfolios)?cmsPortfolios:[];
  const cats=cmsGalleryCategories();
  const G=cmsGalleryUploadState||{running:false,total:0,done:0,failed:0,previews:[]};
  const albums=list.map(p=>{
    const assets=cmsAssets[p.id]||[];
    const category=cmsGalleryCategoryOf(p);
    const title=String(p.title||'시공사진');
    const safeId=esc(p.id);
    return `
      <div class="panel" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
          <div style="min-width:220px;flex:1">
            <div style="font-size:12px;color:var(--text-mute);margin-bottom:5px">사진 묶음 · ${assets.length}/${CMS_ALBUM_MAX}장${assets.length>=CMS_ALBUM_MAX?' · 가득 참':''}</div>
            <div style="display:grid;grid-template-columns:minmax(180px,1.4fr) minmax(150px,1fr);gap:8px">
              <input id="cmsAlbumTitle_${safeId}" value="${esc(title)}" maxlength="200" placeholder="사진 묶음 이름">
              <input id="cmsAlbumCategory_${safeId}" value="${esc(category)}" list="cmsGalleryCategoryList" maxlength="100" placeholder="분류 없음">
            </div>
          </div>
          <div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap">
            <button type="button" class="aic-btn cmsAlbumSave" data-id="${safeId}">저장</button>
            <label class="aic-btn" style="cursor:pointer">
              ＋ 사진 추가
              <input type="file" class="cmsAlbumAddInput" data-id="${safeId}" accept="image/jpeg,image/png,image/webp" multiple style="display:none">
            </label>
            <button type="button" class="aic-btn aic-btn-rej cmsAlbumDelete" data-id="${safeId}">묶음 삭제</button>
          </div>
        </div>
        ${assets.length?`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:9px;margin-top:12px">${assets.map(a=>{
          const src=a.preview_url||a.thumbnail_url||a.image_url||a.optimized_url||a.public_url||a.url||'';
          if(!src) return '';
          return `<div style="position:relative;border:1px solid var(--border);border-radius:9px;overflow:hidden;background:#fff">
            <button type="button" class="cmsGalleryPreview" data-pid="${safeId}" data-aid="${esc(a.id)}" style="display:block;width:100%;padding:0;border:0;background:#eef1f5;cursor:pointer;aspect-ratio:1">
              <img src="${esc(src)}" alt="${esc(title)}" style="width:100%;height:100%;object-fit:cover;display:block">
            </button>
            <button type="button" class="cmsGalleryDelete aic-btn aic-btn-rej" data-pid="${safeId}" data-aid="${esc(a.id)}" style="width:100%;border-radius:0;border-width:1px 0 0;padding:6px 7px">삭제</button>
          </div>`;
        }).join('')}</div>`:'<div class="aic-sub" style="margin-top:10px">아직 사진이 없어요.</div>'}
      </div>`;
  }).join('');
  return `
    <datalist id="cmsGalleryCategoryList">${cats.map(c=>`<option value="${esc(c)}"></option>`).join('')}</datalist>
    <div class="panel">
      <h2>📸 홈페이지 사진</h2>
      <div class="aic-sub" style="margin:-8px 0 14px;line-height:1.7">
        <b>한 번에 고른 사진은 한 묶음으로 올라가요.</b> 묶음 이름과 분류만 정하면 홈페이지에서도 그대로 정리됩니다.
      </div>
      <div style="display:grid;grid-template-columns:minmax(220px,1.4fr) minmax(180px,1fr) auto;gap:8px;align-items:end;margin-bottom:10px">
        <div class="field" style="margin:0">
          <label>사진 묶음 이름 <span style="font-weight:400;color:var(--text-mute)">(선택)</span></label>
          <input type="text" id="cmsGalleryTitle" maxlength="200" placeholder="예: 워시팡팡 주안점">
        </div>
        <div class="field" style="margin:0">
          <label>분류 <span style="font-weight:400;color:var(--text-mute)">(선택)</span></label>
          <input type="text" id="cmsGalleryCategory" list="cmsGalleryCategoryList" maxlength="100" placeholder="예: 셀프빨래방">
        </div>
        <button type="button" class="aic-btn" id="cmsGalleryNewCategory">＋ 새 분류</button>
      </div>
      ${cats.length?`<div style="display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px">${cats.map(c=>`
        <span style="display:inline-flex;align-items:center;gap:3px;border:1px solid var(--border);border-radius:999px;padding:5px 7px 5px 10px;background:#fff;font-size:12px">
          ${esc(c)}
          <button type="button" class="cmsCategoryRename" data-cat="${esc(c)}" title="분류 이름 수정" style="border:0;background:transparent;cursor:pointer;padding:0 3px">✎</button>
          <button type="button" class="cmsCategoryDelete" data-cat="${esc(c)}" title="분류 삭제" style="border:0;background:transparent;cursor:pointer;padding:0 3px;color:#b33">×</button>
        </span>`).join('')}</div>`:''}
      <label class="cms-upload-zone" id="cmsGalleryZone" style="min-height:120px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;cursor:pointer">
        <b style="font-size:16px">＋ 사진 여러 장 추가</b>
        <span>JPG/PNG/WebP · 장당 15MB 이하 · 한 묶음에 최대 ${CMS_ALBUM_MAX}장</span>
        <input type="file" id="cmsGalleryInput" accept="image/jpeg,image/png,image/webp" multiple style="display:none" ${G.running?'disabled':''}>
      </label>
      ${G.running?`<div style="margin-top:14px">
        <div id="cmsGalleryProgressText" style="font-size:12px;font-weight:700;color:var(--navy);margin-bottom:7px">전체 ${G.total}장 · 완료 ${G.done}장${G.failed?' · 실패 '+G.failed+'장':''}</div>
        <div class="cms-upload-progress"><i id="cmsGalleryProgressBar" style="width:${G.total?Math.round((G.done+G.failed)/G.total*100):0}%"></i></div>
      </div>`:''}
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin:16px 0 10px">
      <h2 style="margin:0">사진 묶음 (${list.length})</h2>
      <span class="aic-sub">제목·분류 수정 · 사진 추가/삭제 가능</span>
    </div>
    ${albums||'<div class="panel"><div class="empty">아직 사진 묶음이 없어요. 위에서 사진을 여러 장 골라 올려 주세요.</div></div>'}
  `;
}
