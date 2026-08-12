import fs from 'node:fs';

const path='public/index.html';
let text=fs.readFileSync(path,'utf8');
const marker='/* HM_PHOTO_GALLERY_V1 */';
if(text.includes(marker)){
  console.log('HM photo album patch already applied.');
  process.exit(0);
}
let helpers=Buffer.from(fs.readFileSync('scripts/photo-gallery-helpers.b64','utf8').trim(),'base64').toString('utf8');
const events=Buffer.from(fs.readFileSync('scripts/photo-gallery-events.b64','utf8').trim(),'base64').toString('utf8');

// 숨은 프로젝트 slug는 기존 공개 상세 URL 규칙과 맞춘다.
helpers=helpers.replace(
  "return 'photo-'+String(id||'').toLowerCase().replace(/[^0-9a-z]/g,'');",
  "return 'project-'+String(id||'').toLowerCase().replace(/[^0-9a-z]/g,'');"
);

// 사진 추가 영역에 선택 입력값 하나만 둔다. 지역/분류/프로젝트 작성은 다시 만들지 않는다.
helpers=helpers.replace(
  '      <label class="cms-upload-zone" id="cmsGalleryZone"',
  `      <div class="field" style="margin:0 0 10px">
        <label>사진 묶음 이름 <span style="font-weight:400;color:var(--text-mute)">(선택)</span></label>
        <input type="text" id="cmsGalleryTitle" maxlength="200" placeholder="예: 워시팡팡 외부간판 시공 · 비워도 됩니다">
        <div class="aic-sub" style="margin-top:5px;font-size:11.5px">한 번에 고른 사진들은 이 이름 아래 한 묶음으로 올라갑니다.</div>
      </div>
      <label class="cms-upload-zone" id="cmsGalleryZone"`
);

// 한 번 선택한 사진을 각각 별도 카드로 만들지 않고, 하나의 앨범(포트폴리오)에 여러 장 넣는다.
const uploadStart=helpers.indexOf('async function cmsGalleryUploadFiles(fileList){');
const uploadEnd=helpers.indexOf('\nasync function cmsGalleryDeletePhoto', uploadStart);
if(uploadStart<0 || uploadEnd<0) throw new Error('gallery upload function not found');
const groupedUpload=`async function cmsGalleryUploadFiles(fileList){
  if(cmsGalleryUploadState.running){ toast('지금 사진을 올리는 중이에요','warn'); return; }
  const raw=[...(fileList||[])];
  if(!raw.length) return;
  const seen=new Set(), valid=[]; let skipped=0;
  for(const f of raw.slice(0,120)){
    const key=[f.name,f.size,f.lastModified].join('|');
    if(!f || !/^image\\/(jpeg|png|webp)$/i.test(f.type||'') || f.size>15*1024*1024 || seen.has(key)){ skipped++; continue; }
    seen.add(key); valid.push(f);
  }
  if(raw.length>120) skipped+=raw.length-120;
  if(!valid.length){ toast('올릴 수 있는 사진이 없어요 · JPG/PNG/WebP, 장당 15MB 이하','warn'); return; }
  if(skipped) toast(skipped+'장은 중복·형식·용량 문제로 제외했어요','warn');

  const titleEl=document.getElementById('cmsGalleryTitle');
  const albumTitle=((titleEl&&titleEl.value)||'').trim().slice(0,200) || '시공사진';
  const albumId=cmsUuid();
  const G=cmsGalleryUploadState={running:true,total:valid.length,done:0,failed:0,previews:[],errors:[]};
  G.previews=valid.map((file,i)=>({id:'g_'+i,url:URL.createObjectURL(file),name:file.name}));
  cmsWakeOn();
  render();

  const saveAlbum=async(status)=>{
    const r=await cmsFetchRaw(CMS_BASE+'/portfolios/'+albumId,{
      method:'PUT',
      body:JSON.stringify({
        title:albumTitle,
        slug:cmsGalleryHiddenSlug(albumId),
        industry:'', region:'', summary:'', materials:[], featured:false, status
      })
    });
    if(!(r.status>=200&&r.status<300)){
      let m=''; try{m=(await r.text()).replace(/\\s+/g,' ').slice(0,120);}catch(e){}
      throw new Error('사진 묶음 저장 실패 ('+r.status+')'+(m?' '+m:''));
    }
  };

  try{
    await saveAlbum('draft');
    let cursor=0;
    const worker=async()=>{
      while(true){
        const i=cursor++; if(i>=valid.length) return;
        const file=valid[i];
        try{
          await cmsUploadAsset(albumId,file,i===0?'cover':'gallery',i);
          G.done++;
        }catch(e){
          G.failed++;
          G.errors.push((file.name||'사진')+' → '+(e&&e.message?e.message:String(e)));
        }
        cmsGalleryUpdateProgress();
      }
    };
    await Promise.all([worker(),worker(),worker()]);

    if(G.done){
      await cmsEnsureCover(albumId).catch(()=>false);
      await saveAlbum('published');
      cmsPortfolios=cmsPortfolios||[];
      cmsPortfolios.unshift({id:albumId,title:albumTitle,category:'',region:'',summary:'',status:'published',erpQuoteId:'',slug:cmsGalleryHiddenSlug(albumId),_local:true,_saved:true});
      await cmsRefreshAssets(albumId);
      cmsPortfolioDraftsSave();
      if(titleEl) titleEl.value='';
    }else{
      try{ await cmsFetchRaw(CMS_BASE+'/portfolios/'+albumId,{method:'DELETE'}); }catch(cleanErr){}
    }
  }catch(e){
    G.failed=Math.max(G.failed, valid.length-G.done);
    G.errors.push(e&&e.message?e.message:String(e));
    try{ if(!G.done) await cmsFetchRaw(CMS_BASE+'/portfolios/'+albumId,{method:'DELETE'}); }catch(cleanErr){}
  }finally{
    cmsWakeOff();
    G.running=false;
    G.previews.forEach(x=>{try{URL.revokeObjectURL(x.url);}catch(e){}});
    G.previews=[];
    await cmsLoadPortfolios();
    cmsPortfolioDraftsSave();
  }

  if(G.failed){
    state.cmsErr='사진 '+G.failed+'장 업로드 실패';
    state.cmsSaveTried=G.errors.slice();
    toast(G.done+'장 완료 · '+G.failed+'장 실패','warn');
  }else{
    state.cmsErr=null; state.cmsSaveTried=null;
    toast(albumTitle+' · '+G.done+'장 홈페이지에 올렸어요','ok');
  }
  if(G.done) logActivity('홈페이지 사진 묶음 업로드: '+albumTitle+' ('+G.done+'장)','추가');
  render();
}`;
helpers=helpers.slice(0,uploadStart)+groupedUpload+helpers.slice(uploadEnd);

function replaceOnce(from,to,label){
  const count=text.split(from).length-1;
  if(count!==1) throw new Error(label+': expected exactly 1 match, found '+count);
  text=text.replace(from,to);
}

replaceOnce("const APP_BUILD = 'V56.0812.MISSINGROW';","const APP_BUILD = 'V58.0812.ALBUMBATCH';",'build version');
replaceOnce('function renderWebsiteAdmin(){',helpers+'\nfunction renderWebsiteAdmin(){','gallery helpers');
replaceOnce(
  "  if(tab==='portfolio'){\n    const list=Array.isArray(cmsPortfolios)?cmsPortfolios:[];\n    const sites=(state.quotes||[]).filter(q=>q.status==='시공완료'||q.status==='계약');",
  "  if(tab==='portfolio' && false){\n    const list=Array.isArray(cmsPortfolios)?cmsPortfolios:[];\n    const sites=(state.quotes||[]).filter(q=>q.status==='시공완료'||q.status==='계약');",
  'legacy portfolio renderer'
);
replaceOnce("  if(tab==='copy'){","  if(tab==='portfolio'){ body=cmsRenderPhotoGallery(); }\n\n  if(tab==='copy'){",'album renderer');
replaceOnce("${T('portfolio','시공사례')}","${T('portfolio','사진')}",'tab label');
replaceOnce(
  "${esc(cmsSession.email||'')} 로 로그인됨 · ${tab==='portfolio'?'시공사례는 <b>공개</b> 상태인 프로젝트만 홈페이지에 표시됩니다.':'저장하면 홈페이지에 즉시 반영됩니다.'}",
  "${esc(cmsSession.email||'')} 로 로그인됨 · ${tab==='portfolio'?'한 번에 고른 사진은 <b>한 묶음</b>으로 바로 홈페이지에 공개됩니다.':'저장하면 홈페이지에 즉시 반영됩니다.'}",
  'photo tab help text'
);
replaceOnce('  // 시공사례\n',events+'  // 시공사례 (기존 프로젝트형 기능은 데이터 호환용으로 유지)\n','gallery events');

fs.writeFileSync(path,text,'utf8');
console.log('Applied HM grouped photo album UI patch.');
