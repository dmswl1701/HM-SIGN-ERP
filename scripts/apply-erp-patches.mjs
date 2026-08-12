import fs from 'node:fs';

const path='public/index.html';
let text=fs.readFileSync(path,'utf8');
const marker='/* HM_PHOTO_GALLERY_V1 */';
if(text.includes(marker)){
  console.log('HM photo album patch already applied.');
  process.exit(0);
}
const helpers=Buffer.from(fs.readFileSync('scripts/photo-gallery-helpers.b64','utf8').trim(),'base64').toString('utf8');
const events=Buffer.from(fs.readFileSync('scripts/photo-gallery-events.b64','utf8').trim(),'base64').toString('utf8');

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
replaceOnce('  // 시공사례\n',events+'  // 시공사례 (기존 프로젝트형 기능은 데이터 호환용으로 유지)\n','gallery events');

fs.writeFileSync(path,text,'utf8');
console.log('Applied HM photo album UI patch only.');
