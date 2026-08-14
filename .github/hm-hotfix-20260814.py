from pathlib import Path

p = Path('public/index.html')
s = p.read_text(encoding='utf-8')


def rep(old, new, name):
    global s
    if old not in s:
        raise SystemExit(f'missing patch target: {name}')
    s = s.replace(old, new, 1)


rep("""    // 문의함
    cmsInquiries = null;
    try{
      const r = await cmsFetchRaw(CMS_BASE+'/inquiries');
      if(r.status===200) cmsInquiries = await r.json();
    }catch(e){}
    // 시공사례 + 사진
    try{ await cmsLoadPortfolios(); }catch(e){}
    // 사진첩이 아직 안 불러와졌으면 준비 (시공사례에서 바로 올릴 수 있도록)
    if(state.gallery===null && !state.galleryLoading && typeof loadGallery==='function'){
      state.galleryLoading=true; setTimeout(loadGallery, 10);
    }
""", """    // 홈페이지 문구 화면을 여는 데 문의/시공사진 전체를 기다리지 않는다.
    // 무거운 데이터는 해당 탭을 눌렀을 때만 불러온다.
    cmsInquiries = null;
    cmsPortfolios = null;
""", 'cmsLoadAll eager data')

rep("""  await cmsPoolRun(cmsPortfolios, 6, p=>cmsRefreshAssets(p.id));
""", """  // 프로젝트 목록은 먼저 보여주고 사진은 뒤에서 채운다.
  // 사진 수가 많아져도 홈페이지 관리 첫 화면이 이 요청들을 기다리지 않는다.
  cmsPoolRun(cmsPortfolios, 4, p=>cmsRefreshAssets(p.id))
    .then(()=>{ if(state.view==='website' && state.cmsTab==='portfolio') render(); })
    .catch(()=>{});
""", 'portfolio asset background load')

rep("""  const migrate=cmsPortfolios.filter(cmsPortfolioSlugNeedsMigration);
  for(const p of migrate){
    const before=p.slug||'';
    cmsPortfolioSlug(p);
    const ok=await cmsSavePortfolio(p.id,{silent:true,noRender:true});
    if(!ok) p.slug=before;
  }
  if(migrate.length) cmsPortfolioDraftsSave();
""", """  const migrate=cmsPortfolios.filter(cmsPortfolioSlugNeedsMigration);
  if(migrate.length){
    // 예전 slug 정리는 필요하지만 목록 표시를 막을 이유는 없다. 뒤에서 한 번씩 정리한다.
    (async()=>{
      for(const p of migrate){
        const before=p.slug||'';
        cmsPortfolioSlug(p);
        const ok=await cmsSavePortfolio(p.id,{silent:true,noRender:true});
        if(!ok) p.slug=before;
      }
      cmsPortfolioDraftsSave();
    })().catch(()=>{});
  }
""", 'background slug migration')

rep("""  document.querySelectorAll('.cmsTab').forEach(el=> el.addEventListener('click', ()=>{ state.cmsTab=el.dataset.t; render(); }));
""", """  document.querySelectorAll('.cmsTab').forEach(el=> el.addEventListener('click', async()=>{
    const t=el.dataset.t;
    state.cmsTab=t;
    render();

    // 문의함/시공사례는 실제로 볼 때만 네트워크를 사용한다.
    if(t==='portfolio' && cmsPortfolios===null && !state.cmsPortfolioLoading){
      state.cmsPortfolioLoading=true;
      try{ await cmsLoadPortfolios(); }
      catch(e){ state.cmsErr='시공사례를 불러오지 못했습니다: '+e.message; }
      finally{
        state.cmsPortfolioLoading=false;
        if(state.cmsTab==='portfolio') render();
      }
    }
    if(t==='inquiry' && cmsInquiries===null && !state.cmsInquiryLoading){
      state.cmsInquiryLoading=true;
      try{
        const r=await cmsFetchRaw(CMS_BASE+'/inquiries');
        if(r.status===200) cmsInquiries=await r.json();
      }catch(e){ state.cmsErr='문의함을 불러오지 못했습니다: '+e.message; }
      finally{
        state.cmsInquiryLoading=false;
        if(state.cmsTab==='inquiry') render();
      }
    }
  }));
""", 'lazy tab loading')

rep("""            ${[{r:'before',t:'시공 전 사진'},{r:'after',t:'시공 후 사진'},
               {r:'progress',t:'과정 사진'},{r:'gallery',t:'현장 사진'}].map(x=>`
""", """            ${[{r:'before',t:'시공 전 사진'},{r:'after',t:'시공 후 사진'},
               {r:'gallery',t:'과정·현장 사진'}].map(x=>`
""", 'unsafe progress upload option')

rep("""      else out.progress.push(p.file);
""", """      else out.gallery.push(p.file); // progress role은 배포 Worker 지원 확인 전까지 안전하게 현장사진으로 저장
""", 'auto progress fallback')

rep("""  return fetch(CMS_API+path, {method:opts.method||'GET', headers, body:opts.body});
""", """  const method=opts.method||'GET';
  return fetch(CMS_API+path, {method, headers, body:opts.body, cache:method==='GET'?'no-store':'no-cache'});
""", 'admin fetch freshness')

rep("""    if(r.status>=200&&r.status<300){
      await cmsRefreshAssets(portfolioId);
      if(!opts.silent) toast('사진 분류를 바꿨어요','ok');
      return true;
    }
""", """    if(r.status>=200&&r.status<300){
      const fresh=await cmsRefreshAssets(portfolioId);
      const saved=(fresh||[]).find(x=>String(x.id)===String(assetId));
      if(saved && String(saved.role||'').toLowerCase()===String(role||'').toLowerCase()){
        if(!opts.silent) toast('사진 분류를 바꿨어요','ok');
        return true;
      }
      toast('서버 응답은 왔지만 분류가 실제 저장되지 않았어요. 다시 시도해 주세요','warn');
      return false;
    }
""", 'verify asset role persistence')

p.write_text(s, encoding='utf-8')
print('ERP hotfix patch applied')
