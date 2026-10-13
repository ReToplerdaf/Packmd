// Сборка в один файл: dist/pack.html — те же HTML, CSS и скрипты, но всё
// встроено внутрь. Нужна, когда игру удобнее передать одним файлом
// (артефакт, мессенджер). Сама игра по-прежнему работает из index.html.
//
//   node tools/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

let html = read('index.html');
html = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (_, p) => '<style>\n' + read(p) + '</style>');
html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (_, p) => {
  const js = read(p);
  if (/<\/script/i.test(js)) throw new Error(p + ': внутри есть </script>');
  return '<script>\n' + js + '</script>';
});
if (/(href|src)="(css|js)\//.test(html)) throw new Error('остались внешние файлы');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/pack.html'), html);
console.log('dist/pack.html', (html.length / 1024).toFixed(1) + ' КБ');
// Версия «кружок» одним файлом: тот же код, режим включён флагом до скриптов.
const circle = html.replace('<script>', '<script>window.PACK_CIRCLE = true;</script>\n<script>');
fs.writeFileSync(path.join(root, 'dist/pack-circle.html'), circle);
console.log('dist/pack-circle.html', (circle.length / 1024).toFixed(1) + ' КБ');
