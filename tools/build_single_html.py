"""game/ のファイルを1つのHTMLにまとめる（スマホ確認用ページの公開に使う）
使い方: python3 tools/build_single_html.py 出力先.html
"""
import sys, pathlib, base64, re
root = pathlib.Path(__file__).resolve().parent.parent / 'game'
html = (root / 'index.html').read_text()
css = (root / 'style.css').read_text().replace("top: 8px;", "top: calc(8px + env(safe-area-inset-top, 0px));")
# フォントは1つのファイルの中に入れる（data URI）
font64 = base64.b64encode((root / 'fonts' / 'DotGothic16-subset.woff2').read_bytes()).decode()
css = css.replace('url("fonts/DotGothic16-subset.woff2")', f'url("data:font/woff2;base64,{font64}")')
body = html[html.index('<body>') + 6:html.index('<script src="sprites.js">')]
out = f'''<title>ミスターポストマン</title>
<meta name="theme-color" content="#5c96fa">
<style>
{css}
</style>
{body}<script>
{(root / 'sprites.js').read_text()}
</script>
<script>
{(root / 'audio.js').read_text()}
</script>
<script>
{(root / 'main.js').read_text()}
</script>
'''
pathlib.Path(sys.argv[1]).write_text(out)
print('wrote', sys.argv[1], len(out))
