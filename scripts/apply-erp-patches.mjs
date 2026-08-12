import fs from 'node:fs';

const path='public/index.html';
let text=fs.readFileSync(path,'utf8');
const marker='/* HM_PHOTO_GALLERY_V1 */';
if(text.includes(marker)){
  console.log('HM photo album patch already applied.');
  process.exit(0);
}

let helpers=Buffer.from(fs.readFileSync('scripts/photo-gallery-helpers.b64','utf8').trim(),'base64').toString('utf8');
let events=Buffer.from(fs.readFileSync('scripts/photo-gallery-events.b64','utf8').trim(),'base64').toString('utf8');
const organizerHelpers=fs.readFileSync('scripts/photo-organizer-helpers.inc.js','utf8');
const organizerEvents=fs.readFileSync('scripts/photo-organizer-events.inc.js','utf8');

// 숨은 프로젝트 slug는 기존 공개 상세 URL 규칙과 맞춘다.
helpers=helpers.replace(
  "return 'photo-'+String(id||'').toLowerCase().replace(/[^0-9a-z]/g,'');",
  "return 'project-'+String(id||'').toLowerCase().replace(/[^0-9a-z]/g,'');"
);

// 한 번 선택한 사진은 하나의 묶음에 여러 장 저장한다.
// 제목/분류는 업로드 화면에서 선택적으로 받고, 홈페이지 공개 데이터의 title/industry로 그대로 보낸다.
const uploadStart=helpers.indexOf('async function cmsGalleryUploadFiles(fileList){');
const uploadEnd=helpers.indexOf('\nasync function cmsGalleryDeletePhoto', uploadStart);
if(uploadStart<0 || uploadEnd<0) throw new Error('gallery upload function not found');

const groupedUpload=String.raw`async function cmsGalleryUploadFiles(fileList){
  if(cmsGalleryUploadState.running){ toast('지금 사진을 올리는 중이에요','warn'); return; }
  const raw=[...(fileList||[])];
  if(!raw.length) return;
  const seen=new Set(), valid=[]; let skipped=0;
  for(const f of raw.slice(0,120)){
    const key=[f.name,f.size,f.lastModified].join('|');
    if(!f || !/^image\/(jpeg|png|webp)$/i.test(f.type||'') || f.size>15*1024*1024 || seen.has(key)){ skipped++; continue; }
    seen.add(key); valid.push(f);
  }
  if(raw.length>120) skipped+=raw.length-120;
  if(!valid.length){ toast('올릴 수 있는 사진이 없어요 · JPG/PNG/WebP, 장당 15MB 이하','warn'); return; }
  if(skipped) toast(skipped+'장은 중복·형식·용량 문제로 제외했어요','warn');
  // 한 묶음이 너무 커지면 홈페이지에서 그 묶음이 아예 안 열린다 (CMS_ALBUM_MAX 설명 참고)
  if(valid.length>CMS_ALBUM_MAX){
    const over=valid.length-CMS_ALBUM_MAX;
    valid.length=CMS_ALBUM_MAX;
    alert('한 묶음에는 사진 '+CMS_ALBUM_MAX+'장까지만 들어갑니다.\n\n'
      +'앞의 '+CMS_ALBUM_MAX+'장을 올리고, 나머지 '+over+'장은 올리지 않았습니다.\n'
      +'남은 사진은 다시 골라 새 묶음으로 올려 주세요.');
  }

  const titleEl=document.getElementById('cmsGalleryTitle');
  const categoryEl=document.getElementById('cmsGalleryCategory');
  const albumTitle=((titleEl&&titleEl.value)||'').trim().slice(0,200) || '시공사진';
  const albumCategory=((categoryEl&&categoryEl.value)||'').trim().slice(0,100);
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
        industry:albumCategory, region:'', summary:'', materials:[], featured:false, status
      })
    });
    if(!(r.status>=200&&r.status<300)){
      let m=''; try{m=(await r.text()).replace(/\s+/g,' ').slice(0,120);}catch(e){}
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
      cmsPortfolios.unshift({id:albumId,title:albumTitle,category:albumCategory,industry:albumCategory,region:'',summary:'',status:'published',erpQuoteId:'',slug:cmsGalleryHiddenSlug(albumId),_local:true,_saved:true});
      await cmsRefreshAssets(albumId);
      cmsPortfolioDraftsSave();
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
helpers+='\n'+organizerHelpers+'\n';
events+='\n'+organizerEvents+'\n';

function replaceOnce(from,to,label){
  const count=text.split(from).length-1;
  if(count!==1) throw new Error(label+': expected exactly 1 match, found '+count);
  text=text.replace(from,to);
}

replaceOnce("const APP_BUILD = 'V56.0812.MISSINGROW';","const APP_BUILD = 'V60.0813.ALBUMCAP';",'build version');
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
  "${esc(cmsSession.email||'')} 로 로그인됨 · ${tab==='portfolio'?'사진 묶음의 <b>제목·분류·사진</b>을 여기서 바로 관리할 수 있습니다.':'저장하면 홈페이지에 즉시 반영됩니다.'}",
  'photo tab help text'
);
replaceOnce('  // 시공사례\n',events+'  // 시공사례 (기존 프로젝트형 기능은 데이터 호환용으로 유지)\n','gallery events');

fs.writeFileSync(path,text,'utf8');
console.log('Applied HM photo organizer UI patch.');
