from pathlib import Path

p=Path('public/index.html')
s=p.read_text(encoding='utf-8')
orig=s

# Version + fix the broken version matcher while here.
s=s.replace("const APP_BUILD = 'V43.0807.BATCH3';", "const APP_BUILD = 'V43.0807.BATCH4';", 1)
s=s.replace("const m = txt.match(new RegExp(\"const APP_BUILD = 'V43.0807.BATCH3']+)'\"));", "const m = txt.match(/const APP_BUILD = '([^']+)'/);", 1)

# UX CSS: server images are previewable cards, cover badge, lightweight modal.
marker="""  .cms-asset select,.cms-asset button{width:100%; border:0; border-top:1px solid var(--border); padding:6px; font-size:11.5px; font-family:inherit; background:#fff; cursor:pointer;}
"""
insert="""  .cms-asset select,.cms-asset button{width:100%; border:0; border-top:1px solid var(--border); padding:6px; font-size:11.5px; font-family:inherit; background:#fff; cursor:pointer;}
  .cms-asset{position:relative; cursor:pointer; transition:.16s ease;}
  .cms-asset:hover{transform:translateY(-2px); box-shadow:0 8px 20px rgba(13,31,58,.10); border-color:#AFC0D5;}
  .cms-asset-preview{display:block!important; width:100%!important; padding:0!important; border:0!important; background:#EEF1F6!important; cursor:zoom-in!important;}
  .cms-cover-badge{position:absolute;left:7px;top:7px;z-index:2;padding:4px 7px;border-radius:999px;background:rgba(17,43,77,.9);color:#fff;font-size:10px;font-weight:800;pointer-events:none;}
  .cms-photo-help{font-size:10.5px;color:var(--text-mute);}
"""
assert marker in s, 'css marker missing'
s=s.replace(marker,insert,1)

# Automatic upload after selecting/dropping files.
old="""  if(input.length>limit) toast('한 번에 최대 '+limit+'장까지 준비합니다. 나머지는 다음 묶음으로 올려 주세요','warn');
  if(skipped) toast(skipped+'장은 중복·형식·용량 문제로 제외했어요','warn');
  if(added) toast(added+'장을 업로드 대기열에 준비했어요','ok');
  render();
}
"""
new="""  if(input.length>limit) toast('한 번에 최대 '+limit+'장까지 준비합니다. 나머지는 다음 묶음으로 올려 주세요','warn');
  if(skipped) toast(skipped+'장은 중복·형식·용량 문제로 제외했어요','warn');
  if(added) toast(added+'장 준비 완료 · 자동 업로드를 시작합니다','ok');
  render();
  const pj=(cmsPortfolios||[]).find(x=>x.id===portfolioId);
  if(added && pj && (pj.title||'').trim()) setTimeout(()=>cmsStartUploadQueue(portfolioId,false),0);
  else if(added) toast('프로젝트 제목을 입력하면 사진이 자동으로 올라갑니다','warn');
}
"""
assert old in s, 'queue auto marker missing'
s=s.replace(old,new,1)

# If more photos were added while an upload was running, immediately continue automatically.
old="""  q.running=false;
  await cmsRefreshAssets(portfolioId);

  const failed=q.items.filter(x=>x.status==='failed');
"""
new="""  q.running=false;
  await cmsRefreshAssets(portfolioId);

  // 업로드 도중 추가된 사진이 있으면 버튼 없이 다음 묶음도 자동 진행한다.
  const moreReady=q.items.some(x=>x.status==='ready');
  if(moreReady){ render(); setTimeout(()=>cmsStartUploadQueue(portfolioId,false),0); return; }

  const failed=q.items.filter(x=>x.status==='failed');
"""
assert old in s, 'more-ready marker missing'
s=s.replace(old,new,1)

# Add a simple admin photo viewer. Representative image selection lives inside the viewer, not under every thumbnail.
marker="""async function cmsAssetRole(portfolioId,assetId,role){
"""
helper="""function cmsShowAssetPreview(portfolioId,assetId){
  const asset=(cmsAssets[portfolioId]||[]).find(x=>x.id===assetId); if(!asset) return;
  const src=asset.preview_url||asset.public_url||asset.url||asset.thumbnail_url||'';
  if(!src){ toast('미리보기 주소가 없어요','warn'); return; }
  const old=document.getElementById('cmsAssetPreviewModal'); if(old) old.remove();
  const wrap=document.createElement('div');
  wrap.id='cmsAssetPreviewModal';
  wrap.style.cssText='position:fixed;inset:0;z-index:100000;background:rgba(7,15,27,.82);display:grid;place-items:center;padding:18px';
  wrap.innerHTML=`<section role="dialog" aria-modal="true" aria-label="시공사진 미리보기" style="width:min(1000px,96vw);max-height:94vh;background:#fff;border-radius:14px;overflow:auto;box-shadow:0 24px 70px rgba(0,0,0,.35)">
    <div style="position:sticky;top:0;z-index:2;background:#fff;border-bottom:1px solid var(--border);padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px"><b style="color:var(--navy)">${asset.role==='cover'?'대표사진':'시공사진 미리보기'}</b><button type="button" id="cmsAssetPreviewClose" class="aic-btn">닫기 ✕</button></div>
    <div style="padding:12px;background:#F3F5F8;text-align:center"><img src="${esc(src)}" alt="시공사진" style="max-width:100%;max-height:72vh;object-fit:contain;border-radius:9px;background:#fff"></div>
    ${asset.role==='cover'?'<div class="aic-dm-ok" style="margin:12px 14px">현재 홈페이지 대표사진입니다.</div>':`<div style="padding:12px 14px 16px;text-align:right"><button type="button" id="cmsAssetMakeCover" class="aic-btn aic-btn-primary">이 사진을 대표사진으로</button></div>`}
  </section>`;
  document.body.appendChild(wrap);
  const close=()=>wrap.remove();
  document.getElementById('cmsAssetPreviewClose').onclick=close;
  wrap.addEventListener('click',e=>{if(e.target===wrap)close();});
  const make=document.getElementById('cmsAssetMakeCover');
  if(make) make.onclick=async()=>{ make.disabled=true; make.textContent='변경 중...'; await cmsAssetRole(portfolioId,assetId,'cover'); close(); toast('대표사진으로 바꿨어요','ok'); render(); };
}

async function cmsAssetRole(portfolioId,assetId,role){
"""
assert marker in s, 'asset role marker missing'
s=s.replace(marker,helper,1)

# Replace the portfolio management markup with a simpler workflow.
old="""      <div class=\"aic-sub\" style=\"margin:-8px 0 10px;line-height:1.7\">
        한 공사를 <b>프로젝트 1개</b>로 만들고 사진을 한꺼번에 준비한 뒤 업로드합니다.
        기존 사진 800장도 <b>현장별 50~100장씩</b> 나눠 등록하는 방식으로 운영하세요.
      </div>
      <div class=\"cms-flow\">
        <span>1 프로젝트 선택/생성</span><span>2 제목 확인</span><span>3 사진 여러 장 끌어놓기</span>
        <span>4 일괄 업로드</span><span>5 대표·전/후 분류</span><span>6 공개</span>
      </div>
"""
new="""      <div class=\"aic-sub\" style=\"margin:-8px 0 10px;line-height:1.7\">
        <b>프로젝트 만들기 → 사진 선택 → 홈페이지 공개</b>, 세 단계만 쓰면 됩니다.<br>
        사진을 고르면 자동 저장·최적화·업로드되고, 첫 사진은 자동으로 대표사진이 됩니다.
      </div>
      <div class=\"cms-flow\"><span>1 프로젝트</span><span>2 사진 선택 = 자동 업로드</span><span>3 홈페이지 공개</span></div>
"""
assert old in s, 'flow markup missing'
s=s.replace(old,new,1)

old="""      <div style=\"display:flex;gap:8px;flex-wrap:wrap\">
        <button type=\"button\" class=\"aic-btn aic-btn-primary\" id=\"cmsPjFromSiteAdd\">＋ 이 현장을 시공사례로</button>
        <button type=\"button\" class=\"aic-btn\" id=\"cmsPjAdd\">＋ 새 시공사례</button>
        <button type=\"button\" class=\"aic-btn\" id=\"cmsPjReload\">↻ 서버 목록 새로고침</button>
      </div>
"""
new="""      <div style=\"display:flex;gap:8px;flex-wrap:wrap\">
        <button type=\"button\" class=\"aic-btn aic-btn-primary\" id=\"cmsPjFromSiteAdd\">＋ 이 현장을 시공사례로</button>
        <button type=\"button\" class=\"aic-btn\" id=\"cmsPjAdd\">＋ 새 시공사례</button>
      </div>
"""
assert old in s, 'top project buttons missing'
s=s.replace(old,new,1)

old="""          <div style=\"display:flex;gap:6px;flex-wrap:wrap\">
            <button type=\"button\" class=\"aic-btn aic-btn-primary cmsPjPublish\" data-id=\"${esc(p.id)}\">${(p.status||'draft')==='published'?'🌐 공개중':'🌐 홈페이지 공개'}</button>
            <button type=\"button\" class=\"aic-btn cmsPjSave\" data-id=\"${esc(p.id)}\">💾 프로젝트 저장</button>
            <button type=\"button\" class=\"aic-btn aic-btn-rej cmsPjDel\" data-id=\"${esc(p.id)}\">삭제</button>
          </div>
"""
new="""          <div style=\"display:flex;gap:6px;flex-wrap:wrap\">
            <button type=\"button\" class=\"aic-btn aic-btn-primary cmsPjPublish\" data-id=\"${esc(p.id)}\" ${(q.running||st.ready)?'disabled':''}>${q.running?'사진 업로드 중…':((p.status||'draft')==='published'?'✅ 홈페이지 공개중':'🌐 홈페이지 공개')}</button>
            <button type=\"button\" class=\"aic-btn aic-btn-rej cmsPjDel\" data-id=\"${esc(p.id)}\">삭제</button>
          </div>
"""
assert old in s, 'project actions missing'
s=s.replace(old,new,1)

old="""        <div class=\"field\"><label>한 줄 설명</label><textarea class=\"cmsPj\" data-id=\"${esc(p.id)}\" data-f=\"summary\" rows=\"2\" style=\"width:100%;padding:11px;border:1px solid var(--border);border-radius:7px;font-size:14px;font-family:inherit;line-height:1.7;resize:vertical\">${esc(p.summary||'')}</textarea></div>
        <div class=\"field\"><label>공개 상태</label>
          <select class=\"cmsPj\" data-id=\"${esc(p.id)}\" data-f=\"status\">
            ${['draft','review','published'].map(v=>`<option value=\"${v}\" ${(p.status||'draft')===v?'selected':''}>${v==='draft'?'작성중(홈페이지 비공개)':v==='review'?'검토':'공개'}</option>`).join('')}
          </select>
        </div>
"""
new="""        <div class=\"field\"><label>한 줄 설명</label><textarea class=\"cmsPj\" data-id=\"${esc(p.id)}\" data-f=\"summary\" rows=\"2\" style=\"width:100%;padding:11px;border:1px solid var(--border);border-radius:7px;font-size:14px;font-family:inherit;line-height:1.7;resize:vertical\">${esc(p.summary||'')}</textarea></div>
        <div class=\"aic-sub\" style=\"margin:-2px 0 12px;font-size:11.5px\">입력 내용은 칸을 벗어나면 자동 저장됩니다. ${(p.status||'draft')==='published'?'<b>현재 홈페이지 공개중</b>':'아직 홈페이지에는 비공개입니다.'}</div>
"""
assert old in s, 'status select marker missing'
s=s.replace(old,new,1)

old="""          <div class=\"aic-doc-head\">📥 새 사진 일괄 등록</div>
          <label class=\"cms-upload-zone cmsUploadZone\" data-id=\"${esc(p.id)}\">
            <b>사진 여러 장을 여기에 끌어놓거나 클릭해서 선택</b>
            <span>JPG · PNG · WebP / 장당 15MB 이하 · 한 번에 50~100장 권장 (최대 120장 준비)</span>
            <input type=\"file\" class=\"cmsAssetStage\" data-id=\"${esc(p.id)}\" accept=\"image/jpeg,image/png,image/webp\" multiple style=\"display:none\">
          </label>
"""
new="""          <div class=\"aic-doc-head\">📥 사진 추가</div>
          <label class=\"cms-upload-zone cmsUploadZone\" data-id=\"${esc(p.id)}\">
            <b>사진을 끌어놓거나 클릭해서 여러 장 선택</b>
            <span>선택 즉시 자동 업로드 · 첫 사진은 자동 대표 · JPG/PNG/WebP · 장당 15MB 이하</span>
            <input type=\"file\" class=\"cmsAssetStage\" data-id=\"${esc(p.id)}\" accept=\"image/jpeg,image/png,image/webp\" multiple style=\"display:none\">
          </label>
"""
assert old in s, 'upload zone marker missing'
s=s.replace(old,new,1)

# Remove per-queued-photo role select.
old="""              <div class=\"cms-upload-info\"><div class=\"cms-upload-name\" title=\"${esc(item.file&&item.file.name||'')}\">${esc(item.file&&item.file.name||'사진')}</div><div class=\"cms-upload-status\" id=\"cmsQS_${cmsQueueKey(item.id)}\">${esc(cmsQueueStatusText(item))}</div></div>
              <select class=\"cmsQueueRole\" data-pid=\"${esc(p.id)}\" data-qid=\"${esc(item.id)}\" ${q.running?'disabled':''}>
                ${[['gallery','갤러리'],['cover','대표'],['before','시공전'],['after','시공후']].map(([v,l])=>`<option value=\"${v}\" ${item.role===v?'selected':''}>${l}</option>`).join('')}
              </select>
"""
new="""              <div class=\"cms-upload-info\"><div class=\"cms-upload-name\" title=\"${esc(item.file&&item.file.name||'')}\">${esc(item.file&&item.file.name||'사진')}</div><div class=\"cms-upload-status\" id=\"cmsQS_${cmsQueueKey(item.id)}\">${item.role==='cover'?'대표 · ':''}${esc(cmsQueueStatusText(item))}</div></div>
"""
assert old in s, 'queue role marker missing'
s=s.replace(old,new,1)

old="""          <div class=\"cms-upload-toolbar\">
            <button type=\"button\" class=\"aic-btn aic-btn-primary cmsUploadStart\" data-id=\"${esc(p.id)}\" ${q.running?'disabled':''}>${q.running?'업로드 중…':'⬆ '+st.total+'장 일괄 업로드'}</button>
            ${st.failed?`<button type=\"button\" class=\"aic-btn cmsUploadRetry\" data-id=\"${esc(p.id)}\" ${q.running?'disabled':''}>실패 ${st.failed}장만 재시도</button>`:''}
            <button type=\"button\" class=\"aic-btn cmsUploadClear\" data-id=\"${esc(p.id)}\" ${q.running?'disabled':''}>대기열 비우기</button>
            <span class=\"cms-upload-summary\" id=\"cmsQCount_${key}\">전체 ${st.total} · 완료 ${st.done} · 실패 ${st.failed}</span>
          </div>`:'<div class=\"aic-sub\" style=\"margin-top:9px;font-size:11.5px\">선택한 사진은 바로 서버로 올라가지 않습니다. 미리 확인하고 대표/전/후를 정한 뒤 <b>일괄 업로드</b>를 누르세요.</div>'}
"""
new="""          <div class=\"cms-upload-toolbar\">
            ${st.failed?`<button type=\"button\" class=\"aic-btn cmsUploadRetry\" data-id=\"${esc(p.id)}\" ${q.running?'disabled':''}>실패 ${st.failed}장 다시 올리기</button>`:''}
            <span class=\"cms-upload-summary\" id=\"cmsQCount_${key}\">${q.running?'자동 업로드 중 · ':''}전체 ${st.total} · 완료 ${st.done} · 실패 ${st.failed}</span>
          </div>`:'<div class=\"aic-sub\" style=\"margin-top:9px;font-size:11.5px\">사진을 선택하면 별도 버튼 없이 바로 업로드됩니다.</div>'}
"""
assert old in s, 'queue toolbar marker missing'
s=s.replace(old,new,1)

old="""        <div class=\"cms-existing-head\"><b>✅ 서버에 등록된 사진 (${assets.length})</b><span style=\"font-size:10.5px;color:var(--text-mute)\">대표/전/후 분류는 언제든 변경 가능</span></div>
        ${assets.length?`<div class=\"cms-assets\">${assets.map(a=>{
          const src=a.preview_url||a.public_url||a.url||a.thumbnail_url||'';
          return `<div class=\"cms-asset\">
            ${src?`<img src=\"${esc(src)}\" alt=\"\">`:'<div class=\"cms-asset-ph\">미리보기 없음</div>'}
            <select class=\"cmsAssetRole\" data-pid=\"${esc(p.id)}\" data-aid=\"${esc(a.id)}\">
              ${[['cover','대표'],['before','시공전'],['after','시공후'],['gallery','갤러리']].map(([v,l])=>`<option value=\"${v}\" ${a.role===v?'selected':''}>${l}</option>`).join('')}
            </select>
          </div>`;}).join('')}</div>`:'<div class=\"aic-doc-empty\">아직 서버에 등록된 사진이 없어요.</div>'}
"""
new="""        <div class=\"cms-existing-head\"><b>✅ 올라간 사진 (${assets.length})</b><span class=\"cms-photo-help\">사진 클릭 → 크게 확인 · 대표사진 변경</span></div>
        ${assets.length?`<div class=\"cms-assets\">${assets.map(a=>{
          const src=a.preview_url||a.public_url||a.url||a.thumbnail_url||'';
          return `<div class=\"cms-asset\">
            ${a.role==='cover'?'<span class=\"cms-cover-badge\">대표</span>':''}
            ${src?`<button type=\"button\" class=\"cms-asset-preview cmsAssetPreview\" data-pid=\"${esc(p.id)}\" data-aid=\"${esc(a.id)}\"><img src=\"${esc(src)}\" alt=\"시공사진\"></button>`:'<div class=\"cms-asset-ph\">미리보기 없음</div>'}
          </div>`;}).join('')}</div>`:'<div class=\"aic-doc-empty\">아직 올라간 사진이 없어요.</div>'}
"""
assert old in s, 'existing assets marker missing'
s=s.replace(old,new,1)

# Hide the redundant global save button on the portfolio tab.
old="""        <button type=\"button\" class=\"btn\" id=\"cmsSaveBtn\">${tab==='portfolio'?'💾 시공사례 저장':'💾 홈페이지에 반영'}</button>
"""
new="""        ${tab==='portfolio'?'':`<button type=\"button\" class=\"btn\" id=\"cmsSaveBtn\">💾 홈페이지에 반영</button>`}
"""
assert old in s, 'global save marker missing'
s=s.replace(old,new,1)

# Auto-save field edits and start waiting uploads once a title is entered.
old="""  document.querySelectorAll('.cmsPj').forEach(el=>el.addEventListener('change',()=>{
    const p=(cmsPortfolios||[]).find(x=>x.id===el.dataset.id);
    if(p){ p[el.dataset.f]=el.value; cmsPortfolioDraftsSave(); }
  }));
"""
new="""  document.querySelectorAll('.cmsPj').forEach(el=>el.addEventListener('change',()=>{
    const p=(cmsPortfolios||[]).find(x=>x.id===el.dataset.id);
    if(!p) return;
    p[el.dataset.f]=el.value; cmsPortfolioDraftsSave();
    if((p.title||'').trim()){
      cmsSavePortfolio(p.id,{silent:true,noRender:true}).then(ok=>{
        if(ok && cmsQueue(p.id).items.some(x=>x.status==='ready') && !cmsQueue(p.id).running) cmsStartUploadQueue(p.id,false);
      });
    }
  }));
"""
assert old in s, 'autosave field marker missing'
s=s.replace(old,new,1)

# Publish button becomes the one status control: publish; clicking published state can unpublish with confirmation.
old="""  document.querySelectorAll('.cmsPjPublish').forEach(el=>el.addEventListener('click',async()=>{
    const p=(cmsPortfolios||[]).find(x=>x.id===el.dataset.id); if(!p) return;
    p.status='published';
    await cmsEnsureCover(p.id);
    const ok=await cmsSavePortfolio(p.id,{silent:true,noRender:true});
    if(ok){
      cmsPortfolioDraftsSave();
      toast('홈페이지에 공개했어요','ok');
      await cmsLoadPortfolios();
      render();
    }else{
      toast('공개 저장에 실패했어요','warn'); render();
    }
  }));
  document.querySelectorAll('.cmsPjSave').forEach(el=>el.addEventListener('click',()=>cmsSavePortfolio(el.dataset.id)));
"""
new="""  document.querySelectorAll('.cmsPjPublish').forEach(el=>el.addEventListener('click',async()=>{
    const p=(cmsPortfolios||[]).find(x=>x.id===el.dataset.id); if(!p) return;
    if((p.status||'draft')==='published'){
      if(!confirm('이 시공사례를 홈페이지에서 내릴까요?\n사진과 내용은 삭제되지 않고 비공개로만 바뀝니다.')) return;
      p.status='draft';
      const ok=await cmsSavePortfolio(p.id,{silent:true,noRender:true});
      if(ok){cmsPortfolioDraftsSave();toast('홈페이지에서 비공개로 바꿨어요','ok');await cmsLoadPortfolios();render();}
      else{toast('비공개 변경에 실패했어요','warn');render();}
      return;
    }
    if(cmsQueue(p.id).running || cmsQueue(p.id).items.some(x=>x.status==='ready')){toast('사진 업로드가 끝난 뒤 공개해 주세요','warn');return;}
    p.status='published';
    await cmsEnsureCover(p.id);
    const ok=await cmsSavePortfolio(p.id,{silent:true,noRender:true});
    if(ok){
      cmsPortfolioDraftsSave();
      toast('홈페이지에 공개했어요','ok');
      await cmsLoadPortfolios();
      render();
    }else{
      p.status='draft'; toast('공개 저장에 실패했어요','warn'); render();
    }
  }));
"""
assert old in s, 'publish binding marker missing'
s=s.replace(old,new,1)

# Remove no-longer-visible control bindings and bind image preview.
s=s.replace("  const jr=document.getElementById('cmsPjReload');\n  if(jr) jr.addEventListener('click',async()=>{await cmsLoadPortfolios();render();});\n\n", "", 1)
s=s.replace("  document.querySelectorAll('.cmsQueueRole').forEach(el=>el.addEventListener('change',()=>cmsQueueSetRole(el.dataset.pid,el.dataset.qid,el.value)));\n  document.querySelectorAll('.cmsUploadStart').forEach(el=>el.addEventListener('click',()=>cmsStartUploadQueue(el.dataset.id,false)));\n", "", 1)
s=s.replace("  document.querySelectorAll('.cmsUploadClear').forEach(el=>el.addEventListener('click',()=>cmsQueueClear(el.dataset.id,false)));\n", "", 1)
old="""  document.querySelectorAll('.cmsAssetRole').forEach(el=>el.addEventListener('change',()=>
    cmsAssetRole(el.dataset.pid,el.dataset.aid,el.value)));
"""
new="""  document.querySelectorAll('.cmsAssetPreview').forEach(el=>el.addEventListener('click',()=>
    cmsShowAssetPreview(el.dataset.pid,el.dataset.aid)));
"""
assert old in s, 'asset preview binding marker missing'
s=s.replace(old,new,1)

if s==orig: raise SystemExit('no changes')
p.write_text(s,encoding='utf-8')
print('patched simplified portfolio admin')
