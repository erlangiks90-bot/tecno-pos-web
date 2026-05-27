// CONFIG APK / WEB - WAJIB UNTUK APK
// Jangan dikosongkan. APK akan pakai URL ini untuk API Railway.
window.TECNO_API_BASE = 'https://tecno-pos-web-production.up.railway.app';

function tecnoApiUrl(path){
  const base = (window.TECNO_API_BASE || '').replace(/\/$/, '');
  if(!path) return base;
  if(/^https?:\/\//i.test(path)) return path;
  return base + (path.startsWith('/') ? path : '/' + path);
}
