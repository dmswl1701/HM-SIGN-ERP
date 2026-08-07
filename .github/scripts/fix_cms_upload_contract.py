from pathlib import Path
import re

path = Path('public/index.html')
s = path.read_text(encoding='utf-8')
orig = s

# Version bump
s = s.replace("V43.0807.BATCH1", "V43.0807.BATCH2")

# Preserve slug in local drafts
s = s.replace(
    "status:p.status||'draft',erpQuoteId:p.erpQuoteId||'',_local:true",
    "status:p.status||'draft',erpQuoteId:p.erpQuoteId||'',slug:p.slug||'',_local:true"
)

# Normalize industry -> category when reading public API
s = s.replace(
    "title:(p&&p.title)||'', category:(p&&p.category)||'', region:(p&&p.region)||'',",
    "title:(p&&p.title)||'', category:(p&&(p.category||p.industry))||'', region:(p&&p.region)||'',"
)

# Insert stable slug helper before cmsPortfolioArray
marker = "function cmsPortfolioArray(j){"
helper = r'''function cmsPortfolioSlug(p){
  if(p.slug) return p.slug;
  const title=String(p.title||'project').normalize('NFKC').toLowerCase()
    .replace(/[^0-9a-z가-힣]+/g,'-').replace(/^-+|-+$/g,'').slice(0,150) || 'project';
  const suffix=String(p.id||cmsUuid()).replace(/-/g,'').slice(0,8);
  p.slug=(title+'-'+suffix).slice(0,190);
  return p.slug;
}
'''
if 'function cmsPortfolioSlug(p)' not in s:
    assert marker in s
    s = s.replace(marker, helper + marker, 1)

# Correct portfolio save contract: worker requires slug and industry (not category)
old_save = """      body:JSON.stringify({
        title:p.title, category:p.category, region:p.region, summary:p.summary,
        status:p.status||'draft', erpQuoteId:p.erpQuoteId||undefined
      })"""
new_save = """      body:JSON.stringify({
        title:p.title,
        slug:cmsPortfolioSlug(p),
        industry:p.category||'',
        region:p.region||'',
        summary:p.summary||'',
        materials:[],
        featured:false,
        status:p.status||'draft'
      })"""
assert old_save in s, 'portfolio save payload marker missing'
s = s.replace(old_save, new_save, 1)

# Worker hard limit for original file is 15MB
s = s.replace("if(file.size>25*1024*1024){ skipped++; continue; }", "if(file.size>15*1024*1024){ skipped++; continue; }")
s = s.replace("JPG · PNG · WebP / 장당 25MB 이하", "JPG · PNG · WebP / 장당 15MB 이하")

# Replace guessed upload attempts with the exact Worker contract:
# original + optimized(webp) + thumbnail(webp) + role + sortOrder
start = s.index('async function cmsUploadAsset(portfolioId,file,role){')
end = s.index('\nasync function cmsStartUploadQueue', start)
new_upload = r'''async function cmsImageToWebp(file,maxEdge,quality,suffix,maxBytes){
  const url=URL.createObjectURL(file);
  try{
    const img=await new Promise((resolve,reject)=>{
      const el=new Image();
      el.onload=()=>resolve(el);
      el.onerror=()=>reject(new Error('이미지 파일을 읽지 못했습니다'));
      el.src=url;
    });
    const w=img.naturalWidth||img.width, h=img.naturalHeight||img.height;
    if(!w||!h) throw new Error('이미지 크기를 확인하지 못했습니다');
    const scale=Math.min(1,maxEdge/Math.max(w,h));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(w*scale));
    canvas.height=Math.max(1,Math.round(h*scale));
    const ctx=canvas.getContext('2d',{alpha:true});
    if(!ctx) throw new Error('이미지 변환 기능을 사용할 수 없습니다');
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    let q=quality, blob=null;
    for(let attempt=0;attempt<4;attempt++){
      blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',q));
      if(blob && blob.type==='image/webp' && blob.size<=maxBytes) break;
      q=Math.max(.45,q-.12);
    }
    if(!blob || blob.type!=='image/webp') throw new Error('WebP 변환에 실패했습니다');
    if(blob.size>maxBytes) throw new Error('최적화 후에도 파일 용량이 너무 큽니다');
    const base=(file.name||'photo').replace(/\.[^.]+$/,'').replace(/[^0-9A-Za-z가-힣._-]+/g,'_').slice(0,100)||'photo';
    return new File([blob],base+'-'+suffix+'.webp',{type:'image/webp',lastModified:Date.now()});
  }finally{
    URL.revokeObjectURL(url);
  }
}

async function cmsUploadAsset(portfolioId,file,role,sortOrder){
  if(!file || !/^image\/(jpeg|png|webp)$/i.test(file.type||'')) throw new Error('JPG·PNG·WebP 사진만 올릴 수 있습니다');
  if(file.size>15*1024*1024) throw new Error('원본 사진은 장당 15MB 이하여야 합니다');

  // CMS Worker의 실제 계약에 맞춰 브라우저에서 파생 이미지를 만든다.
  const optimized=await cmsImageToWebp(file,2000,.84,'optimized',8*1024*1024);
  const thumbnail=await cmsImageToWebp(file,640,.78,'thumbnail',2*1024*1024);

  const fd=new FormData();
  fd.append('original',file,file.name||'photo.jpg');
  fd.append('optimized',optimized,optimized.name);
  fd.append('thumbnail',thumbnail,thumbnail.name);
  fd.append('role',role||'gallery');
  fd.append('sortOrder',String(Number.isFinite(sortOrder)?sortOrder:0));

  const endpoint=CMS_BASE+'/portfolios/'+portfolioId+'/assets';
  const r=await cmsFetchRaw(endpoint,{method:'POST',body:fd});
  if(r.status>=200&&r.status<300) return await r.json().catch(()=>({}));
  let text=''; try{text=(await r.text()).replace(/\s+/g,' ').slice(0,220);}catch(e){}
  if(r.status===400 && /invalid_upload/i.test(text)) throw new Error('업로드 형식 오류: 원본/최적화/썸네일 생성값을 서버가 거부했습니다');
  if(r.status===400 && /invalid_file/i.test(text)) throw new Error('사진 형식 또는 용량이 서버 제한을 넘었습니다');
  throw new Error(r.status+(text?' '+text:''));
}
'''
s = s[:start] + new_upload + s[end:]

# Pass current queue position as sortOrder
s = s.replace(
    "item.result=await cmsUploadAsset(portfolioId,item.file,item.role);",
    "item.result=await cmsUploadAsset(portfolioId,item.file,item.role,q.items.indexOf(item));"
)

# More truthful progress text
s = s.replace("if(item.status==='uploading') return '업로드 중…';", "if(item.status==='uploading') return '이미지 최적화·업로드 중…';")

if s == orig:
    raise SystemExit('No changes made')

# Sanity assertions against the actual CMS Worker contract
for token in [
    "slug:cmsPortfolioSlug(p)",
    "industry:p.category||''",
    "fd.append('original'",
    "fd.append('optimized'",
    "fd.append('thumbnail'",
    "fd.append('sortOrder'",
    "V43.0807.BATCH2",
]:
    assert token in s, token
assert "const attempts=['file','asset','image','upload','original'];" not in s

path.write_text(s, encoding='utf-8')
print('CMS portfolio/upload contract patched successfully')
