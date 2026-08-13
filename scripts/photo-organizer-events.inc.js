  const cgn=document.getElementById('cmsGalleryNewCategory');
  if(cgn) cgn.addEventListener('click',cmsGalleryNewCategory);
  document.querySelectorAll('.cmsAlbumSave').forEach(el=>el.addEventListener('click',()=>cmsGalleryUpdateAlbum(el.dataset.id)));
  document.querySelectorAll('.cmsAlbumDelete').forEach(el=>el.addEventListener('click',()=>cmsGalleryDeleteAlbum(el.dataset.id)));
  document.querySelectorAll('.cmsAlbumAddInput').forEach(el=>el.addEventListener('change',e=>{
    const f=[...e.target.files]; e.target.value=''; cmsGalleryAddFiles(el.dataset.id,f);
  }));
  document.querySelectorAll('.cmsAlbumPick').forEach(el=>el.addEventListener('change',()=>cmsGalleryTogglePick(el.dataset.id)));
  const cmr=document.getElementById('cmsMergeRun');
  if(cmr) cmr.addEventListener('click',cmsGalleryMergeAlbums);
  const cmc=document.getElementById('cmsMergeClear');
  if(cmc) cmc.addEventListener('click',cmsGalleryClearPick);
  document.querySelectorAll('.cmsCategoryRename').forEach(el=>el.addEventListener('click',()=>cmsGalleryRenameCategory(el.dataset.cat)));
  document.querySelectorAll('.cmsCategoryDelete').forEach(el=>el.addEventListener('click',()=>cmsGalleryDeleteCategory(el.dataset.cat)));
