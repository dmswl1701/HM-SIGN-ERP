/* 한 묶음에 넣을 수 있는 사진 수.
   ★ 2026-08-13 Worker 가 사진 주소를 한 번에 모아 서명하도록 바뀌면서 원래 있던
     20장 한도(사진 1장마다 바깥 요청 2번 → Cloudflare 50번 한계에 걸림)는 사라졌다.
     사진이 500장이어도 Worker 는 바깥 요청 5번만 쓴다(실측).
   지금 남은 기준은 한 번에 고를 수 있는 사진 수(120장)와 같게 맞춘 것뿐이다. */
const CMS_ALBUM_MAX=120;

/* 묶음 합치기 — 고른 묶음들을 하나로 모은다.
   ⚠ 서버가 사진을 다른 묶음으로 옮겨주지 못한다 (asset PATCH 가 role·sort_order 만 받는다).
     그래서 ERP 가 사진을 내려받아 대상 묶음에 다시 올리고, 다 옮긴 뒤에만 원래 묶음을 지운다.
     한 장이라도 실패하면 원래 묶음을 남겨 둔다 — 사진이 사라지는 일은 없어야 한다. */
let cmsMergePick={};
let cmsMergeState=null;   // {running,total,done,failed,label}

function cmsMergePicked(){
  return Object.keys(cmsMergePick)
    .filter(id=>cmsMergePick[id])
    .map(id=>(cmsPortfolios||[]).find(p=>p.id===id))
    .filter(Boolean);
}
/* 묶음을 하나 더 고를 때마다 화면을 다시 그리므로, 적어 둔 이름이 날아가지 않게 붙잡아 둔다 */
let cmsMergeDraft=null;
function cmsMergeCaptureDraft(){
  const t=document.getElementById('cmsMergeTitle'), c=document.getElementById('cmsMergeCategory');
  if(t||c) cmsMergeDraft={title:(t&&t.value)||'', category:(c&&c.value)||''};
}
function cmsGalleryTogglePick(id){
  cmsMergeCaptureDraft();
  if(cmsMergePick[id]) delete cmsMergePick[id]; else cmsMergePick[id]=true;
  if(!Object.keys(cmsMergePick).length) cmsMergeDraft=null;
  render();
}
function cmsGalleryClearPick(){ cmsMergePick={}; cmsMergeDraft=null; render(); }

/* 사진 1장을 다른 묶음으로 옮긴다. 내려받은 최적화본(2000px webp)을 다시 올린다.
   원본까지는 못 가져온다 — 서버가 원본 주소를 내주지 않는다.
   ⚠ 썸네일(640px)로 대신하지 말 것. 예전 Worker 가 image_url 을 안 줘서 썸네일로 흘러갔고,
     합친 사진이 조용히 저화질이 됐다. 큰 사진 주소가 없으면 차라리 실패시킨다. */
async function cmsMergeCopyPhoto(asset, targetId, sortOrder){
  const url=asset&&(asset.image_url||asset.optimized_url);
  if(!url) throw new Error('큰 사진 주소를 못 받았어요 (Worker가 옛 버전이면 이 오류가 납니다)');
  const r=await fetch(url);
  if(!r.ok) throw new Error('사진을 내려받지 못했어요 ('+r.status+')');
  const blob=await r.blob();
  if(!/^image\/(jpeg|png|webp)$/i.test(blob.type||'')) throw new Error('사진 형식을 알 수 없어요');
  const ext=(blob.type.split('/')[1]||'webp').replace('jpeg','jpg');
  const base=String(asset.original_name||'photo').replace(/\.[^.]+$/,'').slice(0,80)||'photo';
  const file=new File([blob], base+'.'+ext, {type:blob.type, lastModified:Date.now()});
  await cmsUploadAsset(targetId, file, 'gallery', sortOrder);
}

async function cmsGalleryMergeAlbums(){
  if(cmsMergeState&&cmsMergeState.running) return;
  const picked=cmsMergePicked();
  if(picked.length<2){ toast('묶음을 2개 이상 골라 주세요','warn'); return; }

  const target=picked[0], sources=picked.slice(1);
  const already=(cmsAssets[target.id]||[]).length;
  const moving=sources.reduce((s,p)=>s+(cmsAssets[p.id]||[]).length,0);
  if(already+moving>CMS_ALBUM_MAX){
    alert('합치면 사진이 '+(already+moving)+'장이 되어 한 묶음 한도('+CMS_ALBUM_MAX+'장)를 넘습니다.\n\n'
      +'묶음을 몇 개 빼고 다시 눌러 주세요.');
    return;
  }

  const titleEl=document.getElementById('cmsMergeTitle');
  const categoryEl=document.getElementById('cmsMergeCategory');
  const title=String((titleEl&&titleEl.value)||target.title||'').trim().slice(0,200);
  const category=String((categoryEl&&categoryEl.value)||cmsGalleryCategoryOf(target)).trim().slice(0,100);
  if(!title){ toast('합친 묶음의 이름을 입력해 주세요','warn'); if(titleEl)titleEl.focus(); return; }
  if(!confirm('묶음 '+picked.length+'개를 「'+title+'」 하나로 합칠까요?\n\n'
    +'· 사진 '+moving+'장을 옮기고, 옮긴 묶음은 삭제합니다\n'
    +'· 사진이 다 옮겨진 뒤에만 삭제하므로 사진이 사라지지 않습니다\n'
    +'· 옮기는 동안 화면을 끄지 말아 주세요')) return;

  cmsMergeState={running:true,total:moving,done:0,failed:0,label:title};
  cmsWakeOn(); render();
  const kept=[];
  try{
    let cursor=already;
    for(const src of sources){
      // 서명된 사진 주소는 1시간이면 만료된다 — 옮기기 직전에 새로 받는다
      const assets=await cmsRefreshAssets(src.id);
      let allOk=true;
      for(const a of assets){
        try{
          await cmsMergeCopyPhoto(a, target.id, cursor++);
          cmsMergeState.done++;
        }catch(e){
          allOk=false; cmsMergeState.failed++;
          state.cmsSaveTried=(state.cmsSaveTried||[]).concat([(src.title||'묶음')+' → '+(e&&e.message?e.message:String(e))]);
        }
        cmsMergeUpdateProgress();
      }
      if(allOk){
        const r=await cmsFetchRaw(CMS_BASE+'/portfolios/'+src.id,{method:'DELETE'});
        if((r.status>=200&&r.status<300)||r.status===404){
          cmsPortfolios=(cmsPortfolios||[]).filter(x=>x.id!==src.id);
          delete cmsAssets[src.id];
        }else{ kept.push(src.title||'묶음'); }
      }else{
        kept.push(src.title||'묶음');   // 실패한 사진이 있으면 원본을 남긴다
      }
    }
    await cmsGalleryPutAlbum(target,{title,category});
    await cmsEnsureCover(target.id).catch(()=>false);
  }catch(e){
    state.cmsErr='묶음 합치기 실패: '+(e&&e.message?e.message:e);
  }finally{
    cmsWakeOff();
    cmsMergeState.running=false;
    cmsMergePick={}; cmsMergeDraft=null;
    await cmsLoadPortfolios();
    cmsPortfolioDraftsSave();
  }

  if(cmsMergeState.failed){
    state.cmsErr='사진 '+cmsMergeState.failed+'장을 옮기지 못했어요';
    toast(cmsMergeState.done+'장 옮김 · '+cmsMergeState.failed+'장 실패','warn');
  }else{
    state.cmsErr=null; state.cmsSaveTried=null;
    toast('「'+title+'」 하나로 합쳤어요 · 사진 '+(already+cmsMergeState.done)+'장','ok');
    logActivity('홈페이지 사진 묶음 합치기: '+title+' ('+picked.length+'개 → 1개)','변경');
  }
  if(kept.length) alert('사진을 다 옮기지 못한 묶음은 지우지 않고 그대로 뒀습니다:\n\n'+kept.join('\n'));
  cmsMergeState=null;
  render();
}

/* 진행률만 다시 그린다 (전체 render 는 입력칸 포커스를 잃게 한다) */
function cmsMergeUpdateProgress(){
  const M=cmsMergeState; if(!M) return;
  const t=document.getElementById('cmsMergeProgressText');
  const b=document.getElementById('cmsMergeProgressBar');
  if(t) t.textContent='사진 '+M.total+'장 중 '+M.done+'장 옮김'+(M.failed?' · 실패 '+M.failed+'장':'');
  if(b) b.style.width=(M.total?Math.round((M.done+M.failed)/M.total*100):0)+'%';
}

/* 이 묶음이 홈페이지에서 "드래그 비교"로 보일 조건을 갖췄는지 알려준다.
   홈페이지(site.js buildCompare)는 한 묶음에 role=before 사진과 role=after 사진이
   둘 다 있을 때만 비교 슬라이더를 만든다. 조건을 반만 채우면 아무것도 안 나오는데,
   화면에 아무 말도 없으면 왜 안 나오는지 알 방법이 없다.
   ⚠ 시공 전·후는 묶음당 한 장씩이다 — 서버가 새로 지정하면 이전 것을 '현장'으로 내린다. */
function cmsGalleryCompareNote(assets){
  const list=assets||[];
  const before=list.filter(a=>a.role==='before').length;
  const after=list.filter(a=>a.role==='after').length;
  if(before&&after) return `<div class="aic-dm-ok" style="margin-top:10px;font-size:12.5px">
    ✅ <b>홈페이지 시공사례 맨 위에 드래그 비교로 나타납니다.</b> 손님이 손잡이를 끌어 전·후를 봅니다.</div>`;
  if(before||after) return `<div class="aic-dm-warn" style="margin-top:10px;font-size:12.5px">
    <b>${before?'시공 전':'시공 후'}</b>만 지정돼 있어요. <b>${before?'시공 후':'시공 전'}</b>도 한 장 골라야 드래그 비교가 생깁니다.</div>`;
  if(list.length>=2) return `<div class="aic-sub" style="margin-top:10px;font-size:12px">
    사진 두 장을 <b>시공 전</b> · <b>시공 후</b>로 지정하면 홈페이지에 드래그 비교가 생깁니다.</div>`;
  return '';
}

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
/* 편집 패널의 [저장] — 사진이 속한 현장의 이름·분류를 저장한다. */
async function cmsPhotoSaveEdit(){
  if(!cmsPhotoEdit) return;
  const p=(cmsPortfolios||[]).find(x=>x.id===cmsPhotoEdit.pid);
  if(!p){ toast('사진을 찾지 못했어요','warn'); return; }
  const t=document.getElementById('cmsPhotoTitle');
  const c=document.getElementById('cmsPhotoCategory');
  const title=String((t&&t.value)||'').trim();
  const category=String((c&&c.value)||'').trim();
  if(!title){ toast('현장 이름을 입력해 주세요','warn'); if(t)t.focus(); return; }
  try{
    cmsWakeOn();
    await cmsGalleryPutAlbum(p,{title,category});
    await cmsLoadPortfolios();
    cmsPortfolioDraftsSave();
    toast('저장했어요','ok');
    render();
  }catch(e){ toast('저장 실패: '+(e&&e.message?e.message:e),'warn'); }
  finally{ cmsWakeOff(); }
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
        await cmsUploadAssetRetry(id,valid[i],role,existing+i);
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
/* ---------- 사진 한 판으로 보기 ----------
   대표 요청: "사진 쫘라라락 보이고, 각 사진 눌러서 제목이나 내용 편집."
   묶음별 상자를 늘어놓으면 사진 40장이 40개 상자에 흩어져 무엇부터 볼지 알 수 없다.
   그래서 화면은 사진 한 판으로만 두고, 이름·분류·전후는 사진을 눌렀을 때만 연다.
   ⚠ 제목·분류는 사진이 아니라 그 사진이 속한 묶음의 것이다. 한 묶음에 사진이 여럿이면
     한 장에서 고친 제목이 같은 묶음의 다른 사진에도 그대로 걸린다 — 편집칸에 그렇게 적어 둔다. */
let cmsPhotoEdit=null;   // {pid, aid}
let cmsPhotoFilter='';   // '' = 전체 · '__none__' = 분류 없음 · 그 밖에는 분류 이름

/* 분류 고르기에 항상 띄워 둘 기본값. 아직 아무 분류도 안 만들었을 때
   빈 화면만 보여주면 무엇을 적어야 하는지 알 수가 없다. 실제로 쓰는 업종을 미리 깔아 둔다.
   이미 만든 분류가 있으면 그것들이 앞에 오고, 여기 값은 뒤에 붙는다(중복은 걸러진다). */
const CMS_CATEGORY_SUGGEST=['셀프빨래방','베이커리','카페','음식점','미용실','병원','학원','기타'];

function cmsPhotoAllCategories(){
  const out=[];
  cmsGalleryCategories().forEach(c=>{ if(c && out.indexOf(c)<0) out.push(c); });
  CMS_CATEGORY_SUGGEST.forEach(c=>{ if(out.indexOf(c)<0) out.push(c); });
  return out;
}
function cmsPhotoSetFilter(v){ cmsPhotoFilter=v; cmsPhotoEdit=null; render(); }
/* 분류 칩을 누르면 옆 입력칸을 채운다. 저장은 [저장] 버튼이 한다.
   ⚠ 여기서 render() 를 부르면 안 된다 — 화면을 다시 그리면 옆에 적던 현장 이름이 날아간다.
     그래서 입력값만 바꾸고 칩 표시는 직접 손본다. */
function cmsPhotoPickCategory(inputId,value,group){
  const el=document.getElementById(inputId);
  if(!el) return;
  const next=(el.value.trim()===value)?'':value;   // 같은 걸 또 누르면 해제
  el.value=next;
  document.querySelectorAll('.cmsCatChip[data-for="'+group+'"]').forEach(b=>{
    const on=(b.dataset.val===next);
    b.style.background=on?'var(--navy)':'';
    b.style.color=on?'#fff':'';
    b.style.borderColor=on?'var(--navy)':'';
    b.style.fontWeight=on?'700':'';
  });
}

/* 모든 묶음의 사진을 한 줄로 편다. 묶음 순서(최근 수정 순)를 유지하고, 묶음 안에서는 정렬 순서대로. */
function cmsPhotoFlat(){
  const out=[];
  (cmsPortfolios||[]).forEach(p=>{
    let added=0;
    (cmsAssets[p.id]||[]).forEach(a=>{
      const src=a.preview_url||a.thumbnail_url||a.image_url||a.optimized_url||a.public_url||a.url||'';
      if(src){ out.push({album:p, asset:a, src}); added++; }
    });
    /* 사진을 아직 못 받아온 현장도 자리를 남긴다.
       ⚠ 이걸 빼면 화면이 통째로 비어 "사진이 하나도 없다"로 보인다 —
         사진 목록은 현장마다 따로 불러오므로 느리거나 실패하면 흔히 일어난다.
         자리를 남겨두면 그동안에도 이름·분류를 고칠 수 있다. */
    if(!added) out.push({album:p, asset:null, src:''});
  });
  return out;
}
function cmsPhotoRoleLabel(role){
  const hit=CMS_ROLE_CHOICES.filter(c=>c.key===String(role||''))[0];
  return hit?hit.label:'현장';
}
function cmsPhotoOpen(pid,aid){ cmsPhotoEdit={pid,aid}; render(); }
function cmsPhotoClose(){ cmsPhotoEdit=null; render(); }

/* 올리다 실패하면 조용히 한 장이 사라진다. 대표가 "올려도 잘 안 올라간다"고 한 게 이것이다.
   휴대폰 업로드는 잠깐 끊기는 일이 잦으므로 같은 사진을 몇 번 더 시도한다. */
async function cmsUploadAssetRetry(pid,file,role,order){
  let last=null;
  for(let attempt=0;attempt<3;attempt++){
    try{ return await cmsUploadAsset(pid,file,role,order); }
    catch(e){
      last=e;
      if(attempt<2) await new Promise(r=>setTimeout(r, 700*(attempt+1)));
    }
  }
  throw last;
}

function cmsRenderPhotoGallery(){
  const list=Array.isArray(cmsPortfolios)?cmsPortfolios:[];
  const cats=cmsGalleryCategories();
  const G=cmsGalleryUploadState||{running:false,total:0,done:0,failed:0,previews:[]};
  const M=cmsMergeState;
  const picks=cmsMergePicked();
  const pickPhotos=picks.reduce((s,p)=>s+((cmsAssets[p.id]||[]).length),0);
  const pickOver=pickPhotos>CMS_ALBUM_MAX;
  const flatAll=cmsPhotoFlat();
  /* 분류별로 나눠 보기. 사진이 수십 장이면 한 판이 오히려 넓어서, 보고 싶은 업종만 남긴다. */
  const usedCats=[];
  flatAll.forEach(x=>{ const c=cmsGalleryCategoryOf(x.album); if(c && usedCats.indexOf(c)<0) usedCats.push(c); });
  const noneCount=flatAll.filter(x=>!cmsGalleryCategoryOf(x.album)).length;
  const flat=flatAll.filter(x=>{
    const c=cmsGalleryCategoryOf(x.album);
    if(cmsPhotoFilter==='') return true;
    if(cmsPhotoFilter==='__none__') return !c;
    return c===cmsPhotoFilter;
  });
  const filterBar=(usedCats.length||noneCount)?`
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px">
      ${[{v:'',t:'전체 '+flatAll.length}]
        .concat(usedCats.map(c=>({v:c,t:c+' '+flatAll.filter(x=>cmsGalleryCategoryOf(x.album)===c).length})))
        .concat(noneCount?[{v:'__none__',t:'분류 없음 '+noneCount}]:[])
        .map(o=>{ const on=(cmsPhotoFilter===o.v);
          return `<button type="button" class="aic-btn cmsPhotoFilterBtn" data-v="${esc(o.v)}"
            style="${on?'background:var(--navy);color:#fff;border-color:var(--navy);font-weight:700':''}">${esc(o.t)}</button>`;
        }).join('')}
    </div>`:'';

  /* 사진 한 장 = 칸 하나. 누르면 아래 편집 패널이 열린다.
     왼쪽 위 네모는 "합치기" 고르기용이고, 사진이 속한 묶음을 고른다. */
  const tiles=flat.map(item=>{
    const p=item.album, a=item.asset;
    const role=a?String(a.role||'gallery'):'';
    const marked=(role==='before'||role==='after');
    const picked=!!cmsMergePick[p.id];
    const open=cmsPhotoEdit&&(a?cmsPhotoEdit.aid===a.id:(!cmsPhotoEdit.aid&&cmsPhotoEdit.pid===p.id));
    const name=String(p.title||'').trim();
    const unnamed=(!name||name==='시공사진');
    return `<div style="position:relative;border:1px solid ${open?'var(--navy)':'var(--border)'};border-width:${open?'2px':'1px'};border-radius:10px;overflow:hidden;background:#fff${picked?';outline:2px solid var(--navy);outline-offset:-2px':''}">
      <label style="position:absolute;z-index:2;left:6px;top:6px;width:26px;height:26px;display:grid;place-items:center;background:rgba(255,255,255,.92);border-radius:7px;cursor:pointer" title="합치려면 고르세요">
        <input type="checkbox" class="cmsAlbumPick" data-id="${esc(p.id)}" ${picked?'checked':''} style="width:16px;height:16px;margin:0">
      </label>
      ${marked?`<span style="position:absolute;z-index:2;right:6px;top:6px;background:var(--navy);color:#fff;font-size:10.5px;font-weight:700;border-radius:6px;padding:3px 6px">${esc(cmsPhotoRoleLabel(role))}</span>`:''}
      <button type="button" class="cmsPhotoOpen" data-pid="${esc(p.id)}" data-aid="${a?esc(a.id):''}"
        style="display:block;width:100%;padding:0;border:0;background:#eef1f5;cursor:pointer;aspect-ratio:1">
        ${a?`<img src="${esc(item.src)}" alt="${esc(name||'시공사진')}" style="width:100%;height:100%;object-fit:cover;display:block">`
           :`<span style="display:grid;place-items:center;width:100%;height:100%;color:var(--text-mute);font-size:11.5px;line-height:1.5;padding:8px;text-align:center">사진 불러오는 중<br>또는 사진 없음</span>`}
      </button>
      <div style="padding:6px 8px 7px;font-size:11.5px;line-height:1.35;color:${unnamed?'#b3792c':'var(--text)'};font-weight:${unnamed?'700':'500'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
        ${unnamed?'이름 없음':esc(name)}
      </div>
    </div>`;
  }).join('');

  /* 편집 패널 — 사진을 눌렀을 때만 나온다. */
  let editPanel='';
  if(cmsPhotoEdit){
    const hit=cmsPhotoEdit.aid
      ? flat.filter(x=>x.asset && x.asset.id===cmsPhotoEdit.aid)[0]
      : flat.filter(x=>x.album.id===cmsPhotoEdit.pid)[0];
    if(!hit){ cmsPhotoEdit=null; }
    else{
      const p=hit.album, a=hit.asset;
      const assets=cmsAssets[p.id]||[];
      const role=a?String(a.role||'gallery'):'';
      const big=a?(a.image_url||a.optimized_url||hit.src):'';
      editPanel=`<div class="panel" style="border-color:var(--navy);margin-bottom:12px">
        <div style="display:flex;gap:14px;flex-wrap:wrap">
          ${big?`<img src="${esc(big)}" alt="" style="width:190px;height:190px;object-fit:cover;border-radius:10px;background:#eef1f5;flex:0 0 auto">`
               :`<div style="width:190px;height:190px;display:grid;place-items:center;border-radius:10px;background:#eef1f5;color:var(--text-mute);font-size:12px;flex:0 0 auto;text-align:center;line-height:1.6">사진을 아직<br>불러오지 못했어요</div>`}
          <div style="flex:1;min-width:230px">
            <div class="field" style="margin:0 0 8px">
              <label>현장 이름</label>
              <input type="text" id="cmsPhotoTitle" maxlength="200" value="${esc(String(p.title||'')==='시공사진'?'':(p.title||''))}" placeholder="예: 워시팡팡 주안점">
            </div>
            <div class="field" style="margin:0 0 8px">
              <label>분류</label>
              <input type="text" id="cmsPhotoCategory" list="cmsGalleryCategoryList" maxlength="100" value="${esc(cmsGalleryCategoryOf(p))}" placeholder="아래에서 고르거나 직접 입력">
              <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:6px">
                ${cmsPhotoAllCategories().map(c=>{
                  const on=(cmsGalleryCategoryOf(p)===c);
                  return `<button type="button" class="aic-btn cmsCatChip" data-for="edit" data-input="cmsPhotoCategory" data-val="${esc(c)}"
                    style="padding:4px 9px;font-size:12px${on?';background:var(--navy);color:#fff;border-color:var(--navy);font-weight:700':''}">${esc(c)}</button>`;
                }).join('')}
              </div>
            </div>
            ${a?`<label style="display:block;font-size:12px;color:var(--text-mute);margin-bottom:5px">이 사진은</label>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
              ${CMS_ROLE_CHOICES.map(c=>`<button type="button" class="aic-btn cmsPhotoSetRole" data-pid="${esc(p.id)}" data-aid="${esc(a.id)}" data-role="${c.key}"
                style="${role===c.key?'background:var(--navy);color:#fff;border-color:var(--navy);font-weight:700':''}">${esc(c.label)}</button>`).join('')}
            </div>`:''}
            ${assets.length>1?`<div class="aic-sub" style="margin-bottom:10px;font-size:12px">
              이 현장에 사진 <b>${assets.length}장</b>이 묶여 있어요. 이름·분류를 바꾸면 <b>${assets.length}장 전부</b>에 적용됩니다.</div>`:''}
            ${cmsGalleryCompareNote(assets)}
            <div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:10px">
              <button type="button" class="aic-btn" id="cmsPhotoSave" style="background:var(--navy);color:#fff;border-color:var(--navy);font-weight:700">저장</button>
              <label class="aic-btn" style="cursor:pointer">＋ 이 현장에 사진 추가
                <input type="file" class="cmsAlbumAddInput" data-id="${esc(p.id)}" accept="image/jpeg,image/png,image/webp" multiple style="display:none">
              </label>
              ${a?`<button type="button" class="aic-btn aic-btn-rej cmsGalleryDelete" data-pid="${esc(p.id)}" data-aid="${esc(a.id)}">이 사진 삭제</button>`
                 :`<button type="button" class="aic-btn aic-btn-rej cmsAlbumDelete" data-id="${esc(p.id)}">이 현장 삭제</button>`}
              <button type="button" class="aic-btn" id="cmsPhotoCloseBtn">닫기</button>
            </div>
          </div>
        </div>
      </div>`;
    }
  }
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
          <input type="text" id="cmsGalleryCategory" list="cmsGalleryCategoryList" maxlength="100" placeholder="아래에서 고르거나 직접 입력">
        </div>
        <button type="button" class="aic-btn" id="cmsGalleryNewCategory">＋ 새 분류</button>
      </div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin:0 0 12px">
        ${cmsPhotoAllCategories().map(c=>`<button type="button" class="aic-btn cmsCatChip" data-for="upload" data-input="cmsGalleryCategory" data-val="${esc(c)}"
          style="padding:4px 9px;font-size:12px">${esc(c)}</button>`).join('')}
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
      <h2 style="margin:0">사진 (${flat.length}${cmsPhotoFilter?' / 전체 '+flatAll.length:''})</h2>
      <span class="aic-sub">사진을 눌러 이름·분류·전후를 정하세요 · 네모를 고르면 한 현장으로 합칩니다</span>
    </div>
    ${filterBar}
    ${M&&M.running?`
      <div class="panel" style="position:sticky;top:0;z-index:6;border-color:var(--navy)">
        <b style="color:var(--navy)">「${esc(M.label)}」로 합치는 중…</b>
        <div class="aic-sub" style="margin:6px 0 8px">사진을 옮기는 동안 화면을 끄거나 다른 앱으로 넘어가지 말아 주세요.</div>
        <div id="cmsMergeProgressText" style="font-size:12px;font-weight:700;color:var(--navy);margin-bottom:7px">사진 ${M.total}장 중 ${M.done}장 옮김${M.failed?' · 실패 '+M.failed+'장':''}</div>
        <div class="cms-upload-progress"><i id="cmsMergeProgressBar" style="width:${M.total?Math.round((M.done+M.failed)/M.total*100):0}%"></i></div>
      </div>`
    :(picks.length?`
      <div class="panel" style="position:sticky;top:0;z-index:6;border-color:var(--navy)">
        <b style="color:var(--navy)">묶음 ${picks.length}개 선택됨 · 사진 ${pickPhotos}장</b>
        <div class="aic-sub" style="margin:6px 0 10px;line-height:1.7">
          맨 위에 있는 <b>「${esc(picks[0].title||'제목 없음')}」</b>에 나머지 사진을 모읍니다. 옮긴 묶음은 사라집니다.
          ${pickOver?`<br><span style="color:#b33;font-weight:700">사진이 ${pickPhotos}장이라 한 묶음 한도(${CMS_ALBUM_MAX}장)를 넘습니다. 묶음을 몇 개 빼 주세요.</span>`:''}
        </div>
        <div style="display:grid;grid-template-columns:minmax(180px,1.4fr) minmax(140px,1fr);gap:8px;margin-bottom:9px">
          <input type="text" id="cmsMergeTitle" maxlength="200" placeholder="합친 뒤 이름" value="${esc(cmsMergeDraft?cmsMergeDraft.title:(picks[0].title||''))}">
          <input type="text" id="cmsMergeCategory" list="cmsGalleryCategoryList" maxlength="100" placeholder="분류" value="${esc(cmsMergeDraft?cmsMergeDraft.category:cmsGalleryCategoryOf(picks[0]))}">
        </div>
        <div style="display:flex;gap:7px;flex-wrap:wrap">
          <button type="button" class="aic-btn" id="cmsMergeRun" ${(picks.length<2||pickOver)?'disabled':''}>${picks.length}개를 하나로 합치기</button>
          <button type="button" class="aic-btn" id="cmsMergeClear">선택 해제</button>
        </div>
      </div>`:'')}
    ${editPanel}
    ${flat.length
      ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:10px">${tiles}</div>`
      : (cmsPhotoFilter
          ? '<div class="panel"><div class="empty">이 분류에는 사진이 없어요. 위에서 <b>전체</b>를 눌러 보세요.</div></div>'
          : '<div class="panel"><div class="empty">아직 사진이 없어요. 위에서 사진을 여러 장 골라 올려 주세요.</div></div>')}
  `;
}
