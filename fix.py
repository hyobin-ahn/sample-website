import re
with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

html = re.sub(r'<footer class="footer">\s*<div class="footer-grid">\s*</div>\s*</footer>', '', html, flags=re.DOTALL)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)
