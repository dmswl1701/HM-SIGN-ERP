from pathlib import Path

p=Path('public/index.html')
s=p.read_text(encoding='utf-8')

# Version bump
s=s.replace("const APP_BUILD = 'V43.0807.BATCH4';","const APP_BUILD = 'V43.0807.BATCH5';",1)

# Better upload completion guidance
old="""  if(done.length) toast(done.length+'장 업로드 완료','ok');
"""
new="""  if(done.length) toast(done.length+'장 업로드 완료 · 사진을 눌러 확인한 뒤 홈페이지 공개를 누르세요','ok');
"""
assert old in s, 'upload completion marker missing'
s=s.replace(old,new,1)

# Use full optimized image in preview when available, add delete button and clean one-toast cover action.
start=s.index('function cmsShowAssetPreview(portfolioId,assetId){')
end=s.index('\nasync function cmsAssetRole(',start)
new_preview=r'''function cmsShowAssetPreview(portfolioId,assetId){
  const asset=(cmsAssets[portfolioId]||[]).find(x=>x.id===assetId); if(!asset) return;
  const src=asset.image_url||asset.optimized_url||asset.preview_url||asset.public_url||asset.url||asset.thumbnail_url||'';
  if(!src){ toast('미리보기 주소가 없어요','warn'); return; }
  const old=document.getElementById('cmsAssetPreviewModal'); if(old) old.remove();
  const wrap=document.createElement('div');
  wrap.id='cmsAssetPreviewModal';
  wrap.style.cssText='position:fixed;inset:0;z-index:100000;background:rgba(7,15,27,.82);display:grid;place-items:center;padding:18px';
  wrap.innerHTML=`<section role="dialog" aria-modal="true" aria-label="시공사진 미리보기" style="width:min(1100px,96vw);max-height:94vh;background:#fff;border-radius:14px;overflow:auto;box-shadow:0 24px 70px rgba(0,0,0,.35)">
    <div style="position:sticky;top:0;z-index:2;background:#fff;border-bottom:1px solid var(--border);padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px"><b style="color:var(--navy)">${asset.role==='cover'?'대표사진':'시공사진 미리보기'}</b><button type="button" id="cmsAssetPreviewClose" class="aic-btn">닫기 ✕</button></div>
    <div style="padding:12px;background:#F3F5F8;text-align:center"><img src="${esc(src)}" alt="시공사진" style="max-width:100%;max-height:72vh;object-fit:contain;border-radius:9px;background:#fff"></div>
    <div style="padding:12px 14px 16px;display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap">
      <button type="button" id="cmsAssetDelete" class="aic-btn aic-btn-rej">이 사진 삭제</button>
      ${asset.role==='cover'?'<div class="aic-dm-ok" style="margin:0;flex:1;min-width:220px">현재 홈페이지 대표사진입니다. 다른 사진을 눌러 대표사진을 바꿀 수 있어요.</div>':`<button type="button" id="cmsAssetMakeCover" class="aic-btn aic-btn-primary">이 사진을 대표사진으로</button>`}
    </div>
  </section>`;
  document.body.appendChild(wrap);
  const close=()=>wrap.remove();
  document.getElementById('cmsAssetPreviewClose').onclick=close;
  wrap.addEventListener('click',e=>{if(e.target===wrap)close();});
  const make=document.getElementById('cmsAssetMakeCover');
  if(make) make.onclick=async()=>{
    make.disabled=true; make.textContent='변경 중...';
    const ok=await cmsAssetRole(portfolioId,assetId,'cover',{silent:true});
    if(ok){ close(); toast('대표사진으로 바꿨어요','ok'); render(); }
    else{ make.disabled=false; make.textContent='이 사진을 대표사진으로'; }
  };
  const del=document.getElementById('cmsAssetDelete');
  if(del) del.onclick=async()=>{
    const ok=await cmsDeleteAsset(portfolioId,assetId);
    if(ok){ close(); render(); }
  };
}
'''
s=s[:start]+new_preview+s[end:]

start=s.index('async function cmsAssetRole(portfolioId,assetId,role){')
end=s.index('\n\n/* ---------- 문의 목록 정규화',start)
new_role=r'''async function cmsAssetRole(portfolioId,assetId,role,opts){
  opts=opts||{};
  try{
    const r=await cmsFetchRaw(CMS_BASE+'/portfolios/'+portfolioId+'/assets/'+assetId,{
      method:'PATCH',body:JSON.stringify({role})
    });
    if(r.status>=200&&r.status<300){
      await cmsRefreshAssets(portfolioId);
      if(!opts.silent) toast('사진 분류를 바꿨어요','ok');
      return true;
    }
    let m=''; try{m=(await r.text()).slice(0,140);}catch(e){}
    toast('변경 실패 ('+r.status+') '+m,'warn');
  }catch(e){ toast('변경 실패: '+e.message,'warn'); }
  return false;
}

async function cmsDeleteAsset(portfolioId,assetId){
  const asset=(cmsAssets[portfolioId]||[]).find(x=>x.id===assetId); if(!asset) return false;
  const msg=asset.role==='cover'
    ? '현재 대표사진입니다. 삭제할까요?\n\n삭제 후 남은 사진이 있으면 첫 사진을 대표사진으로 자동 지정합니다.'
    : '이 사진을 삭제할까요?\n\n홈페이지 상세에서도 함께 사라집니다.';
  if(!confirm(msg)) return false;
  try{
    const r=await cmsFetchRaw(CMS_BASE+'/portfolios/'+portfolioId+'/assets/'+assetId,{method:'DELETE'});
    if(r.status>=200&&r.status<300){
      await cmsRefreshAssets(portfolioId);
      if(asset.role==='cover' && (cmsAssets[portfolioId]||[]).length){
        await cmsEnsureCover(portfolioId);
        await cmsRefreshAssets(portfolioId);
      }
      toast('사진을 삭제했어요','ok');
      return true;
    }
    let m=''; try{m=(await r.text()).slice(0,140);}catch(e){}
    toast('사진 삭제 실패 ('+r.status+') '+m,'warn');
  }catch(e){ toast('사진 삭제 실패: '+e.message,'warn'); }
  return false;
}
'''
s=s[:start]+new_role+s[end:]

# Publish button becomes meaningful even before clicking: no photo = disabled and clear label.
old="""            <button type=\"button\" class=\"aic-btn aic-btn-primary cmsPjPublish\" data-id=\"${esc(p.id)}\" ${(q.running||st.ready)?'disabled':''}>${q.running?'사진 업로드 중…':((p.status||'draft')==='published'?'✅ 홈페이지 공개중':'🌐 홈페이지 공개')}</button>
"""
new="""            <button type=\"button\" class=\"aic-btn aic-btn-primary cmsPjPublish\" data-id=\"${esc(p.id)}\" ${(q.running||st.ready||(!(assets.length)&&((p.status||'draft')!=='published')))?'disabled':''}>${q.running?'사진 업로드 중…':(!assets.length&&((p.status||'draft')!=='published')?'사진을 먼저 올려주세요':((p.status||'draft')==='published'?'✅ 홈페이지 공개중':'🌐 홈페이지 공개'))}</button>
"""
assert old in s, 'publish button marker missing'
s=s.replace(old,new,1)

# Clearer upload-zone copy: first photo can be changed later.
old="""            <span>선택 즉시 자동 업로드 · 첫 사진은 자동 대표 · JPG/PNG/WebP · 장당 15MB 이하</span>
"""
new="""            <span>선택 즉시 자동 업로드 · 첫 사진은 대표로 지정 · 업로드 후 사진을 눌러 대표 변경/삭제 가능 · JPG/PNG/WebP · 장당 15MB 이하</span>
"""
assert old in s, 'upload help marker missing'
s=s.replace(old,new,1)

# Defensive publish guard in event handler too.
old="""    if(cmsQueue(p.id).running || cmsQueue(p.id).items.some(x=>x.status==='ready')){toast('사진 업로드가 끝난 뒤 공개해 주세요','warn');return;}
    p.status='published';
"""
new="""    if(cmsQueue(p.id).running || cmsQueue(p.id).items.some(x=>x.status==='ready')){toast('사진 업로드가 끝난 뒤 공개해 주세요','warn');return;}
    if(!(cmsAssets[p.id]||[]).length){toast('사진을 한 장 이상 올린 뒤 공개해 주세요','warn');return;}
    p.status='published';
"""
assert old in s, 'publish guard marker missing'
s=s.replace(old,new,1)

p.write_text(s,encoding='utf-8')
print('patched ERP staff workflow')
