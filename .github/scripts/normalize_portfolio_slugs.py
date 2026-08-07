from pathlib import Path

p=Path('public/index.html')
s=p.read_text(encoding='utf-8')

s=s.replace("const APP_BUILD = 'V43.0807.BATCH5';","const APP_BUILD = 'V43.0807.BATCH6';",1)

old="""function cmsPortfolioSlug(p){
  if(p.slug) return p.slug;
  const title=String(p.title||'project').normalize('NFKC').toLowerCase()
    .replace(/[^0-9a-z가-힣]+/g,'-').replace(/^-+|-+$/g,'').slice(0,150) || 'project';
  const suffix=String(p.id||cmsUuid()).replace(/-/g,'').slice(0,8);
  p.slug=(title+'-'+suffix).slice(0,190);
  return p.slug;
}
"""
new="""function cmsPortfolioSlug(p){
  // 공개 상세 URL은 브라우저/프록시마다 한글 path 인코딩이 다르게 처리될 수 있으므로
  // 제목과 무관한 ASCII 고정 slug를 사용한다. 프로젝트 id가 같으면 slug도 항상 같다.
  const raw=String((p&&p.id)||cmsUuid()).toLowerCase().replace(/[^0-9a-z]/g,'');
  const stable='project-'+(raw||String(Date.now()));
  if(p.slug!==stable) p.slug=stable;
  return p.slug;
}
function cmsPortfolioSlugNeedsMigration(p){
  if(!p || !p.id || !(p.title||'').trim()) return false;
  const raw=String(p.id).toLowerCase().replace(/[^0-9a-z]/g,'');
  return p.slug!==('project-'+raw);
}
"""
assert old in s, 'slug function marker missing'
s=s.replace(old,new,1)

old2="""  cmsPortfolios=[...byId.values()];
  for(const p of cmsPortfolios) await cmsRefreshAssets(p.id);
}
"""
new2="""  cmsPortfolios=[...byId.values()];
  for(const p of cmsPortfolios) await cmsRefreshAssets(p.id);

  // 예전 한글 slug 프로젝트는 직원이 버튼을 누르지 않아도 관리자 화면을 여는 순간
  // ASCII 고정 slug로 한 번만 조용히 마이그레이션한다. 기존 공개 상태/사진은 그대로 유지된다.
  const migrate=cmsPortfolios.filter(cmsPortfolioSlugNeedsMigration);
  for(const p of migrate){
    const before=p.slug||'';
    cmsPortfolioSlug(p);
    const ok=await cmsSavePortfolio(p.id,{silent:true,noRender:true});
    if(!ok) p.slug=before;
  }
  if(migrate.length) cmsPortfolioDraftsSave();
}
"""
assert old2 in s, 'load portfolios marker missing'
s=s.replace(old2,new2,1)

p.write_text(s,encoding='utf-8')
print('normalized portfolio slugs')
