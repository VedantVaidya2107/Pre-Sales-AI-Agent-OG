import urllib.request as r, re
try:
    h = r.urlopen('https://vedantvaidya2107.github.io/Pre-Sales-Agent/').read().decode(errors='ignore')
    m = re.search(r'src="([^"]+main-[^"]+\.js)"', h) or re.search(r'src="([^"]+index-[^"]+\.js)"', h)
    if not m:
        print("COULD NOT FIND JS BUNDLE IN HTML")
    else:
        path = m.group(1)
        url = "https://vedantvaidya2107.github.io" + (path if path.startswith('/') else "/Pre-Sales-Agent/" + path)
        print("Fetching JS from:", url)
        j = r.urlopen(url).read().decode(errors='ignore')
        print("RENDER_URL_PRESENT:", "pre-sales-agent-1.onrender.com" in j)
        print("LOCALHOST_PRESENT:", "localhost:3001" in j)
except Exception as e:
    print("Error:", e)
