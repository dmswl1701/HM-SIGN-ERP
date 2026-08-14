import fs from 'node:fs';

const path='public/index.html';
let text=fs.readFileSync(path,'utf8');
const marker='/* HM_PHOTO_SYNC_V70 */';
if(text.includes(marker)){
  console.log('HM photo sync V70 already applied.');
  process.exit(0);
}

const sync=fs.readFileSync('scripts/photo-sync-v70.inc.js','utf8');

function replaceOnce(from,to,label){
  const count=text.split(from).length-1;
  if(count!==1) throw new Error(label+': expected exactly 1 match, found '+count);
  text=text.replace(from,to);
}

replaceOnce("const APP_BUILD = 'V69.0814.SAVEDIAG';","const APP_BUILD = 'V70.0814.PHOTOSYNC';",'build version');
replaceOnce('function renderWebsiteAdmin(){',marker+'\n'+sync+'\nfunction renderWebsiteAdmin(){','photo sync helpers');

// 직원이 실제로 누르는 말만 단순하게 정리한다. 기능은 그대로 유지한다.
text=text.replace(
  '<b style="color:var(--navy)">묶음 ${picks.length}개 선택됨 · 사진 ${pickPhotos}장</b>',
  '<b style="color:var(--navy)">선택 ${picks.length}개 · 사진 ${pickPhotos}장</b>'
);
text=text.replace(
  '맨 위에 있는 <b>「${esc(picks[0].title||\'제목 없음\')}」</b>에 나머지 사진을 모읍니다. 옮긴 묶음은 사라집니다.',
  '아래에서 <b>현장 이름</b>과 <b>분류</b>를 정하고 적용하세요. 사진 자체를 합치고 싶을 때만 [한 현장으로 합치기]를 누르면 됩니다.'
);
text=text.replace(
  ">${picks.length}개 이름만 바꾸기</button>",
  ">${picks.length}개에 이름·분류 적용</button>"
);
text=text.replace(
  ">${picks.length}개를 하나로 합치기</button>",
  ">한 현장으로 합치기</button>"
);
text=text.replace(
  '<b>이름만 바꾸기</b> — 카드는 ${picks.length}개로 남고 이름·분류만 같아집니다. <b>즉시 끝납니다.</b><br>',
  '<b>이름·분류 적용</b> — 사진은 그대로 두고 선택한 항목의 이름·분류만 저장합니다. <b>가장 빠른 정리 방법입니다.</b><br>'
);
text=text.replace(
  '<b>하나로 합치기</b> — 카드 한 개로 모읍니다. 사진을 옮기느라 장수만큼 시간이 걸립니다.',
  '<b>한 현장으로 합치기</b> — 정말 같은 현장 사진일 때만 한 카드로 모읍니다. 사진을 옮겨야 해서 시간이 더 걸립니다.'
);

fs.writeFileSync(path,text,'utf8');
console.log('Applied HM photo sync V70 patch.');
