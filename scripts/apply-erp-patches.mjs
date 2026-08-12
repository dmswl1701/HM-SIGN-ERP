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

// 새 사진을 서버에 올린 직후 로컬 앨범에도 즉시 넣어, 한 번에 많이 올려도 전부 그대로 보이게 한다.
helpers=helpers.replace(
  "return 'photo-'+String(id||'').toLowerCase().replace(/[^0-9a-z]/g,'');",
  "return 'project-'+String(id||'').toLowerCase().replace(/[^0-9a-z]/g,'');"
);
helpers=helpers.replace(
  "        await cmsGallerySaveHidden(id,'published');\n        G.done++;",
  "        await cmsGallerySaveHidden(id,'published');\n        cmsPortfolios=cmsPortfolios||[];\n        cmsPortfolios.unshift({id,title:'시공사진',category:'',region:'',summary:'',status:'published',erpQuoteId:'',slug:cmsGalleryHiddenSlug(id),_local:true,_saved:true});\n        await cmsRefreshAssets(id);\n        cmsPortfolioDraftsSave();\n        G.done++;"
);

function replaceOnce(from,to,label){
  const count=text.split(from).length-1;
  if(count!==1) throw new Error(label+': expected exactly 1 match, found '+count);
  text=text.replace(from,to);
}

replaceOnce("const APP_BUILD = 'V56.0812.MISSINGROW';","const APP_BUILD = 'V57.0812.PHOTOALBUM';",'build version');
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
  "${esc(cmsSession.email||'')} 로 로그인됨 · ${tab==='portfolio'?'사진을 고르면 자동으로 최적화해 <b>바로 홈페이지에 공개</b>합니다.':'저장하면 홈페이지에 즉시 반영됩니다.'}",
  'photo tab help text'
);
replaceOnce('  // 시공사례\n',events+'  // 시공사례 (기존 프로젝트형 기능은 데이터 호환용으로 유지)\n','gallery events');

fs.writeFileSync(path,text,'utf8');
console.log('Applied HM photo album UI patch only.');
