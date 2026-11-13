"""game/ のファイルを1つのHTMLにまとめる（スマホ確認用ページの公開に使う）
使い方: python3 tools/build_single_html.py 出力先.html
"""
import sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent / 'game'
html = (root / 'index.html').read_text()
css = (root / 'style.css').read_text().replace("top: 8px;", "top: calc(8px + env(safe-area-inset-top, 0px));")
body = html[html.index('<body>') + 6:html.index('<script src="sprites.js">')]
out = f'''<title>ミスターポストマン</title>
<meta name="theme-color" content="#5c96fa">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DotGothic16&display=swap">
<style>
{css}
</style>
{body}<script>
{(root / 'sprites.js').read_text()}
</script>
<script>
{(root / 'main.js').read_text()}
</script>
'''
pathlib.Path(sys.argv[1]).write_text(out)
print('wrote', sys.argv[1], len(out))
