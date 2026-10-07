/*!
 * BlockFace — 给图片贴 Minecraft 头像
 * Copyright 2026 Dainsleif
 * Licensed under the Apache License, Version 2.0
 */

/** 触发浏览器下载；文件名里的非法字符会被替换 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // 交给浏览器完成读取后再回收
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('导出失败：画布为空'))),
        type,
        quality,
      );
    } catch (error) {
      // 跨域污染的画布会在这里抛 SecurityError
      reject(
        new Error(
          '导出失败：画布包含跨域图片且对方未开启 CORS。请改用「上传皮肤」或为图片地址配置跨域代理。',
          { cause: error },
        ),
      );
    }
  });
}

export function suggestFilename(prefix = 'blockface', ext = 'png'): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${prefix}-${stamp}.${ext}`;
}
