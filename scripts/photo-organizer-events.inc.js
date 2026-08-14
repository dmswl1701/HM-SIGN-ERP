  const grp=document.getElementById('cmsGalleryRepublish');
  if(grp) grp.addEventListener('click',cmsGalleryRepublishAll);
  const cgn=document.getElementById('cmsGalleryNewCategory');
  if(cgn) cgn.addEventListener('click',cmsGalleryNewCategory);
  document.querySelectorAll('.cmsAlbumSave').forEach(el=>el.addEventListener('click',()=>cmsGalleryUpdateAlbum(el.dataset.id)));
  document.querySelectorAll('.cmsAlbumDelete').forEach(el=>el.addEventListener('click',()=>cmsGalleryDeleteAlbum(el.dataset.id)));
  document.querySelectorAll('.cmsAlbumAddInput').forEach(el=>el.addEventListener('change',e=>{
    const f=[...e.target.files]; e.target.value=''; cmsGalleryAddFiles(el.dataset.id,f);
  }));
  const psm=document.getElementById('cmsPhotoSelectModeBtn');
  if(psm) psm.addEventListener('click',cmsPhotoToggleSelectMode);
  const ppa=document.getElementById('cmsPhotoPickAll');
  if(ppa) ppa.addEventListener('click',()=>{
    const ids=[];
    document.querySelectorAll('.cmsPhotoPickTile').forEach(t=>{ if(ids.indexOf(t.dataset.id)<0) ids.push(t.dataset.id); });
    cmsPhotoPickAllVisible(ids);
  });
  document.querySelectorAll('.cmsPhotoPickTile').forEach(el=>el.addEventListener('click',()=>cmsPhotoTogglePick(el.dataset.id)));
  document.querySelectorAll('.cmsPhotoFilterBtn').forEach(el=>el.addEventListener('click',()=>cmsPhotoSetFilter(el.dataset.v)));
  document.querySelectorAll('.cmsCatChip').forEach(el=>el.addEventListener('click',()=>cmsPhotoPickCategory(el.dataset.input, el.dataset.val, el.dataset.for)));
  document.querySelectorAll('.cmsPhotoOpen').forEach(el=>el.addEventListener('click',()=>cmsPhotoOpen(el.dataset.pid, el.dataset.aid)));
  const cpc=document.getElementById('cmsPhotoCloseBtn');
  if(cpc) cpc.addEventListener('click',cmsPhotoClose);
  const cps=document.getElementById('cmsPhotoSave');
  if(cps) cps.addEventListener('click',cmsPhotoSaveEdit);
  document.querySelectorAll('.cmsPhotoSetRole').forEach(el=>el.addEventListener('click',async()=>{
    el.disabled=true;
    await cmsAssetRole(el.dataset.pid, el.dataset.aid, el.dataset.role);
    el.disabled=false;
    render();
  }));
  document.querySelectorAll('.cmsPhotoRole').forEach(el=>el.addEventListener('change',async()=>{
    const prev=el.dataset.was||'';
    el.disabled=true;
    const ok=await cmsAssetRole(el.dataset.pid, el.dataset.aid, el.value);
    el.disabled=false;
    if(!ok && prev) el.value=prev;   // 실패하면 고른 값을 되돌려 화면과 서버를 맞춘다
    render();
  }));
  document.querySelectorAll('.cmsPhotoRole').forEach(el=>{ el.dataset.was=el.value; });
  document.querySelectorAll('.cmsAlbumPick').forEach(el=>el.addEventListener('change',()=>cmsGalleryTogglePick(el.dataset.id)));
  const crp=document.getElementById('cmsRenamePicked');
  if(crp) crp.addEventListener('click',cmsGalleryRenamePicked);
  const cmr=document.getElementById('cmsMergeRun');
  if(cmr) cmr.addEventListener('click',cmsGalleryMergeAlbums);
  const cmc=document.getElementById('cmsMergeClear');
  if(cmc) cmc.addEventListener('click',cmsGalleryClearPick);
  document.querySelectorAll('.cmsCategoryRename').forEach(el=>el.addEventListener('click',()=>cmsGalleryRenameCategory(el.dataset.cat)));
  document.querySelectorAll('.cmsCategoryDelete').forEach(el=>el.addEventListener('click',()=>cmsGalleryDeleteCategory(el.dataset.cat)));
