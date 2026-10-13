// Bundles index.html + css + js into one self-contained file.
//   node build.mjs                -> dist/box-horse.html   (complete document, open anywhere)
//   node build.mjs --artifact     -> dist/artifact.html    (no doctype/html/head/body: <title>, <style>, body content, scripts;
//                                                           the hosting skeleton supplies the document wrapper)
//   node build.mjs [--artifact] out.html
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const artifact = args.includes('--artifact');
const outArg = args.find((a) => !a.startsWith('--'));
const out = outArg || path.join(root, 'dist', artifact ? 'artifact.html' : 'box-horse.html');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const css = html.match(/<link rel="stylesheet" href="([^"]+)">/g).map((m) => fs.readFileSync(path.join(root, m.match(/href="([^"]+)"/)[1]), 'utf8')).join('\n');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => {
  const js = fs.readFileSync(path.join(root, m[1]), 'utf8');
  if (js.includes('</script')) throw new Error(m[1] + ' contains </script>');
  return js;
});

let result;
if (artifact) {
  const title = html.match(/<title>([^<]*)<\/title>/)[1];
  const body = html.match(/<body>([\s\S]*?)<script/)[1].trim();
  result = '<title>' + title + '</title>\n<style>\n' + css + '\n</style>\n' + body + '\n' + scripts.map((js) => '<script>\n' + js + '\n</script>').join('\n') + '\n';
} else {
  result = html
    .replace(/<link rel="stylesheet" href="([^"]+)">/, () => '<style>\n' + css + '\n</style>')
    .replace(/<script src="([^"]+)"><\/script>/g, () => '<script>\n' + scripts.shift() + '\n</script>');
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, result);
console.log('wrote', path.relative(root, out), (fs.statSync(out).size / 1024).toFixed(1) + ' KB');
