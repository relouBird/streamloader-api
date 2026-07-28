// utils/payPage.ts
export const payPage = (
  icon: string,
  title: string,
  msg: string,
  redirect: string,
) =>
  `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
  <title>${title} — StreamLoader</title>
  <meta http-equiv="refresh" content="3;url=${redirect}">
  <style>body{font-family:Inter,sans-serif;background:#13132A;color:#EEEEF8;
  display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;}
  .b{max-width:420px;padding:48px 32px;}.i{font-size:56px;margin-bottom:16px;}
  h1{font-size:22px;margin-bottom:8px;} p{color:#9090B8;font-size:14px;}</style>
  </head><body>
  <div class="b"><div class="i">${icon}</div><h1>${title}</h1><p>${msg}</p></div>
  </body></html>`;
