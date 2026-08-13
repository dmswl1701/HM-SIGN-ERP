  const cgn=document.getElementById('cmsGalleryNewCategory');
  if(cgn) cgn.addEventListener('click',cmsGalleryNewCategory);
  document.querySelectorAll('.cmsAlbumSave').forEach(el=>el.addEventListener('click',()=>cmsGalleryUpdateAlbum(el.dataset.id)));
  document.querySelectorAll('.cmsAlbumDelete').forEach(el=>el.addEventListener('click',()=>cmsGalleryDeleteAlbum(el.dataset.id)));
  document.querySelectorAll('.cmsAlbumAddInput').forEach(el=>el.addEventListener('change',e=>{
    const f=[...e.target.files]; e.target.value=''; cmsGalleryAddFiles(el.dataset.id,f);
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
  const cmr=document.getElementById('cmsMergeRun');
  if(cmr) cmr.addEventListener('click',cmsGalleryMergeAlbums);
  const cmc=document.getElementById('cmsMergeClear');
  if(cmc) cmc.addEventListener('click',cmsGalleryClearPick);
  document.querySelectorAll('.cmsCategoryRename').forEach(el=>el.addEventListener('click',()=>cmsGalleryRenameCategory(el.dataset.cat)));
  document.querySelectorAll('.cmsCategoryDelete').forEach(el=>el.addEventListener('click',()=>cmsGalleryDeleteCategory(el.dataset.cat)));
